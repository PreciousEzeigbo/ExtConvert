import { useCallback, useEffect, useRef } from 'react';
import { ConversionJob } from '@/components/conversion-queue';
import { toast } from '@/hooks/use-toast';
import { API_BASE_URL, clearBackendHistory, startBatchConversion } from '@/lib/conversion-api';
import { pollJobUntilFinished } from '@/lib/conversion-poller';
import { useConverterStore } from '@/hooks/use-converter-store';
import JSZip from 'jszip';

const normalizeFormat = (format: string): string => {
  const value = format.toLowerCase();

  if (value === 'text') return 'txt';
  if (value === 'word') return 'docx';
  if (value === 'image') return 'png';

  return value;
};

type ResultJob = ConversionJob & { batchId: string };
type CompletedResultJob = ConversionJob & {
  batchId: string;
  status: 'completed';
  downloadUrl: string;
  outputFilename: string;
  downloaded: false;
};
type FailedResultJob = ConversionJob & {
  batchId: string;
  status: 'failed';
  error: string;
  downloaded: false;
};

const toUserFacingError = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Conversion was interrupted. Please try again.';
  }

  if (error instanceof TypeError) {
    return `Cannot reach conversion API at ${API_BASE_URL}. Start the backend or set NEXT_PUBLIC_API_BASE_URL.`;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Conversion failed. Please try again.';
};

