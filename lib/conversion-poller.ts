import { fetchConversionJob, type BackendJob } from '@/lib/conversion-api';

const TERMINAL_STATUSES = new Set<BackendJob['status']>(['done', 'partial', 'failed']);
const FAST_POLL_MS = 500;
const SLOW_POLL_MS = 3000;
const SLOW_POLL_AFTER_MS = 10000;

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
  }
): Promise<BackendJob> {
  const maxAttempts = options?.maxAttempts ?? 60;
  const startingDelayMs = options?.startingDelayMs ?? FAST_POLL_MS;
  const maxDelayMs = options?.maxDelayMs ?? SLOW_POLL_MS;

  let delayMs = startingDelayMs;
  let lastStatus: BackendJob['status'] | null = null;
  let lastStatusChangeAt = performance.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException('Polling aborted.', 'AbortError');
    }

    const job = await fetchConversionJob(batchId, options?.signal);
    if (TERMINAL_STATUSES.has(job.status)) {
      return job;
    }

    const now = performance.now();
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      lastStatusChangeAt = now;
      delayMs = startingDelayMs;
    } else if (job.status === 'processing' && now - lastStatusChangeAt > SLOW_POLL_AFTER_MS) {
      delayMs = SLOW_POLL_MS;
    } else {
      delayMs = startingDelayMs;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs, options?.signal);
      if (job.status === 'processing' && now - lastStatusChangeAt > SLOW_POLL_AFTER_MS) {
        delayMs = maxDelayMs;
      }
    }
  }

  throw new Error('Conversion timed out. Please try again.');
}
