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

// Claude Sonnet 5.5 / Haiku 5.5 responses can begin with one or more
// `thinking` blocks (adaptive thinking runs by default when `thinking` is
// omitted) — never read content[0].text. Join every `text` block instead.
// deno-lint-ignore no-explicit-any
export function extractText(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// A decline is a normal HTTP 200 with stop_reason "refusal" — check before
// reading content. Returns the refusal detail, or null when the response
// isn't a refusal.
export interface RefusalDetail {
  category: string;
  stop_details: unknown;
}

export function checkRefusal(
  // deno-lint-ignore no-explicit-any
  result: { stop_reason?: string; stop_details?: unknown } | any,
): RefusalDetail | null {
  if (result?.stop_reason !== "refusal") return null;
  return {
    // deno-lint-ignore no-explicit-any
    category: (result?.stop_details as any)?.category ?? "unknown",
    stop_details: result?.stop_details ?? null,
  };
}

// Logs a refusal with the function name, whatever identifiers the caller has
// (scene id, entity id, chapter id, project id, ...), and the full stop_details.
export function logRefusal(
  fnName: string,
  ids: Record<string, unknown>,
  refusal: RefusalDetail,
): void {
  console.error(
    `[${fnName}] Anthropic refused:`,
    JSON.stringify({ ...ids, category: refusal.category, stop_details: refusal.stop_details }),
  );
}

// Standard body for a refused request so the frontend can show a specific,
// named message instead of a generic failure. Always sent with HTTP 200 —
// a refusal is a normal outcome, not a server error — so `supabase-js`
// surfaces it on `data`, not `error`.
export interface RefusalPayload {
  refused: true;
  message: string;
  name: string;
  category: string;
}

export function refusalPayload(name: string, refusal: RefusalDetail): RefusalPayload {
  return {
    refused: true,
    message: `The AI declined to process "${name}".`,
    name,
    category: refusal.category,
  };
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
