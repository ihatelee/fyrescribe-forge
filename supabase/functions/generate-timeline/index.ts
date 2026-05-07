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
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify project ownership via user-scoped client ────────────────
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

    // ── Service-role client for data operations ────────────────────────
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Events and History entities (include id for entity_id linking)
    const { data: entities } = await supabase
      .from("entities")
      .select("id, name, category, summary")
      .eq("project_id", project_id)
      .in("category", ["events", "history"]);

    // Build a lookup map: lowercase name → entity id (covers events + history)
    const entityIdByName = new Map<string, string>(
      (entities || []).map((e) => [e.name.toLowerCase(), e.id])
    );

    // Fetch scene content (first 500 chars each to keep context manageable)
    const { data: scenes } = await supabase
      .from("scenes")
      .select("title, content")
      .eq("project_id", project_id)
      .not("content", "is", null);

    const entityContext = (entities || [])
      .map((e) => `[${e.category}] ${e.name}${e.summary ? `: ${e.summary}` : ""}`)
      .join("\n");

    const sceneContext = (scenes || [])
      .map((s) => {
        const snippet = (s.content || "").slice(0, 500).replace(/\s+/g, " ").trim();
        return `Scene "${s.title}": ${snippet}`;
      })
      .join("\n\n");

    const prompt = `You are a story analyst. Based on the world-building entities and scene excerpts below, identify chronological events and produce a timeline.

ENTITIES (Events & History):
${entityContext || "(none)"}

SCENE EXCERPTS:
${sceneContext || "(none)"}

Return a JSON array only — no prose, no code fences. Each item must have:
- "label": string (short event name, 3–8 words)
- "date_label": MUST be EXACTLY one of: "Ancient Times", "Generations Ago", "Years Ago", "Recent Past", "Present Day". No other values allowed.
- "date_sort": integer matching the era — Ancient Times=100, Generations Ago=300, Years Ago=400, Recent Past=500, Present Day=600
- "type": "world_history" | "story_event"
- "significance_score": integer 1–10 (8–10: world-changing events — battles, deaths, major discoveries, regime changes; 7: notable, plot-defining moments; 1–6: minor or background — DO NOT INCLUDE these in your output)

Include world history events and story-level events separately. ONLY include events with significance_score ≥ 7. Extract at most 2 events per scene, only the most significant. If a scene contains nothing notable (≥ 7), return nothing for it. Aim for 4–10 events total. Output only the JSON array.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return new Response(JSON.stringify({ error: "Anthropic API call failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const rawText = aiResult.content?.[0]?.text ?? "[]";

    // Strip any accidental code fences
    const jsonText = rawText.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const events: { label: string; date_label: string; date_sort: number; type: string; significance_score?: number }[] =
      JSON.parse(jsonText);

    // Allowed era labels and their sort values
    const ERAS: Record<string, number> = {
      "ancient times": 100,
      "generations ago": 300,
      "years ago": 400,
      "recent past": 500,
      "present day": 600,
    };
    const ERA_NAMES: Record<string, string> = {
      "ancient times": "Ancient Times",
      "generations ago": "Generations Ago",
      "years ago": "Years Ago",
      "recent past": "Recent Past",
      "present day": "Present Day",
    };

    function coerceEra(label: string | undefined, sort: number | undefined): { label: string; sort: number } {
      const key = (label ?? "").trim().toLowerCase();
      if (key in ERAS) return { label: ERA_NAMES[key], sort: ERAS[key] };
      // Fall back by date_sort proximity
      const s = typeof sort === "number" ? sort : 400;
      const closest = Object.entries(ERAS).reduce((a, b) =>
        Math.abs(b[1] - s) < Math.abs(a[1] - s) ? b : a
      );
      return { label: ERA_NAMES[closest[0]], sort: closest[1] };
    }

    // Validate and insert into timeline_events; match label → entity_id where possible
    const rows = events
      .filter((e) => e.label && (e.type === "world_history" || e.type === "story_event"))
      .map((e) => {
        const era = coerceEra(e.date_label, e.date_sort);
        return {
          project_id,
          label: e.label,
          date_label: era.label,
          date_sort: era.sort,
          type: e.type as "world_history" | "story_event",
          entity_id: entityIdByName.get(e.label.toLowerCase()) ?? null,
          significance_score: typeof e.significance_score === "number"
            ? Math.min(10, Math.max(1, Math.round(e.significance_score)))
            : 5,
        };
      })
      .filter((r) => r.significance_score >= 7);

    const { data: inserted, error: insertError } = await supabase
      .from("timeline_events")
      .insert(rows)
      .select("*");

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save timeline events" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ events: inserted }), {
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
