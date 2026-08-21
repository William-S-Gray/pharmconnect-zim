/**
 * API client for the PharmConnect backend.
 *
 * Replaces `supabaseClient.ts`. The shape is deliberately different from
 * supabase-js: there is no `.from(table).select()` here, because the whole
 * point of the migration was to stop the browser issuing queries against
 * the database. Every call below hits an endpoint that has already decided
 * what this user is allowed to see.
 *
 * Authentication is an httpOnly cookie, so there is no token for this file
 * to hold, store, or accidentally log — and no `getSession()` to await
 * before a request. `credentials: 'include'` is what carries it, and it is
 * set on every call.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Field-level messages for inline form errors, when the server sent them. */
  get fieldErrors(): Record<string, string> {
    return this.details ?? {};
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Query } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      // Sends and accepts the session cookie. Without it every request is
      // anonymous, which fails as a confusing 401 rather than as a
      // recognisable configuration mistake.
      credentials: 'include',
      headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // fetch only rejects on a genuine network failure. Surfacing that as a
    // distinct status lets the UI say "you appear to be offline" instead of
    // reporting a server error that did not happen.
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // A non-JSON body means a proxy or load balancer answered, not the
      // API. Do not echo it to the user; it is usually an HTML error page.
      if (!response.ok) throw new ApiError(response.status, 'Unexpected server response');
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; details?: Record<string, string> };
    throw new ApiError(response.status, body.error ?? 'Request failed', body.details);
  }

  return payload as T;
}

const get   = <T>(path: string, query?: Query) => request<T>('GET', path, { query });
const post  = <T>(path: string, body?: unknown) => request<T>('POST', path, { body });
const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body });
const del   = <T>(path: string) => request<T>('DELETE', path);

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type UserRole = 'super_admin' | 'pharmacy_admin' | 'pharmacy_staff';
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  global_role: UserRole;
  lifecycle_status: string;
  mfa_enabled: boolean;
}

export interface Pharmacy {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsapp_number?: string | null;
  address?: string | null;
  city: string;
  suburb: string | null;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
  plan_tier: 'FREE' | 'BASIC' | 'PRO';
  mcaz_license?: string | null;
  is_open_24h?: boolean;
  operating_hours?: Record<string, { open: string; close: string }> | null;
  // The columns are lat/lng. Several pages read `latitude`/`longitude`,
  // which never existed in any migration and always came back undefined.
  lat: number | null;
  lng: number | null;
  notify_new_device?: boolean;
  notify_new_location?: boolean;
  notify_failed_attempt?: boolean;
  notify_password_change?: boolean;
}

/** What the public directory exposes — deliberately fewer fields. */
export interface PublicPharmacy {
  id: string;
  name: string;
  address: string | null;
  city: string;
  suburb: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  is_open_24h: boolean;
  operating_hours: Record<string, { open: string; close: string }> | null;
  lat: number | null;
  lng: number | null;
}

export interface PublicStockItem {
  id: string;
  drug_name: string;
  strength: string | null;
  form: string | null;
  unit_price: number | null;
  quantity: number;
  stock_status: StockStatus;
}

export interface Reservation {
  id: string;
  reference_code: string;
  status: string;
  reserved_until: string;
  created_at: string;
}

export interface Membership {
  id: string;
  role: UserRole;
  pharmacy_id: string;
  pharmacy_name: string;
  status: string;
}

/** What `/api/auth/me` returns: everything the app shell needs to render. */
export interface AuthPayload {
  profile: UserProfile;
  role: UserRole;
  pharmacy: Pharmacy | null;
  memberships: Membership[];
}

export interface StockItem {
  id: string;
  pharmacy_id: string;
  drug_id: string | null;
  drug_name: string;
  strength: string | null;
  form: string | null;
  quantity: number;
  unit_price: number | null;
  threshold: number;
  is_available: boolean;
  expiry_date: string | null;
  stock_status: StockStatus;
  /** Maintained by a trigger. syncManager compares it to detect conflicts. */
  updated_at: string;
}

