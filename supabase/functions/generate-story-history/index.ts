// Generate or refine a 2-paragraph "Story History" narrative for a character.
// Additive: builds on existing history rather than replacing it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const entityId: string | undefined = body.entityId;
    if (!entityId || typeof entityId !== "string") {
      return new Response(JSON.stringify({ error: "entityId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch entity (RLS-safe via user client to ensure ownership).
    const { data: entity, error: entityErr } = await userClient
      .from("entities")
      .select("id, name, category, summary, sections, fields, project_id")
      .eq("id", entityId)
      .maybeSingle();

    if (entityErr || !entity) {
      return new Response(JSON.stringify({ error: "Entity not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (entity.category !== "characters") {
      return new Response(
        JSON.stringify({ error: "Story History is only available for characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sections = (entity.sections ?? {}) as Record<string, string>;
    const fields = (entity.fields ?? {}) as Record<string, string>;
    const existingHistory = (sections["Story History"] ?? "").trim();

    // Pull mention contexts in manuscript order so the AI sees the
    // character's actual on-page appearances.
    const { data: mentions } = await admin
      .from("entity_mentions")
      .select(
        `context, position, scene_id,
         scenes:scene_id ( title, order, chapter_id,
           chapters:chapter_id ( title, order ) )`,
      )
      .eq("entity_id", entityId)
      .limit(80);

    const orderedMentions = (mentions ?? [])
      .map((m: any) => ({
        chapterOrder: m.scenes?.chapters?.order ?? 0,
        sceneOrder: m.scenes?.order ?? 0,
        position: m.position ?? 0,
        chapterTitle: m.scenes?.chapters?.title ?? "",
        sceneTitle: m.scenes?.title ?? "",
        context: (m.context ?? "").trim(),
      }))
      .sort(
        (a, b) =>
          a.chapterOrder - b.chapterOrder ||
          a.sceneOrder - b.sceneOrder ||
          a.position - b.position,
      )
      .filter((m) => m.context.length > 0);

    const stripHtml = (html: string) =>
      html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    const sectionsSummary = Object.entries(sections)
      .filter(([k]) => k !== "Story History")
      .map(([k, v]) => `${k}: ${stripHtml(v ?? "")}`)
      .filter((line) => line.length > line.indexOf(":") + 2)
      .join("\n");

    const fieldsSummary = Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const mentionLines = orderedMentions
      .slice(0, 60)
      .map(
        (m) =>
          `[${m.chapterTitle} / ${m.sceneTitle}] ${stripHtml(m.context)}`,
      )
      .join("\n");

    const systemPrompt = `You are a literary editor writing a concise, in-world "Story History" entry for a character in a novel's wiki. Output flowing prose only — no headings, no bullet points, no meta commentary. Maximum two paragraphs. Stay grounded in the supplied source material; do not invent events that are not implied by it.`;

    const userPrompt = `Character: ${entity.name}

At a Glance:
${fieldsSummary || "(none)"}

Summary: ${entity.summary ?? "(none)"}

Existing article sections:
${sectionsSummary || "(none)"}

Mentions in the manuscript (in story order):
${mentionLines || "(none yet)"}

${
  existingHistory
    ? `EXISTING STORY HISTORY (refine and extend this — preserve its voice and accurate facts, weave in any new events from the mentions above, and tighten the prose. Do not discard what's already here):\n\n${stripHtml(existingHistory)}`
    : `Write a fresh Story History from scratch using the source above.`
}

Return only the Story History prose (max 2 paragraphs).`;

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const text = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const generated: string =
      aiJson?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!generated) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert paragraphs to simple HTML for the rich-text section.
    const html = generated
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, " ").trim()}</p>`)
      .join("");

    const newSections = { ...sections, "Story History": html };
    const { error: updateErr } = await userClient
      .from("entities")
      .update({ sections: newSections })
      .eq("id", entityId);

    if (updateErr) {
      console.error("Failed to save story history:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to save" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-story-history error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
