import axios, { AxiosError } from 'axios';
import { rateLimiter } from './rateLimiter';
import { getDeduplicationKey, getInflight, setInflight } from './requestDedup';
import { getCsrfToken, isMutationMethod, CSRF_HEADER } from './csrfToken';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: Auth + Rate Limiting ──────────────────────
api.interceptors.request.use((config) => {
  // Attach JWT token
  const token = localStorage.getItem('pharmtrack_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Attach CSRF token to mutation requests
  const method = config.method || 'get';
  if (isMutationMethod(method)) {
    config.headers[CSRF_HEADER] = getCsrfToken();
  }

  // Rate limiting check
  const endpoint = config.url || '';
  const result = rateLimiter.check(endpoint);
  if (!result.allowed) {
    const seconds = Math.ceil((result.retryAfterMs || 10000) / 1000);
    toast.error(`Too many requests. Please wait ${seconds}s before trying again.`);
    return Promise.reject(
      new AxiosError(
        `Rate limited: retry after ${seconds}s`,
        'ERR_RATE_LIMITED',
        config,
        undefined,
        { status: 429, statusText: 'Too Many Requests', headers: {}, config, data: {} } as any
      )
    );
  }

  return config;
});

// ── Response interceptor: 401 handling + retry-after from server ───
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pharmtrack_token');
      localStorage.removeItem('pharmtrack_pharmacy');
      window.location.href = '/pharmacy/login';
    }

    // If server returns 429, show user-friendly message
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const seconds = retryAfter ? parseInt(retryAfter, 10) : 30;
      toast.error(`Server rate limit reached. Please wait ${seconds}s.`);
    }

    return Promise.reject(error);
  }
);

// ── GET request deduplication via response interceptor ─────────────
api.interceptors.request.use((config) => {
  if (config.method?.toUpperCase() === 'GET') {
    const key = getDeduplicationKey(
      config.method,
      `${config.baseURL || ''}${config.url || ''}`,
      config.params
    );
    if (key) {
      const inflight = getInflight(key);
      if (inflight) {
        // Cancel this request and return the inflight promise's result
        const controller = new AbortController();
        controller.abort();
        config.signal = controller.signal;
        (config as any).__dedupKey = key;
        (config as any).__dedupPromise = inflight;
      }
    }
  }
  return config;
});

// Intercept canceled dedup requests and resolve with inflight result
api.interceptors.response.use(
  undefined,
  async (error) => {
    const dedupPromise = (error.config as any)?.__dedupPromise;
    if (dedupPromise && axios.isCancel(error)) {
      return dedupPromise;
    }
    return Promise.reject(error);
  }
);

export default api;
