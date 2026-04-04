import { useCallback, useEffect, useRef } from 'react';
import { ConversionJob } from '@/components/conversion-queue';
import { toast } from '@/hooks/use-toast';
import { clearBackendHistory, startBatchConversion } from '@/lib/conversion-api';
import { pollJobUntilFinished } from '@/lib/conversion-poller';
import { useConverterStore } from '@/hooks/use-converter-store';

const normalizeFormat = (format: string): string => {
  const value = format.toLowerCase();

  if (value === 'text') return 'txt';
  if (value === 'word') return 'docx';
  if (value === 'image') return 'png';

  return value;
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
    removeFromHistory: removeHistoryItem,
    clearHistory: clearLocalHistory,
    jobFiles,
  } = useConverterStore();

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
          const { batchId } = await startBatchConversion({
            files: fileEntries.map(entry => entry.file),
            fileIds: fileEntries.map(entry => entry.job.fileId),
            targetFormat,
          });

          fileEntries.forEach(({ job }) => updateJobStatus(job.id, 'processing', { progress: 50 }));

          const backendJob = await pollJobUntilFinished(batchId, {
            signal: activePollController.current?.signal,
          });
          const resultByFileId = new Map(backendJob.results.map(result => [result.file_id, result]));

          for (const { job } of fileEntries) {
            const result = resultByFileId.get(job.fileId);

            if (result?.status === 'success') {
              const completedJob: ConversionJob = {
                ...job,
                status: 'completed',
                progress: 100,
                downloadUrl: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'}/api/jobs/${batchId}/download/${job.fileId}`,
              };

              toast({
                title: 'Conversion completed',
                description: `${job.fileName} is ready for download.`,
                className: 'completion-toast text-foreground',
              });

              addToHistory(completedJob);
              removeFromQueue(job.id);
              continue;
            }

            const failedJob: ConversionJob = {
              ...job,
              status: 'failed',
              progress: 100,
              error: result?.error || 'Conversion failed for this file.',
            };

            updateJobStatus(job.id, 'failed', {
              progress: 100,
              error: failedJob.error,
            });
          }
        } catch (error) {
          jobsInGroup.forEach(job => {
            updateJobStatus(job.id, 'failed', {
              progress: 100,
              error: error instanceof Error ? error.message : 'Conversion failed. Please try again.',
            });
          });
        }
      }
    } finally {
      activePollController.current?.abort();
      activePollController.current = null;
      setIsConverting(false);
    }
  }, [addToHistory, jobFiles, queue, removeFromQueue, setIsConverting, updateJobStatus]);

  useEffect(() => () => {
    activePollController.current?.abort();
  }, []);

  const downloadFile = useCallback((jobId: string) => {
    const job = history.find(item => item.id === jobId) || queue.find(item => item.id === jobId);
    if (!job || !job.downloadUrl) return;

    const link = document.createElement('a');
    link.href = job.downloadUrl;
    link.download = `${job.fileName.split('.')[0]}.${job.toFormat.toLowerCase()}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [history, queue]);

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
    removeFromHistory,
    clearHistory,
  };
}
