import axios, { AxiosError } from 'axios';
import { rateLimiter } from './rateLimiter';
import { getDeduplicationKey, getInflight, setInflight } from './requestDedup';
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

// ── Wrap adapter for GET request deduplication ────────────────────
const originalAdapter = api.defaults.adapter;

api.defaults.adapter = async (config) => {
  const key = getDeduplicationKey(
    config.method || 'GET',
    `${config.baseURL || ''}${config.url || ''}`,
    config.params
  );

  if (key) {
    const inflight = getInflight(key);
    if (inflight) return inflight;

    const promise = (typeof originalAdapter === 'function'
      ? originalAdapter(config)
      : axios.defaults.adapter!(config)
    ) as Promise<any>;

    setInflight(key, promise);
    return promise;
  }

  return typeof originalAdapter === 'function'
    ? originalAdapter(config)
    : axios.defaults.adapter!(config);
};

export default api;
