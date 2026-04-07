'use client';

import { useMemo } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Download, DownloadCloud, File, Loader2, RefreshCw, Trash2, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConversionJob } from './conversion-queue';

interface ConversionHistoryProps {
  queue: ConversionJob[];
  history: ConversionJob[];
  onConvert: (selectedJobs: string[]) => void;
  onDownload: (jobId: string) => void;
  onDownloadAll: (batchId: string) => void;
  onRetry: (jobId: string) => void;
  onRemoveFromQueue: (jobId: string) => void;
  onRemoveFromHistory?: (jobId: string) => void;
  onClearHistory: () => void;
  isConverting?: boolean;
}

const formatFileSize = (size?: number) => {
  if (size === undefined || size === null || Number.isNaN(size)) {
    return 'Size pending';
  }

  if (size === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
};

const sortByRecent = (a: ConversionJob, b: ConversionJob) => b.createdAt.getTime() - a.createdAt.getTime();

const statusPriority: Record<ConversionJob['status'], number> = {
  processing: 3,
  pending: 2,
  completed: 1,
  failed: 0,
};

const rowTone = (status: ConversionJob['status']) => {
  switch (status) {
    case 'processing':
      return 'border-blue-300 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/20';
    case 'completed':
      return 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20';
    case 'failed':
      return 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20';
    default:
      return 'border-border bg-muted/20';
  }
};

const rowIcon = (job: ConversionJob) => {
  switch (job.status) {
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-300" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
};

const rowStatusLabel = (job: ConversionJob) => {
  switch (job.status) {
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return 'Queued';
  }
};

export function ConversionHistory({
  queue,
  history,
  onConvert,
  onDownload,
  onDownloadAll,
  onRetry,
  onRemoveFromQueue,
  onRemoveFromHistory,
  onClearHistory,
  isConverting = false,
}: ConversionHistoryProps) {
  const mergedJobs = useMemo(() => {
    const jobsById = new Map<string, ConversionJob>();

    [...queue, ...history].forEach(job => {
      const existing = jobsById.get(job.id);
      if (!existing) {
        jobsById.set(job.id, job);
        return;
      }

      const existingPriority = statusPriority[existing.status];
      const currentPriority = statusPriority[job.status];
      if (currentPriority > existingPriority || (currentPriority === existingPriority && job.createdAt.getTime() >= existing.createdAt.getTime())) {
        jobsById.set(job.id, { ...existing, ...job });
      }
    });

    return Array.from(jobsById.values()).sort(sortByRecent);
  }, [history, queue]);

  const activeJobs = mergedJobs.filter(job => job.status === 'pending' || job.status === 'processing');
  const completedJobs = mergedJobs.filter(job => job.status === 'completed');
  const failedJobs = mergedJobs.filter(job => job.status === 'failed');
  const actionableJobs = mergedJobs.filter(job => job.status === 'pending');

  const visibleGroups = useMemo(() => {
    const grouped = new Map<string, { key: string; label: string; jobs: ConversionJob[]; latestCreatedAt: number }>();

    mergedJobs.forEach(job => {
      const key = job.batchId || `live:${job.toFormat}`;
      const label = job.batchId
        ? `Batch ${job.batchId.slice(0, 8).toUpperCase()}`
        : `Ready for ${job.toFormat.toUpperCase()}`;

      const existing = grouped.get(key) || {
        key,
        label,
        jobs: [],
        latestCreatedAt: job.createdAt.getTime(),
      };

      existing.jobs.push(job);
      existing.latestCreatedAt = Math.max(existing.latestCreatedAt, job.createdAt.getTime());
      grouped.set(key, existing);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt)
      .map(group => ({
        ...group,
        jobs: group.jobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      }));
  }, [mergedJobs]);

  if (mergedJobs.length === 0) {
    return <p className="text-sm text-muted-foreground">No conversions yet.</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card/95 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Conversions</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeJobs.length > 0
              ? `${activeJobs.length} file${activeJobs.length === 1 ? '' : 's'} in progress`
              : `${completedJobs.length + failedJobs.length} finished file${completedJobs.length + failedJobs.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actionableJobs.length > 0 && (
            <Button
              onClick={() => onConvert(actionableJobs.map(job => job.id))}
              disabled={isConverting || actionableJobs.length === 0}
              className="h-9 px-4"
              size="sm"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Converting...
                </>
              ) : (
                'Convert All'
              )}
            </Button>
          )}

          {(completedJobs.length > 0 || failedJobs.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearHistory}
              className="text-destructive hover:text-destructive hover:bg-red-100/70 dark:hover:bg-red-900/25"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {visibleGroups.map(group => {
          const completedCount = group.jobs.filter(job => job.status === 'completed').length;
          const failedCount = group.jobs.filter(job => job.status === 'failed').length;
          const pendingCount = group.jobs.filter(job => job.status === 'pending').length;
          const processingCount = group.jobs.filter(job => job.status === 'processing').length;

          return (
            <section key={group.key} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {completedCount > 0 ? `${completedCount} completed` : ''}
                    {completedCount > 0 && failedCount > 0 ? ', ' : ''}
                    {failedCount > 0 ? `${failedCount} failed` : ''}
                    {completedCount === 0 && failedCount === 0 && pendingCount > 0 ? `${pendingCount} pending` : ''}
                    {processingCount > 0 ? `${pendingCount > 0 || completedCount > 0 || failedCount > 0 ? ', ' : ''}${processingCount} processing` : ''}
                  </p>
                </div>

                {completedCount > 1 && group.key.startsWith('live:') === false && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownloadAll(group.key)}
                    className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  >
                    <DownloadCloud className="w-4 h-4 mr-2" />
                    Download all
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {group.jobs.map(job => (
                  <article
                    key={job.id}
                    className={`rounded-xl border p-4 shadow-sm transition-all ${rowTone(job.status)}`}
                  >
                    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/5">
                            {rowIcon(job)}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate text-sm font-semibold text-foreground">
                                {job.fileName}
                              </h4>
                              <Badge variant="outline" className="uppercase tracking-wide">
                                {job.toFormat.toUpperCase()}
                              </Badge>
                              {job.downloaded && job.status === 'completed' && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  Downloaded
                                </Badge>
                              )}
                              <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>
                                {rowStatusLabel(job)}
                              </Badge>
                            </div>

                            {job.status === 'processing' && job.progress !== undefined && (
                              <div className="space-y-1">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-border/70">
                                  <div
                                    className="h-full progress-stripes transition-all duration-500 bg-primary"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                  {job.progress <= 40 ? 'Uploading' : 'Converting'}... {job.progress}%
                                </p>
                              </div>
                            )}

                            {job.status === 'pending' && (
                              <p className="text-xs text-muted-foreground">Waiting to start conversion.</p>
                            )}

                            {job.status === 'completed' && (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                  Converted
                                </span>
                                <span>•</span>
                                <span>{formatFileSize(job.outputSize)}</span>
                              </div>
                            )}

                            {job.status === 'failed' && (
                              <p className="text-sm text-red-700 dark:text-red-300">
                                {job.error || 'Conversion failed.'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-2 md:w-[11rem]">
                        {job.status === 'completed' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => onDownload(job.id)}
                              className="h-11 flex-1 bg-foreground text-background hover:bg-foreground/90"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                            {onRemoveFromHistory && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRemoveFromHistory(job.id)}
                                className="h-11 w-11 p-0 border-destructive/40 text-destructive hover:bg-red-100/80 hover:text-destructive/90 shrink-0"
                                title="Clear File"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}

                        {job.status === 'failed' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => onRetry(job.id)}
                              className="h-11 flex-1 bg-red-600 text-white hover:bg-red-700"
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Retry
                            </Button>
                            {onRemoveFromHistory && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRemoveFromHistory(job.id)}
                                className="h-11 w-11 p-0 border-destructive/40 text-destructive hover:bg-red-100/80 hover:text-destructive/90 shrink-0"
                                title="Clear File"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}

                        {job.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => onConvert([job.id])}
                              disabled={isConverting}
                              className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Convert
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onRemoveFromQueue(job.id)}
                              className="h-11 w-11 p-0 border-destructive/40 text-destructive hover:bg-red-100/80 hover:text-destructive/90 shrink-0"
                              title="Remove File"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
