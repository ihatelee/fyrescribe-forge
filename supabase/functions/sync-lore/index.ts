import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum characters of scene content to include per scene in the AI prompt.
const SCENE_CONTENT_LIMIT = 1200;

// ── Category metadata (mirrors frontend EntityDetailPage constants) ──────────

const CATEGORY_FIELDS: Record<string, string[]> = {
  characters: ["Place of Birth", "Currently Residing", "Eye Color", "Hair Color", "Height", "Allegiance", "First Appearance", "First Mentioned"],
  places: ["Region", "Climate", "Population", "Government", "Notable Landmarks", "First Mentioned"],
  events: ["Date/Era", "Location", "Key Participants", "Outcome", "First Mentioned"],
  artifacts: ["Type", "Origin", "Current Owner", "Powers", "First Mentioned"],
  creatures: ["Classification", "Habitat", "Average Size", "Diet", "Threat Level", "First Mentioned"],
  magic: ["Type", "Regional Origin", "Rarity", "First Recorded Use"],
  factions: ["Type", "Founded", "Leader", "Headquarters", "Allegiance", "First Mentioned"],
  doctrine: ["Type", "Regional Origin", "Followers", "Core Belief", "First Mentioned"],
  history: ["Date/Era", "Location", "Key Factions", "Outcome"],
};

const CATEGORY_SECTIONS: Record<string, string[]> = {
  characters: ["Overview", "Background", "Personality", "Relationships", "Notable Events"],
  places: ["Description", "History", "Notable Inhabitants", "Points of Interest"],
  creatures: ["Appearance", "Behaviour", "Abilities", "Habitat", "Lore"],
  artifacts: ["Description", "History", "Powers", "Current Whereabouts"],
  events: ["Summary", "Causes", "Key Participants", "Consequences", "Aftermath"],
  magic: ["Description", "Regional Origin", "Known Users", "Imbued Weapons & Artifacts"],
  factions: ["Overview", "History", "Structure", "Notable Members", "Goals"],
  doctrine: ["Core Tenets", "Origins", "Followers", "Contradictions"],
  history: ["Overview", "Causes", "Key Figures", "Consequences", "Legacy"],
};

// ── Types ────────────────────────────────────────────────────────────────────

