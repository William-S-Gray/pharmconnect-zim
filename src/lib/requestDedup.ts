/**
 * Request deduplication — prevents duplicate in-flight GET requests.
 * Identical GET requests made while one is pending will share the same promise.
 */

const inflightRequests = new Map<string, Promise<any>>();

export function getDeduplicationKey(method: string, url: string, params?: Record<string, any>): string | null {
  if (method.toUpperCase() !== 'GET') return null;
  const paramStr = params ? JSON.stringify(params) : '';
  return `${method}:${url}:${paramStr}`;
}

export function getInflight(key: string): Promise<any> | undefined {
  return inflightRequests.get(key);
}

export function setInflight(key: string, promise: Promise<any>): void {
  inflightRequests.set(key, promise);
  // Auto-cleanup when resolved or rejected
  promise.finally(() => inflightRequests.delete(key));
}
