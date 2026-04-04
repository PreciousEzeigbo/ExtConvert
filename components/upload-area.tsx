'use client';

import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UploadAreaProps {
  onFilesSelected: (files: File[]) => void;
  acceptedFormats: string[];
  isLoading?: boolean;
}

export function UploadArea({ onFilesSelected, acceptedFormats, isLoading = false }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
    const newFiles = [...selectedFiles, ...files];
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    onFilesSelected(updated);
  };

  const acceptString = acceptedFormats.join(',');

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
          isDragging
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

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Selected Files ({selectedFiles.length})</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  disabled={isLoading}
                  className="ml-2 p-1 hover:bg-destructive/10 rounded transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
