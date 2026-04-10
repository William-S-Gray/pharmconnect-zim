import { supabase } from './supabaseClient';

/**
 * Log a system activity event to the audit_logs table.
 */
export const logActivity = async (
  eventType: string, 
  metadata: any = {}, 
  userId?: string
) => {
  try {
    const { error } = await supabase.rpc('log_audit_event', {
      p_event_type: eventType,
      p_metadata: metadata,
      p_user_id: userId
    });
    if (error) console.error('Failed to log activity:', error);
  } catch (e) {
    console.error('Audit logging error:', e);
  }
};

/**
 * Initiates a deletion request from a normal user to an admin.
 */
export const requestDeletion = async (
  table: 'profiles' | 'pharmacies',
  id: string,
  reason: string,
  pharmacyId?: string
) => {
  const { data, error } = await supabase.rpc('request_deletion', {
    p_table: table,
    p_id: id,
    p_reason: reason,
    p_pharmacy_id: pharmacyId
  });
  if (error) throw error;
  return data;
};

/**
 * Approves a deletion request, moving the record to Trash.
 */
export const approveDeletion = async (requestId: string) => {
  const { error } = await supabase.rpc('approve_deletion', {
    p_request_id: requestId
  });
  if (error) throw error;
};

/**
 * Restores a record from Trash, performing dependency checks.
 */
export const restoreRecord = async (table: string, id: string) => {
  const { data, error } = await supabase.rpc('restore_from_trash', {
    p_table: table,
    p_id: id
  });
  if (error) throw error;
  return data; // Returns { success: boolean, error?: string, parent?: string }
};

/**
 * Subscribes to real-time delete requests for current pharmacy or global admins.
 */
export const subscribeToDeleteRequests = (
  pharmacyId: string | undefined, 
  onNewRequest: (payload: any) => void
) => {
  const channel = supabase
    .channel('delete_requests_realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'delete_requests',
        filter: pharmacyId ? `pharmacy_id=eq.${pharmacyId}` : undefined
      },
      (payload) => {
        onNewRequest(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
