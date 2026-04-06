import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Wifi, WifiOff } from 'lucide-react';

interface OfflineStatusContextType {
  isOnline: boolean;
}

const OfflineStatusContext = createContext<OfflineStatusContextType | undefined>(undefined);

export const OfflineStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('You are back online. Synchronizing data...', {
        icon: <Wifi className="w-4 h-4 text-green-500" />,
        duration: 5000,
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error('You are offline. Changes will be saved locally.', {
        icon: <WifiOff className="w-4 h-4 text-destructive" />,
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <OfflineStatusContext.Provider value={{ isOnline }}>
      {children}
    </OfflineStatusContext.Provider>
  );
};

export const useOfflineStatus = () => {
  const context = useContext(OfflineStatusContext);
  if (context === undefined) {
    throw new Error('useOfflineStatus must be used within an OfflineStatusProvider');
  }
  return context;
};
