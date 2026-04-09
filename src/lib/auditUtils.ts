import { supabase } from './supabaseClient';

export type AuditCategory = 'auth' | 'user_mgmt' | 'drug_mgmt' | 'stock' | 'settings' | 'system';
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'view' | 'approve' | 'reject';

interface AuditParams {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  category: AuditCategory;
  target: string;
  detail: string;
  metadata?: Record<string, any>;
}

/**
 * Logs an administrative or critical action to the audit_logs table.
 */
export async function logAuditEvent({
  userId,
  userEmail,
  userRole,
  action,
  category,
  target,
  detail,
  metadata = {}
}: AuditParams) {
  try {
    // If user details not provided, try to get from session
    let finalUserId = userId;
    let finalEmail = userEmail;
    let finalRole = userRole;

    if (!finalUserId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        finalUserId = session.user.id;
        // In a real app we might fetch user role/email from profiles if not in session metadata
        finalEmail = session.user.email;
      }
    }

    const { error } = await supabase.from('audit_logs').insert([{
      user_id: finalUserId,
      event_type: `${category}_${action}`,
      metadata: {
        ...metadata,
        email: finalEmail,
        role: finalRole,
        category,
        target,
        detail,
        timestamp: new Date().toISOString()
      }
    }]);

    if (error) {
      console.warn('Failed to log audit event:', error.message);
    }
  } catch (err) {
    console.warn('Audit logging error:', err);
  }
}
