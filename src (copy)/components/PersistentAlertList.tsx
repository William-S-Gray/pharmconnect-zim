import React from 'react';
import { useNotifications } from '../context/NotificationContext';
import { X, Bell, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';

export const PersistentAlertList = () => {
  const { persistentAlerts, dismissNotification } = useNotifications();
  const { isPharmacyAdmin } = useAuth();

  if (persistentAlerts.length === 0) return null;

  return (
    <div className="space-y-3 mb-6 animate-in slide-in-from-top duration-500">
      {persistentAlerts.map((alert) => (
        <div 
          key={alert.id}
          className={`relative p-4 rounded-xl border-l-4 shadow-sm flex items-start gap-3 transition-all ${
            alert.type === 'REQUEST' 
              ? 'bg-blue-500/10 border-blue-500 text-blue-900 dark:text-blue-100' 
              : 'bg-orange-500/10 border-orange-500 text-orange-900 dark:text-orange-100'
          }`}
        >
          <div className="mt-0.5">
            {alert.type === 'REQUEST' ? (
              <Bell className="w-5 h-5 text-blue-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-orange-500" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm flex items-center gap-2">
              {alert.title}
              <span className="text-[10px] uppercase tracking-wider bg-current/10 px-1.5 py-0.5 rounded">
                {alert.type}
              </span>
            </h4>
            <p className="text-sm opacity-90 mt-0.5 leading-relaxed">
              {alert.message}
            </p>
            
            <div className="flex gap-2 mt-3">
              {alert.type === 'REQUEST' && (
                <Button size="sm" variant="outline" className="h-7 text-xs bg-background/50 border-blue-500/30 hover:bg-background">
                  <ExternalLink className="w-3 h-3 mr-1" /> View Request
                </Button>
              )}
              {alert.type === 'APPROVAL' && (
                <Button size="sm" variant="outline" className="h-7 text-xs bg-background/50 border-orange-500/30 hover:bg-background">
                  <CheckCircle className="w-3 h-3 mr-1" /> Review Change
                </Button>
              )}
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 text-xs hover:bg-current/10"
                onClick={() => dismissNotification(alert.id)}
              >
                Ignore
              </Button>
            </div>
          </div>
          
          <button 
            onClick={() => dismissNotification(alert.id)}
            className="absolute top-2 right-2 p-1 hover:bg-current/10 rounded-full transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4 opacity-50" />
          </button>
        </div>
      ))}
    </div>
  );
};