export function useConverter() {
  const activePollController = useRef<AbortController | null>(null);
  const {
    queue,
    history,
    isConverting,
    setIsConverting,
    addToQueue: storeAddToQueue,
    updateJobStatus,
    removeFromQueue,
    addToHistory,
    updateHistoryJob,
    removeFromHistory: removeHistoryItem,
    clearHistory: clearLocalHistory,
    jobFiles,
  } = useConverterStore();

  const formatDownloadFilename = useCallback((job: ConversionJob) => {
    if (job.outputFilename) return job.outputFilename;
    const baseName = job.fileName.includes('.') ? job.fileName.replace(/\.[^/.]+$/, '') : job.fileName;
    return `${baseName}.${job.toFormat.toLowerCase()}`;
  }, []);

  const fetchRemoteFileSize = useCallback(async (url: string) => {
    try {
      const headResponse = await fetch(url, { method: 'HEAD' });
      if (headResponse.ok) {
        const headerSize = headResponse.headers.get('content-length');
        if (headerSize) {
          const parsed = Number(headerSize);
          if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
          }
        }
      }
    } catch {
      // Fallback below.
    }

    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const blob = await response.blob();
      return blob.size;
    } catch {
      return undefined;
    }
  }, []);

  const triggerDownload = useCallback((downloadUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const addToQueue = useCallback((files: File[], conversionType: string) => {
    const [fromRaw, , toRaw] = conversionType.split('-');

    const jobs: ConversionJob[] = files.map(file => {
      const fileId = crypto.randomUUID();

      return {
        id: fileId,
        fileId,
        fileName: file.name,
        fromFormat: normalizeFormat(fromRaw || ''),
        toFormat: normalizeFormat(toRaw || ''),
        status: 'pending',
        createdAt: new Date(),
      };
    });

    storeAddToQueue(jobs, files);
  }, [storeAddToQueue]);

  const convertFiles = useCallback(async (jobIds: string[]) => {
    activePollController.current?.abort();
    activePollController.current = new AbortController();

    setIsConverting(true);

    const jobsToConvert = queue.filter(job => jobIds.includes(job.id));
    const jobsByTarget = jobsToConvert.reduce<Record<string, ConversionJob[]>>((accumulator, job) => {
      if (!accumulator[job.toFormat]) {
        accumulator[job.toFormat] = [];
      }

      accumulator[job.toFormat].push(job);
      return accumulator;
    }, {});

    try {
      for (const [targetFormat, jobsInGroup] of Object.entries(jobsByTarget)) {
        jobsInGroup.forEach(job => updateJobStatus(job.id, 'processing', { progress: 10 }));
        let batchId = '';

        const fileEntries = jobsInGroup
          .map(job => ({ job, file: jobFiles[job.id] }))
          .filter((item): item is { job: ConversionJob; file: File } => Boolean(item.file));

        if (fileEntries.length === 0) {
          jobsInGroup.forEach(job => {
            updateJobStatus(job.id, 'failed', {
              error: 'Missing source file. Re-upload and try again.',
              progress: 0,
            });
          });

          continue;
        }

        try {
          ({ batchId } = await startBatchConversion({
            files: fileEntries.map(entry => entry.file),
            fileIds: fileEntries.map(entry => entry.job.fileId),
            targetFormat,
            onUploadProgress: (percent) => {
              const uiProgress = Math.round(percent * 0.4);
              fileEntries.forEach(({ job }) => updateJobStatus(job.id, 'processing', { progress: uiProgress }));
            }
          }));

          fileEntries.forEach(({ job }) => updateJobStatus(job.id, 'processing', { progress: 40, batchId }));

          const backendJob = await pollJobUntilFinished(batchId, {
            signal: activePollController.current?.signal,
            onProgress: (stream) => {
              stream.files.forEach((f) => {
                const matchedJob = fileEntries.find(entry => entry.job.fileId === f.file_id)?.job;
                if (matchedJob) {
                  const uiProgress = 40 + Math.round(f.progress * 0.6);
                  updateJobStatus(matchedJob.id, 'processing', { progress: uiProgress });
                }
              });
            }
          });
          const resultByFileId = new Map(backendJob.results.map(result => [result.file_id, result]));

          const completedEntries = (await Promise.all(
            fileEntries.map(async ({ job }) => {
              const result = resultByFileId.get(job.fileId);
              if (result?.status !== 'success') {
                return null;
              }

              const downloadUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'}/api/jobs/${batchId}/download/${job.fileId}`;
              const outputFilename = result.filename || formatDownloadFilename(job);
              const outputSize = await fetchRemoteFileSize(downloadUrl);

              return {
                ...job,
                batchId,
                status: 'completed' as const,
                progress: 100,
                downloadUrl,
                outputFilename,
                outputSize,
                downloaded: false,
              } satisfies CompletedResultJob;
            })
          )).filter(Boolean) as CompletedResultJob[];

          const failedEntries = fileEntries
            .map(({ job }) => {
              const result = resultByFileId.get(job.fileId);
              if (result?.status === 'success') {
                return null;
              }

              return {
                ...job,
                batchId,
                status: 'failed' as const,
                progress: 100,
                error: result?.error || 'Conversion failed for this file.',
                downloaded: false,
              } satisfies FailedResultJob;
            })
            .filter(Boolean) as FailedResultJob[];

          completedEntries.forEach(job => {
            toast({
              title: 'Conversion completed',
              description: `${job.fileName} is ready for download.`,
              className: 'bg-green-50 text-green-900 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900',
            });

            addToHistory(job);
            removeFromQueue(job.id);
          });

          failedEntries.forEach(job => {
            updateJobStatus(job.id, 'failed', {
              progress: 100,
              error: job.error,
            });
            addToHistory(job);
          });
        } catch (error) {
          const errorMessage = toUserFacingError(error);
          jobsInGroup.forEach(job => {
            updateJobStatus(job.id, 'failed', {
              progress: 100,
              error: errorMessage,
              batchId,
            });
            addToHistory({
              ...job,
              batchId,
              status: 'failed',
              progress: 100,
              error: errorMessage,
              downloaded: false,
            });
          });
        }
      }
    } finally {
      activePollController.current?.abort();
      activePollController.current = null;
      setIsConverting(false);
    }
  }, [addToHistory, fetchRemoteFileSize, formatDownloadFilename, jobFiles, queue, removeFromQueue, setIsConverting, updateJobStatus]);

  useEffect(() => () => {
    activePollController.current?.abort();
  }, []);

  const downloadFile = useCallback((jobId: string) => {
    const job = history.find(item => item.id === jobId) || queue.find(item => item.id === jobId);
    if (!job || !job.downloadUrl) return;

    triggerDownload(job.downloadUrl, formatDownloadFilename(job));
    updateHistoryJob(job.id, { downloaded: true });
  }, [formatDownloadFilename, history, queue, triggerDownload, updateHistoryJob]);

  const downloadAll = useCallback(async (batchId: string) => {
    const completedJobs = history.filter(job => job.batchId === batchId && job.status === 'completed' && job.downloadUrl);
    if (completedJobs.length === 0) return;

    const zip = new JSZip();

    await Promise.all(completedJobs.map(async job => {
      const response = await fetch(job.downloadUrl as string);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${job.fileName}`);
      }

      const blob = await response.blob();
      zip.file(formatDownloadFilename(job), blob);
    }));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    triggerDownload(zipUrl, `extconvert-${batchId}.zip`);
    URL.revokeObjectURL(zipUrl);

    completedJobs.forEach(job => updateHistoryJob(job.id, { downloaded: true }));
  }, [formatDownloadFilename, history, triggerDownload, updateHistoryJob]);

  const retryHistoryJob = useCallback((jobId: string) => {
    removeHistoryItem(jobId);
    convertFiles([jobId]);
  }, [convertFiles, removeHistoryItem]);

  const removeFromHistory = useCallback((jobId: string) => {
    removeHistoryItem(jobId);
  }, [removeHistoryItem]);

  const clearHistory = useCallback(() => {
    clearLocalHistory();

    clearBackendHistory().catch(error => {
      console.error('Failed to clear backend history:', error);
    });
  }, [clearLocalHistory]);

  return {
    queue,
    history,
    isConverting,
    addToQueue,
    updateJobStatus,
    removeFromQueue,
    convertFiles,
    downloadFile,
    downloadAll,
    removeFromHistory,
    retryHistoryJob,
    clearHistory,
  };
}
