import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'REQUEST' | 'APPROVAL';
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
  pharmacy_id?: string;
  user_id?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  persistentAlerts: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, pharmacy, role } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by user or pharmacy
    if (pharmacy?.id) {
      query = query.or(`user_id.eq.${user.id},pharmacy_id.eq.${pharmacy.id}`);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
    } else {
      setNotifications(data || []);
    }
  }, [user, pharmacy]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (!error) {
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    }
  };

  const dismissNotification = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_dismissed: true })
      .eq('id', id);

    if (!error) {
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_dismissed: true } : n)
      );
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    fetchNotifications();

    // Subscribe to Realtime notifications
    const channel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: pharmacy?.id 
            ? `pharmacy_id=eq.${pharmacy.id}` 
            : `user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          
          // Show toast
          if (newNotif.type === 'REQUEST' || newNotif.type === 'APPROVAL') {
            toast.message(newNotif.title, {
              description: newNotif.message,
              duration: 10000, // Longer for important ones
            });
          } else {
            toast.info(newNotif.title, {
              description: newNotif.message
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, pharmacy, fetchNotifications]);

  const persistentAlerts = notifications.filter(n => !n.is_dismissed && (n.type === 'REQUEST' || n.type === 'APPROVAL'));
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      persistentAlerts,
      unreadCount,
      markAsRead,
      dismissNotification
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
};
