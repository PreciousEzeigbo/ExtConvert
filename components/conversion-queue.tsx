'use client';

import { File, Download, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ConversionJob {
  id: string;
  fileId: string;
  fileName: string;
  fromFormat: string;
  toFormat: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  downloadUrl?: string;
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
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const failedJobs = jobs.filter(j => j.status === 'failed');

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <File className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-muted-foreground">No files in queue yet</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <File className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900';
      case 'failed':
        return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900';
      case 'processing':
        return 'bg-blue-50/70 border-blue-300 dark:bg-blue-950/25 dark:border-blue-800 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]';
      default:
        return 'bg-muted/30 border-border';
    }
  };

  const JobItem = ({ job }: { job: ConversionJob }) => (
    <div className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${getStatusColor(job.status)}`}>
      <div className="flex-shrink-0">
        {getStatusIcon(job.status)}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{job.fileName}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>{job.fromFormat.toUpperCase()}</span>
          <span>→</span>
          <span>{job.toFormat.toUpperCase()}</span>
        </div>
        
        {job.status === 'processing' && job.progress !== undefined && (
          <div className="mt-2 w-full bg-border/70 rounded-full h-2 overflow-hidden">
            <div
              className="h-full progress-stripes transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        )}
        
        {job.status === 'failed' && job.error && (
          <p className="text-xs text-destructive mt-1">{job.error}</p>
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
            <Download className="w-4 h-4" />
          </Button>
        )}
        
        {(job.status === 'pending' || job.status === 'failed') && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRemove(job.id)}
            className="h-8 w-8 p-0 text-destructive border-destructive/40 hover:text-destructive hover:border-destructive/60 hover:bg-red-100/80 dark:hover:bg-red-900/35"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

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
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
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

      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Completed ({completedJobs.length})</h3>
          <div className="space-y-2">
            {completedJobs.map(job => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {failedJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Failed ({failedJobs.length})</h3>
          <div className="space-y-2">
            {failedJobs.map(job => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
