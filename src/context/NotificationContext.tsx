import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

export interface Notification {
  id: string;
  user_id: string | null;
  pharmacy_id: string | null;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'REQUEST' | 'APPROVAL';
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  persistentAlerts: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Ids already shown, so a refetch triggered by the realtime stream can
  // tell a genuinely new notification from one that was already on screen
  // and avoid re-toasting the whole list.
  const seenIds = useRef<Set<string>>(new Set());

  /**
   * The audience filter used to be built here, as an `.or()` string
   * combining user_id and pharmacy_id. It is now the server's decision —
   * the endpoint returns exactly the notifications this session may see,
   * so a bug in this file can no longer widen what is fetched.
   */
  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    try {
      setNotifications(await api.notifications.list() as unknown as Notification[]);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic: the badge should clear on click, not a round trip later.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await api.notifications.markRead(id);
    } catch (err) {
      console.error('Failed to mark notification read:', err);
      refresh();
    }
  }, [refresh]);

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_dismissed: true } : n)));
    try {
      await api.notifications.dismiss(id);
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    refresh();

    /**
     * Replaces the Supabase realtime channel.
     *
     * That subscription carried the whole row and pushed it straight into
     * state. The SSE event carries identifiers only — deliberately, so the
     * stream cannot deliver a row the API would not have served — so this
     * refetches and then reports whatever is genuinely new.
     */
    const unsubscribe = api.subscribeToChanges(
      async (event) => {
        if (event.op !== 'INSERT') return;
        try {
          const fresh = await api.notifications.list() as unknown as Notification[];
          // Compare against what was on screen before this refetch to decide
          // what is genuinely new. Read from the ref rather than from state
          // so the comparison does not depend on this closure's snapshot.
          const known = seenIds.current;
          setNotifications(fresh);
          for (const n of fresh) {
            if (known.has(n.id)) continue;
            const important = n.type === 'REQUEST' || n.type === 'APPROVAL';
            (important ? toast.message : toast.info)(n.title, {
              description: n.message,
              duration: important ? 10_000 : 4_000,
            });
          }
        } catch (err) {
          console.error('Notification refresh failed:', err);
        }
      },
      { tables: ['notifications'] },
    );

    return unsubscribe;
  }, [user, refresh]);

  useEffect(() => {
    seenIds.current = new Set(notifications.map((n) => n.id));
  }, [notifications]);

  const persistentAlerts = notifications.filter(
    (n) => !n.is_dismissed && (n.type === 'REQUEST' || n.type === 'APPROVAL'),
  );
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationContext.Provider value={{
      notifications, persistentAlerts, unreadCount,
      markAsRead, dismissNotification, refresh,
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
