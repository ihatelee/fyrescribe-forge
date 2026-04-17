import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Structured At a Glance fields that link to other entities.
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

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // ── Fetch entities ───────────────────────────────────────────────────
    const { data: entities } = await admin
      .from("entities")
      .select("id, name, category, summary, sections")
      .eq("project_id", project_id)
      .is("archived_at", null);

    if (!entities || entities.length < 2) {
      return new Response(JSON.stringify({ suggestions_created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch existing links (to avoid re-suggestions) ───────────────────
    const entityIds = entities.map((e: any) => e.id);
    const { data: existingLinks } = await admin
      .from("entity_links")
      .select("entity_a_id, entity_b_id, relationship")
      .or(`entity_a_id.in.(${entityIds.join(",")}),entity_b_id.in.(${entityIds.join(",")})`)

    // Build a Set of sorted id pairs for dedup
    const linkedPairs = new Set<string>(
      (existingLinks ?? []).map((l: any) => {
        const pair = [l.entity_a_id, l.entity_b_id].sort().join("|");
        return pair;
      }),
    );

    // ── Build AI context ─────────────────────────────────────────────────
    const stripHtml = (html: string) =>
      (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const entityLines = entities.map((e: any) => {
      const sections = (e.sections ?? {}) as Record<string, string>;
      const context =
        stripHtml(sections["Overview"] ?? "") ||
        stripHtml(sections["Description"] ?? "") ||
        stripHtml(e.summary ?? "") ||
        "(no description)";
      return `ID: ${e.id}\nName: ${e.name}\nCategory: ${e.category}\nContext: ${context.slice(0, 400)}`;
    }).join("\n\n");

    const existingLinkLines = (existingLinks ?? [])
      .map((l: any) => {
        const a = entities.find((e: any) => e.id === l.entity_a_id);
        const b = entities.find((e: any) => e.id === l.entity_b_id);
        if (!a || !b) return null;
        return `${a.name} <-> ${b.name}: ${l.relationship ?? "linked"}`;
      })
      .filter(Boolean)
      .join("\n");

    const prompt = `You are analyzing a fantasy world's cast of characters, locations, factions, artifacts, and creatures.
Given the following entities, suggest meaningful relationships between pairs.
Only suggest relationships that are strongly implied by the entity descriptions.
Do not suggest relationships that already exist.
Return ONLY a valid JSON array. Each element must be:
{ "entity_a_id": string, "entity_b_id": string, "relationship": string, "confidence": number }
Where confidence is a number 1-10. Only return suggestions with confidence 7 or above.
Return an empty array [] if no strong relationships are found.

Existing entity data:
"""
${entityLines}
"""

Already linked pairs (do not re-suggest):
"""
${existingLinkLines || "(none)"}
"""`;

    // ── AI call ──────────────────────────────────────────────────────────
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      console.error("AI error:", aiRes.status, await aiRes.text());
      return new Response(JSON.stringify({ error: "AI call failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const rawContent: string = aiJson?.content?.[0]?.text?.trim() ?? "";

    // ── Parse AI response ────────────────────────────────────────────────
    let aiSuggestions: { entity_a_id: string; entity_b_id: string; relationship: string; confidence: number }[] = [];
    try {
      // Strip markdown code fences if present
      const cleaned = rawContent.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      aiSuggestions = JSON.parse(cleaned);
      if (!Array.isArray(aiSuggestions)) aiSuggestions = [];
    } catch {
      console.error("Failed to parse AI JSON:", rawContent.slice(0, 200));
      aiSuggestions = [];
    }

    // ── Filter + deduplicate ─────────────────────────────────────────────
    const validEntityIds = new Set(entityIds);
    const filtered = aiSuggestions.filter((s) => {
      if (!s.entity_a_id || !s.entity_b_id || s.entity_a_id === s.entity_b_id) return false;
      if (!validEntityIds.has(s.entity_a_id) || !validEntityIds.has(s.entity_b_id)) return false;
      const confidence = Math.round(s.confidence ?? 0);
      if (confidence < 7) return false;
      const pair = [s.entity_a_id, s.entity_b_id].sort().join("|");
      if (linkedPairs.has(pair)) return false;
      return true;
    });

    // ── Full refresh: delete pending, bulk insert ────────────────────────
    await admin
      .from("lore_link_suggestions")
      .delete()
      .eq("project_id", project_id)
      .eq("status", "pending");

    if (filtered.length > 0) {
      const rows = filtered.map((s) => ({
        project_id,
        entity_a_id: s.entity_a_id,
        entity_b_id: s.entity_b_id,
        relationship: (s.relationship ?? "related to").trim(),
        confidence: Math.min(10, Math.max(1, Math.round(s.confidence))),
      }));
      const { error: insertError } = await admin.from("lore_link_suggestions").insert(rows);
      if (insertError) console.error("Insert error:", insertError);
    }

    // ── Second pass: field-tagging ───────────────────────────────────────
    const fieldLinksCreated = await runFieldTaggingPass(admin, project_id, anthropicKey, entities);

    return new Response(
      JSON.stringify({ suggestions_created: filtered.length, field_links_created: fieldLinksCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("link-lore error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function runFieldTaggingPass(
  admin: ReturnType<typeof createClient>,
  project_id: string,
  anthropicKey: string,
  entities: any[],
): Promise<number> {
  const targetableEntities = entities.filter((e) => !!FIELD_TARGET_MAP[e.category as string]);
  if (targetableEntities.length === 0 || entities.length < 2) return 0;

  const entityIds = entities.map((e) => e.id);

  // Fetch mention contexts
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

  // Fetch existing field links to skip
  const { data: existingFieldLinks } = await admin
    .from("entity_links")
    .select("entity_a_id, relationship")
    .in("entity_a_id", entityIds)
    .in("relationship", ALL_FIELD_KEYS);

  const alreadyFilled = new Set(
    (existingFieldLinks ?? []).map((l: any) => `${l.entity_a_id}:${l.relationship}`),
  );

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

  const entityRefLines = entities
    .map((e: any) => `ID: ${e.id} | Name: ${e.name} | Category: ${e.category}`)
    .join("\n");

  const fieldMapLines = Object.entries(FIELD_TARGET_MAP)
    .map(([cat, fields]) =>
      `${cat}: ${fields.map((f) => `${f.field} (links to ${f.targetCategory})`).join(", ")}`
    )
    .join("\n");

  const alreadyFilledLines = [...alreadyFilled]
    .map((key) => {
      const [entityId, fieldKey] = key.split(":");
      const entity = entities.find((e) => e.id === entityId);
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
    console.error("Field-tagging AI error:", aiRes.status, await aiRes.text().catch(() => ""));
    return 0;
  }

  const aiJson = await aiRes.json();
  const rawContent: string = aiJson?.content?.[0]?.text?.trim() ?? "";

  let aiSuggestions: { entity_id: string; field_key: string; target_entity_id: string }[] = [];
  try {
    const cleaned = rawContent.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
    aiSuggestions = JSON.parse(cleaned);
    if (!Array.isArray(aiSuggestions)) aiSuggestions = [];
  } catch {
    console.error("Field-tagging: failed to parse AI JSON:", rawContent.slice(0, 200));
    aiSuggestions = [];
  }

  const validEntityIds = new Set(entityIds);
  const entityCategoryMap = new Map(entities.map((e) => [e.id, e.category as string]));
  const seen = new Set<string>();

  const toInsert = aiSuggestions.filter((s) => {
    if (!s.entity_id || !s.field_key || !s.target_entity_id) return false;
    if (!validEntityIds.has(s.entity_id) || !validEntityIds.has(s.target_entity_id)) return false;
    if (s.entity_id === s.target_entity_id) return false;

    const entityCat = entityCategoryMap.get(s.entity_id) ?? "";
    const fieldSpec = FIELD_TARGET_MAP[entityCat]?.find((f) => f.field === s.field_key);
    if (!fieldSpec) return false;

    const targetCat = entityCategoryMap.get(s.target_entity_id) ?? "";
    if (targetCat !== fieldSpec.targetCategory) return false;

    if (alreadyFilled.has(`${s.entity_id}:${s.field_key}`)) return false;

    const dedupeKey = `${s.entity_id}:${s.field_key}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);

    return true;
  });

  if (toInsert.length > 0) {
    const rows = toInsert.map((s) => ({
      entity_a_id: s.entity_id,
      entity_b_id: s.target_entity_id,
      relationship: s.field_key,
    }));
    const { error } = await admin.from("entity_links").insert(rows);
    if (error) console.error("Field-tagging insert error:", error);
  }

  return toInsert.length;
}
