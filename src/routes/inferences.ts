import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { asyncHandler, requireAuth, requireCredit, validateUuidParam } from '../middleware/http';
import { CreditTransaction, Dataset, InferenceJob, MediaAsset, User } from '../models';
import { inferenceQueue } from '../queue/inference-queue';
import { InferenceClientError, inferenceClient, InferenceResult } from '../services/inference-client';

const router = Router();
router.param('datasetId', validateUuidParam);
router.param('processingId', validateUuidParam);
router.param('assetId', validateUuidParam);
const startSchema = z.object({ modelId: z.enum(['yolo11n', 'yolo11n.pt']).default('yolo11n') });

router.post('/datasets/:datasetId/inferences', requireAuth, requireCredit, asyncHandler(async (req, res) => {
  const input = startSchema.parse(req.body ?? {});
  const dataset = await Dataset.findOne({ where: { id: req.params.datasetId, ownerId: req.auth!.id } });
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  const assets = await MediaAsset.findAll({ where: { datasetId: dataset.id } });
  if (assets.length === 0) {
    res.status(400).json({ error: 'Add at least one image or video before requesting inference.' });
    return;
  }

  const queueAssets = assets.map((asset) => ({ id: asset.id, path: asset.storagePath, kind: asset.kind }));
  let probe;
  try {
    probe = await inferenceClient.probe(queueAssets);
  } catch (error) {
    const status = error instanceof InferenceClientError && error.status ? 422 : 503;
    res.status(status).json({ error: 'Could not inspect dataset media before inference.' });
    return;
  }
  const frameCounts = new Map<string, number>(probe.assets.map((item) => [item.assetId, item.frameCount]));
  // Probe video metadata first so the full per-frame cost can be reserved before Bull starts work.
  const cost = assets.reduce((sum, asset) => {
    const count = frameCounts.get(asset.id);
    if (!count || count < 1) throw new Error(`Invalid frame count for asset ${asset.id}`);
    return sum + (asset.kind === 'image' ? 4 : count * 1.75);
  }, 0);
  const roundedCost = Number(cost.toFixed(4));

  const reservation = await sequelize.transaction(async (transaction) => {
    // Reserve credits and create the job atomically before publishing it to Bull.
    const user = await User.findByPk(req.auth!.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) return null;
    const enoughCredit = Number(user.creditBalance) >= roundedCost;
    const inferenceJob = await InferenceJob.create({
      ownerId: user.id,
      datasetId: dataset.id,
      modelId: input.modelId,
      estimatedCost: roundedCost,
      status: enoughCredit ? 'PENDING' : 'ABORTED',
      progress: 0,
      result: null,
      errorType: enoughCredit ? null : 'INSUFFICIENT_CREDIT',
    }, { transaction });
    if (!enoughCredit) return { inferenceJob, enoughCredit: false };
    user.creditBalance = Number(user.creditBalance) - roundedCost;
    await user.save({ transaction });
    await CreditTransaction.create({
      userId: user.id,
      kind: 'INFERENCE',
      amount: -roundedCost,
      referenceId: inferenceJob.id,
      description: `YOLO inference on dataset ${dataset.id}`,
    }, { transaction });
    return { inferenceJob, enoughCredit: true };
  });

  if (!reservation) {
    res.status(401).json({ error: 'Authenticated user no longer exists.' });
    return;
  }
  if (!reservation.enoughCredit) {
    res.status(202).json({ processingId: reservation.inferenceJob.id, status: 'ABORTED', estimatedCost: roundedCost });
    return;
  }
  try {
    await inferenceQueue.add({ inferenceJobId: reservation.inferenceJob.id, modelId: input.modelId, assets: queueAssets }, { jobId: reservation.inferenceJob.id });
  } catch (error) {
    await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(req.auth!.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (user) {
        user.creditBalance = Number(user.creditBalance) + roundedCost;
        await user.save({ transaction });
        await CreditTransaction.create({
          userId: user.id, kind: 'REFUND', amount: roundedCost,
          referenceId: reservation.inferenceJob.id, description: 'Refund because the inference job could not be queued.',
        }, { transaction });
      }
      await reservation.inferenceJob.update({ status: 'FAILED', errorType: 'QUEUE_UNAVAILABLE' }, { transaction });
    });
    throw error;
  }
  res.status(202).json({ processingId: reservation.inferenceJob.id, status: 'PENDING', estimatedCost: roundedCost });
}));

router.get('/processings/:processingId', requireAuth, requireCredit, asyncHandler(async (req, res) => {
  const inferenceJob = await InferenceJob.findOne({ where: { id: req.params.processingId, ownerId: req.auth!.id } });
  if (!inferenceJob) {
    res.status(404).json({ error: 'Processing job not found.' });
    return;
  }
  const response: Record<string, unknown> = {
    processingId: inferenceJob.id,
    status: inferenceJob.status,
    progress: inferenceJob.progress,
    errorType: inferenceJob.errorType,
  };
  if (inferenceJob.status === 'COMPLETED' && inferenceJob.result) {
    const result = inferenceJob.result as unknown as InferenceResult;
    response.result = { modelId: result.modelId, frames: result.frames.map(({ annotatedFile: _internalPath, ...frame }) => frame) };
  }
  res.json(response);
}));

async function sendFrameImage(req: Request, res: Response, requestedAssetId?: string): Promise<void> {
  const frameNumber = Number(req.params.frameNumber);
  if (!Number.isInteger(frameNumber) || frameNumber < 0) {
    res.status(400).json({ error: 'Frame number must be a non-negative integer.' });
    return;
  }
  const inferenceJob = await InferenceJob.findOne({ where: { id: req.params.processingId, ownerId: req.auth!.id } });
  if (!inferenceJob) {
    res.status(404).json({ error: 'Processing job not found.' });
    return;
  }
  if (inferenceJob.status !== 'COMPLETED' || !inferenceJob.result) {
    res.status(409).json({ error: 'Frame images are available only after a completed processing job.' });
    return;
  }
  const result = inferenceJob.result as unknown as InferenceResult;
  const candidates = result.frames.filter((item) => item.frameNumber === frameNumber && (!requestedAssetId || item.assetId === requestedAssetId));
  if (!requestedAssetId && candidates.length > 1) {
    res.status(409).json({ error: 'Frame number matches multiple media assets. Specify assetId in the asset-specific frame route.' });
    return;
  }
  const frame = candidates[0];
  const asset = frame ? await MediaAsset.findOne({ where: { id: frame.assetId, datasetId: inferenceJob.datasetId } }) : null;
  if (!asset || !frame) {
    res.status(404).json({ error: 'Requested frame was not found in this result.' });
    return;
  }
  try {
    const image = await inferenceClient.renderFrame({ assetPath: asset.storagePath, assetKind: asset.kind, frameNumber, annotatedFile: frame.annotatedFile });
    res.type('image/jpeg').send(image);
  } catch {
    res.status(502).json({ error: 'Could not create the side-by-side frame image.' });
  }
}

// The short route follows the exam wording when a frame number identifies one media item.
router.get('/processings/:processingId/frames/:frameNumber', requireAuth, requireCredit, asyncHandler(async (req, res) => {
  await sendFrameImage(req, res);
}));

// Keep the explicit route for datasets containing multiple media items with the same frame number.
router.get('/processings/:processingId/assets/:assetId/frames/:frameNumber', requireAuth, requireCredit, asyncHandler(async (req, res) => {
  await sendFrameImage(req, res, req.params.assetId);
}));

export default router;
