import { supabase } from './supabaseClient';
import { toast } from 'sonner';

export type SyncOperation = {
  id: string;
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  data: any;
  timestamp: number;
  retryCount: number;
  userId?: string;
  pharmacyId?: string;
};

const QUEUE_KEY = 'pharmconnect_sync_queue';
const CONFLICT_KEY = 'pharmconnect_sync_conflicts';

class SyncManager {
  private queue: SyncOperation[] = [];
  private isSyncing = false;

  constructor() {
    this.loadQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.sync());
      // Check every 2 minutes as backup
      setInterval(() => this.sync(), 120000);
    }
  }

  private loadQueue() {
    const saved = localStorage.getItem(QUEUE_KEY);
    if (saved) {
      try {
        this.queue = JSON.parse(saved);
      } catch (e) {
        this.queue = [];
      }
    }
  }

  private saveQueue() {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
  }

  enqueue(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', data: any, context?: { userId?: string, pharmacyId?: string }) {
    const op: SyncOperation = {
      id: crypto.randomUUID(),
      table,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      userId: context?.userId,
      pharmacyId: context?.pharmacyId,
    };
    this.queue.push(op);
    this.saveQueue();

    if (navigator.onLine) {
      this.sync();
    } else {
      toast.info('Working offline. Changes will sync when connection returns.', {
        description: `Stored ${this.queue.length} pending changes.`
      });
    }
  }

  async sync() {
    if (this.isSyncing || this.queue.length === 0 || !navigator.onLine) return;

    this.isSyncing = true;
    const toastId = toast.loading('Synchronizing data...');
    
    let processedCount = 0;
    const failedOps: SyncOperation[] = [];

    for (const op of [...this.queue]) {
      try {
        const success = await this.processOperation(op);
        if (success) {
          processedCount++;
          this.queue = this.queue.filter(q => q.id !== op.id);
        } else {
          // Conflict handled inside processOperation
          this.queue = this.queue.filter(q => q.id !== op.id);
        }
      } catch (error: any) {
        console.error('Sync failed for operation:', op.id, error);
        op.retryCount++;
        if (op.retryCount < 5) {
          failedOps.push(op);
        } else {
          // Permanently failed - log to conflicts for manual review
          await this.logConflict(op, { error: error.message }, 'PERMANENT_FAILURE');
          this.queue = this.queue.filter(q => q.id !== op.id);
        }
      }
      this.saveQueue();
    }

    this.isSyncing = false;
    
    if (processedCount > 0) {
      toast.success(`Successfully synchronized ${processedCount} changes.`, { id: toastId });
    } else if (this.queue.length === 0) {
      toast.dismiss(toastId);
    } else {
      toast.error('Some changes could not be synchronized.', { id: toastId });
    }
  }

  private async processOperation(op: SyncOperation): Promise<boolean> {
    if (op.type === 'UPDATE' || op.type === 'DELETE') {
      // Conflict detection for updates/deletes
      const { data: serverRecord, error: fetchError } = await supabase
        .from(op.table)
        .select('*')
        .eq('id', op.data.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      if (serverRecord) {
        // Check if server version is newer than when we queued the change
        const serverUpdatedAt = new Date(serverRecord.updated_at).getTime();
        const localQueuedAt = op.timestamp;

        if (serverUpdatedAt > localQueuedAt) {
          await this.handleConflict(op, serverRecord);
          return false;
        }
      }
    }

    // Apply change
    let error;
    if (op.type === 'INSERT') {
      ({ error } = await supabase.from(op.table).insert(op.data));
    } else if (op.type === 'UPDATE') {
      ({ error } = await supabase.from(op.table).update(op.data).eq('id', op.data.id));
    } else if (op.type === 'DELETE') {
      ({ error } = await supabase.from(op.table).delete().eq('id', op.data.id));
    }

    if (error) throw error;
    return true;
  }

  private async handleConflict(op: SyncOperation, serverRecord: any) {
    console.warn('Data conflict detected for', op.table, op.data.id);
    
    // Log to Supabase for admin review
    await this.logConflict(op, serverRecord, 'DATA_CONFLICT');

    toast.error('Sync Conflict Detected', {
      description: `A change to ${op.table} was made on another device. An admin has been notified to resolve this conflict.`,
      duration: 10000,
    });
  }

  private async logConflict(op: SyncOperation, serverData: any, reason: string) {
    try {
      await supabase.from('sync_conflicts').insert({
        table_name: op.table,
        record_id: op.data.id || (op.type === 'INSERT' ? op.data.id : null),
        local_data: op.data,
        server_data: serverData,
        status: 'PENDING',
        user_id: op.userId,
        pharmacy_id: op.pharmacyId,
      });
    } catch (e) {
      console.error('Failed to log conflict to server:', e);
      // Fallback to local storage for conflicts
      const localConflicts = JSON.parse(localStorage.getItem(CONFLICT_KEY) || '[]');
      localConflicts.push({ ...op, serverData, reason, resolved: false });
      localStorage.setItem(CONFLICT_KEY, JSON.stringify(localConflicts));
    }
  }

  getPendingCount() {
    return this.queue.length;
  }
}

export const syncManager = new SyncManager();
