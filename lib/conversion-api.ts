export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001';

export type BackendFile = {
  file_id: string;
  original_name: string;
  path: string;
  ext: string;
};

export type BackendResult = {
  file_id: string;
  original: string;
  status: 'success' | 'failed';
  output?: string;
  filename?: string;
  error?: string;
};

export type BackendJob = {
  batch_id: string;
  status: 'pending' | 'processing' | 'done' | 'partial' | 'failed';
  total: number;
  completed: number;
  failed: number;
  files: BackendFile[];
  results: BackendResult[];
  target_format: string;
};

export async function startBatchConversion(params: {
  files: File[];
  fileIds: string[];
  targetFormat: string;
}): Promise<{ batchId: string }> {
  const formData = new FormData();
  params.files.forEach(file => formData.append('files', file));
  params.fileIds.forEach(fileId => formData.append('file_ids', fileId));

  const response = await fetch(
    `${API_BASE_URL}/api/convert/batch?target_format=${encodeURIComponent(params.targetFormat)}`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to start conversion batch.');
  }

  const data = (await response.json()) as { batch_id: string };
  return { batchId: data.batch_id };
}

export async function fetchConversionJob(batchId: string, signal?: AbortSignal): Promise<BackendJob> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${batchId}`, { signal });
  if (!response.ok) {
    throw new Error('Failed to fetch conversion status.');
  }

  return (await response.json()) as BackendJob;
}

export async function clearBackendHistory(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/history`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to clear backend history.');
  }
}
