 'use client';

import { useState } from 'react';
import { File, Download, Loader2, CheckCircle2, AlertCircle, Trash2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ConversionJob {
  id: string;
  batchId?: string;
  fileId: string;
  fileName: string;
  fromFormat: string;
  toFormat: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  downloadUrl?: string;
  outputFilename?: string;
  outputSize?: number;
  downloaded?: boolean;
  createdAt: Date;
}

interface ConversionQueueProps {
  jobs: ConversionJob[];
  onConvert: (selectedJobs: string[]) => void;
  onDownload: (jobId: string) => void;
  onRemove: (jobId: string) => void;
  isConverting?: boolean;
}

export function ConversionQueue({
  jobs,
  onConvert,
  onDownload,
  onRemove,
  isConverting = false,
}: ConversionQueueProps) {
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const processingJobs = jobs.filter(j => j.status === 'processing');

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <File className="size-4 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No files in queue yet</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="size-4 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="size-4 text-primary" />;
      case 'failed':
        return <AlertCircle className="size-4 text-destructive" />;
      default:
        return <File className="size-4 text-warning" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-card border-border';
      case 'failed':
        return 'bg-card border-destructive/40';
      case 'processing':
        return 'bg-card border-primary/40';
      default:
        return 'bg-card border-warning/40';
    }
  };

  const JobItem = ({ job }: { job: ConversionJob }) => {
    const [leaving, setLeaving] = useState(false);

    const startRemove = (id: string) => {
      setLeaving(true);
      setTimeout(() => onRemove(id), 180);
    };

    return (
      <div className={`flex items-center gap-4 p-4 rounded-md border ${getStatusColor(job.status)} transition-all duration-200 ease-out ${leaving ? 'opacity-0 -translate-y-2 max-h-0 p-0 overflow-hidden' : 'opacity-100'}`}>
      <div className="flex-shrink-0">
        {getStatusIcon(job.status)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{job.fileName}</p>
        <div className="flex items-center gap-2 font-label text-[11px] text-muted-foreground mt-1">
          <span>{job.fromFormat}</span>
          <span>→</span>
          <span>{job.toFormat}</span>
        </div>

        {job.status === 'processing' && job.progress !== undefined && (
          <div className="mt-1 space-y-1">
            <div className="mt-2 w-full bg-muted rounded-sm h-2 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="font-label text-[11px] text-muted-foreground">
              {job.progress <= 40 ? 'Uploading' : 'Converting'} {job.progress}%
            </p>
          </div>
        )}

        {job.status === 'failed' && job.error && (
          <p className="text-xs text-destructive mt-1 transition-opacity duration-200">{job.error}</p>
        )}
      </div>

      <div className="flex gap-2 flex-shrink-0">
        {job.status === 'completed' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDownload(job.id)}
            className="h-8 w-8 p-0"
            title="Download"
          >
            <Download className="size-4" />
          </Button>
        )}

        {(job.status === 'pending' || job.status === 'failed') && (
          <>
            {job.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onConvert([job.id])}
                disabled={isConverting}
                className="h-8 w-8 p-0"
                title="Convert File"
              >
                <Play className="size-4 ml-0.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => startRemove(job.id)}
              className="h-8 w-8 p-0 text-destructive"
              title="Remove"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6">
      {processingJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Converting ({processingJobs.length})</h3>
          <div className="space-y-2">
            {processingJobs.map(job => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {pendingJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Pending ({pendingJobs.length})</h3>
            <Button
              onClick={() => onConvert(pendingJobs.map(j => j.id))}
              disabled={isConverting || pendingJobs.length === 0}
              className="h-8 px-3"
              size="sm"
            >
              {isConverting ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Converting...
                </>
              ) : (
                'Convert All'
              )}
            </Button>
          </div>
          <div className="space-y-2">
            {pendingJobs.map(job => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
