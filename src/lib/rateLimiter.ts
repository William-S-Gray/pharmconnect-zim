/**
 * Client-side rate limiter using a sliding window approach.
 * Prevents excessive API calls from the frontend.
 */

interface RateLimitEntry {
  timestamps: number[];
  blocked_until: number;
}

interface RateLimiterConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Cooldown period after limit is hit (ms) */
  cooldownMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 30,
  windowMs: 60_000,   // 1 minute
  cooldownMs: 10_000,  // 10 second cooldown
};

// Per-endpoint rate limits (stricter for sensitive routes)
const ENDPOINT_LIMITS: Record<string, RateLimiterConfig> = {
  '/api/auth/login': { maxRequests: 5, windowMs: 60_000, cooldownMs: 30_000 },
  '/api/auth/register': { maxRequests: 3, windowMs: 60_000, cooldownMs: 60_000 },
  '/api/alerts/test': { maxRequests: 3, windowMs: 300_000, cooldownMs: 60_000 },
  '/api/subscriptions/initiate': { maxRequests: 5, windowMs: 60_000, cooldownMs: 30_000 },
  '/api/auth/forgot-password': { maxRequests: 3, windowMs: 300_000, cooldownMs: 60_000 },
  '/api/auth/reset-password': { maxRequests: 5, windowMs: 300_000, cooldownMs: 60_000 },
};

class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();

  /**
   * Returns the config for a given endpoint key.
   */
  private getConfig(key: string): RateLimiterConfig {
    // Match exact or prefix
    for (const [pattern, config] of Object.entries(ENDPOINT_LIMITS)) {
      if (key === pattern || key.startsWith(pattern)) return config;
    }
    return DEFAULT_CONFIG;
  }

  /**
   * Checks if a request to the given endpoint is allowed.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  check(endpoint: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const config = this.getConfig(endpoint);
    let entry = this.entries.get(endpoint);

    if (!entry) {
      entry = { timestamps: [], blocked_until: 0 };
      this.entries.set(endpoint, entry);
    }

    // Check if still in cooldown
    if (now < entry.blocked_until) {
      return { allowed: false, retryAfterMs: entry.blocked_until - now };
    }

    // Clean old timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

    // Check limit
    if (entry.timestamps.length >= config.maxRequests) {
      entry.blocked_until = now + config.cooldownMs;
      return { allowed: false, retryAfterMs: config.cooldownMs };
    }

    // Allow and record
    entry.timestamps.push(now);
    return { allowed: true };
  }

  /**
   * Reset rate limit for an endpoint (e.g. after successful login).
   */
  reset(endpoint: string): void {
    this.entries.delete(endpoint);
  }

  /**
   * Clear all rate limit data.
   */
  clearAll(): void {
    this.entries.clear();
  }
}

export const rateLimiter = new RateLimiter();
