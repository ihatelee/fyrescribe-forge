import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// PDF text extraction — no external library; works on text-based PDFs only.
// Scans BT…ET blocks for parenthesised strings, with a raw fallback.
// ---------------------------------------------------------------------------
function extractTextFromPdf(buffer: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(buffer);

  const texts: string[] = [];

  // Primary: gather text inside BT…ET blocks
  const btEtRe = /BT([\s\S]*?)ET/g;
  let btMatch: RegExpExecArray | null;
  while ((btMatch = btEtRe.exec(raw)) !== null) {
    const block = btMatch[1];
    // Parenthesised strings — handle escape sequences inside
    const parenRe = /\((?:[^)\\]|\\.)*\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = parenRe.exec(block)) !== null) {
      const text = pm[0]
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (text.trim()) texts.push(text);
    }
  }

  // Fallback: scan all parenthesised strings that look like real words
  if (texts.length === 0) {
    const fallbackRe = /\(([^)\\]{3,})\)/g;
    let m: RegExpExecArray | null;
    while ((m = fallbackRe.exec(raw)) !== null) {
      const t = m[1].trim();
      if (t && /[a-zA-Z]/.test(t)) texts.push(t);
    }
  }

  return texts.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Expected multipart/form-data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const category = formData.get("category");

    if (!(file instanceof File) || !category || typeof category !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required fields: file, category" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Extract text ───────────────────────────────────────────────────────
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isTxt =
      file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");

    if (!isPdf && !isTxt) {
      return new Response(
        JSON.stringify({ error: "Unsupported file type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    let extractedText: string;

    if (isTxt) {
      extractedText = new TextDecoder("utf-8").decode(buffer);
    } else {
      extractedText = extractTextFromPdf(buffer);
      if (!extractedText) {
        return new Response(
          JSON.stringify({ error: "Could not extract text from PDF. Ensure it is a text-based (not scanned) PDF." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Truncate to keep prompt size reasonable (~8 000 chars ≈ ~2 000 tokens)
    const truncated = extractedText.slice(0, 8000);

    // ── Call Claude ────────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system:
          "You are a lore extraction assistant for a fantasy world-building app. " +
          "Extract structured fields from the provided document. Return ONLY a JSON array " +
          "of objects with shape { key: string, value: string }. Use field names " +
          "appropriate for the entity category provided. Do not include any explanation or " +
          "markdown, just the raw JSON array.",
        messages: [
          {
            role: "user",
            content: `Category: ${category}\n\nDocument:\n${truncated}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error("Anthropic API error:", responseText);
      return new Response(
        JSON.stringify({ error: "Anthropic API error: " + responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiResult = await response.json();
    const rawText: string = aiResult.content?.[0]?.text ?? "[]";

    // Strip accidental code fences
    const jsonText = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let fields: { key: string; value: string }[];
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Expected array");
      fields = parsed.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof item.key === "string" &&
          typeof item.value === "string",
      );
    } catch {
      console.error("Failed to parse Claude response:", rawText);
      return new Response(
        JSON.stringify({ error: "Claude returned invalid JSON: " + rawText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ fields }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(
      JSON.stringify({ error: "Unhandled: " + (e instanceof Error ? e.message : String(e)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
