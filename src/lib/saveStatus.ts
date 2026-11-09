import { useSyncExternalStore } from "react";
import { pendingCount } from "@/hooks/use-debounce";

// Backoff schedule for a failing save: 5s, 10s, 20s, then every 30s for as
// long as the page stays open.
const RETRY_DELAYS = [5000, 10000, 20000];
const STEADY_RETRY_DELAY = 30000;

type SaveResult<E> = { error: E | null };
// PromiseLike, not Promise: Supabase query builders are thenables but aren't
// full Promises (no .catch/.finally), and callers pass those directly.
type SaveFn<E> = () => PromiseLike<SaveResult<E>>;

const failingKeys = new Set<string>();
const pendingRetries = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function clearPendingRetry(key: string): void {
  const timer = pendingRetries.get(key);
  if (timer === undefined) return;
  clearTimeout(timer);
  pendingRetries.delete(key);
}

function markFailing(key: string): void {
  if (failingKeys.has(key)) return;
  failingKeys.add(key);
  notify();
}

function clearFailing(key: string): void {
  if (!failingKeys.delete(key)) return;
  notify();
}

async function attempt<E>(key: string, fn: SaveFn<E>, retryIndex: number): Promise<SaveResult<E>> {
  const result = await fn();
  if (!result.error) {
    clearFailing(key);
    return result;
  }
  markFailing(key);
  const delay = RETRY_DELAYS[retryIndex] ?? STEADY_RETRY_DELAY;
  const timer = setTimeout(() => {
    pendingRetries.delete(key);
    attempt(key, fn, retryIndex + 1).catch((e) =>
      console.error(`Retry failed for ${key}:`, e),
    );
  }, delay);
  pendingRetries.set(key, timer);
  return result;
}

/**
 * Run a save, retrying with backoff on failure until it succeeds. `key`
 * identifies the record being saved (e.g. `scene:${sceneId}`) — a newer
 * runSave() call for the same key cancels that key's pending retry, since
 * the newer call carries the latest content.
 *
 * Resolves with the result of this call's own first attempt; any retries it
 * schedules run in the background.
 */
export function runSave<E>(key: string, fn: SaveFn<E>): Promise<SaveResult<E>> {
  clearPendingRetry(key);
  return attempt(key, fn, 0);
}

function isFailing(keyPrefix?: string): boolean {
  if (!keyPrefix) return failingKeys.size > 0;
  for (const key of failingKeys) {
    if (key.startsWith(keyPrefix)) return true;
  }
  return false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether any key (optionally restricted to `keyPrefix`) is currently failing. */
export function useSaveStatus(keyPrefix?: string): { failing: boolean } {
  const failing = useSyncExternalStore(subscribe, () => isFailing(keyPrefix));
  return { failing };
}

/** True when a debounced save is still queued, or any save is failing/retrying. */
export function hasUnsavedWork(): boolean {
  return failingKeys.size > 0 || pendingCount() > 0;
}

/** Test-only: clears all module state between test cases. */
export function __resetSaveStatusForTesting(): void {
  for (const timer of pendingRetries.values()) clearTimeout(timer);
  pendingRetries.clear();
  failingKeys.clear();
}
