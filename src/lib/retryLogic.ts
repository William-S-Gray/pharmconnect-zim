/**
 * Exponential backoff retry logic for Axios.
 * Retries failed requests due to network errors or 5xx server errors.
 */

import type { AxiosError, InternalAxiosRequestConfig } from 'axios';

interface RetryConfig {
  /** Max number of retries */
  maxRetries: number;
  /** Base delay in ms (doubles each retry) */
  baseDelayMs: number;
  /** Max delay cap in ms */
  maxDelayMs: number;
  /** HTTP status codes that trigger a retry */
  retryableStatuses: Set<number>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  retryableStatuses: new Set([408, 500, 502, 503, 504]),
};

/** Methods safe to retry (idempotent) */
const RETRYABLE_METHODS = new Set(['get', 'head', 'options', 'put', 'delete']);

/**
 * Determine if a failed request should be retried.
 */
export function shouldRetry(error: AxiosError, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  const retryCount = (error.config as any)?.__retryCount || 0;
  if (retryCount >= config.maxRetries) return false;

  const method = error.config?.method?.toLowerCase() || '';

  // Always retry network errors (no response) for safe methods
  if (!error.response && RETRYABLE_METHODS.has(method)) return true;

  // Retry specific server error codes for safe methods
  if (error.response && RETRYABLE_METHODS.has(method)) {
    return config.retryableStatuses.has(error.response.status);
  }

  // For POST: only retry on network errors (connection refused, timeout)
  if (method === 'post' && !error.response) {
    const code = error.code || '';
    return ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'].includes(code);
  }

  return false;
}

/**
 * Calculate delay with exponential backoff + jitter.
 */
export function getRetryDelay(retryCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * config.baseDelayMs * 0.5;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep utility.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mark a request config with retry metadata.
 */
export function markRetry(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const retryCount = ((config as any).__retryCount || 0) + 1;
  (config as any).__retryCount = retryCount;
  return config;
}

export { DEFAULT_RETRY_CONFIG };
export type { RetryConfig };
