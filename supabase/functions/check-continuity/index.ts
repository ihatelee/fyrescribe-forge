import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCENE_CONTENT_LIMIT = 1500;

interface ContinuityIssue {
  type: "character" | "location" | "timeline" | "fact";
  description: string;
  quote: string;
  entity_name: string;
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

    const body = await req.json().catch(() => ({}));
    const { chapter_id, project_id } = body as { chapter_id: string; project_id: string };

    if (!chapter_id || !project_id) {
      return new Response(JSON.stringify({ error: "chapter_id and project_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await userClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .single();
    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch chapter and its scenes
    const [chapterRes, scenesRes, entitiesRes] = await Promise.all([
      supabase.from("chapters").select("id, title").eq("id", chapter_id).single(),
      supabase.from("scenes").select("id, title, content, order").eq("chapter_id", chapter_id).order("order"),
      supabase.from("entities").select("name, category, summary, sections, fields").eq("project_id", project_id).is("archived_at", null),
    ]);

    const chapter = chapterRes.data;
    const scenes = scenesRes.data ?? [];
    const entities = entitiesRes.data ?? [];

    if (scenes.length === 0) {
      return new Response(
        JSON.stringify({ issues: [], chapter_title: chapter?.title ?? "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Combine scene content
    const sceneText = scenes
      .map((s: { title: string; content: string | null }) => {
        const content = stripHtml(s.content ?? "").slice(0, SCENE_CONTENT_LIMIT);
        return `[Scene: ${s.title}]\n${content}`;
      })
      .join("\n\n");

    // Build entity context: name, category, key facts
    const entityContext = entities
      .map((e: { name: string; category: string; summary?: string; sections?: Record<string, string>; fields?: Record<string, string> }) => {
        const sections = e.sections ?? {};
        const fields = e.fields ?? {};
        const detail = e.summary ?? Object.values(sections).find((v) => v?.trim())?.slice(0, 80) ?? "";
        const fieldPairs = Object.entries(fields)
          .filter(([, v]) => v?.trim())
          .map(([k, v]) => `${k}: ${v}`)
          .slice(0, 6)
          .join(", ");
        return `[${e.category}] ${e.name}${detail ? " — " + detail : ""}${fieldPairs ? " | " + fieldPairs : ""}`;
      })
      .join("\n");

    const prompt = buildPrompt(chapter?.title ?? "", sceneText, entityContext);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "(unreadable)");
      console.error(`[check-continuity] Anthropic HTTP ${response.status}:`, errText.slice(0, 400));
      return new Response(JSON.stringify({ error: "AI call failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult: { content?: { text?: string }[] } = await response.json();
    const rawText = aiResult.content?.[0]?.text ?? "[]";
    const jsonText = rawText
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let issues: ContinuityIssue[] = [];
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) issues = parsed;
    } catch {
      console.error("[check-continuity] JSON parse failed:", rawText.slice(0, 400));
    }

    return new Response(
      JSON.stringify({ issues, chapter_title: chapter?.title ?? "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[check-continuity] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function buildPrompt(chapterTitle: string, sceneText: string, entityContext: string): string {
  return `You are a continuity editor checking a novel chapter against the author's lore database.

CHAPTER: ${chapterTitle}

LORE DATABASE (canonical facts about each entity):
${entityContext || "(no entities yet)"}

CHAPTER TEXT:
"""
${sceneText}
"""

Compare the chapter text against the lore database. Flag only genuine conflicts — where the text directly contradicts an established fact (wrong eye colour, wrong location, wrong allegiance, character described as dead but acting, etc.). Do NOT flag:
- Details not present in the lore database
- Things simply absent from the lore
- Stylistic or tonal differences
- Ambiguous phrasing

Return a JSON array. Each element must have exactly these keys:
- "type": one of "character", "location", "timeline", "fact"
- "entity_name": the name of the entity involved
- "description": one sentence clearly stating what conflicts and why
- "quote": the exact phrase from the chapter text that conflicts (max 20 words, verbatim)

Return [] if there are no genuine conflicts. Output only the JSON array. No prose, no markdown fences.`;
}
