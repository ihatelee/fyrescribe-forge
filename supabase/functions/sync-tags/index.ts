import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Structured At a Glance fields that link to other entities (entity picker fields).
// field → target entity category.
const FIELD_TARGET_MAP: Record<string, Array<{ field: string; targetCategory: string }>> = {
  characters: [
    { field: "Place of Birth", targetCategory: "places" },
    { field: "Currently Residing", targetCategory: "places" },
    { field: "Allegiance", targetCategory: "factions" },
  ],
  artifacts: [
    { field: "Origin", targetCategory: "places" },
    { field: "Current Owner", targetCategory: "characters" },
  ],
  factions: [
    { field: "Leader", targetCategory: "characters" },
    { field: "Headquarters", targetCategory: "places" },
  ],
  creatures: [
    { field: "Habitat", targetCategory: "places" },
  ],
  magic: [
    { field: "Regional Origin", targetCategory: "places" },
  ],
};

const ALL_FIELD_KEYS = Object.values(FIELD_TARGET_MAP).flat().map((f) => f.field);

const stripHtml = (html: string) =>
  (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    // ── Auth ─────────────────────────────────────────────────────────────
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

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id || typeof project_id !== "string") {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify ownership ─────────────────────────────────────────────────
    const { data: project, error: projectError } = await userClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient<any>(supabaseUrl, supabaseServiceKey);

    const suggestions = await runFieldTaggingPass(admin, project_id, anthropicKey);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-tags error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

type TagSuggestion = {
  entity_id: string;
  entity_name: string;
  entity_category: string;
  field_key: string;
  target_entity_id: string;
  target_entity_name: string;
  target_entity_category: string;
};

async function runFieldTaggingPass(
  admin: any,
  project_id: string,
  anthropicKey: string,
): Promise<TagSuggestion[]> {
  // Fetch entities
  const { data: entities } = await admin
    .from("entities")
    .select("id, name, category, summary, sections")
    .eq("project_id", project_id)
    .is("archived_at", null);

  const targetableEntities = (entities ?? []).filter(
    (e: any) => !!FIELD_TARGET_MAP[e.category as string],
  );

  if (targetableEntities.length === 0 || (entities ?? []).length < 2) return [];

  const entityIds = (entities ?? []).map((e: any) => e.id);

  // Fetch mention contexts (up to 5 per entity, most recent first)
  const { data: mentions } = await admin
    .from("entity_mentions")
    .select("entity_id, context")
    .in("entity_id", entityIds);

  const mentionsMap = new Map<string, string[]>();
  (mentions ?? []).forEach((m: any) => {
    if (!mentionsMap.has(m.entity_id)) mentionsMap.set(m.entity_id, []);
    const arr = mentionsMap.get(m.entity_id)!;
    if (arr.length < 5) arr.push(m.context ?? "");
  });

  // Fetch existing field links to avoid re-suggesting
  const { data: existingFieldLinks } = await admin
    .from("entity_links")
    .select("entity_a_id, relationship")
    .in("entity_a_id", entityIds)
    .in("relationship", ALL_FIELD_KEYS);

  const alreadyFilled = new Set(
    (existingFieldLinks ?? []).map((l: any) => `${l.entity_a_id}:${l.relationship}`),
  );

  // Build entity context string (only targetable entities)
  const entityContextLines = targetableEntities.map((e: any) => {
    const sections = (e.sections ?? {}) as Record<string, string>;
    const desc =
      stripHtml(sections["Overview"] ?? "") ||
      stripHtml(sections["Description"] ?? "") ||
      stripHtml(e.summary ?? "") ||
      "(no description)";
    const mentionCtx = (mentionsMap.get(e.id) ?? []).join(" | ");
    const fieldList = FIELD_TARGET_MAP[e.category]!.map((f) => f.field).join(", ");
    return [
      `ID: ${e.id}`,
      `Name: ${e.name}`,
      `Category: ${e.category}`,
      `Description: ${desc.slice(0, 300)}`,
      `Mention contexts: ${mentionCtx || "(none)"}`,
      `Fields to fill: ${fieldList}`,
    ].join("\n");
  }).join("\n\n");

  // Include ALL entities in a compact reference list so the AI can identify targets by ID
  const entityRefLines = (entities ?? []).map((e: any) =>
    `ID: ${e.id} | Name: ${e.name} | Category: ${e.category}`
  ).join("\n");

  // Field map description
  const fieldMapLines = Object.entries(FIELD_TARGET_MAP)
    .map(([cat, fields]) =>
      `${cat}: ${fields.map((f) => `${f.field} (links to ${f.targetCategory})`).join(", ")}`
    )
    .join("\n");

  // Already-filled summary
  const alreadyFilledLines = [...alreadyFilled]
    .map((key) => {
      const [entityId, fieldKey] = key.split(":");
      const entity = (entities ?? []).find((e: any) => e.id === entityId);
      return entity ? `${entity.name} (${entity.category}): ${fieldKey}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const prompt =
    `You are analyzing fantasy world entities to populate structured profile fields.
For each entity below, look for strong evidence in their description and mention contexts
that would fill these specific fields. Only suggest a field value if clearly supported
by the text — do not guess.
For each suggestion return: { "entity_id": string, "field_key": string, "target_entity_id": string }
where target_entity_id is the ID of the entity that should fill that field.
Only suggest fields where the target is an accepted entity in the entity reference list below.
Return ONLY a valid JSON array. Return [] if no strong evidence exists.

Entities and their mention contexts:
"""
${entityContextLines}
"""

Target fields per category:
"""
${fieldMapLines}
"""

Entity reference list (valid targets):
"""
${entityRefLines}
"""

Already populated fields (do not re-suggest):
"""
${alreadyFilledLines || "(none)"}
"""`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    console.error("sync-tags AI error:", aiRes.status, await aiRes.text().catch(() => ""));
    return [];
  }

  const aiJson = await aiRes.json();
  const rawContent: string = aiJson?.content?.[0]?.text?.trim() ?? "";

  let aiSuggestions: { entity_id: string; field_key: string; target_entity_id: string }[] = [];
  try {
    const cleaned = rawContent
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/, "")
      .trim();
    aiSuggestions = JSON.parse(cleaned);
    if (!Array.isArray(aiSuggestions)) aiSuggestions = [];
  } catch {
    console.error("sync-tags: failed to parse AI JSON:", rawContent.slice(0, 200));
    aiSuggestions = [];
  }

  // Validate
  const validEntityIds = new Set(entityIds);
  const entityById = new Map<string, { name: string; category: string }>(
    (entities ?? []).map((e: any) => [e.id, { name: e.name, category: e.category as string }]),
  );

  const seen = new Set<string>();
  const validated: TagSuggestion[] = [];
  for (const s of aiSuggestions) {
    if (!s.entity_id || !s.field_key || !s.target_entity_id) continue;
    if (!validEntityIds.has(s.entity_id) || !validEntityIds.has(s.target_entity_id)) continue;
    if (s.entity_id === s.target_entity_id) continue;

    const sourceMeta = entityById.get(s.entity_id);
    const targetMeta = entityById.get(s.target_entity_id);
    if (!sourceMeta || !targetMeta) continue;

    const fieldSpec = FIELD_TARGET_MAP[sourceMeta.category]?.find((f) => f.field === s.field_key);
    if (!fieldSpec) continue;
    if (targetMeta.category !== fieldSpec.targetCategory) continue;

    if (alreadyFilled.has(`${s.entity_id}:${s.field_key}`)) continue;

    const dedupeKey = `${s.entity_id}:${s.field_key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    validated.push({
      entity_id: s.entity_id,
      entity_name: sourceMeta.name,
      entity_category: sourceMeta.category,
      field_key: s.field_key,
      target_entity_id: s.target_entity_id,
      target_entity_name: targetMeta.name,
      target_entity_category: targetMeta.category,
    });
  }

  return validated;
}
