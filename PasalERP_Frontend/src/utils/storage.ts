/**
 * Safe, versioned local-storage helpers used during the frontend-only phase.
 * This layer is intentionally isolated so it can later be replaced by API-backed
 * repositories without changing the UI components.
 */
export const APP_STORAGE_VERSION = 2;

export interface StoredEnvelope<T> {
  version: number;
  updatedAt: string;
  data: T;
}

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as T | StoredEnvelope<T>;
    if (isEnvelope<T>(parsed)) return parsed.data;
    return parsed as T;
  } catch (error) {
    console.warn(`[storage] Unable to read ${key}; using fallback data.`, error);
    return fallback;
  }
}

export function writeStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    const envelope: StoredEnvelope<T> = {
      version: APP_STORAGE_VERSION,
      updatedAt: new Date().toISOString(),
      data,
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch (error) {
    console.error(`[storage] Unable to persist ${key}.`, error);
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[storage] Unable to remove ${key}.`, error);
  }
}

export function clearAppStorage(keys: string[]): void {
  keys.forEach(removeStorage);
}

function isEnvelope<T>(value: unknown): value is StoredEnvelope<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return 'version' in candidate && 'updatedAt' in candidate && 'data' in candidate;
}
