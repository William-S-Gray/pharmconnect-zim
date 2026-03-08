/**
 * CSRF Token Manager
 * 
 * Generates a per-session CSRF token and attaches it to mutation requests
 * (POST, PUT, PATCH, DELETE). The backend must validate the token from
 * the `X-CSRF-Token` header against the session's expected value.
 * 
 * Flow:
 * 1. On app init, generate a cryptographically random token
 * 2. Store it in sessionStorage (scoped to tab, cleared on close)
 * 3. Attach to all mutation requests via X-CSRF-Token header
 * 4. Backend validates token matches what was issued at login
 */

const CSRF_STORAGE_KEY = 'pharmtrack_csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

/** Mutation HTTP methods that require CSRF protection */
const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * Generate a cryptographically random token using Web Crypto API.
 * Falls back to Math.random if crypto is unavailable.
 */
function generateToken(): string {
  try {
    const buffer = new Uint8Array(32);
    crypto.getRandomValues(buffer);
    return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback for environments without crypto
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

/**
 * Get or create the CSRF token for this session.
 */
export function getCsrfToken(): string {
  let token = sessionStorage.getItem(CSRF_STORAGE_KEY);
  if (!token) {
    token = generateToken();
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  }
  return token;
}

/**
 * Refresh the CSRF token (call after login or sensitive actions).
 */
export function refreshCsrfToken(): string {
  const token = generateToken();
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  return token;
}

/**
 * Clear the CSRF token (call on logout).
 */
export function clearCsrfToken(): void {
  sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

/**
 * Check if a request method requires CSRF protection.
 */
export function isMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method.toLowerCase());
}

export { CSRF_HEADER };
