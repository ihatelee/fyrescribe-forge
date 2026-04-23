import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum characters of scene content to include per scene in the AI prompt.
const SCENE_CONTENT_LIMIT = 1200;

// ── Types ────────────────────────────────────────────────────────────────────

type SuggestionType = "character" | "location" | "item" | "lore";

/** Shape returned by the AI for each entity in a scene. */
interface AISuggestion {
  type: SuggestionType;
  name: string;
  /** One sentence, ≤20 words — maps to entity.description. Always distinct from sections.Overview. */
  short_description: string;
  source_sentence: string;
  /** Article-body content keyed by section name (Overview, Background, etc.) */
  sections: Record<string, string>;
  /** At-a-Glance key/value pairs (Eye Color, Region, Type, etc.) */
  at_a_glance: Record<string, string>;
  /** Stamped server-side after the AI call — never from the client. */
  scene_id?: string;
  source_location?: string;
}

/** Maps the 4 suggestion types to the closest entity_category for UI display. */
const TYPE_TO_CATEGORY: Record<SuggestionType, string> = {
  character: "characters",
  location: "places",
  item: "artifacts",
  lore: "magic",
};

interface SceneRow {
  id: string;
  title: string;
  content: string;
  chapter_title: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    // ── Auth: verify JWT and get user ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const { project_id, trigger = "manual", force = false } = body as {
      project_id?: string;
      trigger?: "scheduled" | "manual";
      force?: boolean;
    };

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine which projects to process — only user-owned projects.
    let projectIds: string[];
    if (project_id) {
      // Verify ownership
      const { data: project, error: projectError } = await userClient
        .from("projects")
        .select("id")
        .eq("id", project_id)
        .eq("user_id", userId)
        .single();
      if (projectError || !project) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      projectIds = [project_id];
    } else {
      // Only sync projects owned by the authenticated user
      const { data: userProjects } = await userClient
        .from("projects")
        .select("id")
        .eq("user_id", userId);
      const userProjectIds = new Set((userProjects ?? []).map((p) => p.id));

      const { data: dirtyScenes } = await supabase
        .from("scenes")
        .select("project_id")
        .eq("is_dirty", true);
      projectIds = [...new Set((dirtyScenes ?? []).map((s) => s.project_id))]
        .filter((pid) => userProjectIds.has(pid));
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
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
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
    // Fetch scenes (with parent chapter title) — all with content when
    // force=true, otherwise only dirty ones.
    let query = supabase
      .from("scenes")
      .select("id, title, content, chapters(title)")
      .eq("project_id", projectId)
      .not("content", "is", null)
      .not("content", "eq", "");
    if (!force) {
      query = query.eq("is_dirty", true);
    }
    const { data: rawScenes } = await query;

    // Flatten the nested chapters relation into a flat SceneRow.
    const scenes: SceneRow[] = (rawScenes ?? []).map(
      (s: { id: string; title: string; content: string; chapters: { title: string } | null }) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        chapter_title: s.chapters?.title ?? "",
      }),
    );

    if (!scenes || scenes.length === 0) {
      await finaliseLog(supabase, logId, "completed", 0, 0);
      return { project_id: projectId, scenes_processed: 0, suggestions_created: 0, force };
    }

    // Fetch existing entities so the AI can avoid re-suggesting them.
    const { data: existingEntities } = await supabase
      .from("entities")
      .select("name, category, summary, sections, aliases")
      .eq("project_id", projectId);

    const entityContext = (existingEntities ?? [])
      .map((e: { name: string; category: string; summary?: string; sections?: Record<string, string>; aliases?: string[] | null }) => {
        const sections = e.sections ?? {};
        const aliasNote = (e.aliases ?? []).length > 0
          ? ` (also known as: ${(e.aliases ?? []).join(", ")})`
          : "";
        const summary = (e.summary ?? "").trim();
        const populatedSections = Object.entries(sections).filter(([, v]) => (v ?? "").trim());
        const sectionNames = populatedSections.map(([k]) => k);
        // Include a short snippet from each populated section (up to 3) so the
        // AI can do a genuine content diff rather than just counting section keys.
        const sectionSnippets = populatedSections
          .slice(0, 3)
          .map(([k, v]) => `    ${k}: ${v.trim().slice(0, 80)}${v.trim().length > 80 ? "…" : ""}`)
          .join("\n");
        return [
          `- ${e.name}${aliasNote} [${e.category}]`,
          summary ? `  Summary: ${summary.slice(0, 120)}` : null,
          sectionNames.length > 0 ? `  Documented sections: ${sectionNames.join(", ")}` : null,
          sectionSnippets ? `  Existing notes:\n${sectionSnippets}` : null,
        ].filter(Boolean).join("\n");
      })
      .join("\n\n");

    // ── One API call per scene ───────────────────────────────────────────────
    // Each call asks for a single JSON object (or null). This keeps output
    // tokens tiny (~200–400) and makes truncation impossible.

    const allSuggestions: AISuggestion[] = [];

    for (const scene of scenes) {
      const sceneText = (scene.content ?? "").slice(0, SCENE_CONTENT_LIMIT).trim();
      if (!sceneText) continue;

      const sceneSuggestions = await callAnthropicForScene(
        anthropicKey,
        scene.title,
        scene.chapter_title,
        sceneText,
        entityContext,
      );

      const sourceLocation = scene.chapter_title
        ? `${scene.chapter_title} › ${scene.title}`
        : scene.title;

      for (const s of sceneSuggestions) {
        s.scene_id = scene.id;
        s.source_location = sourceLocation;
        allSuggestions.push(s);
      }
    }

    console.log(`[sync-lore] project=${projectId} scenes=${scenes.length} raw_suggestions=${allSuggestions.length}`);

    // ── Deduplicate by name+type (case-insensitive) ──────────────────────────
    // Keep first occurrence — scenes are processed in manuscript order so the
    // earliest mention wins.
    const seenKeys = new Set<string>();
    const suggestions: AISuggestion[] = [];
    for (const s of allSuggestions) {
      const key = `${s.type}:${s.name.trim().toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        suggestions.push(s);
      }
    }
    console.log(`[sync-lore] after dedup: ${suggestions.length} unique suggestions`);

    // ── Map to lore_suggestions rows ─────────────────────────────────────────
    const validTypes = new Set<string>(["character", "location", "item", "lore"]);

    const rows = suggestions
      .filter((s) => s.name?.trim() && validTypes.has(s.type))
      .map((s) => {
        const sections = s.sections ?? {};
        const at_a_glance = s.at_a_glance ?? {};
        // Use the AI-supplied short_description (≤20 words, one sentence).
        // Falls back to the first non-empty section only when the AI omits it.
        const description = (s.short_description ?? "").trim()
          || (sections["Overview"] ?? sections["Description"] ?? sections["Summary"] ?? "").trim();
        return {
          project_id: projectId,
          type: "new_entity" as const,
          payload: {
            type: s.type,
            name: s.name.trim(),
            category: TYPE_TO_CATEGORY[s.type] ?? "magic",
            description,
            source_sentence: s.source_sentence?.trim() ?? null,
            source_location: s.source_location?.trim() ?? null,
            scene_id: s.scene_id ?? null,
            sections,
            at_a_glance,
            first_mentioned: s.source_sentence?.trim() ?? null,
            first_appearance: s.scene_id ?? null,
          },
          status: "pending" as const,
        };
      });

    let suggestionsCreated = 0;
    if (rows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("lore_suggestions")
        .insert(rows)
        .select("id");
      if (insertError) {
        console.error("[sync-lore] insert error:", insertError.message);
      }
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
// Returns an array of AISuggestions (empty array on any error). Never throws —
// a bad scene is logged and skipped so it never aborts the whole sync.

async function callAnthropicForScene(
  anthropicKey: string,
  sceneTitle: string,
  chapterTitle: string,
  sceneText: string,
  entityContext: string,
): Promise<AISuggestion[]> {
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(sceneTitle, chapterTitle, sceneText, entityContext) }],
      }),
    });
  } catch (err) {
    console.error(`[sync-lore] fetch error for scene "${sceneTitle}":`, err);
    return [];
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "(unreadable)");
    console.error(`[sync-lore] Anthropic HTTP ${response.status} for scene "${sceneTitle}":`, errText.slice(0, 400));
    return [];
  }

  let aiResult: { content?: { text?: string }[] };
  try {
    aiResult = await response.json();
  } catch (err) {
    console.error(`[sync-lore] Failed to parse Anthropic response JSON for scene "${sceneTitle}":`, err);
    return [];
  }

  const rawText = aiResult.content?.[0]?.text ?? "[]";
  const jsonText = rawText
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error(`[sync-lore] JSON.parse failed for scene "${sceneTitle}". Raw:`, rawText.slice(0, 600));
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error(`[sync-lore] Expected array for scene "${sceneTitle}", got ${typeof parsed}. Raw:`, rawText.slice(0, 400));
    return [];
  }

  return parsed as AISuggestion[];
}

// deno-lint-ignore no-explicit-any
async function finaliseLog(supabase: any, logId: string | undefined, status: string, scenesProcessed: number, suggestionsCreated: number) {
  if (!logId) return;
  await supabase
    .from("sync_log")
    .update({ status, scenes_processed: scenesProcessed, suggestions_created: suggestionsCreated })
    .eq("id", logId);
}

const SYSTEM_PROMPT = `YOU ARE FYRESCRIBE.
You are the author's research assistant — you live inside the manuscript and report back on what's there. You write lore entries directly to the author in a consistent voice: sharp, informed, concise, and occasionally wry. You do not pad, euphemize, or sanitize. You trust the author to handle their own material.
Your entries should read like notes from someone who has actually read the book — not a bot summarizing a document.
WRONG: "Character A is referenced briefly in an unfiltered private thought expressing frustration or low opinion."
RIGHT: "Character A thinks Character B is [exact words from text] sometimes — but mostly [exact words]. Close friendship, candid internal register."
Keep entries tight. If a character appeared once and said two things, the entry is two sentences. Do not invent detail that isn't in the scene.`;

function buildUserPrompt(sceneTitle: string, chapterTitle: string, sceneText: string, entityContext: string): string {
  const locationLabel = chapterTitle ? `${chapterTitle} › ${sceneTitle}` : sceneTitle;
  return `Extract all named entities from this scene.

ALREADY DOCUMENTED ENTITIES — compare what's already documented against what happens in this scene. Only suggest an entity update if the scene contains something genuinely new — a new event, relationship, reveal, or character detail not already captured. If the existing documentation already covers everything relevant in this scene, skip the entity entirely:
${entityContext || "(none yet)"}

SCENE: ${locationLabel}
"""
${sceneText}
"""

Return a JSON array. Each element must have exactly these keys:
- "type": one of "character", "location", "item", "lore"
  - character: named people or beings
  - location: named places, buildings, regions, streets, neighborhoods, bars, houses, or any other named place — extract any named location regardless of how mundane or informal it sounds. "The Spot", "Joe's Bar", "Elm Street", and "The Old House" are all valid location entities if they have a proper name.
  - item: named objects, artifacts, weapons
  - lore: named magic systems, factions, events, creatures, doctrines, historical periods
- "name": the proper name, 1–5 words
- "short_description": REQUIRED. Maximum 20 words. Hard limit — count the words. One sentence only. Who this person is and their most memorable trait or role. Example: "A member of Owen's social circle, known by the nickname Nez. Prone to accidents." Do NOT copy from Overview. Do NOT exceed 20 words.
- "source_sentence": the exact sentence from the scene where this entity first appears, copied verbatim
- "sections": object with article-style content. Only include a key when the scene has clear evidence for it. Max 60 words per value.
  - character → allowed keys: "Overview" (REQUIRED. Minimum 3 sentences. Must include specific details from the scene text — names, actions, relationships, events. Do not write generic observations. Do not copy from short_description. If the scene only mentions this entity briefly, say what was mentioned specifically and note that further details are unknown.), "Background" (any backstory, history, or origin details mentioned or implied in the scene text — where they came from, past events referenced, family or history mentioned. Do not invent — only use what is in the text. Leave empty if nothing is known.), "Personality" (specific traits, habits, or behavioral patterns revealed by actions or dialogue in the scene. Do not write generic observations. Only include what the scene actually shows.), "Relationships", "Notable Events" (list specific things that happen TO or are done BY this entity in this scene — accidents, actions, confrontations, discoveries, anything plot-relevant. Do not leave blank if something happened.)
  - location  → allowed keys: "Description", "History", "Notable Inhabitants", "Points of Interest"
  - item      → allowed keys: "Description", "History", "Powers", "Current Whereabouts"
  - lore      → allowed keys: "Description", "Regional Origin", "Known Users", "Imbued Weapons & Artifacts"
- "at_a_glance": object with short factual fields. Only include a key when the scene has clear evidence. Values must be 1–8 words.
  - character → allowed keys: "Place of Birth", "Currently Residing", "Eye Color", "Hair Color", "Height", "Allegiance"
  - location  → allowed keys: "Region", "Climate", "Population", "Government", "Notable Landmarks"
  - item      → allowed keys: "Type", "Origin", "Current Owner", "Powers"
  - lore      → allowed keys: "Type", "Regional Origin", "Rarity"

Include every named entity. Return [] if the scene has no named entities.
Output only the JSON array. No prose, no markdown fences.`;
}
