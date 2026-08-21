import { api } from './api';

/**
 * Trash / restore / deletion-request helpers.
 *
 * `logActivity()` used to live here, letting any signed-in browser write
 * arbitrary rows into audit_logs through a SECURITY DEFINER RPC. It has
 * been removed rather than ported: a client-supplied audit trail records
 * whatever the client chooses to admit to, which is worth nothing during an
 * investigation. Every endpoint that changes something now writes its own
 * entry server-side, inside the same transaction as the change.
 */

/** Ask an administrator to delete a pharmacy or your own account. */
export const requestDeletion = async (
  table: 'profiles' | 'pharmacies',
  id: string,
  reason: string,
  pharmacyId?: string,
) => api.deleteRequests.create({
  target_table: table,
  target_id: id,
  reason,
  pharmacy_id: pharmacyId,
});

/** Approve a request, moving the target to trash. Super admin only. */
export const approveDeletion = async (requestId: string) =>
  api.admin.decideDeleteRequest(requestId, 'APPROVED');

export const denyDeletion = async (requestId: string) =>
  api.admin.decideDeleteRequest(requestId, 'DENIED');

/**
 * Restore a record from trash.
 *
 * The old RPC returned `{ success, error?, parent? }` and callers branched
 * on it. This throws an ApiError instead, so a failure cannot be silently
 * ignored by a caller that forgot to check the flag.
 */
export const restoreRecord = async (table: string, id: string) => {
  if (table === 'profiles') return api.admin.restoreUser(id);
  if (table === 'pharmacies') return api.admin.restorePharmacy(id);
  throw new Error(`Cannot restore records from ${table}`);
};

/**
 * Watch for new deletion requests.
 *
 * Replaces a Supabase realtime channel filtered by pharmacy_id. The SSE
 * stream is already scoped to what the caller may see, so there is no
 * client-side filter to get wrong — but the event carries identifiers
 * only, so the handler refetches rather than reading a row off the wire.
 */
export const subscribeToDeleteRequests = (
  pharmacyId: string | undefined,
  onNewRequest: () => void,
) => api.subscribeToChanges(
  (event) => {
    if (event.op !== 'INSERT') return;
    if (pharmacyId && event.pharmacy_id !== pharmacyId) return;
    onNewRequest();
  },
  { tables: ['delete_requests'] },
);
