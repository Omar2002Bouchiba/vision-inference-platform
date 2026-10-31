export interface InferenceAssetInput {
  id: string;
  path: string;
  kind: 'image' | 'video';
}

export interface ProbeResult {
  assets: Array<{ assetId: string; frameCount: number }>;
}

export interface InferenceResult {
  modelId: string;
  frames: Array<{
    assetId: string;
    frameNumber: number;
    detections: Array<Record<string, unknown>>;
    annotatedFile: string;
  }>;
}

export class InferenceClientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'InferenceClientError';
  }
}

export class InferenceClient {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, body: unknown, timeoutMs: number): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new InferenceClientError('Python inference service is unavailable.');
    }
    if (!response.ok) {
      throw new InferenceClientError(`Python inference service returned HTTP ${response.status}.`, response.status);
    }
    return response;
  }

  async probe(assets: InferenceAssetInput[]): Promise<ProbeResult> {
    const response = await this.request('/probe', { assets }, 60_000);
    return await response.json() as ProbeResult;
  }

  async infer(jobId: string, modelId: string, assets: InferenceAssetInput[]): Promise<InferenceResult> {
    const response = await this.request('/infer', { jobId, modelId, assets }, 6 * 60 * 60 * 1000);
    return await response.json() as InferenceResult;
  }

  async renderFrame(input: { assetPath: string; assetKind: 'image' | 'video'; frameNumber: number; annotatedFile: string }): Promise<Buffer> {
    const response = await this.request('/frame', input, 60_000);
    return Buffer.from(await response.arrayBuffer());
  }
}

export const inferenceClient = new InferenceClient(process.env.INFERENCE_URL ?? 'http://127.0.0.1:8000');
