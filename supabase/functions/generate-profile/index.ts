import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORY_SECTIONS: Record<string, string[]> = {
  characters: ["Overview", "Background", "Personality", "Relationships", "Notable Events"],
  places: ["Description", "History", "Notable Inhabitants", "Points of Interest"],
  creatures: ["Appearance", "Behaviour", "Abilities", "Habitat", "Lore"],
  artifacts: ["Description", "History", "Powers", "Current Whereabouts"],
  events: ["Summary", "Causes", "Key Participants", "Consequences", "Aftermath"],
  magic: ["Description", "Regional Origin", "Known Users", "Imbued Weapons & Artifacts"],
  factions: ["Overview", "History", "Structure", "Notable Members", "Goals"],
  doctrine: ["Core Tenets", "Origins", "Followers", "Contradictions"],
  history: ["Overview", "Causes", "Key Figures", "Consequences", "Legacy"],
};

function buildSectionInstructions(category: string): string {
  const keys = CATEGORY_SECTIONS[category] ?? CATEGORY_SECTIONS["characters"];
  const lines: string[] = [];

  for (const key of keys) {
    switch (key) {
      case "Overview":
        lines.push(`"Overview": Current status, role, and significance. Present tense. 1 paragraph, 3–5 sentences.`);
        break;
      case "Background":
        lines.push(`"Background": Fixed history before the story — origin, upbringing, formative events. 1 paragraph, 3–5 sentences. Only what is supported by the excerpts.`);
        break;
      case "Personality":
        lines.push(`"Personality": Observable traits, speech patterns, and behavioural tendencies shown in the text. 1 paragraph, 3–5 sentences.`);
        break;
      case "Relationships":
        lines.push(`"Relationships": Each significant relationship on its own line: "[Name]: 1–2 sentences."`);
        break;
      case "Notable Events":
        lines.push(`"Notable Events": One sentence per event. Only events clearly present in the excerpts.`);
        break;
      default:
        lines.push(`"${key}": 1 paragraph. Only what is supported by the excerpts.`);
    }
  }

  if (category === "characters") {
    lines.push(`"Magic & Abilities": Known abilities, magic use, or powers shown in the excerpts. 1 paragraph. Omit if not applicable.`);
  }

  return lines.map((l) => `- ${l}`).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const { entity_id } = await req.json().catch(() => ({}));
    if (!entity_id) {
      return new Response(JSON.stringify({ error: "entity_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: entity, error: entityError } = await userClient
      .from("entities")
      .select("id, name, category, summary, sections, fields, is_pov_character, project_id")
      .eq("id", entity_id)
      .single();

    if (entityError || !entity) {
      return new Response(JSON.stringify({ error: "Entity not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: mentions } = await userClient
      .from("entity_mentions")
      .select("context")
      .eq("entity_id", entity_id)
      .limit(30);

    const mentionContexts = (mentions ?? [])
      .map((m: { context: string | null }) => m.context?.trim())
      .filter(Boolean) as string[];

    // For POV characters, fetch the full content of all scenes they narrate.
    const POV_SCENE_CONTENT_LIMIT = 3000;
    type PovScene = { content: string | null; title: string; chapters: { title: string } | null };
    let povScenes: PovScene[] = [];
    if (entity.is_pov_character && entity.project_id) {
      const { data: povData } = await userClient
        .from("scenes")
        .select("content, title, chapters(title)")
        .eq("pov_character_id", entity_id)
        .eq("project_id", entity.project_id)
        .limit(15);
      povScenes = (povData ?? []) as unknown as PovScene[];
    }

    if (mentionContexts.length === 0 && povScenes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No manuscript content found for this entity. Run Sync Lore first." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sectionInstructions = buildSectionInstructions(entity.category);

    // Build context block: mention snippets first, then full POV scenes.
    const contextParts: string[] = [];
    if (mentionContexts.length > 0) {
      contextParts.push(
        `MENTION SNIPPETS (name appears in these passages):\n${mentionContexts.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`,
      );
    }
    if (povScenes.length > 0) {
      const sceneBlocks = povScenes.map((s) => {
        const chapterLabel = s.chapters?.title ? `${s.chapters.title} › ` : "";
        const trimmed = (s.content ?? "").trim().slice(0, POV_SCENE_CONTENT_LIMIT);
        return `[Scene: ${chapterLabel}${s.title}]\n${trimmed}${(s.content ?? "").trim().length > POV_SCENE_CONTENT_LIMIT ? "…" : ""}`;
      });
      contextParts.push(`POV SCENES (${entity.name} is the point-of-view narrator):\n${sceneBlocks.join("\n\n---\n\n")}`);
    }
    const contextBlock = contextParts.join("\n\n===\n\n");

    const prompt = `You are writing a lore entry for "${entity.name}" (${entity.category}).

You have read this manuscript. You are not summarizing it for someone who hasn't. Write like someone who knows the story — direct, specific, and with the same register as the source material. If the text is dark, write it dark. If it's funny, let that land. If it's both, hold both.

Hard rules:
- Use only what is on the page. No inference, no invented detail, no gap-filling.
- Do not sanitize. Do not euphemize. If the text says something blunt or ugly, write it bluntly.
- Do not use corporate or clinical language. "Going through a difficult period" is not acceptable when the text gives you something real to work with.
- Be specific. Use the actual details from the text — names, objects, moments, exact circumstances. Generic observations are a failure mode.
- Present tense for current-state fields (Overview, Personality).
- If the content doesn't support a field, omit it entirely. No placeholder sentences.
- Do not duplicate content across fields.
- Do not wrap output in markdown fences.

Manuscript content:
${contextBlock}

Return a JSON object. Include only fields you have clear evidence for:
- "short_description": One sentence, max 20 words. The most defining thing about this entity — make it count.
${sectionInstructions}

Return ONLY a JSON object. No prose, no markdown fences, no explanation.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: povScenes.length > 0 ? 4096 : 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      console.error("Anthropic error:", aiRes.status, await aiRes.text().catch(() => ""));
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const rawText: string = aiJson?.content?.[0]?.text?.trim() ?? "{}";
    const cleaned = rawText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();

    let generatedSections: Record<string, string>;
    try {
      generatedSections = JSON.parse(cleaned);
      if (typeof generatedSections !== "object" || Array.isArray(generatedSections)) {
        generatedSections = {};
      }
    } catch {
      console.error("Failed to parse generate-profile response:", rawText.slice(0, 200));
      return new Response(JSON.stringify({ error: "AI returned unparseable response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (Object.keys(generatedSections).length === 0) {
      return new Response(JSON.stringify({ error: "AI returned empty profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull short_description out of the sections payload — it's stored on entities.summary, not in sections JSON.
    const rawShort = typeof generatedSections.short_description === "string"
      ? generatedSections.short_description.trim()
      : "";
    delete generatedSections.short_description;

    // Cap to 20 words, preserving trailing punctuation on the last kept word.
    const capWords = (text: string, max: number): string => {
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length <= max) return text.trim();
      return words.slice(0, max).join(" ").replace(/[,;:–—-]+$/, "") + "…";
    };
    const shortDescription = rawShort ? capWords(rawShort, 20) : "";

    // Generated fields win over existing; non-profile fields (Story History, etc.) are preserved.
    const existingSections = (entity.sections ?? {}) as Record<string, string>;
    const mergedSections = { ...existingSections, ...generatedSections };

    const updatePayload: { sections: Record<string, string>; summary?: string } = {
      sections: mergedSections,
    };
    if (shortDescription) {
      updatePayload.summary = shortDescription;
    }

    const { error: updateError } = await userClient
      .from("entities")
      .update(updatePayload)
      .eq("id", entity_id);

    if (updateError) {
      console.error("Failed to update entity sections:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sections: mergedSections, summary: shortDescription || entity.summary || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-profile error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
