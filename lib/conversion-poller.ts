import { fetchConversionJob, type BackendJob } from '@/lib/conversion-api';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Polling aborted.', 'AbortError'));
    };

    if (signal?.aborted) {
      clearTimeout(timeoutId);
      reject(new DOMException('Polling aborted.', 'AbortError'));
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });

export async function pollJobUntilFinished(
  batchId: string,
  options?: {
    signal?: AbortSignal;
    maxAttempts?: number;
    startingDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  }
): Promise<BackendJob> {
  const maxAttempts = options?.maxAttempts ?? 60;
  const startingDelayMs = options?.startingDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 10000;
  const backoffMultiplier = options?.backoffMultiplier ?? 1.5;

  let delayMs = startingDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException('Polling aborted.', 'AbortError');
    }

    const job = await fetchConversionJob(batchId, options?.signal);
    if (job.status === 'done' || job.status === 'partial' || job.status === 'failed') {
      return job;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs, options?.signal);
      delayMs = Math.min(Math.ceil(delayMs * backoffMultiplier), maxDelayMs);
    }
  }

  throw new Error('Conversion timed out. Please try again.');
}
