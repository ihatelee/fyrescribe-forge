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
  /** At a Glance values — only keys the AI can infer from the text */
  fields?: Record<string, string>;
  /** Article section content — only sections the AI has evidence for */
  sections?: Record<string, string>;
  /** Short tag strings for cross-referencing */
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
      /** When true, ignore is_dirty and sync all scenes with content. */
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

    const sceneContext = scenes
      .map(
        (s: { title: string; content: string }) =>
          `Scene "${s.title}":\n${(s.content ?? "").slice(0, SCENE_CONTENT_LIMIT).trim()}`,
      )
      .join("\n\n---\n\n");

    const entityContext = (existingEntities ?? [])
      .map(
        (e: { name: string; category: string; summary?: string }) =>
          `[${e.category}] ${e.name}${e.summary ? ": " + e.summary : ""}`,
      )
      .join("\n");

    // Call Anthropic.
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: buildPrompt(sceneContext, entityContext) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      await finaliseLog(supabase, logId, "failed", scenes.length, 0);
      throw new Error("Anthropic API call failed");
    }

    const aiResult = await response.json();
    const rawText: string = aiResult.content?.[0]?.text ?? "[]";
    const jsonText = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let suggestions: AISuggestion[];
    try {
      suggestions = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error(`[sync-lore] JSON parse error for project ${projectId}. Raw text:`, rawText.slice(0, 800));
      throw parseErr;
    }
    console.log(`[sync-lore] project=${projectId} suggestions_from_ai=${suggestions.length}`, JSON.stringify(suggestions.map((s) => ({ name: s.name, category: s.category, fieldKeys: Object.keys(s.fields ?? {}), sectionKeys: Object.keys(s.sections ?? {}), confidence: s.confidence }))));

    // Map to lore_suggestions rows.
    const validCategories = new Set([
      "characters",
      "places",
      "events",
      "history",
      "artifacts",
      "creatures",
      "magic",
      "factions",
      "doctrine",
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
        // Build a case-insensitive lookup of AI-returned field values so key
        // casing differences (e.g. "place of birth" vs "Place of Birth") don't
        // silently drop data.
        const aiFieldsLower: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.fields ?? {})) {
          if (typeof v === "string") aiFieldsLower[k.toLowerCase()] = v;
        }

        // Populate all expected At a Glance keys; AI values (matched
        // case-insensitively) override blanks.
        const expectedFields = CATEGORY_FIELDS[s.category] ?? [];
        const fields = Object.fromEntries(
          expectedFields.map((key) => [key, aiFieldsLower[key.toLowerCase()] ?? ""]),
        );

        // Build a case-insensitive lookup of AI-returned section values.
        const aiSectionsLower: Record<string, string> = {};
        for (const [k, v] of Object.entries(s.sections ?? {})) {
          if (typeof v === "string" && v.trim()) aiSectionsLower[k.toLowerCase()] = v.trim();
        }

        // Keep only non-empty section values, matched against expected section
        // names (case-insensitively) so key casing mismatches don't lose data.
        const expectedSections = CATEGORY_SECTIONS[s.category] ?? [];
        const sections: Record<string, string> = {};
        for (const sectionKey of expectedSections) {
          const val = aiSectionsLower[sectionKey.toLowerCase()];
          if (val) sections[sectionKey] = val;
        }
        // Also capture any AI-returned sections not in the expected list
        // (future-proofing; won't break the frontend).
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


// deno-lint-ignore no-explicit-any
async function finaliseLog(supabase: any, logId: string | undefined, status: string, scenesProcessed: number, suggestionsCreated: number) {
  if (!logId) return;
  await supabase
    .from("sync_log")
    .update({ status, scenes_processed: scenesProcessed, suggestions_created: suggestionsCreated })
    .eq("id", logId);
}

function buildCategoryReference(): string {
  const lines: string[] = ["CATEGORY REFERENCE — use these when building fields/sections:"];
  for (const cat of Object.keys(CATEGORY_FIELDS)) {
    const fields = CATEGORY_FIELDS[cat].join(", ");
    const sections = (CATEGORY_SECTIONS[cat] ?? []).join(", ");
    lines.push(`  ${cat}:`);
    lines.push(`    At a Glance fields: ${fields}`);
    lines.push(`    Article sections:   ${sections}`);
  }
  return lines.join("\n");
}

function buildPrompt(sceneContext: string, entityContext: string): string {
  return `You are a world-building analyst for a fantasy novel. Analyse the scene excerpts and extract named entities worth tracking in a world-building database.

EXISTING ENTITIES — do NOT re-suggest these:
${entityContext || "(none yet)"}

${buildCategoryReference()}

SCENE EXCERPTS:
${sceneContext}

Return a JSON array only — no prose, no markdown fences. Each element must have exactly these keys:

- "name": string — proper name of the entity (1–5 words)
- "category": one of "characters" | "places" | "events" | "history" | "artifacts" | "creatures" | "magic" | "factions" | "doctrine"
- "description": string — 1–2 sentence summary of what this entity is
- "confidence": number 0.0–1.0
- "source_scene_title": string — scene title where this entity appears
- "fields": object — At a Glance key/value pairs for this category (use the field names from CATEGORY REFERENCE above; only include fields whose values you can infer from the text; omit fields you cannot determine)
- "sections": object — article section key/value pairs (use the section names from CATEGORY REFERENCE above; write 2–4 sentences per section based strictly on manuscript evidence; only include sections you have real content for)
- "tags": array of short lowercase strings (e.g. ["protagonist", "magic-user", "northern-faction"]) — 2–5 tags that would help cross-reference this entity with others

Rules:
- Confidence >= 0.6 only.
- Focus on proper nouns and named things. No generic concepts.
- Do not re-suggest entities in the EXISTING ENTITIES list.
- For "fields": use only the exact key names listed in CATEGORY REFERENCE. Leave out any key you have no evidence for.
- For "sections": use only the exact section names listed for the category. Write substantive content — do not write placeholder text.
- Output only the JSON array, nothing else.`;
}
