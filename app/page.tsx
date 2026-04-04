'use client';

import { useState, useEffect } from 'react';
import { FileText, Zap } from 'lucide-react';
import { UploadArea } from '@/components/upload-area';
import { FormatSelector, getAcceptedFormatsForType } from '@/components/format-selector';
import { ConversionQueue } from '@/components/conversion-queue';
import { ConversionHistory } from '@/components/conversion-history';
import { useConverter } from '@/hooks/use-converter';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [selectedType, setSelectedType] = useState('image-to-pdf');
  const [isMounted, setIsMounted] = useState(false);
  
  const {
    queue,
    history,
    isConverting,
    addToQueue,
    removeFromQueue,
    convertFiles,
    downloadFile,
    removeFromHistory,
    clearHistory,
  } = useConverter();

  // Hydration fix
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const handleFilesSelected = (files: File[]) => {
    addToQueue(files, selectedType);
  };

  const handleConvert = (jobIds: string[]) => {
    convertFiles(jobIds);
  };

  const acceptedFormats = getAcceptedFormatsForType(selectedType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">DocConvert</h1>
                <p className="text-xs text-muted-foreground">Fast document conversion</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Input */}
          <div className="lg:col-span-2 space-y-6">
            {/* Format Selector Card */}
            <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Conversion Settings
              </h2>
              <FormatSelector selectedType={selectedType} onTypeChange={setSelectedType} />
            </div>

            {/* Upload Area Card */}
            <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4">Upload Files</h2>
              <UploadArea
                onFilesSelected={handleFilesSelected}
                acceptedFormats={acceptedFormats}
                isLoading={isConverting}
              />
            </div>

            {/* Queue Card */}
            {queue.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground mb-4">Conversion Queue</h2>
                <ConversionQueue
                  jobs={queue}
                  onConvert={handleConvert}
                  onDownload={downloadFile}
                  onRemove={removeFromQueue}
                  isConverting={isConverting}
                />
              </div>
            )}

            {/* History Card */}
            {history.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                <ConversionHistory
                  history={history}
                  onDownload={downloadFile}
                  onRemoveFromHistory={removeFromHistory}
                  onClearHistory={clearHistory}
                />
              </div>
            )}
          </div>

          {/* Right Column - Info */}
          <div className="space-y-6">
            {/* Quick Info Card */}
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-6">
              <h3 className="font-semibold text-foreground mb-3">Getting Started</h3>
              <ol className="space-y-2 text-sm text-foreground/80">
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">1.</span>
                  <span>Select your conversion type</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">2.</span>
                  <span>Upload your files via drag & drop</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">3.</span>
                  <span>Click &ldquo;Convert All&rdquo; to start</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">4.</span>
                  <span>Download your converted files</span>
                </li>
              </ol>
            </div>

            {/* Features Card */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="font-semibold text-foreground mb-3">Features</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Batch processing</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Multiple formats</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Progress tracking</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Conversion history</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">✓</span>
                  <span>Drag & drop upload</span>
                </li>
              </ul>
            </div>

            {/* Stats Card */}
            {(queue.length > 0 || history.length > 0) && (
              <div className="bg-muted/30 border border-border rounded-lg p-6">
                <h3 className="font-semibold text-foreground mb-3">Statistics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">In Queue:</span>
                    <span className="font-semibold text-foreground">{queue.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {history.filter(j => j.status === 'completed').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Failed:</span>
                    <span className="font-semibold text-destructive">
                      {history.filter(j => j.status === 'failed').length}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
