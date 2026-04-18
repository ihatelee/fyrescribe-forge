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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const { project_id } = await req.json();
    if (!project_id || typeof project_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user owns the project
    const { data: project, error: projectErr } = await userClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .single();

    if (projectErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all non-archived entities
    const { data: entities, error: entErr } = await userClient
      .from("entities")
      .select("id, name, category, summary")
      .eq("project_id", project_id)
      .is("archived_at", null)
      .limit(200);

    if (entErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch entities" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!entities || entities.length < 2) {
      return new Response(
        JSON.stringify({ error: "Need at least 2 entities to analyze relationships" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch scenes with chapter info for context
    const { data: scenes } = await userClient
      .from("scenes")
      .select("id, title, order, chapter_id, content, chapters(title, order)")
      .eq("project_id", project_id)
      .order("order")
      .limit(200);

    // Fetch existing links to avoid duplicates
    const entityIds = entities.map((e: any) => e.id);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: existingLinks } = await adminClient
      .from("entity_links")
      .select("entity_a_id, entity_b_id")
      .or(
        entityIds.map((id: string) => `entity_a_id.eq.${id}`).join(","),
      );

    const existingSet = new Set(
      (existingLinks ?? []).map(
        (l: any) => [l.entity_a_id, l.entity_b_id].sort().join("|"),
      ),
    );

    // Build entity list for AI prompt
    const entityList = entities
      .map((e: any) => `- ${e.name} [${e.category}]: ${e.summary ?? "No summary"}`)
      .join("\n");

    // Build scene context for AI — truncated content snippets
    const sceneList = (scenes ?? [])
      .map((s: any) => {
        const chapterTitle = s.chapters?.title ?? "Untitled Chapter";
        const chapterOrder = s.chapters?.order ?? 0;
        const snippet = (s.content ?? "").slice(0, 300);
        return `- Chapter ${chapterOrder + 1} "${chapterTitle}" › Scene ${s.order + 1} "${s.title}": ${snippet}`;
      })
      .join("\n");

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        max_tokens: 4096,
        system:
          "You are a lore relationship analyst for a fantasy world-building app called Fyrescribe.\n" +
          "Given a list of world entities and manuscript scenes, analyze potential relationships between entities.\n" +
          "Return ONLY a JSON array of suggested links. Each link:\n" +
          "{\n" +
          '  "entity_a_name": string,\n' +
          '  "entity_b_name": string,\n' +
          '  "relationship": string (short label like "ally of", "ruler of", "located in", "created by", "member of", "rival of"),\n' +
          '  "source_scene": string | null (the scene title where this relationship is most evident, or null if inferred from summaries alone),\n' +
          '  "source_chapter": string | null (the chapter title containing that scene, or null)\n' +
          "}\n\n" +
          "Rules:\n" +
          "- Only suggest relationships that are strongly implied by the entity names, categories, summaries, or scene content\n" +
          "- Keep relationship labels concise (2-4 words)\n" +
          "- The SAME two entities CAN appear multiple times with DIFFERENT relationships if supported by different scenes\n" +
          "- Always include source_scene and source_chapter when the relationship comes from a specific scene\n" +
          "- Return between 0 and 20 suggestions, ranked by confidence\n" +
          "- Return raw JSON array only, no markdown or explanation",
        messages: [
          {
            role: "user",
            content: `Entities:\n${entityList}\n\nScenes:\n${sceneList || "(no scenes available)"}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const rawText: string = aiResult.content?.[0]?.text ?? "[]";
    const jsonText = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let suggestions: Array<{
      entity_a_name: string;
      entity_b_name: string;
      relationship: string;
      source_scene: string | null;
      source_chapter: string | null;
    }>;

    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Expected array");
      suggestions = parsed.filter(
        (s: any) =>
          typeof s.entity_a_name === "string" &&
          typeof s.entity_b_name === "string" &&
          typeof s.relationship === "string",
      );
    } catch {
      console.error("Failed to parse AI response:", rawText);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve names to IDs and filter out existing links
    const nameMap = new Map(entities.map((e: any) => [e.name.toLowerCase(), e]));
    const results = suggestions
      .map((s) => {
        const a = nameMap.get(s.entity_a_name.toLowerCase());
        const b = nameMap.get(s.entity_b_name.toLowerCase());
        if (!a || !b || a.id === b.id) return null;
        // Don't deduplicate same entity pairs — different relationships from different scenes are valid
        return {
          entity_a: { id: a.id, name: a.name, category: a.category },
          entity_b: { id: b.id, name: b.name, category: b.category },
          relationship: s.relationship,
          source_scene: s.source_scene || null,
          source_chapter: s.source_chapter || null,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ suggestions: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
