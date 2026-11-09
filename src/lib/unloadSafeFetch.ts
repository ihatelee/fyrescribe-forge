// Lets autosaves that are flushed while the page is closing or reloading
// actually reach the server. Browsers cancel normal requests on unload;
// requests marked `keepalive` are allowed to finish.
//
// The flag is only raised while useDebouncedCallback flushes on tab hide /
// pagehide, so normal requests are untouched. Keepalive bodies are capped
// (~64 KB total) by the browser, so larger payloads go out as normal requests.

const KEEPALIVE_MAX_BODY = 60_000;
let flushingForUnload = false;

export function runWhileUnloading(fn: () => void): void {
  flushingForUnload = true;
  try {
    fn();
  } finally {
    // Reset after pending microtasks (auth token lookup etc.) have issued their fetches.
    setTimeout(() => {
      flushingForUnload = false;
    }, 0);
  }
}

export const unloadSafeFetch: typeof fetch = (input, init) => {
  if (
    flushingForUnload &&
    (typeof init?.body !== "string" || init.body.length <= KEEPALIVE_MAX_BODY)
  ) {
    return fetch(input, { ...init, keepalive: true });
  }
  return fetch(input, init);
};
