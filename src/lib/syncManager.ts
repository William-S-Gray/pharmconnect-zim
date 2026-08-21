import { toast } from 'sonner';
import { api, ApiError } from './api';

/**
 * Offline write queue for stock edits.
 *
 * Pharmacies in Zimbabwe lose connectivity routinely, so edits made offline
 * are queued locally and replayed when the connection returns.
 *
 * Scoped to `pharmacy_stock` deliberately. The previous version took a
 * table name and issued `supabase.from(op.table)` against it, which read as
 * general-purpose but was only ever called with 'pharmacy_stock' — and
 * could not have worked for anything else, because conflict detection
 * assumed an `updated_at` column and an `id` primary key. Narrowing it to
 * the one real case removes a general mechanism nobody could safely use.
 *
 * Conflicts are never resolved automatically. If the server row changed
 * while an edit sat in the queue, both versions go to an administrator:
 * silently overwriting a colleague's stock correction with a stale count is
 * worse than asking.
 */

export type SyncOperation = {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown> & { id?: string };
  timestamp: number;
  retryCount: number;
  userId?: string;
  pharmacyId?: string;
};

const QUEUE_KEY = 'pharmconnect_sync_queue';
const MAX_RETRIES = 5;

class SyncManager {
  private queue: SyncOperation[] = [];
  private isSyncing = false;

  constructor() {
    this.loadQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.sync());
      setInterval(() => this.sync(), 120_000);
    }
  }

  private loadQueue() {
    try {
      this.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    } catch {
      // Corrupt queue: better to lose unsynced edits than to wedge the app
      // on every load trying to parse them.
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error('[sync] could not persist queue', err);
    }
  }

  enqueue(
    _table: 'pharmacy_stock',
    type: SyncOperation['type'],
    data: Record<string, unknown> & { id?: string },
    context?: { userId?: string; pharmacyId?: string },
  ) {
    const op: SyncOperation = {
      id: crypto.randomUUID(),
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
        description: `Stored ${this.queue.length} pending change${this.queue.length === 1 ? '' : 's'}.`,
      });
    }
  }

  async sync() {
    if (this.isSyncing || this.queue.length === 0 || !navigator.onLine) return;

    this.isSyncing = true;
    const toastId = toast.loading('Synchronizing data...');
    let processed = 0;
    const retry: SyncOperation[] = [];

    for (const op of [...this.queue]) {
      try {
        await this.processOperation(op);
        processed += 1;
      } catch (err) {
        // A rejected write is a decision, not a transport failure: retrying
        // it will fail identically every time and would block the queue
        // forever. Surface it and drop it.
        const permanent = err instanceof ApiError
          && err.status >= 400 && err.status < 500 && err.status !== 429;

        if (permanent) {
          await this.reportConflict(op, { error: (err as ApiError).message });
          toast.error('A queued change was rejected', {
            description: (err as ApiError).message,
            duration: 10_000,
          });
        } else {
          op.retryCount += 1;
          if (op.retryCount < MAX_RETRIES) {
            retry.push(op);
          } else {
            await this.reportConflict(op, { error: 'Exceeded retry limit' });
          }
        }
      }
      this.queue = this.queue.filter((q) => q.id !== op.id);
      this.saveQueue();
    }

    this.queue.push(...retry);
    this.saveQueue();
    this.isSyncing = false;

    if (processed > 0) {
      toast.success(`Synchronized ${processed} change${processed === 1 ? '' : 's'}.`, { id: toastId });
    } else if (this.queue.length === 0) {
      toast.dismiss(toastId);
    } else {
      toast.error('Some changes could not be synchronized.', { id: toastId });
    }
  }

  private async processOperation(op: SyncOperation) {
    const pharmacyId = op.pharmacyId;
    if (!pharmacyId) throw new ApiError(400, 'Queued change has no pharmacy');

    if (op.type === 'INSERT') {
      await api.stock.create(pharmacyId, op.data);
      return;
    }

    const stockId = op.data.id;
    if (!stockId) throw new ApiError(400, 'Queued change has no record id');

    if (op.type === 'DELETE') {
      await api.stock.remove(pharmacyId, stockId);
      return;
    }

    // UPDATE. Check whether the server row moved while this sat in the
    // queue; if it did, the two versions go to an admin rather than one
    // silently winning.
    const current = await api.stock.list(pharmacyId, { limit: 200 });
    const serverRow = current.items.find((item) => item.id === stockId);

    if (serverRow) {
      const serverUpdated = new Date(serverRow.updated_at ?? 0).getTime();

      if (serverUpdated > op.timestamp) {
        await this.reportConflict(op, serverRow as unknown as Record<string, unknown>);
        toast.error('Sync conflict detected', {
          description: 'This item changed on another device. An administrator will resolve it.',
          duration: 10_000,
        });
        return;
      }
    }

    const { id: _ignored, ...changes } = op.data;
    await api.stock.update(pharmacyId, stockId, changes);
  }

  private async reportConflict(op: SyncOperation, serverData: Record<string, unknown>) {
    if (!op.pharmacyId || !op.data.id) return;
    try {
      await api.sync.reportConflict({
        pharmacy_id: op.pharmacyId,
        table_name: 'pharmacy_stock',
        record_id: op.data.id,
        local_data: op.data,
        server_data: serverData,
      });
    } catch (err) {
      // If even the conflict report cannot be filed, say so rather than
      // stashing it in localStorage where nobody will ever look.
      console.error('[sync] failed to report conflict', err);
    }
  }

  getPendingCount() {
    return this.queue.length;
  }
}

export const syncManager = new SyncManager();
