import 'dotenv/config';
import { sequelize } from './config/database';
import { initializeModels, InferenceJob } from './models';
import { inferenceQueue } from './queue/inference-queue';
import { inferenceClient } from './services/inference-client';

async function startWorker(): Promise<void> {
  initializeModels(sequelize);
  await sequelize.authenticate();
  await inferenceQueue.isReady();

  inferenceQueue.process(1, async (queueJob) => {
    // The database job record is the source of truth for polling, not Bull's transient state.
    const record = await InferenceJob.findByPk(queueJob.data.inferenceJobId);
    if (!record || ['ABORTED', 'FAILED', 'COMPLETED'].includes(record.status)) return;
    await record.update({ status: 'RUNNING', progress: 10, errorType: null });
    try {
      const result = await inferenceClient.infer(
        queueJob.data.inferenceJobId,
        queueJob.data.modelId,
        queueJob.data.assets,
      );
      await record.update({ status: 'COMPLETED', progress: 100, result: result as unknown as Record<string, unknown>, errorType: null });
      return result;
    } catch (error) {
      const isServiceError = error instanceof Error && error.message.startsWith('Python inference service returned');
      await record.update({ status: 'FAILED', errorType: isServiceError ? 'INFERENCE_ERROR' : 'INFERENCE_SERVICE_UNAVAILABLE' });
      throw error;
    }
  });

  console.log('Bull inference worker is ready.');
}

startWorker().catch((error: unknown) => {
  console.error('Worker startup failed:', error);
  process.exitCode = 1;
});
