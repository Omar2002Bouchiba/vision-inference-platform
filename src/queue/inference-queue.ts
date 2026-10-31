import Queue from 'bull';

export interface InferenceQueuePayload {
  inferenceJobId: string;
  modelId: string;
  assets: Array<{ id: string; path: string; kind: 'image' | 'video' }>;
}

export const inferenceQueue = new Queue<InferenceQueuePayload>('inference', {
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
});
