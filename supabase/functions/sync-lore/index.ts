import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum characters of scene content to send to the AI per scene.
const SCENE_CONTENT_LIMIT = 4000;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Prose section keys that sync-lore must never write — stripped from any AI
// response before it touches the DB, regardless of what the model emits.
const PROSE_SECTION_KEYS = new Set([
  "Overview", "Background", "Personality", "Relationships", "Notable Events",
  "Description", "History", "Notable Inhabitants", "Points of Interest",
  "Appearance", "Behaviour", "Abilities", "Habitat", "Lore",
  "Summary", "Causes", "Key Participants", "Consequences", "Aftermath",
  "Structure", "Notable Members", "Goals", "Core Tenets", "Origins",
  "Followers", "Contradictions", "Key Figures", "Legacy", "Magic & Abilities",
  "Known Users", "Imbued Weapons & Artifacts", "Powers", "Current Whereabouts",
]);

const ALLOWED_AT_A_GLANCE_KEYS: Record<string, Set<string>> = {
  character: new Set(["Place of Birth", "Eye Color", "Hair Color", "Height", "Allegiance"]),
  location: new Set(["Region", "Climate", "Population", "Government", "Notable Landmarks"]),
  item: new Set(["Type", "Origin", "Current Owner", "Powers"]),
  lore: new Set(["Type", "Regional Origin", "Rarity"]),
};

// ── Types ────────────────────────────────────────────────────────────────────

type SuggestionType = "character" | "location" | "item" | "lore";

interface AISuggestion {
  type: SuggestionType;
  name: string;
  /** One sentence, ≤20 words. Hard-capped in code after AI returns. */
  short_description: string;
  source_sentence: string;
  /** At-a-Glance key/value pairs only. No prose. */
  at_a_glance: Record<string, string>;
  /**
   * "new"       → entity not in DB; goes to Lore Inbox as new_entity
   * "update"    → entity exists; at_a_glance has net-new facts; goes to Lore Inbox as update
   * "no_update" → entity exists; nothing new; skip entirely
   */
  update_type: "new" | "update" | "no_update";
  // Stamped server-side — never from the AI.
  scene_id?: string;
  source_location?: string;
}

interface ExistingEntity {
  id: string;
  name: string;
  category: string;
  summary: string | null;
  /** at_a_glance facts are stored inside the fields jsonb column, not a dedicated column. */
  fields: Record<string, unknown> | null;
  aliases: string[] | null;
  synced_scenes: string[] | null;
}

interface SceneRow {
  id: string;
  title: string;
  content: string;
  chapter_title: string;
  pov_character_id: string | null;
}

const TYPE_TO_CATEGORY: Record<SuggestionType, string> = {
  character: "characters",
  location: "places",
  item: "artifacts",
  lore: "magic",
};

function findExistingEntity(
  entities: ExistingEntity[],
  name: string,
  type: SuggestionType,
): ExistingEntity | null {
  const category = TYPE_TO_CATEGORY[type];
  const nameLower = name.trim().toLowerCase();
  return entities.find((e) => {
    if (e.category !== category) return false;
    const allNames = [e.name, ...(e.aliases ?? [])].map((n) => n.toLowerCase());
    return allNames.some(
      (n) => n === nameLower || n.includes(nameLower) || nameLower.includes(n),
    );
  }) ?? null;
}

/** Returns true if the AI's at_a_glance contains at least one key/value not
 *  already present in the entity's fields jsonb (where at_a_glance data lives). */
function hasNewAtAGlanceFacts(
  existingFields: Record<string, unknown> | null,
  incoming: Record<string, string>,
): boolean {
  if (!incoming || Object.keys(incoming).length === 0) return false;
  const ex = existingFields ?? {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!value?.trim()) continue;
    const existingValue = String(ex[key] ?? "").trim().toLowerCase();
    if (!existingValue || existingValue !== value.trim().toLowerCase()) return true;
  }
  return false;
}

