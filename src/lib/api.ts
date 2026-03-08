import axios, { AxiosError } from 'axios';
import { rateLimiter } from './rateLimiter';
import { getDeduplicationKey, getInflight, setInflight } from './requestDedup';
import { getCsrfToken, isMutationMethod, CSRF_HEADER } from './csrfToken';
import { shouldRetry, getRetryDelay, sleep, markRetry } from './retryLogic';
import { sessionTimeout } from './sessionTimeout';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send httpOnly cookies automatically
});

// ── Request interceptor: Auth + CSRF + Rate Limiting ───────────────
api.interceptors.request.use((config) => {
  // Attach JWT token (fallback — prefer httpOnly cookie set by server)
  const token = localStorage.getItem('pharmtrack_token');
  if (token && token !== 'httponly') {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Attach CSRF token to mutation requests
  const method = config.method || 'get';
  if (isMutationMethod(method)) {
    config.headers[CSRF_HEADER] = getCsrfToken();
  }

  // Rate limiting check (skip retries from counting again)
  if (!(config as any).__retryCount) {
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
  }

  return config;
});

// ── Response interceptor: Success handler — extend session ─────────
api.interceptors.response.use(
  (response) => {
    // Extend session timeout on successful API activity
    sessionTimeout.recordActivity();

    // If server sends token via response header (httpOnly cookie flow),
    // store a marker so we know auth is cookie-based
    if (response.headers['x-auth-mode'] === 'cookie') {
      localStorage.setItem('pharmtrack_token', 'httponly');
    }

    return response;
  },
  async (error: AxiosError) => {
    // ── Retry logic with exponential backoff ──────────────────
    if (shouldRetry(error)) {
      const config = markRetry(error.config!);
      const retryCount = (config as any).__retryCount;
      const delay = getRetryDelay(retryCount - 1);

      console.warn(
        `[API] Retry ${retryCount}/3 for ${config.method?.toUpperCase()} ${config.url} in ${Math.round(delay)}ms`
      );

      await sleep(delay);
      return api.request(config);
    }

    // ── 401 Unauthorized — clear session ──────────────────────
    if (error.response?.status === 401) {
      localStorage.removeItem('pharmtrack_token');
      localStorage.removeItem('pharmtrack_pharmacy');
      sessionTimeout.stop();
      window.location.href = '/pharmacy/login';
    }

    // ── 429 Too Many Requests from server ─────────────────────
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const seconds = retryAfter ? parseInt(retryAfter, 10) : 30;
      toast.error(`Server rate limit reached. Please wait ${seconds}s.`);
    }

    return Promise.reject(error);
  }
);

// ── GET request deduplication ─────────────────────────────────────
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
