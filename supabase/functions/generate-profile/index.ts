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
      .select("id, name, category, summary, sections, fields")
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

    if (mentionContexts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No manuscript mentions found for this entity. Run Sync Lore first." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sectionInstructions = buildSectionInstructions(entity.category);

    const prompt = `You are writing a lore profile for "${entity.name}" (${entity.category}) using only the manuscript excerpts below.

Rules:
- Write only from what is present in the excerpts. No inference, no embellishment, no invented detail.
- Use present tense for current-state fields (Overview, Personality).
- Be concise. If the excerpts don't support a field, omit that field entirely.
- Do not duplicate content across fields.
- Do not wrap output in markdown fences.

Manuscript excerpts:
${mentionContexts.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}

Return a JSON object with only the fields you have clear evidence for:
${sectionInstructions}

Return ONLY a JSON object. No prose, no markdown fences.`;

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

    // Generated fields win over existing; non-profile fields (Story History, etc.) are preserved.
    const existingSections = (entity.sections ?? {}) as Record<string, string>;
    const mergedSections = { ...existingSections, ...generatedSections };

    const { error: updateError } = await userClient
      .from("entities")
      .update({ sections: mergedSections })
      .eq("id", entity_id);

    if (updateError) {
      console.error("Failed to update entity sections:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save profile" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sections: mergedSections }), {
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
