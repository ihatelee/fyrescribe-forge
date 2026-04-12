import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum characters of scene content to include per scene in the AI prompt.
const SCENE_CONTENT_LIMIT = 1200;

interface AISuggestion {
  name: string;
  category: string;
  description: string;
  confidence: number;
  source_scene_title?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { project_id, trigger = "manual" } = body as {
      project_id?: string;
      trigger?: "scheduled" | "manual";
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
      const result = await syncProject(supabase, pid, trigger as "scheduled" | "manual", anthropicKey);
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
): Promise<{ project_id: string; scenes_processed: number; suggestions_created: number }> {
  // Open a sync_log entry.
  const { data: logEntry } = await supabase
    .from("sync_log")
    .insert({ project_id: projectId, triggered_by: trigger, status: "running" })
    .select("id")
    .single();
  const logId: string | undefined = logEntry?.id;

  try {
    // Fetch scenes with dirty content.
    const { data: scenes } = await supabase
      .from("scenes")
      .select("id, title, content")
      .eq("project_id", projectId)
      .eq("is_dirty", true)
      .not("content", "is", null)
      .not("content", "eq", "");

    if (!scenes || scenes.length === 0) {
      await finaliseLog(supabase, logId, "completed", 0, 0);
      return { project_id: projectId, scenes_processed: 0, suggestions_created: 0 };
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

    const suggestions: AISuggestion[] = JSON.parse(jsonText);

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
      .map((s) => ({
        project_id: projectId,
        type: "new_entity" as const,
        payload: {
          name: s.name,
          category: s.category,
          description: s.description ?? "",
          confidence: Math.min(1, Math.max(0, s.confidence)),
          source_scene_title: s.source_scene_title ?? null,
        },
        status: "pending" as const,
      }));

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
    return { project_id: projectId, scenes_processed: scenes.length, suggestions_created: suggestionsCreated };
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

function buildPrompt(sceneContext: string, entityContext: string): string {
  return `You are a world-building analyst for a fantasy novel. Analyse the scene excerpts below and identify named entities that deserve entries in the world-building database: characters, locations, artefacts, creatures, magic systems, factions, historical events, and lore concepts.

EXISTING ENTITIES — do NOT re-suggest these unless you have significant new information:
${entityContext || "(none yet)"}

SCENE EXCERPTS:
${sceneContext}

Return a JSON array only — no prose, no markdown code fences. Each element must have exactly these keys:
- "name": string — the entity's proper name (1–5 words)
- "category": one of "characters" | "places" | "events" | "history" | "artifacts" | "creatures" | "magic" | "factions" | "doctrine"
- "description": string — 1–2 sentences summarising what this entity is, based only on the text
- "confidence": number 0.0–1.0 — how certain you are this is a distinct, named, trackable entity
- "source_scene_title": string — title of the scene where this entity appears

Rules:
- Only include entities with confidence >= 0.6.
- Focus on proper nouns (named characters, named places, specific artefacts, named groups).
- Do not suggest generic concepts or unnamed background elements.
- Do not include entities already in the EXISTING ENTITIES list.
- Output only the JSON array, nothing else.`;
}
