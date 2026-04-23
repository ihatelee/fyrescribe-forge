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
  /**
   * "new"          → entity not yet in DB; goes to Lore Inbox as new_entity suggestion
   * "update"       → entity exists; sections contain only net-new content; merged server-side
   * "contradiction" → entity exists; content conflicts with existing docs; goes to inbox for review
   */
  update_type?: "new" | "update" | "contradiction" | "no_update";
  /** Stamped server-side after the AI call — never from the client. */
  scene_id?: string;
  source_location?: string;
}

/** Existing entity row fetched for diff context. */
interface ExistingEntity {
  id: string;
  name: string;
  category: string;
  summary: string | null;
  sections: Record<string, string>;
  aliases: string[] | null;
  synced_scenes: string[] | null;
}

/** Per-entity debug snapshot returned when debug=true is passed in the request body. */
interface DebugEntityEntry {
  name: string;
  entity_type: string;
  update_type: string;
  routed_to: "inbox_new" | "inbox_contradiction" | "direct_update" | "no_new_content" | "no_update";
  ai_sections: string[];
  raw_sections: Record<string, string>;
}

/** Maps the 4 suggestion types to the closest entity_category for UI display. */
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
    return allNames.some((n) => n === nameLower || n.includes(nameLower) || nameLower.includes(n));
  }) ?? null;
}

// Fields where the latest version supersedes the old — rewriting is better than stacking.
const SECTION_REPLACE_KEYS = new Set(["Overview", "Personality"]);

function mergeSection(key: string, existing: string, newContent: string): string {
  const trimmedExisting = existing.trim();
  const trimmedNew = newContent.trim();
  if (!trimmedExisting) return trimmedNew;
  if (!trimmedNew) return trimmedExisting;
  // Replace-strategy: new content reflects the latest current-state; stacking produces bloat.
  if (SECTION_REPLACE_KEYS.has(key)) return trimmedNew;
  // Append-strategy for Background, Notable Events, Story History, Relationships, etc.
  return `${trimmedExisting}\n\n${trimmedNew}`;
}