interface AISuggestion {
  name: string;
  category: string;
  description: string;
  confidence: number;
  source_scene_title?: string;
  fields?: Record<string, string>;
  sections?: Record<string, string>;
  tags?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { project_id, trigger = "manual", force = false } = body as {
      project_id?: string;
      trigger?: "scheduled" | "manual";
      force?: boolean;
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine which projects to process.
    let projectIds: string[];
    if (project_id) {
      projectIds = [project_id];
    } else {
      const { data: dirtyScenes } = await supabase
        .from("scenes")
        .select("project_id")
        .eq("is_dirty", true);
      projectIds = [...new Set((dirtyScenes ?? []).map((s) => s.project_id))];
    }

    if (projectIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No projects with dirty scenes", projects_synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results = [];
    for (const pid of projectIds) {
      const result = await syncProject(supabase, pid, trigger as "scheduled" | "manual", anthropicKey, force);
      results.push(result);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function syncProject(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  projectId: string,
  trigger: "scheduled" | "manual",
  anthropicKey: string,
  force = false,
): Promise<{ project_id: string; scenes_processed: number; suggestions_created: number; force: boolean }> {
  // Open a sync_log entry.
  const { data: logEntry } = await supabase
    .from("sync_log")
    .insert({ project_id: projectId, triggered_by: trigger, status: "running" })
    .select("id")
    .single();
  const logId: string | undefined = logEntry?.id;

  try {
    // Fetch scenes — all with content when force=true, otherwise only dirty ones.
    let query = supabase
      .from("scenes")
      .select("id, title, content")
      .eq("project_id", projectId)
      .not("content", "is", null)
      .not("content", "eq", "");
    if (!force) {
      query = query.eq("is_dirty", true);
    }
    const { data: scenes } = await query;

    if (!scenes || scenes.length === 0) {
      await finaliseLog(supabase, logId, "completed", 0, 0);
      return { project_id: projectId, scenes_processed: 0, suggestions_created: 0, force };
    }

    // Fetch existing entities so the AI can avoid re-suggesting them.
    const { data: existingEntities } = await supabase
      .from("entities")
      .select("name, category, summary")
      .eq("project_id", projectId);

    const entityContext = (existingEntities ?? [])
      .map(
        (e: { name: string; category: string; summary?: string }) =>
          `[${e.category}] ${e.name}${e.summary ? ": " + e.summary : ""}`,
      )
      .join("\n");

    // ── One API call per scene ───────────────────────────────────────────────
    // Each call asks for a single JSON object (or null). This keeps output
    // tokens tiny (~200–400) and makes truncation impossible.

    const allSuggestions: AISuggestion[] = [];

    for (const scene of scenes as { id: string; title: string; content: string }[]) {
      const sceneText = (scene.content ?? "").slice(0, SCENE_CONTENT_LIMIT).trim();
      if (!sceneText) continue;

      const suggestion = await callAnthropicForScene(
        anthropicKey,
        scene.title,
        sceneText,
        entityContext,
      );

      if (suggestion) {
        // Stamp the source scene title in case the AI omitted it.
        suggestion.source_scene_title = suggestion.source_scene_title || scene.title;
        allSuggestions.push(suggestion);
      }
    }

    console.log(`[sync-lore] project=${projectId} scenes=${scenes.length} raw_suggestions=${allSuggestions.length}`);

    // ── Deduplicate by name (case-insensitive) ───────────────────────────────
    // Keep the highest-confidence version when the same entity appears in
    // multiple scenes.
    const seenNames = new Map<string, AISuggestion>();
    for (const s of allSuggestions) {
      const key = s.name.trim().toLowerCase();
      const existing = seenNames.get(key);
      if (!existing || s.confidence > existing.confidence) {
        seenNames.set(key, s);
      }
    }
    const suggestions = [...seenNames.values()];
    console.log(`[sync-lore] after dedup: ${suggestions.length} unique suggestions`);

    // ── Map to lore_suggestions rows ─────────────────────────────────────────
    const validCategories = new Set([
      "characters", "places", "events", "history", "artifacts",
      "creatures", "magic", "factions", "doctrine",
    ]);

    const rows = suggestions
      .filter(
        (s) =>
          s.name &&
          validCategories.has(s.category) &&
          typeof s.confidence === "number" &&
          s.confidence >= 0.6,
      )
      .map((s) => {
        // Case-insensitive field key lookup so casing variations don't drop data.
        const aiFieldsLower: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.fields ?? {})) {
          if (typeof v === "string") aiFieldsLower[k.toLowerCase()] = v;
        }
        const expectedFields = CATEGORY_FIELDS[s.category] ?? [];
        const fields = Object.fromEntries(
          expectedFields.map((key) => [key, aiFieldsLower[key.toLowerCase()] ?? ""]),
        );

        // Case-insensitive section key lookup.
        const aiSectionsLower: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.sections ?? {})) {
          if (typeof v === "string" && v.trim()) aiSectionsLower[k.toLowerCase()] = v.trim();
        }
        const expectedSections = CATEGORY_SECTIONS[s.category] ?? [];
        const sections: Record<string, string> = {};
        for (const sectionKey of expectedSections) {
          const val = aiSectionsLower[sectionKey.toLowerCase()];
          if (val) sections[sectionKey] = val;
        }
        for (const [k, v] of Object.entries(s.sections ?? {})) {
          if (typeof v === "string" && v.trim() && !sections[k]) {
            sections[k] = v.trim();
          }
        }

        return {
          project_id: projectId,
          type: "new_entity" as const,
          payload: {
            name: s.name,
            category: s.category,
            description: s.description ?? "",
            confidence: Math.min(1, Math.max(0, s.confidence)),
            source_scene_title: s.source_scene_title ?? null,
            fields,
            sections,
            tags: Array.isArray(s.tags)
              ? s.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean)
              : [],
          },
          status: "pending" as const,
        };
      });

    let suggestionsCreated = 0;
    if (rows.length > 0) {
      const { data: inserted } = await supabase
        .from("lore_suggestions")
        .insert(rows)
        .select("id");
      suggestionsCreated = inserted?.length ?? 0;
    }

