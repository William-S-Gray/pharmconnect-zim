/**
 * Session Inactivity Timeout Manager
 *
 * Monitors user activity (mouse, keyboard, touch, scroll) and triggers
 * logout after a configurable period of inactivity.
 */

type LogoutCallback = () => void;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click',
];

/** Default: 30 minutes of inactivity */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/** Warning shown 2 minutes before logout */
const WARNING_BEFORE_MS = 2 * 60 * 1000;

class SessionTimeoutManager {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private warningId: ReturnType<typeof setTimeout> | null = null;
  private logoutCallback: LogoutCallback | null = null;
  private warningCallback: (() => void) | null = null;
  private timeoutMs = DEFAULT_TIMEOUT_MS;
  private isActive = false;
  private lastActivity = Date.now();

  private handleActivity = () => {
    this.lastActivity = Date.now();
    if (this.isActive) this.resetTimers();
  };

  /**
   * Start monitoring for inactivity.
   */
  start(
    onLogout: LogoutCallback,
    options?: { timeoutMs?: number; onWarning?: () => void }
  ): void {
    this.stop(); // Clean up any existing listeners

    this.logoutCallback = onLogout;
    this.warningCallback = options?.onWarning || null;
    this.timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.isActive = true;
    this.lastActivity = Date.now();

    // Attach activity listeners
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, this.handleActivity, { passive: true })
    );

    // Listen for activity in other tabs via storage events
    window.addEventListener('storage', this.handleStorageEvent);

    this.resetTimers();
  }

  /**
   * Stop monitoring and clean up.
   */
  stop(): void {
    this.isActive = false;
    this.clearTimers();

    ACTIVITY_EVENTS.forEach((event) =>
      window.removeEventListener(event, this.handleActivity)
    );
    window.removeEventListener('storage', this.handleStorageEvent);

    this.logoutCallback = null;
    this.warningCallback = null;
  }

  /**
   * Record activity (call from API responses to extend session).
   */
  recordActivity(): void {
    this.handleActivity();
  }

  /**
   * Get remaining time in ms before timeout.
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.lastActivity;
    return Math.max(0, this.timeoutMs - elapsed);
  }

  private resetTimers(): void {
    this.clearTimers();

    // Set warning timer
    const warningDelay = this.timeoutMs - WARNING_BEFORE_MS;
    if (warningDelay > 0 && this.warningCallback) {
      this.warningId = setTimeout(() => {
        this.warningCallback?.();
      }, warningDelay);
    }

    // Set logout timer
    this.timeoutId = setTimeout(() => {
      if (this.logoutCallback) {
        this.logoutCallback();
      }
    }, this.timeoutMs);

    // Sync activity across tabs
    try {
      localStorage.setItem('pharmtrack_last_activity', String(Date.now()));
    } catch {
      // Ignore storage errors
    }
  }

  private clearTimers(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.warningId) {
      clearTimeout(this.warningId);
      this.warningId = null;
    }
  }

  /**
   * Sync timeout across browser tabs — if another tab is active, reset here too.
   */
  private handleStorageEvent = (e: StorageEvent): void => {
    if (e.key === 'pharmtrack_last_activity' && e.newValue) {
      const otherTabActivity = parseInt(e.newValue, 10);
      if (otherTabActivity > this.lastActivity) {
        this.lastActivity = otherTabActivity;
        this.resetTimers();
      }
    }

    // If another tab logged out, follow suit
    if (e.key === 'pharmtrack_token' && !e.newValue) {
      this.logoutCallback?.();
    }
  };
}

export const sessionTimeout = new SessionTimeoutManager();
