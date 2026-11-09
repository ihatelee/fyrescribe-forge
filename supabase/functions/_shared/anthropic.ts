// Shared Anthropic Messages API call with a time limit and automatic retries.
//
// - Each attempt is cut off after ATTEMPT_TIMEOUT_MS, so a stalled response
//   fails with a clear error instead of hanging until the edge runtime kills it.
// - Retries on rate limits (429), overloaded (529), server errors (500/502/503/504)
//   and network/timeout errors, honouring Retry-After (capped).
// - Never starts a retry that couldn't finish inside the function's wall-clock budget.
//
// Drop-in for: fetch("https://api.anthropic.com/v1/messages", init)

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 110_000;
const TOTAL_BUDGET_MS = 140_000; // below Supabase's 150 s free-plan wall clock
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number, res?: Response): number {
  const retryAfter = res?.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
  return attempt === 1 ? 1_000 : 3_000;
}

export async function fetchAnthropic(init: RequestInit): Promise<Response> {
  const started = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    const timeout = Math.min(ATTEMPT_TIMEOUT_MS, remaining);
    if (timeout < 5_000) break;

    let res: Response | undefined;
    try {
      res = await fetch(ANTHROPIC_URL, { ...init, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      lastError = e;
      console.warn(`Anthropic attempt ${attempt} failed:`, e instanceof Error ? e.message : e);
    }

    if (res && !RETRYABLE_STATUS.has(res.status)) return res;
    if (res) {
      console.warn(`Anthropic attempt ${attempt} returned ${res.status}`);
      if (attempt === MAX_ATTEMPTS) return res; // let the caller's existing error handling run
    }

    const wait = backoffMs(attempt, res);
    if (Date.now() - started + wait + 5_000 > TOTAL_BUDGET_MS) {
      if (res) return res;
      break;
    }
    await sleep(wait);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Anthropic request failed after retries");
}