function buildEntityContext(entities: ExistingEntity[]): string {
  if (entities.length === 0) return "(none yet)";
  return entities
    .map((e) => {
      const sections = e.sections ?? {};
      const aliasNote = (e.aliases ?? []).length > 0
        ? ` (also known as: ${(e.aliases ?? []).join(", ")})`
        : "";
      const summary = (e.summary ?? "").trim();
      const populatedSections = Object.entries(sections).filter(([, v]) => (v ?? "").trim());
      const sectionContent = populatedSections
        .map(([k, v]) => `    ${k}: ${v.trim().slice(0, 300)}${v.trim().length > 300 ? "…" : ""}`)
        .join("\n");
      return [
        `- ${e.name}${aliasNote} [${e.category}]`,
        summary ? `  Summary: ${summary.slice(0, 120)}` : null,
        sectionContent ? `  Existing content:\n${sectionContent}` : null,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

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
    const { project_id, trigger = "manual", force = false, debug = false } = body as {
      project_id?: string;
      trigger?: "scheduled" | "manual";
      force?: boolean;
      debug?: boolean;
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
      const result = await syncProject(supabase, pid, trigger as "scheduled" | "manual", anthropicKey, force, debug);
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
  debug = false,
): Promise<{ project_id: string; scenes_processed: number; suggestions_created: number; entities_updated: number; force: boolean; debug_data?: DebugEntityEntry[] }> {
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
      return { project_id: projectId, scenes_processed: 0, suggestions_created: 0, entities_updated: 0, force, debug_data: debug ? [] : undefined };
    }

    // Fetch existing entities for diff context and synced-scene tracking.
    const { data: existingEntities } = await supabase
      .from("entities")
      .select("id, name, category, summary, sections, aliases, synced_scenes")
      .eq("project_id", projectId);

    const existingEntityList = (existingEntities ?? []) as ExistingEntity[];

    // ── One AI call per scene ────────────────────────────────────────────────
    // Context is built per-scene so only entities not yet checked against this
    // specific scene are passed to the model. force=true bypasses the filter so
    // all entities are always included (used by debug sync).

    const allSuggestions: AISuggestion[] = [];
    // Tracks entityId → sceneIds processed this run, for synced_scenes update.
    const entitySceneMap = new Map<string, string[]>();

    for (const scene of scenes) {
      const sceneText = (scene.content ?? "").slice(0, SCENE_CONTENT_LIMIT).trim();
      if (!sceneText) continue;

      // Only include entities that haven't been checked against this scene yet.
      const unsyncedEntities = force
        ? existingEntityList
        : existingEntityList.filter((e) => !(e.synced_scenes ?? []).includes(scene.id));

      // Record which entities are being passed to AI so we can mark them synced.
      for (const e of unsyncedEntities) {
        const list = entitySceneMap.get(e.id) ?? [];
        list.push(scene.id);
        entitySceneMap.set(e.id, list);
      }

      const entityContext = buildEntityContext(unsyncedEntities);

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

    // ── Route suggestions: new → inbox, update → direct patch, contradiction → inbox ──
    const validTypes = new Set<string>(["character", "location", "item", "lore"]);
    const validSuggestions = suggestions.filter((s) => s.name?.trim() && validTypes.has(s.type));

    type InboxRow = { project_id: string; type: "new_entity" | "contradiction"; payload: Record<string, unknown>; status: "pending" };
    const inboxRows: InboxRow[] = [];
    let entitiesUpdated = 0;
    const debugEntries: DebugEntityEntry[] = [];

    for (const s of validSuggestions) {
      const sections = s.sections ?? {};
      const at_a_glance = s.at_a_glance ?? {};
      const description = (s.short_description ?? "").trim()
        || (sections["Overview"] ?? sections["Description"] ?? sections["Summary"] ?? "").trim();

      const existingEntity = findExistingEntity(existingEntityList, s.name, s.type);

      if (!existingEntity || s.update_type === "new") {
        // Path 1: new entity → Lore Inbox
        if (debug) debugEntries.push({ name: s.name.trim(), entity_type: s.type, update_type: s.update_type ?? "new", routed_to: "inbox_new", ai_sections: Object.keys(sections).filter((k) => (sections[k] ?? "").trim()), raw_sections: sections });
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
            sections,
            at_a_glance,
            first_mentioned: s.source_sentence?.trim() ?? null,
            first_appearance: s.scene_id ?? null,
          },
          status: "pending",
        });
      } else if (s.update_type === "contradiction") {
        // Path 3: contradicts existing docs → Lore Inbox for review
        if (debug) debugEntries.push({ name: s.name.trim(), entity_type: s.type, update_type: "contradiction", routed_to: "inbox_contradiction", ai_sections: Object.keys(sections).filter((k) => (sections[k] ?? "").trim()), raw_sections: sections });
        inboxRows.push({
          project_id: projectId,
          type: "contradiction",
          payload: {
            entity_id: existingEntity.id,
            type: s.type,
            name: s.name.trim(),
            category: TYPE_TO_CATEGORY[s.type] ?? "magic",
            description,
            source_sentence: s.source_sentence?.trim() ?? null,
            source_location: s.source_location?.trim() ?? null,
            scene_id: s.scene_id ?? null,
            sections,
            at_a_glance,
          },
          status: "pending",
        });
      } else if (s.update_type === "no_update") {
        // AI found nothing new — synced_scenes will be updated below, no DB write
        if (debug) debugEntries.push({ name: s.name.trim(), entity_type: s.type, update_type: "no_update", routed_to: "no_update", ai_sections: [], raw_sections: {} });
      } else {
        // Path 2: update_type === "update" → merge sections directly into entity
        console.log(`[sync-lore] merge candidate: entity="${existingEntity.name}" ai_sections=${JSON.stringify(Object.keys(sections))} raw=${JSON.stringify(sections)}`);
        const mergedSections: Record<string, string> = { ...(existingEntity.sections ?? {}) };
        let hasNewContent = false;
        for (const [key, value] of Object.entries(sections)) {
          if (value?.trim()) {
            mergedSections[key] = mergeSection(key, mergedSections[key] ?? "", value.trim());
            hasNewContent = true;
          }
        }
        if (debug) debugEntries.push({ name: s.name.trim(), entity_type: s.type, update_type: "update", routed_to: hasNewContent ? "direct_update" : "no_new_content", ai_sections: Object.keys(sections).filter((k) => (sections[k] ?? "").trim()), raw_sections: sections });
        if (hasNewContent) {
          const { error: updateError } = await supabase
            .from("entities")
            .update({ sections: mergedSections })
            .eq("id", existingEntity.id);
          if (updateError) {
            console.error(`[sync-lore] entity update failed for ${existingEntity.id}:`, updateError.message);
          } else {
            entitiesUpdated++;
          }
        }
      }
    }

    let suggestionsCreated = 0;
    if (inboxRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("lore_suggestions")
        .insert(inboxRows)
        .select("id");
      if (insertError) {
        console.error("[sync-lore] insert error:", insertError.message);
      }
      suggestionsCreated = inserted?.length ?? 0;
    }

    // ── Update synced_scenes for every entity-scene pair passed to the AI ───
    if (entitySceneMap.size > 0) {
      await Promise.all(
        Array.from(entitySceneMap.entries()).map(([entityId, newSceneIds]) => {
          const entity = existingEntityList.find((e) => e.id === entityId);
          const existing = entity?.synced_scenes ?? [];
          const updated = [...new Set([...existing, ...newSceneIds])];
          return supabase.from("entities").update({ synced_scenes: updated }).eq("id", entityId);
        }),
      );
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
    console.log(`[sync-lore] project=${projectId} suggestions_created=${suggestionsCreated} entities_updated=${entitiesUpdated}`);
    return { project_id: projectId, scenes_processed: scenes.length, suggestions_created: suggestionsCreated, entities_updated: entitiesUpdated, force, debug_data: debug ? debugEntries : undefined };
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

ALREADY DOCUMENTED ENTITIES — these have not yet been checked against this scene. For each that appears in this scene, compare existing content against what the scene reveals. If the entity does not appear in this scene at all, omit it. For entities NOT in this list, use update_type "new". When update_type is "update", put ONLY the new content in sections — do not repeat what is already there:
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
- "update_type": Required. "new" if not in the documented list. "update" if documented and this scene adds net-new information. "contradiction" if the scene conflicts with existing docs. "no_update" if documented, the entity appears in this scene, but existing docs already capture everything relevant.
- "sections": object with article-style content. Only include a key when the scene has clear evidence for it.
  - character → allowed keys:
      "Overview": REQUIRED. Who this character IS right now — current role, status, and significance. Present tense. Maximum 1 paragraph (3–5 sentences). Do not repeat background or story history here. Do not copy from short_description. Example: "A member of Owen's inner circle, viewed with frustration by Owen."
      "Background": Fixed history BEFORE the story began — origin, upbringing, past events that shaped them. Does not change as the story progresses. Maximum 1 paragraph (3–5 sentences). Do not invent. Only include what is implied or stated in the scene text. Example: "Grew up in the same neighbourhood as Owen."
      "Personality": Observable traits, quirks, and behavioural patterns based on what is shown in the scene. Maximum 1 paragraph (3–5 sentences). Do not invent traits not shown in the text.
      "Relationships": For each relationship mentioned, write 1–2 sentences only. Format: "[Name]: [relationship description]." Example: "Owen: A childhood acquaintance who currently holds a low opinion of Nez." Do not write more than 2 sentences per relationship.
      "Notable Events": List specific things that happen TO or are done BY this character in this scene. Include accidents, actions, confrontations, discoveries — anything plot-relevant. One sentence per event. Do not editorialize. Example: "Nez accidentally lit his pants on fire." Leave empty if nothing notable happens.
  - location  → allowed keys: "Description", "History", "Notable Inhabitants", "Points of Interest" — Max 1 paragraph each.
  - item      → allowed keys: "Description", "History", "Powers", "Current Whereabouts" — Max 1 paragraph each.
  - lore      → allowed keys: "Description", "Regional Origin", "Known Users", "Imbued Weapons & Artifacts" — Max 1 paragraph each.
- "at_a_glance": object with short factual fields. Only include a key when the scene has clear evidence. Values must be 1–8 words.
  - character → allowed keys: "Place of Birth", "Currently Residing", "Eye Color", "Hair Color", "Height", "Allegiance"
  - location  → allowed keys: "Region", "Climate", "Population", "Government", "Notable Landmarks"
  - item      → allowed keys: "Type", "Origin", "Current Owner", "Powers"
  - lore      → allowed keys: "Type", "Regional Origin", "Rarity"

Include every named entity. Return [] if the scene has no named entities.
Output only the JSON array. No prose, no markdown fences.`;
}
