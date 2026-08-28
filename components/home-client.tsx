'use client';

import { useState } from 'react';
import { FileText, Zap } from 'lucide-react';
import { UploadArea } from '@/components/upload-area';
import { FormatSelector, getAcceptedFormatsForType } from '@/components/format-selector';
import { ConversionHistory } from '@/components/conversion-history';
import { ThemeToggle } from '@/components/theme-toggle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConverter } from '@/hooks/use-converter';

interface HomeClientProps {
  currentYear: number;
}

export function HomeClient({ currentYear }: HomeClientProps) {
  const [selectedType, setSelectedType] = useState('image-to-pdf');
  const [selectedImageFormat, setSelectedImageFormat] = useState('png');

  const {
    queue,
    history,
    isConverting,
    addToQueue,
    removeFromQueue,
    removeFromHistory,
    convertFiles,
    downloadFile,
    downloadAll,
    retryHistoryJob,
    clearHistory,
  } = useConverter();

  const handleFilesSelected = (files: File[]) => {
    const effectiveType =
      selectedType === 'pdf-to-image' ? `pdf-to-${selectedImageFormat}` : selectedType;

    addToQueue(files, effectiveType);
  };

  const handleConvert = (jobIds: string[]) => {
    convertFiles(jobIds);
  };

  const acceptedFormats = getAcceptedFormatsForType(selectedType);
  const failedIds = new Set<string>();
  queue.filter(job => job.status === 'failed').forEach(job => failedIds.add(job.id));
  history.filter(job => job.status === 'failed').forEach(job => failedIds.add(job.id));
  const failedCount = failedIds.size;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-sm border border-border bg-card p-2">
                <Zap className="size-4 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">ExtConvert</h1>
                <p className="font-label text-[11px] text-muted-foreground">Fast document conversion</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-6" aria-labelledby="conversion-tools-heading">
            <h2 id="conversion-tools-heading" className="sr-only">
              Conversion Tools
            </h2>

            <Card aria-labelledby="settings-heading">
              <CardHeader>
                <CardTitle id="settings-heading" className="text-lg flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  Conversion Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormatSelector
                  selectedType={selectedType}
                  onTypeChange={setSelectedType}
                  selectedImageFormat={selectedImageFormat}
                  onImageFormatChange={setSelectedImageFormat}
                />
              </CardContent>
            </Card>

            <Card aria-labelledby="upload-heading">
              <CardHeader>
                <CardTitle id="upload-heading" className="text-lg">
                  Upload Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UploadArea
                  onFilesSelected={handleFilesSelected}
                  acceptedFormats={acceptedFormats}
                  isLoading={isConverting}
                />
              </CardContent>
            </Card>

            <ConversionHistory
              queue={queue}
              history={history}
              onConvert={handleConvert}
              onDownload={downloadFile}
              onDownloadAll={downloadAll}
              onRetry={retryHistoryJob}
              onRemoveFromQueue={removeFromQueue}
              onRemoveFromHistory={removeFromHistory}
              onClearHistory={clearHistory}
              isConverting={isConverting}
            />
          </section>

          <aside className="space-y-6" aria-label="Converter information">
            <Card aria-labelledby="getting-started-heading">
              <CardHeader>
                <CardTitle id="getting-started-heading" className="text-lg">
                  Getting Started
                </CardTitle>
              </CardHeader>
              <CardContent>
              <ol className="space-y-2 text-sm text-foreground/80">
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">1.</span>
                  <span>Select your conversion type</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">2.</span>
                  <span>Upload your files via drag and drop</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">3.</span>
                  <span>Click Convert All to start</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-primary flex-shrink-0">4.</span>
                  <span>Download your converted files</span>
                </li>
              </ol>
              </CardContent>
            </Card>

            <Card aria-labelledby="features-heading">
              <CardHeader>
                <CardTitle id="features-heading" className="text-lg">
                  Features
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                  <span>Drag and drop upload</span>
                </li>
              </ul>
              </CardContent>
            </Card>

            {(queue.length > 0 || history.length > 0) && (
              <Card aria-labelledby="stats-heading">
                <CardHeader>
                  <CardTitle id="stats-heading" className="text-lg">
                    Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                <div className="space-y-2 font-label text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">In Queue</span>
                    <span className="text-foreground">{queue.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="text-primary">
                      {history.filter(j => j.status === 'completed').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Failed</span>
                    <span className="text-destructive">
                      {failedCount}
                    </span>
                  </div>
                </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </main>

      <footer className="border-t border-border py-5">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {currentYear} ExtConvert. Your document converter.
        </div>
      </footer>
    </div>
  );
}
