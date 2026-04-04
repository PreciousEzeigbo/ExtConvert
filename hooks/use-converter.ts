import { useState, useCallback, useEffect } from 'react';
import { ConversionJob } from '@/components/conversion-queue';

const STORAGE_KEY = 'converter-history';
const QUEUE_KEY = 'converter-queue';

export function useConverter() {
  const [queue, setQueue] = useState<ConversionJob[]>([]);
  const [history, setHistory] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem(QUEUE_KEY);
      const savedHistory = localStorage.getItem(STORAGE_KEY);
      
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue);
        setQueue(parsed.map((j: any) => ({ ...j, createdAt: new Date(j.createdAt) })));
      }
      
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed.map((j: any) => ({ ...j, createdAt: new Date(j.createdAt) })));
      }
    } catch (error) {
      console.error('Error loading converter data:', error);
    }
  }, []);

  // Save queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  }, [queue]);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }, [history]);

  const addToQueue = useCallback((files: File[], conversionType: string) => {
    const newJobs: ConversionJob[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      fileName: file.name,
      fromFormat: conversionType.split('-')[0],
      toFormat: conversionType.split('-')[2],
      status: 'pending',
      createdAt: new Date(),
    }));

    setQueue(prev => [...prev, ...newJobs]);
  }, []);

  const updateJobStatus = useCallback((jobId: string, status: ConversionJob['status'], data?: Partial<ConversionJob>) => {
    setQueue(prev =>
      prev.map(job =>
        job.id === jobId
          ? { ...job, status, ...data }
          : job
      )
    );
  }, []);

  const removeFromQueue = useCallback((jobId: string) => {
    setQueue(prev => prev.filter(job => job.id !== jobId));
  }, []);

  const convertFiles = useCallback(async (jobIds: string[]) => {
    setIsConverting(true);

    const jobsToConvert = queue.filter(j => jobIds.includes(j.id));

    try {
      for (const job of jobsToConvert) {
        updateJobStatus(job.id, 'processing', { progress: 0 });

        try {
          // Simulate conversion process with progress updates
          const progressInterval = setInterval(() => {
            updateJobStatus(job.id, 'processing', {
              progress: prev => Math.min((prev || 0) + Math.random() * 30, 90)
            });
          }, 500);

          // Simulate API call delay
          await new Promise(resolve => setTimeout(resolve, 2000));

          clearInterval(progressInterval);

          // Mark as completed
          const completedJob: ConversionJob = {
            ...job,
            status: 'completed',
            progress: 100,
            downloadUrl: `/api/download/${job.id}`,
          };

          updateJobStatus(job.id, 'completed', {
            progress: 100,
            downloadUrl: completedJob.downloadUrl,
          });

          // Move to history
          setHistory(prev => [...prev, completedJob]);
          removeFromQueue(job.id);
        } catch (error) {
          updateJobStatus(job.id, 'failed', {
            error: 'Conversion failed. Please try again.',
          });
        }
      }
    } finally {
      setIsConverting(false);
    }
  }, [queue, updateJobStatus, removeFromQueue]);

  const downloadFile = useCallback((jobId: string) => {
    const job = history.find(j => j.id === jobId) || queue.find(j => j.id === jobId);
    if (!job || !job.downloadUrl) return;

    // Create a mock download - in production, this would be a real file download
    const link = document.createElement('a');
    link.href = job.downloadUrl;
    link.download = `${job.fileName.split('.')[0]}.${job.toFormat.toLowerCase()}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [history, queue]);

  const removeFromHistory = useCallback((jobId: string) => {
    setHistory(prev => prev.filter(job => job.id !== jobId));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

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
