'use client';

import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface UploadAreaProps {
  onFilesSelected: (files: File[]) => void;
  acceptedFormats: string[];
  isLoading?: boolean;
}

export function UploadArea({ onFilesSelected, acceptedFormats, isLoading = false }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFilesSelected(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
  };

  const handleFilesSelected = (files: File[]) => {
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push(file.name);
      } else {
        validFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      toast({
        title: 'File too large',
        description: `Skipped ${invalidFiles.length} file(s) over 100MB limit.`,
        className: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
      });
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const acceptString = acceptedFormats.join(',');

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptString}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={isLoading}
        />

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              {isDragging ? 'Drop your files here' : 'Drag and drop your files'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Supported formats: {acceptedFormats.join(', ').toUpperCase()}
          </p>
        </div>
      </div>

    </div>
  );
}
