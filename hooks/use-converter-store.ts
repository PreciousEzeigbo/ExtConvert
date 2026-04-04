import { useCallback, useEffect, useState } from 'react';
import type { ConversionJob } from '@/components/conversion-queue';

const STORAGE_KEY = 'converter-history';
const QUEUE_KEY = 'converter-queue';

function reviveJobs(raw: string | null): ConversionJob[] {
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as Array<ConversionJob & { createdAt: string }>;
  return parsed.map(job => ({
    ...job,
    fileId: job.fileId || job.id,
    createdAt: new Date(job.createdAt),
  }));
}

export function useConverterStore() {
  const [queue, setQueue] = useState<ConversionJob[]>([]);
  const [history, setHistory] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [jobFiles, setJobFiles] = useState<Record<string, File>>({});

  useEffect(() => {
    try {
      setQueue(reviveJobs(localStorage.getItem(QUEUE_KEY)));
      setHistory(reviveJobs(localStorage.getItem(STORAGE_KEY)));
    } catch (error) {
      console.error('Error loading converter data:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving queue:', error);
    }
  }, [queue]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }, [history]);

  const addToQueue = useCallback((jobs: ConversionJob[], files: File[]) => {
    setQueue(prev => [...prev, ...jobs]);
    setJobFiles(prev => {
      const next = { ...prev };
      jobs.forEach((job, index) => {
        next[job.id] = files[index];
      });
      return next;
    });
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
    setJobFiles(prev => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
  }, []);

  const addToHistory = useCallback((job: ConversionJob) => {
    setHistory(prev => [...prev, job]);
  }, []);

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
    setIsConverting,
    addToQueue,
    updateJobStatus,
    removeFromQueue,
    addToHistory,
    removeFromHistory,
    clearHistory,
    jobFiles,
  };
}