function buildEntityContext(entities: ExistingEntity[]): string {
  if (entities.length === 0) return "(none yet)";
  return entities
    .map((e) => {
      const aliasNote = (e.aliases ?? []).length > 0
        ? ` (also known as: ${(e.aliases ?? []).join(", ")})`
        : "";
      const desc = (e.summary ?? "").trim();
      // at_a_glance facts are stored inside the fields jsonb column
      const glance = (e.fields ?? {}) as Record<string, string>;
      const glanceLines = Object.entries(glance)
        .filter(([, v]) => (v ?? "").toString().trim())
        .map(([k, v]) => `    ${k}: ${String(v).trim()}`)
        .join("\n");
      return [
        `- ${e.name}${aliasNote} [${e.category}]`,
        desc ? `  Description: ${desc.slice(0, 120)}` : null,
        glanceLines ? `  At a Glance:\n${glanceLines}` : null,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

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
    const { project_id, trigger = "manual", force = false, debug = false } = body as {
      project_id?: string;
      trigger?: "scheduled" | "manual";
      force?: boolean;
      debug?: boolean;
    };

    const supabase = createClient(supabaseUrl, supabaseKey);

    let projectIds: string[];
    if (project_id) {
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
      const result = await syncProject(
        supabase,
        userClient,
        pid,
        trigger as "scheduled" | "manual",
        anthropicKey,
        force,
        debug,
      );
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

// ── Per-project sync ─────────────────────────────────────────────────────────

async function syncProject(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  userClient: any,
  projectId: string,
  trigger: "scheduled" | "manual",
  anthropicKey: string,
  force = false,
  debug = false,
): Promise<{
  project_id: string;
  scenes_processed: number;
  suggestions_created: number;
  force: boolean;
  debug_data?: { name: string; update_type: string; routed_to: string }[];
}> {
  const { data: logEntry } = await supabase
    .from("sync_log")
    .insert({ project_id: projectId, triggered_by: trigger, status: "running" })
    .select("id")
    .single();
  const logId: string | undefined = logEntry?.id;

  try {
    // ── Fetch scenes (with chapter title + POV character id) ─────────────
    let query = supabase
      .from("scenes")
      .select("id, title, content, pov_character_id, chapters(title)")
      .eq("project_id", projectId)
      .not("content", "is", null)
      .not("content", "eq", "");
    if (!force) query = query.eq("is_dirty", true);

    const { data: rawScenes } = await query;

    const scenes: SceneRow[] = (rawScenes ?? []).map(
      (s: {
        id: string;
        title: string;
        content: string;
        pov_character_id: string | null;
        chapters: { title: string } | null;
      }) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        chapter_title: s.chapters?.title ?? "",
        pov_character_id: s.pov_character_id ?? null,
      }),
    );

    if (!scenes || scenes.length === 0) {
      await finaliseLog(supabase, logId, "completed", 0, 0);
      return {
        project_id: projectId,
        scenes_processed: 0,
        suggestions_created: 0,
        force,
        debug_data: debug ? [] : undefined,
      };
    }

    // ── Fetch existing entities (for dedup + at-a-glance diff) ───────────
    const { data: existingEntities } = await supabase
      .from("entities")
      .select("id, name, category, summary, fields, aliases, synced_scenes")
      .eq("project_id", projectId);

    const existingEntityList = (existingEntities ?? []) as ExistingEntity[];

    // ── Build scene→POV name lookup ──────────────────────────────────────
    // Maps scene id → POV character name (if pov_character_id is set and
    // that entity exists). Used to inject POV note into the AI prompt so
    // first-person narrators are detected even though they don't self-name.
    const entityIdToName = new Map(existingEntityList.map((e) => [e.id, e.name]));
    const scenePovNameMap = new Map<string, string>();
    for (const scene of scenes) {
      if (scene.pov_character_id) {
        const name = entityIdToName.get(scene.pov_character_id);
        if (name) scenePovNameMap.set(scene.id, name);
      }
    }

    // ── One AI call per scene ────────────────────────────────────────────
    const allSuggestions: AISuggestion[] = [];
    const entitySceneMap = new Map<string, string[]>();

    for (const scene of scenes) {
      const sceneText = stripHtml(scene.content ?? "").slice(0, SCENE_CONTENT_LIMIT).trim();
      if (!sceneText) continue;

      const unsyncedEntities = force
        ? existingEntityList
        : existingEntityList.filter(
            (e) => !(e.synced_scenes ?? []).includes(scene.id),
          );

      console.log(`[sync-lore] scene_id=${scene.id} total_entities=${existingEntityList.length} unsynced=${unsyncedEntities.length} sample_synced_scenes=${JSON.stringify(existingEntityList[0]?.synced_scenes)}`);

      for (const e of unsyncedEntities) {
        const list = entitySceneMap.get(e.id) ?? [];
        list.push(scene.id);
        entitySceneMap.set(e.id, list);
      }

      const entityContext = buildEntityContext(existingEntityList);
      const povCharacterName = scenePovNameMap.get(scene.id) ?? null;

      const sceneSuggestions = await callAnthropicForScene(
        anthropicKey,
        scene.title,
        scene.chapter_title,
        sceneText,
        entityContext,
        povCharacterName,
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

    console.log(
      `[sync-lore] project=${projectId} scenes=${scenes.length} raw_suggestions=${allSuggestions.length}`,
    );

    // ── Deduplicate by name+type (case-insensitive, first mention wins) ──
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

    // ── Route suggestions ────────────────────────────────────────────────
    // new entity           → Lore Inbox (new_entity)
    // existing + new facts → Lore Inbox (update)
    // existing + nothing   → skip
    const validTypes = new Set<string>(["character", "location", "item", "lore"]);
    const validSuggestions = suggestions.filter(
      (s) => s.name?.trim() && validTypes.has(s.type),
    );

    type InboxRow = {
      project_id: string;
      type: "new_entity" | "update";
      payload: Record<string, unknown>;
      status: "pending";
    };
    const inboxRows: InboxRow[] = [];
    const debugEntries: { name: string; update_type: string; routed_to: string }[] = [];

    for (const s of validSuggestions) {
      // ── Hard-enforce 20-word cap on short_description ──────────────────
      const shortDesc = (s.short_description ?? "").trim();
      const description = shortDesc
        ? shortDesc.split(/\s+/).slice(0, 20).join(" ")
        : shortDesc;

      // ── Strip any prose sections the AI emitted despite instructions ───
      const UNKNOWN_VALUES = new Set(["unknown", "n/a", "none", "unclear", "unspecified", "not specified", "not mentioned"]);
      const allowedKeys = ALLOWED_AT_A_GLANCE_KEYS[s.type] ?? new Set();
      const at_a_glance: Record<string, string> = {};
      for (const [key, value] of Object.entries(s.at_a_glance ?? {})) {
        if (allowedKeys.has(key) && (value ?? "").trim()) {
          const v = value.trim().split(/\s+/).slice(0, 8).join(" ");
          if (!UNKNOWN_VALUES.has(v.toLowerCase())) {
            at_a_glance[key] = v;
          }
        }
      }

      const existingEntity = findExistingEntity(existingEntityList, s.name, s.type);

      console.log(`[sync-lore] entity="${s.name}" update_type="${s.update_type}" at_a_glance=${JSON.stringify(at_a_glance)} keys=${Object.keys(at_a_glance).length}`);

      if (!existingEntity || s.update_type === "new") {
        // ── Path 1: new entity → Lore Inbox ───────────────────────────
        if (debug) debugEntries.push({ name: s.name.trim(), update_type: "new", routed_to: "inbox_new" });
        inboxRows.push({
          project_id: projectId,
          type: "new_entity",
          payload: {
            type: s.type,
            name: s.name.trim(),
            category: TYPE_TO_CATEGORY[s.type] ?? "magic",
            description,
            source_sentence: s.source_sentence?.trim() ?? null,
            source_location: s.source_location?.trim() ?? null,
            scene_id: s.scene_id ?? null,
            at_a_glance,
            first_mentioned: s.source_sentence?.trim() ?? null,
            first_appearance: s.scene_id ?? null,
          },
          status: "pending",
        });
      } else if (
        Object.keys(at_a_glance).length > 0 &&
        hasNewAtAGlanceFacts(existingEntity.fields, at_a_glance)
      ) {
        // ── Path 2: existing entity with new at-a-glance facts → Lore Inbox ──
        if (debug) debugEntries.push({ name: s.name.trim(), update_type: "update", routed_to: "inbox_update" });
        inboxRows.push({
          project_id: projectId,
          type: "update",
          payload: {
            entity_id: existingEntity.id,
            type: s.type,
            name: s.name.trim(),
            category: TYPE_TO_CATEGORY[s.type] ?? "magic",
            description,
            source_sentence: s.source_sentence?.trim() ?? null,
            source_location: s.source_location?.trim() ?? null,
            scene_id: s.scene_id ?? null,
            at_a_glance,
          },
          status: "pending",
        });
      } else {
        // ── Path 3: nothing new → skip ──────────────────────────────────
        if (debug) debugEntries.push({ name: s.name.trim(), update_type: s.update_type, routed_to: "skipped" });
      }
    }

    let suggestionsCreated = 0;
    if (inboxRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("lore_suggestions")
        .insert(inboxRows)
        .select("id");
      if (insertError) console.error("[sync-lore] insert error:", insertError.message);
      suggestionsCreated = inserted?.length ?? 0;
    }

    // ── Update synced_scenes ─────────────────────────────────────────────
    if (entitySceneMap.size > 0) {
      await Promise.all(
        Array.from(entitySceneMap.entries()).map(([entityId, newSceneIds]) => {
          const entity = existingEntityList.find((e) => e.id === entityId);
          const existing = entity?.synced_scenes ?? [];
          const updated = [...new Set([...existing, ...newSceneIds])];
          return userClient.from("entities").update({ synced_scenes: updated }).eq("id", entityId);
        }),
      );
    }

    // ── Clear is_dirty on processed scenes ──────────────────────────────
    await supabase
      .from("scenes")
      .update({ is_dirty: false })
      .in("id", scenes.map((s) => s.id));

    // ── Update projects.last_sync_at ─────────────────────────────────────
    await supabase
      .from("projects")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", projectId);

    await finaliseLog(supabase, logId, "completed", scenes.length, suggestionsCreated);
    console.log(
      `[sync-lore] project=${projectId} suggestions_created=${suggestionsCreated}`,
    );

    return {
      project_id: projectId,
      scenes_processed: scenes.length,
      suggestions_created: suggestionsCreated,
      force,
      debug_data: debug ? debugEntries : undefined,
    };
  } catch (err) {
    await finaliseLog(supabase, logId, "failed", 0, 0);
    throw err;
  }
}

// ── Per-scene Anthropic call ─────────────────────────────────────────────────

async function callAnthropicForScene(
  anthropicKey: string,
  sceneTitle: string,
  chapterTitle: string,
  sceneText: string,
  entityContext: string,
  povCharacterName: string | null,
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
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: buildUserPrompt(
              sceneTitle,
              chapterTitle,
              sceneText,
              entityContext,
              povCharacterName,
            ),
          },
        ],
      }),
    });
  } catch (err) {
    console.error(`[sync-lore] fetch error for scene "${sceneTitle}":`, err);
    return [];
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "(unreadable)");
    console.error(
      `[sync-lore] Anthropic HTTP ${response.status} for scene "${sceneTitle}":`,
      errText.slice(0, 400),
    );
    return [];
  }

  let aiResult: { content?: { text?: string }[] };
  try {
    aiResult = await response.json();
  } catch (err) {
    console.error(
      `[sync-lore] Failed to parse Anthropic response JSON for scene "${sceneTitle}":`,
      err,
    );
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
    console.error(
      `[sync-lore] JSON.parse failed for scene "${sceneTitle}". Raw:`,
      rawText.slice(0, 600),
    );
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error(
      `[sync-lore] Expected array for scene "${sceneTitle}", got ${typeof parsed}. Raw:`,
      rawText.slice(0, 400),
    );
    return [];
  }

  return parsed as AISuggestion[];
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildUserPrompt(
  sceneTitle: string,
  chapterTitle: string,
  sceneText: string,
  entityContext: string,
  povCharacterName: string | null,
): string {
  const locationLabel = chapterTitle ? `${chapterTitle} › ${sceneTitle}` : sceneTitle;

  const povNote = povCharacterName
    ? `
POV CHARACTER: This scene is narrated in first person by "${povCharacterName}". They will not refer to themselves by name in the text — they appear only as "I", "me", "my", "myself". You must still extract them as a character entity using the name "${povCharacterName}". Use their thoughts, actions, decisions, and observations as evidence for their at_a_glance fields and short_description. Their source_sentence should be the first sentence where the first-person narrator acts or speaks.
`
    : "";

  return `You are extracting named entities from a manuscript scene for a lore database. This is a structured data extraction pass only.

RULES:
- Extract only clearly named, significant entities. No unnamed references, no background extras, no entities that appear only in passing.
- Named informal locations ("The Spot", "Joe's Bar", "The Hollow") count if they have a proper name.
- DO NOT write any prose. DO NOT emit Overview, Background, Personality, Relationships, Notable Events, Description, History, or any other prose field. This is strictly an extraction pass — prose is generated separately per entity.
- The only fields you may return are: type, name, short_description, source_sentence, update_type, at_a_glance.
${povNote}
ALREADY DOCUMENTED ENTITIES — for each that appears in this scene, check whether the scene adds net-new at_a_glance facts not already captured. If no new facts, use update_type "no_update". For entities NOT in this list, use update_type "new":
${entityContext}

SCENE: ${locationLabel}
"""
${sceneText}
"""

Return a JSON array. Each element must have exactly these fields:

- "type": "character" | "location" | "item" | "lore"
  - character: named people or beings with a speaking/acting role or clear narrative significance
  - location: named places — buildings, regions, streets, neighbourhoods, bars, rooms, landmarks. Include named informal locations.
  - item: named objects, weapons, artifacts
  - lore: named magic systems, factions, creatures, doctrines, events, historical periods

- "name": proper name, 1–5 words

- "short_description": REQUIRED. One sentence. Maximum 20 words — count them. Who or what this is and their most defining trait or role. Hard limit.

- "source_sentence": exact sentence from the scene where this entity first appears, copied verbatim. For POV characters, use the first sentence where the narrator acts or speaks.

- "update_type": "new" | "update" | "no_update"
  - "new" — not in the documented list above
  - "update" — in the list, and this scene adds net-new at_a_glance facts
  - "no_update" — in the list, nothing new to add

- "at_a_glance": structured facts only. Omit any key the scene doesn't support. Values: 1–8 words max.
  - Never emit "Unknown", "N/A", "None", or any placeholder value — if the scene doesn't have clear specific evidence for a key, omit it entirely.
  - character  → "Place of Birth", "Eye Color", "Hair Color", "Height", "Allegiance"
  - location   → "Region", "Climate", "Population", "Government", "Notable Landmarks"
  - item       → "Type", "Origin", "Current Owner", "Powers"
  - lore       → "Type", "Regional Origin", "Rarity"

Return [] if the scene contains no clearly named, significant entities.
Output only the JSON array. No prose, no markdown fences, no explanation.`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function finaliseLog(supabase: any, logId: string | undefined, status: string, scenesProcessed: number, suggestionsCreated: number) {
  if (!logId) return;
  await supabase
    .from("sync_log")
    .update({ status, scenes_processed: scenesProcessed, suggestions_created: suggestionsCreated })
    .eq("id", logId);
}
