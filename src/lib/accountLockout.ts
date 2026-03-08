/**
 * Client-side account lockout tracker.
 * Locks login after repeated failures per email, with escalating cooldowns.
 */

const STORAGE_KEY = 'pharmtrack_lockout';
const MAX_ATTEMPTS = 5;
const BASE_COOLDOWN_MS = 30_000; // 30 seconds
const MAX_COOLDOWN_MS = 15 * 60_000; // 15 minutes

interface LockoutEntry {
  attempts: number;
  lockedUntil: number;
}

type LockoutStore = Record<string, LockoutEntry>;

function getStore(): LockoutStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore(store: LockoutStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function checkLockout(email: string): { locked: boolean; remainingMs: number } {
  const key = normalizeEmail(email);
  const store = getStore();
  const entry = store[key];
  if (!entry) return { locked: false, remainingMs: 0 };

  const now = Date.now();
  if (entry.lockedUntil > now) {
    return { locked: true, remainingMs: entry.lockedUntil - now };
  }
  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt(email: string): { locked: boolean; remainingMs: number; attempts: number } {
  const key = normalizeEmail(email);
  const store = getStore();
  const entry = store[key] || { attempts: 0, lockedUntil: 0 };

  entry.attempts += 1;

  if (entry.attempts >= MAX_ATTEMPTS) {
    // Escalating cooldown: 30s, 60s, 120s, ... up to 15min
    const multiplier = Math.pow(2, Math.floor(entry.attempts / MAX_ATTEMPTS) - 1);
    const cooldown = Math.min(BASE_COOLDOWN_MS * multiplier, MAX_COOLDOWN_MS);
    entry.lockedUntil = Date.now() + cooldown;
    store[key] = entry;
    saveStore(store);
    return { locked: true, remainingMs: cooldown, attempts: entry.attempts };
  }

  store[key] = entry;
  saveStore(store);
  return { locked: false, remainingMs: 0, attempts: entry.attempts };
}

export function resetLockout(email: string) {
  const key = normalizeEmail(email);
  const store = getStore();
  delete store[key];
  saveStore(store);
}

export function formatLockoutTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}
