import { useEffect, useRef, useCallback } from "react";

/**
 * Debounced callback used for autosave.
 *
 * Reliability guarantees:
 * - Pending calls are FLUSHED (not dropped) when the component unmounts,
 *   when the tab is hidden, and on pagehide — so the last second of typing
 *   is never lost when the user navigates away or closes the tab.
 * - Optional `getKey`: calls with different keys are debounced independently,
 *   so a pending save for one record (scene / note / entity / field) is never
 *   cancelled by a save for another. Without `getKey`, all calls share one
 *   timer (latest call wins), as before.
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  getKey?: (...args: Parameters<T>) => string,
): T {
  const pendingRef = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; args: Parameters<T> }>(),
  );
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;

  useEffect(() => {
    const pending = pendingRef.current;
    const flushAll = () => {
      for (const [key, { timer, args }] of pending) {
        clearTimeout(timer);
        pending.delete(key);
        callbackRef.current(...args);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      const pending = pendingRef.current;
      const key = getKeyRef.current ? getKeyRef.current(...args) : "__default__";
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        pending.delete(key);
        callbackRef.current(...args);
      }, delay);
      pending.set(key, { timer, args });
    }) as T,
    [delay],
  );
}
