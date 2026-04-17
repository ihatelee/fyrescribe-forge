import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    return new Response(JSON.stringify({ suggestions_created: filtered.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("link-lore error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
