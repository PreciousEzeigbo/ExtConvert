'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  const handleToggle = () => {
    if (!mounted) return;
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleToggle}
      className="relative h-9 w-9 overflow-hidden rounded-full border-border/70 bg-card/70 backdrop-blur transition-all hover:scale-105 hover:bg-card"
      aria-label="Toggle color theme"
      title={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle color theme'}
    >
      <Sun
        className={`absolute h-4 w-4 text-amber-500 transition-all duration-300 ${
          mounted && isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 text-blue-400 transition-all duration-300 ${
          mounted && isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
        }`}
      />
      <span className="sr-only">Toggle color theme</span>
    </Button>
  );
}
