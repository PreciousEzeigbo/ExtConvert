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
  onUploadProgress?: (percent: number) => void;
}): Promise<{ batchId: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    params.files.forEach(file => formData.append('files', file));
    params.fileIds.forEach(fileId => formData.append('file_ids', fileId));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/convert/batch?target_format=${encodeURIComponent(params.targetFormat)}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && params.onUploadProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        params.onUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ batchId: data.batch_id });
        } catch (e) {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData && typeof errData.detail === 'string') {
            reject(new Error(errData.detail));
            return;
          } else if (errData && Array.isArray(errData.detail) && errData.detail[0]?.msg) {
            reject(new Error(errData.detail[0].msg));
            return;
          }
        } catch (e) {
          // ignore parse error block
        }
        reject(new Error('Failed to start conversion batch.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(formData);
  });
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
