'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const CONVERSION_TYPES = [
  { id: 'image-to-pdf', label: 'Image to PDF', from: 'Image', to: 'PDF' },
  { id: 'pdf-to-image', label: 'PDF to Image', from: 'PDF', to: 'Image' },
  { id: 'word-to-pdf', label: 'Word to PDF', from: 'Word', to: 'PDF' },
  { id: 'pdf-to-word', label: 'PDF to Word', from: 'PDF', to: 'Word' },
  { id: 'pdf-to-text', label: 'PDF to Text', from: 'PDF', to: 'Text' },
  { id: 'text-to-pdf', label: 'Text to PDF', from: 'Text', to: 'PDF' },
];

interface FormatSelectorProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
}

export function FormatSelector({ selectedType, onTypeChange }: FormatSelectorProps) {
  const currentType = CONVERSION_TYPES.find(t => t.id === selectedType);

  const getAcceptedFormats = (type: string): string[] => {
    const conversionType = CONVERSION_TYPES.find(t => t.id === type);
    if (!conversionType) return [];

    switch (conversionType.from) {
      case 'Image':
        return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      case 'PDF':
        return ['.pdf'];
      case 'Word':
        return ['.doc', '.docx'];
      case 'Text':
        return ['.txt'];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Select Conversion Type
          </label>
          <Select value={selectedType} onValueChange={onTypeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a conversion..." />
            </SelectTrigger>
            <SelectContent>
              {CONVERSION_TYPES.map(type => (
                <SelectItem key={type.id} value={type.id}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentType && (
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
            <div className="text-center flex-1">
              <p className="text-sm text-muted-foreground mb-1">From</p>
              <p className="text-lg font-semibold text-foreground">{currentType.from}</p>
            </div>
            <div className="px-3">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
            </div>
            <div className="text-center flex-1">
              <p className="text-sm text-muted-foreground mb-1">To</p>
              <p className="text-lg font-semibold text-foreground">{currentType.to}</p>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Accepted formats: {getAcceptedFormats(selectedType).join(', ').toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
}

export function getAcceptedFormatsForType(type: string): string[] {
  switch (type) {
    case 'image-to-pdf':
      return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    case 'pdf-to-image':
    case 'pdf-to-word':
    case 'pdf-to-text':
      return ['.pdf'];
    case 'word-to-pdf':
      return ['.doc', '.docx'];
    case 'text-to-pdf':
      return ['.txt'];
    default:
      return [];
  }
}
