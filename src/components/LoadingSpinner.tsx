import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingSpinner({ size = 'md', label, className }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className="rounded-full p-2"
        style={{
          background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 20% 95%) 100%)',
          boxShadow: '0 1px 0 0 rgba(255,255,255,0.8) inset, 0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid hsl(214 20% 85%)',
        }}
      >
        <Loader2 className={cn(sizeMap[size], 'animate-spin text-primary')} />
      </div>
      {label && <p className="text-sm text-muted-foreground text-emboss">{label}</p>}
    </div>
  );
}

export function FullPageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