export interface SearchResult {
  pharmacy_id: string;
  pharmacy_name: string;
  suburb: string | null;
  city: string;
  phone: string | null;
  whatsapp_number: string | null;
  lat: number | null;
  lng: number | null;
  drug_id: string | null;
  drug_name: string;
  drug_strength: string | null;
  stock_id: string;
  unit_price: number | null;
  quantity: number;
  stock_status: StockStatus;
  distance_km: number | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ------------------------------------------------------------------
// Endpoints
// ------------------------------------------------------------------

export const auth = {
  /** Null when signed out — not an error, so callers need no try/catch. */
  me: () => get<AuthPayload | null>('/api/auth/me'),

  /**
   * Returns `{ mfa_required: true }` rather than a session when the account
   * has TOTP enrolled and no code was supplied. Call again with `totp`.
   */
  login: (email: string, password: string, totp?: string) =>
    post<AuthPayload | { mfa_required: true }>('/api/auth/login', { email, password, totp }),

  register: (input: {
    email: string;
    password: string;
    full_name: string;
    pharmacy?: Partial<Pharmacy> & { name: string; email: string };
  }) => post<AuthPayload>('/api/auth/register', input),

  logout: () => post<void>('/api/auth/logout'),

  forgotPassword: (email: string) => post<{ ok: true }>('/api/auth/password/forgot', { email }),
  resetPassword: (token: string, password: string) =>
    post<{ ok: true }>('/api/auth/password/reset', { token, password }),
  changePassword: (current_password: string, new_password: string) =>
    post<{ ok: true }>('/api/auth/password/change', { current_password, new_password }),

  mfa: {
    enroll: () => post<{ secret: string; otpauth_url: string }>('/api/auth/mfa/enroll'),
    confirm: (code: string) => post<{ ok: true }>('/api/auth/mfa/confirm', { code }),
    disable: (password: string) => post<{ ok: true }>('/api/auth/mfa/disable', { password }),
  },

  sessions: {
    list: () => get<Array<{
      id: string; ip_address: string | null; user_agent: string | null;
      created_at: string; last_seen_at: string; is_current: boolean;
    }>>('/api/auth/sessions'),
    revokeOthers: () => post<{ ok: true }>('/api/auth/sessions/revoke-others'),
  },

  /**
   * Full-page navigation, not fetch: the OAuth flow needs the browser to
   * follow redirects to Google and back.
   */
  googleSignInUrl: () => `${BASE_URL}/api/auth/google`,
};

export const pharmacies = {
  listPublic: (query?: { city?: string; limit?: number; offset?: number }) =>
    get<PublicPharmacy[]>('/api/pharmacies/public', query),
  getPublic: (id: string) =>
    get<PublicPharmacy & { stock: PublicStockItem[] }>(`/api/pharmacies/public/${id}`),

  list: (query?: { status?: string; search?: string; limit?: number; offset?: number }) =>
    get<Paged<Pharmacy>>('/api/pharmacies', query),
  get: (id: string) => get<Pharmacy>(`/api/pharmacies/${id}`),
  update: (id: string, changes: Partial<Pharmacy>) => patch<Pharmacy>(`/api/pharmacies/${id}`, changes),

  /** Dashboard figures: stock totals, low-stock alerts, trending searches. */
  dashboard: (id: string) => get<{
    searches_this_month: number;
    stock: { total: number; low_stock: number };
    plan_tier: string;
    top_searched_drugs: Array<{ common_name: string; search_count: number }>;
    recent_alerts: Array<{ common_name: string; strength: string | null; quantity: number; threshold: number }>;
  }>(`/api/pharmacies/${id}/dashboard`),

  /** All sidebar badge counts in one request. */
  counts: (id: string) => get<{
    pending_deletes: number; conflicts: number;
    reservations: number; approvals: number; requests: number;
  }>(`/api/pharmacies/${id}/counts`),

  staff: (id: string) => get<Array<UserProfile & { role: UserRole; joined_at: string }>>(
    `/api/pharmacies/${id}/staff`),
  invite: (id: string, email: string, role: UserRole = 'pharmacy_staff') =>
    post(`/api/pharmacies/${id}/invitations`, { email, role }),
  removeStaff: (id: string, userId: string) => del<void>(`/api/pharmacies/${id}/staff/${userId}`),
};

export const stock = {
  list: (pharmacyId: string, query?: {
    search?: string; status?: string; limit?: number; offset?: number;
  }) => get<Paged<StockItem>>(`/api/stock/${pharmacyId}`, query),

  /**
   * Resolves to `{ pending: true }` (HTTP 202) when the caller is staff
   * rather than a pharmacy admin: the change becomes an approval request.
   * Callers must branch on this, or a staff member sees a success toast for
   * a change that has not been applied.
   */
  create: (pharmacyId: string, item: Partial<StockItem>) =>
    post<StockItem | { pending: true }>(`/api/stock/${pharmacyId}`, item),
  update: (pharmacyId: string, stockId: string, changes: Partial<StockItem>) =>
    patch<StockItem | { pending: true }>(`/api/stock/${pharmacyId}/${stockId}`, changes),
  remove: (pharmacyId: string, stockId: string) =>
    del<void | { pending: true }>(`/api/stock/${pharmacyId}/${stockId}`),

  bulkImport: (pharmacyId: string, items: Array<Partial<StockItem>>) =>
    post<{ imported: number }>(`/api/stock/${pharmacyId}/bulk`, { items }),
};

export const search = {
  drugs: (query: {
    q: string; lat?: number; lng?: number; radius_km?: number; city?: string; limit?: number;
  }) => get<{ query: string; intent: string; results: SearchResult[] }>('/api/search', query),

  intent: (q: string, city?: string) =>
    get<{ intent: string; suggestions: string[] }>('/api/search/intent', { q, city }),

  catalogue: (q: string, limit = 10) =>
    get<Array<{ id: string; common_name: string; generic_name: string; strength: string; form: string }>>(
      '/api/search/drugs', { q, limit }),
};

export const drugs = {
  list: (query?: { search?: string; category?: string; limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>('/api/drugs', query),
  get: (id: string) => get<Record<string, unknown>>(`/api/drugs/${id}`),
  /** 404s when the catalogue has no entry; the UI falls back to its local map. */
  byName: (name: string) => get<Record<string, unknown>>('/api/drugs/lookup/by-name', { name }),
  create: (drug: Record<string, unknown>) => post('/api/drugs', drug),
  update: (id: string, changes: Record<string, unknown>) => patch(`/api/drugs/${id}`, changes),
  remove: (id: string) => del<void>(`/api/drugs/${id}`),
};

export const reservations = {
  create: (input: {
    pharmacy_id: string; drug_id?: string | null; drug_name: string;
    patient_name: string; patient_phone: string; quantity?: number; notes?: string;
    delivery_required?: boolean; delivery_address?: string;
  }) => post<Reservation>('/api/reservations', input),

  byCode: (code: string) => get<Record<string, unknown>>(`/api/reservations/by-code/${code}`),

  list: (pharmacyId: string, query?: { status?: string; limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>(`/api/reservations/${pharmacyId}`, query),
  update: (pharmacyId: string, id: string, changes: { status?: string; notes?: string }) =>
    patch(`/api/reservations/${pharmacyId}/${id}`, changes),
};

export const requests = {
  create: (input: {
    pharmacy_id: string; drug_id?: string | null; sender_name: string; sender_contact: string;
  }) => post('/api/requests', input),
  list: (pharmacyId: string, query?: { limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>(`/api/requests/${pharmacyId}`, query),
  update: (pharmacyId: string, id: string, status: string) =>
    patch(`/api/requests/${pharmacyId}/${id}`, { status }),
};

/** Unmet demand: "nobody near me stocks this". */
export const wanted = {
  create: (input: {
    requested_query: string; city?: string; contact_info?: string; notes?: string;
  }) => post<{ id: string; status: string; created_at: string }>('/api/wanted', input),
  /** Super admin only — it carries the public's contact details. */
  list: (query?: { status?: string; limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>('/api/wanted', query),
  update: (id: string, changes: { status?: string; notes?: string }) =>
    patch(`/api/wanted/${id}`, changes),
};

export const approvals = {
  list: (pharmacyId: string, status = 'PENDING') =>
    get<Array<Record<string, unknown>>>(`/api/approvals/${pharmacyId}`, { status }),
  approve: (pharmacyId: string, id: string) => post(`/api/approvals/${pharmacyId}/${id}/approve`),
  reject: (pharmacyId: string, id: string, notes?: string) =>
    post(`/api/approvals/${pharmacyId}/${id}/reject`, { notes }),
};

export const notifications = {
  list: () => get<Array<Record<string, unknown>>>('/api/notifications'),
  markRead: (id: string) => post<void>(`/api/notifications/${id}/read`),
  dismiss: (id: string) => post<void>(`/api/notifications/${id}/dismiss`),
};

export const profile = {
  get: () => get<UserProfile>('/api/profile'),
  /**
   * Display fields only. There is no `global_role` here because the
   * endpoint does not accept one — role changes go through
   * `admin.setRole`, and that is the whole point.
   */
  update: (changes: {
    full_name?: string;
    avatar_url?: string | null;
    /** UI-only preferences. Nothing authorizes off this. */
    preferences?: Record<string, unknown>;
  }) => patch<UserProfile>('/api/profile', changes),

  /**
   * Send a test message to your own address. The recipient is the
   * session's email and cannot be supplied — otherwise this would be an
   * open relay on a trusted domain.
   */
  sendTestEmail: () => post<{ ok: true; sent_to: string }>('/api/profile/test-email'),

  /**
   * Your own login history, with a real per-attempt success flag. Not the
   * admin-wide audit log, and not derived from it.
   */
  activity: (limit = 10) =>
    get<Array<{
      id: string; ip_address: string | null;
      success: boolean; attempted_at: string;
    }>>('/api/profile/activity', { limit }),
};

export const deleteRequests = {
  create: (input: {
    target_table: 'profiles' | 'pharmacies';
    target_id: string;
    reason: string;
    pharmacy_id?: string;
  }) => post('/api/delete-requests', input),
  list: () => get<Array<Record<string, unknown>>>('/api/delete-requests'),
};

export const sync = {
  reportConflict: (input: {
    pharmacy_id: string; table_name: string; record_id: string;
    local_data: Record<string, unknown>; server_data: Record<string, unknown>;
  }) => post('/api/sync/conflicts', input),
  conflicts: (pharmacyId: string, status = 'PENDING') =>
    get<Array<Record<string, unknown>>>(`/api/sync/conflicts/${pharmacyId}`, { status }),
  resolve: (pharmacyId: string, id: string, resolution: 'local' | 'server') =>
    post(`/api/sync/conflicts/${pharmacyId}/${id}/resolve`, { resolution }),
};

export const admin = {
  users: (query?: { search?: string; role?: string; limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>('/api/admin/users', query),

  createUser: (input: {
    email: string; password: string; full_name: string;
    global_role?: UserRole; pharmacy_id?: string; pharmacy_role?: UserRole;
  }) => post<{ id: string; email: string; full_name: string }>('/api/admin/users', input),

  trash: () => get<{
    users: Array<Record<string, unknown>>;
    pharmacies: Array<Record<string, unknown>>;
  }>('/api/admin/trash'),

  trashPharmacy: (id: string) => post(`/api/admin/pharmacies/${id}/trash`),
  restorePharmacy: (id: string) => post(`/api/admin/pharmacies/${id}/restore`),
  deletePharmacy: (id: string) => del<void>(`/api/admin/pharmacies/${id}`),
  setRole: (userId: string, role: UserRole) => post(`/api/admin/users/${userId}/role`, { role }),
  trashUser: (userId: string) => post(`/api/admin/users/${userId}/trash`),
  restoreUser: (userId: string) => post(`/api/admin/users/${userId}/restore`),
  deleteUser: (userId: string) => del<void>(`/api/admin/users/${userId}`),

  createPharmacy: (input: {
    name: string; email: string; phone?: string; address?: string;
    city?: string; suburb?: string; mcaz_license?: string;
    status?: string; plan_tier?: string;
    admin: { email: string; password: string; full_name: string };
  }) => post<{ id: string; name: string }>('/api/admin/pharmacies', input),

  setPharmacyStatus: (id: string, status: string) =>
    post(`/api/admin/pharmacies/${id}/status`, { status }),
  setPharmacyPlan: (id: string, plan_tier: string) =>
    post(`/api/admin/pharmacies/${id}/plan`, { plan_tier }),

  deleteRequests: (status = 'PENDING') =>
    get<Array<Record<string, unknown>>>('/api/admin/delete-requests', { status }),
  decideDeleteRequest: (id: string, decision: 'APPROVED' | 'DENIED') =>
    post(`/api/admin/delete-requests/${id}/decide`, { decision }),

  reservations: (query?: { status?: string; search?: string; limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>('/api/admin/reservations', query),
  updateReservation: (id: string, status: string) =>
    patch(`/api/admin/reservations/${id}`, { status }),

  analyticsOverview: (query?: { pharmacy_id?: string; days?: number }) =>
    get<{
      pharmacy_count: number;
      inventory_count: number;
      city_breakdown: Array<{ city: string; count: number }>;
      daily_searches: Array<{ day: string; searches: number }>;
      top_drugs: Array<{ name: string; searches: number }>;
      registration_trend: Array<{ month: string; pharmacies: number }>;
      stock_distribution: { in_stock: number; low_stock: number; out_of_stock: number };
    }>('/api/admin/analytics/overview', query),

  /** Unmet demand by city and drug — what the network cannot supply. */
  demand: (days = 7) =>
    get<Array<{
      hour_bucket: string; city: string; drug_search: string;
      search_volume: number; unfulfilled_demand: number;
    }>>('/api/admin/analytics/demand', { days }),

  audit: (query?: { event_type?: string; user_id?: string; limit?: number; offset?: number }) =>
    get<Paged<Record<string, unknown>>>('/api/admin/audit', query),
  stats: () => get<Record<string, number>>('/api/admin/stats'),
  counts: () => get<{
    pending_deletes: number; conflicts: number;
    pending_pharmacies: number; wanted: number;
  }>('/api/admin/counts'),
  searchAnalytics: (days = 30) =>
    get<{ top: Array<Record<string, unknown>>; unmet: Array<Record<string, unknown>> }>(
      '/api/admin/analytics/searches', { days }),
};

export const maps = {
  geocode: (address: string) =>
    get<{ formatted_address: string; lat: number; lng: number } | null>(
      '/api/maps/geocode', { address }),
  autocomplete: (input: string) =>
    get<Array<{ description: string; place_id: string }>>('/api/maps/autocomplete', { input }),

  reverseGeocode: (lat: number, lng: number) =>
    get<{ address: string | null }>('/api/maps/reverse-geocode', { lat, lng }),

  /**
   * Null when Google has no route between the points. The old client fell
   * back to calling Google straight from the browser, which could never
   * work — the Distance Matrix API sends no CORS headers — so there is no
   * fallback here.
   */
  drivingDistance: (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ) => get<{
    distance_text: string; distance_value: number;
    duration_text: string; duration_value: number;
  } | null>('/api/maps/distance', {
    origin_lat: origin.lat, origin_lng: origin.lng,
    dest_lat: destination.lat, dest_lng: destination.lng,
  }),
};

// ------------------------------------------------------------------
// Realtime
// ------------------------------------------------------------------

export interface ChangeEvent {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string;
  pharmacy_id: string | null;
  user_id: string | null;
}

/**
 * Subscribe to server-sent change events. Replaces
 * `supabase.channel(...).on('postgres_changes', ...)`.
 *
 * The payload carries identifiers only, never row contents — deliberately,
 * so the stream cannot leak a row to someone the API would not have served
 * it to. Handlers should refetch the affected query rather than trying to
 * patch local state from the event.
 *
 * Returns an unsubscribe function; call it from a useEffect cleanup, or the
 * stream and its retry timer outlive the component.
 */
export function subscribeToChanges(
  onChange: (event: ChangeEvent) => void,
  options: { tables?: string[] } = {},
): () => void {
  const source = new EventSource(`${BASE_URL}/api/events`, { withCredentials: true });

  source.addEventListener('change', (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as ChangeEvent;
      if (options.tables && !options.tables.includes(payload.table)) return;
      onChange(payload);
    } catch {
      // A malformed frame is not worth surfacing; the next one will do.
    }
  });

  // EventSource reconnects on its own, so this is for visibility rather
  // than recovery. Logging every retry would be noisy on a flaky link.
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      console.warn('[api] realtime stream closed');
    }
  };

  return () => source.close();
}

export const api = {
  auth, profile, pharmacies, stock, search, drugs,
  reservations, requests, wanted, approvals, notifications,
  deleteRequests, sync, admin, maps,
  subscribeToChanges,
};

export default api;
