import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.mjs";

// Disable the worker requirement — no Worker API in the Deno edge runtime.
// Empty string is not accepted by 4.4.168; false suppresses the worker check.
pdfjsLib.GlobalWorkerOptions.workerSrc = false as any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// PDF text extraction via pdfjs-dist.
// Handles FlateDecode compressed streams, CIDFont, and Type3 fonts.
// ---------------------------------------------------------------------------
async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join("");
    pages.push(pageText);
  }
  return pages.join("\n").slice(0, 8000);
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
      extractedText = await extractTextFromPdf(buffer);
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
        max_tokens: 2048,
        system:
          "You are a lore extraction assistant for a fantasy world-building app called Fyrescribe.\n" +
          "Extract structured fields from the provided document and map them to the exact field\n" +
          "names listed below for the given category. Return ONLY a JSON object with this shape:\n" +
          "{\n" +
          "  name: string,\n" +
          "  summary: string,\n" +
          "  fields: Record<string, string>,\n" +
          "  sections: Record<string, string>\n" +
          "}\n\n" +
          "Rules:\n" +
          "- The source document may be structured or unstructured. Extract whatever relevant information is present even if it doesn't match the exact field labels. If a field label in the document differs from the expected key name, map it to the closest matching key. If a field has no corresponding data in the document, return an empty string for that key — do not omit it.\n" +
          "- name: the entity's name\n" +
          "- summary: a 1-2 sentence visual/descriptive summary combining physical appearance, title, race, occupation\n" +
          "- fields: use ONLY these exact key names per category (no others):\n" +
          "  characters: Place of Birth, Currently Residing, Eye Color, Hair Color, Height, Allegiance, First Appearance, First Mentioned\n" +
          "  places: Region, Climate, Population, Government, Notable Landmarks, First Mentioned\n" +
          "  events: Date/Era, Location, Key Participants, Outcome, First Mentioned\n" +
          "  artifacts: Type, Origin, Current Owner, Powers, First Mentioned\n" +
          "  creatures: Classification, Habitat, Average Size, Diet, Threat Level, First Mentioned\n" +
          "  magic: Type, Regional Origin, Rarity, First Recorded Use\n" +
          "  factions: Type, Founded, Leader, Headquarters, Allegiance, First Mentioned\n" +
          "  doctrine: Type, Regional Origin, Followers, Core Belief, First Mentioned\n" +
          "  history: Date/Era, Location, Key Factions, Outcome\n" +
          "- sections: use ONLY these exact key names per category (no others):\n" +
          "  characters: Overview, Background, Personality, Relationships, Notable Events, Magic & Abilities\n" +
          "  places: Description, History, Notable Inhabitants, Points of Interest\n" +
          "  creatures: Appearance, Behaviour, Abilities, Habitat, Lore\n" +
          "  artifacts: Description, History, Powers, Current Whereabouts\n" +
          "  events: Summary, Causes, Key Participants, Consequences, Aftermath\n" +
          "  magic: Description, Regional Origin, Known Users, Imbued Weapons & Artifacts\n" +
          "  factions: Overview, History, Structure, Notable Members, Goals\n" +
          "  doctrine: Core Tenets, Origins, Followers, Contradictions\n" +
          "  history: Overview, Causes, Key Figures, Consequences, Legacy\n" +
          "- Only populate fields and sections where the source document contains relevant content\n" +
          "- Leave fields/sections as empty string if no relevant content found\n" +
          "- Do not invent information not present in the document\n" +
          "- Return raw JSON only, no markdown or explanation",
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
    const rawText: string = aiResult.content?.[0]?.text ?? "{}";

    // Strip accidental code fences
    const jsonText = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let name: string;
    let summary: string;
    let fields: Record<string, string>;
    let sections: Record<string, string>;
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected object");
      }
      name = typeof parsed.name === "string" ? parsed.name : "";
      summary = typeof parsed.summary === "string" ? parsed.summary : "";
      fields = parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
        ? Object.fromEntries(
            Object.entries(parsed.fields).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>
        : {};
      sections = parsed.sections && typeof parsed.sections === "object" && !Array.isArray(parsed.sections)
        ? Object.fromEntries(
            Object.entries(parsed.sections).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>
        : {};
    } catch {
      console.error("Failed to parse Claude response:", rawText);
      return new Response(
        JSON.stringify({ error: "Claude returned invalid JSON: " + rawText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ name, summary, fields, sections }), {
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
