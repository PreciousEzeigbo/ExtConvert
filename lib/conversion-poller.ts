import { fetchConversionJob, type BackendJob } from '@/lib/conversion-api';
import { API_BASE_URL } from '@/lib/conversion-api';

const TERMINAL_STATUSES = new Set<BackendJob['status']>(['done', 'partial', 'failed']);

export type StreamedFilesStatus = {
  status: BackendJob['status'];
  files: {
    file_id: string;
    progress: number;
    status: 'success' | 'failed' | 'processing' | 'pending';
  }[];
};

export async function pollJobUntilFinished(
  batchId: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (data: StreamedFilesStatus) => void;
  }
): Promise<BackendJob> {
  const url = `${API_BASE_URL}/api/jobs/${batchId}/stream`;

  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(url);

    const cleanup = () => {
      eventSource.close();
      options?.signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Polling aborted.', 'AbortError'));
    };

    if (options?.signal?.aborted) {
      onAbort();
      return;
    }

    options?.signal?.addEventListener('abort', onAbort, { once: true });

    eventSource.onmessage = async (event) => {
      try {
        const data: StreamedFilesStatus = JSON.parse(event.data);
        options?.onProgress?.(data);

        if (TERMINAL_STATUSES.has(data.status)) {
          cleanup();
          try {
            const finalJob = await fetchConversionJob(batchId);
            resolve(finalJob);
          } catch (e) {
            reject(e instanceof Error ? e : new Error("Failed to fetch final job"));
          }
        }
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error('Invalid stream data'));
      }
    };

    eventSource.onerror = (e) => {
      cleanup();
      reject(new Error('Connection dropped during conversion. Please check your internet connection.'));
    };
  });
}
