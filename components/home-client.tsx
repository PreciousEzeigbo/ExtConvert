'use client';

import { useState } from 'react';
import { FileText, Zap } from 'lucide-react';
import { UploadArea } from '@/components/upload-area';
import { FormatSelector, getAcceptedFormatsForType } from '@/components/format-selector';
import { ConversionQueue } from '@/components/conversion-queue';
import { ConversionHistory } from '@/components/conversion-history';
import { ThemeToggle } from '@/components/theme-toggle';
import { useConverter } from '@/hooks/use-converter';

export function HomeClient() {
  const [selectedType, setSelectedType] = useState('image-to-pdf');
  const [selectedImageFormat, setSelectedImageFormat] = useState('png');

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

  const handleFilesSelected = (files: File[]) => {
    const effectiveType =
      selectedType === 'pdf-to-image' ? `pdf-to-${selectedImageFormat}` : selectedType;

    addToQueue(files, effectiveType);
  };

  const handleConvert = (jobIds: string[]) => {
    convertFiles(jobIds);
  };

  const acceptedFormats = getAcceptedFormatsForType(selectedType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">ExtConvert</h1>
                <p className="text-xs text-muted-foreground">Fast document conversion</p>
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

            <section className="bg-card border border-border rounded-lg p-6 shadow-sm" aria-labelledby="settings-heading">
              <h3 id="settings-heading" className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Conversion Settings
              </h3>
              <FormatSelector
                selectedType={selectedType}
                onTypeChange={setSelectedType}
                selectedImageFormat={selectedImageFormat}
                onImageFormatChange={setSelectedImageFormat}
              />
            </section>

            <section className="bg-card border border-border rounded-lg p-6 shadow-sm" aria-labelledby="upload-heading">
              <h3 id="upload-heading" className="text-lg font-semibold text-foreground mb-4">
                Upload Files
              </h3>
              <UploadArea
                onFilesSelected={handleFilesSelected}
                acceptedFormats={acceptedFormats}
                isLoading={isConverting}
              />
            </section>

            {queue.length > 0 && (
              <section className="bg-card border border-border rounded-lg p-6 shadow-sm" aria-labelledby="queue-heading">
                <h3 id="queue-heading" className="text-lg font-semibold text-foreground mb-4">
                  Conversion Queue
                </h3>
                <ConversionQueue
                  jobs={queue}
                  onConvert={handleConvert}
                  onDownload={downloadFile}
                  onRemove={removeFromQueue}
                  isConverting={isConverting}
                />
              </section>
            )}

            {history.length > 0 && (
              <section className="bg-card border border-border rounded-lg p-6 shadow-sm" aria-labelledby="history-heading">
                <h3 id="history-heading" className="sr-only">
                  Conversion History
                </h3>
                <ConversionHistory
                  history={history}
                  onDownload={downloadFile}
                  onRemoveFromHistory={removeFromHistory}
                  onClearHistory={clearHistory}
                />
              </section>
            )}
          </section>

          <aside className="space-y-6" aria-label="Converter information">
            <section className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-6" aria-labelledby="getting-started-heading">
              <h2 id="getting-started-heading" className="font-semibold text-foreground mb-3">
                Getting Started
              </h2>
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
            </section>

            <section className="bg-card border border-border rounded-lg p-6" aria-labelledby="features-heading">
              <h2 id="features-heading" className="font-semibold text-foreground mb-3">
                Features
              </h2>
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
            </section>

            {(queue.length > 0 || history.length > 0) && (
              <section className="bg-muted/30 border border-border rounded-lg p-6" aria-labelledby="stats-heading">
                <h2 id="stats-heading" className="font-semibold text-foreground mb-3">
                  Statistics
                </h2>
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
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
