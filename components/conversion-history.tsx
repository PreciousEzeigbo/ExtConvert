'use client';

import { Clock, Download, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { ConversionJob } from './conversion-queue';

interface ConversionHistoryProps {
  history: ConversionJob[];
  onDownload: (jobId: string) => void;
  onRemoveFromHistory: (jobId: string) => void;
  onClearHistory: () => void;
}

export function ConversionHistory({
  history,
  onDownload,
  onRemoveFromHistory,
  onClearHistory,
}: ConversionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (history.length === 0) {
    return null;
  }

  const completedHistory = history.filter(j => j.status === 'completed');

  if (completedHistory.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border pt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full mb-4 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Conversion History ({completedHistory.length})
          </h3>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="space-y-3">
          <div className="max-h-64 overflow-y-auto space-y-2">
            {completedHistory.map(job => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{job.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{job.fromFormat.toUpperCase()}</span>
                    <span>→</span>
                    <span>{job.toFormat.toUpperCase()}</span>
                    <span>•</span>
                    <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="flex gap-2 ml-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(job.id)}
                    className="h-8 w-8 p-0"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRemoveFromHistory(job.id)}
                    className="h-8 w-8 p-0 text-destructive border-destructive/40 hover:text-destructive hover:border-destructive/60 hover:bg-red-100/80 dark:hover:bg-red-900/35"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          {completedHistory.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearHistory}
              className="w-full text-destructive border-destructive/40 hover:text-destructive hover:border-destructive/60 hover:bg-red-100/85 dark:hover:bg-red-900/35"
            >
              Clear All History
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
