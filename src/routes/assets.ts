import { Router, Request, Response } from 'express';
import { Dataset, MediaAsset } from '../models';
import { asyncHandler, requireAuth, requireCredit, validateUuidParam } from '../middleware/http';
import { imageUpload, videoUpload } from '../config/uploads';
import { chargeAndSaveAsset, InsufficientCreditError } from '../services/asset-service';

const router = Router();
router.param('datasetId', validateUuidParam);

async function findOwnedDataset(datasetId: string, ownerId: string): Promise<Dataset | null> {
  return Dataset.findOne({ where: { id: datasetId, ownerId } });
}

function requireFile(req: Request, res: Response): Express.Multer.File | null {
  if (!req.file) {
    res.status(400).json({ error: 'Upload a file using the "file" form field.' });
    return null;
  }
  return req.file;
}

router.use(requireAuth, requireCredit);

router.get('/:datasetId/assets', asyncHandler(async (req, res) => {
  const dataset = await findOwnedDataset(req.params.datasetId, req.auth!.id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  const assets = await MediaAsset.findAll({ where: { datasetId: dataset.id }, attributes: { exclude: ['storagePath'] } });
  res.json(assets);
}));

router.post('/:datasetId/assets/images', asyncHandler(async (req, res, next) => {
  const dataset = await findOwnedDataset(req.params.datasetId, req.auth!.id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  imageUpload(req, res, (error) => {
    if (error) return next(error);
    const file = requireFile(req, res);
    if (!file) return;
    void chargeAndSaveAsset(dataset, file, 'image').then(({ asset, cost }) => {
      res.status(201).json({ id: asset.id, datasetId: asset.datasetId, kind: asset.kind, originalName: asset.originalName, sizeBytes: asset.sizeBytes, uploadCost: cost });
    }).catch((caught: unknown) => {
      if (caught instanceof InsufficientCreditError) {
        res.status(401).json({ error: 'Insufficient credit for this upload.' });
        return;
      }
      next(caught);
    });
  });
}));

router.post('/:datasetId/assets/videos', asyncHandler(async (req, res, next) => {
  const dataset = await findOwnedDataset(req.params.datasetId, req.auth!.id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  videoUpload(req, res, (error) => {
    if (error) return next(error);
    const file = requireFile(req, res);
    if (!file) return;
    void chargeAndSaveAsset(dataset, file, 'video').then(({ asset, cost }) => {
      res.status(201).json({ id: asset.id, datasetId: asset.datasetId, kind: asset.kind, originalName: asset.originalName, sizeBytes: asset.sizeBytes, uploadCost: cost });
    }).catch((caught: unknown) => {
      if (caught instanceof InsufficientCreditError) {
        res.status(401).json({ error: 'Insufficient credit for this upload.' });
        return;
      }
      next(caught);
    });
  });
}));

export default router;