    // Clear is_dirty on processed scenes.
    await supabase
      .from("scenes")
      .update({ is_dirty: false })
      .in("id", scenes.map((s: { id: string }) => s.id));

    // Update projects.last_sync_at.
    await supabase
      .from("projects")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", projectId);

    await finaliseLog(supabase, logId, "completed", scenes.length, suggestionsCreated);
    return { project_id: projectId, scenes_processed: scenes.length, suggestions_created: suggestionsCreated, force };
  } catch (err) {
    await finaliseLog(supabase, logId, "failed", 0, 0);
    throw err;
  }
}

// ── Per-scene Anthropic call ─────────────────────────────────────────────────
// Returns a single AISuggestion or null. Never throws — logs and returns null
// on any error so one bad scene never aborts the whole sync.

async function callAnthropicForScene(
  anthropicKey: string,
  sceneTitle: string,
  sceneText: string,
  entityContext: string,
): Promise<AISuggestion | null> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: buildPrompt(sceneTitle, sceneText, entityContext) }],
      }),
    });
  } catch (err) {
    console.error(`[sync-lore] fetch error for scene "${sceneTitle}":`, err);
    return null;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "(unreadable)");
    console.error(`[sync-lore] Anthropic HTTP ${response.status} for scene "${sceneTitle}":`, errText.slice(0, 400));
    return null;
  }

  let aiResult: { content?: { text?: string }[] };
  try {
    aiResult = await response.json();
  } catch (err) {
    console.error(`[sync-lore] Failed to parse Anthropic response JSON for scene "${sceneTitle}":`, err);
    return null;
  }

  const rawText = aiResult.content?.[0]?.text ?? "null";
  const jsonText = rawText
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error(`[sync-lore] JSON.parse failed for scene "${sceneTitle}". Raw:`, rawText.slice(0, 600));
    return null;
  }

  // AI signals "nothing to suggest" with null.
  if (parsed === null) return null;

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(`[sync-lore] Unexpected JSON type (${typeof parsed}) for scene "${sceneTitle}". Raw:`, rawText.slice(0, 400));
    return null;
  }

  return parsed as AISuggestion;
}

// deno-lint-ignore no-explicit-any
async function finaliseLog(supabase: any, logId: string | undefined, status: string, scenesProcessed: number, suggestionsCreated: number) {
  if (!logId) return;
  await supabase
    .from("sync_log")
    .update({ status, scenes_processed: scenesProcessed, suggestions_created: suggestionsCreated })
    .eq("id", logId);
}

function buildCategoryReference(): string {
  const lines: string[] = ["CATEGORY REFERENCE:"];
  for (const cat of Object.keys(CATEGORY_FIELDS)) {
    const fields = CATEGORY_FIELDS[cat].join(", ");
    const sections = (CATEGORY_SECTIONS[cat] ?? []).join(", ");
    lines.push(`  ${cat}: fields=[${fields}] sections=[${sections}]`);
  }
  return lines.join("\n");
}

function buildPrompt(sceneTitle: string, sceneText: string, entityContext: string): string {
  return `You are a world-building analyst for a fantasy novel. Identify the single most important named entity in the scene below that is worth tracking in a world-building database.

EXISTING ENTITIES — do NOT suggest these:
${entityContext || "(none yet)"}

${buildCategoryReference()}

SCENE "${sceneTitle}":
${sceneText}

Return a single JSON object for the most important entity, or null if there is nothing worth tracking (confidence below 0.6 or no proper nouns).

The JSON object must have exactly these keys:
- "name": string — proper name, 1–5 words
- "category": one of "characters"|"places"|"events"|"history"|"artifacts"|"creatures"|"magic"|"factions"|"doctrine"
- "description": string — max 60 words
- "confidence": number 0.0–1.0
- "source_scene_title": string — use "${sceneTitle}"
- "fields": object — only keys from CATEGORY REFERENCE you can infer from the text
- "sections": object — at most 1 section, max 50 words; use exact section name from CATEGORY REFERENCE
- "tags": array of 2–3 lowercase strings

Output only the JSON object or the word null. No prose, no markdown fences.`;
}
