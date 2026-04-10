import React from 'react';
import { useOfflineStatus } from '@/context/OfflineStatusContext';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ConnectivityBanner: React.FC = () => {
  const { isOnline } = useOfflineStatus();

  if (isOnline) return null;

  return (
    <div className={cn(
      "w-full bg-destructive text-destructive-foreground py-1.5 px-4 flex items-center justify-center gap-2 text-sm font-medium animate-in slide-in-from-top duration-300",
      "sticky top-0 z-[100] shadow-md border-b border-white/10"
    )}>
      <WifiOff className="w-4 h-4 animate-pulse" />
      <span>Working Offline — Changes will sync when connected.</span>
      <div className="ml-2 px-2 py-0.5 rounded bg-white/20 text-[10px] uppercase font-bold tracking-wider">
        Mode: Local Persistence
      </div>
    </div>
  );
};
