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

    const { existing_sections, new_sections } = await req.json().catch(() => ({}));

    if (!existing_sections || !new_sections) {
      return new Response(JSON.stringify({ error: "existing_sections and new_sections are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are merging two sets of information about the same entity in a fantasy world.
Combine them into a single coherent record.
Keep all unique information from both.
Where both have content for the same field, write a unified version that preserves all facts.
Do not infer or add anything not present in either source.
Return ONLY a JSON object with the same field structure as the input sections. No prose, no markdown fences.

Existing record:
"""
${JSON.stringify(existing_sections, null, 2)}
"""

New information:
"""
${JSON.stringify(new_sections, null, 2)}
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
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      console.error("Anthropic error:", aiRes.status, await aiRes.text().catch(() => ""));
      return new Response(JSON.stringify({ error: "AI merge failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const rawText: string = aiJson?.content?.[0]?.text?.trim() ?? "{}";
    const cleaned = rawText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();

    let merged: Record<string, string>;
    try {
      merged = JSON.parse(cleaned);
      if (typeof merged !== "object" || Array.isArray(merged)) merged = {};
    } catch {
      console.error("Failed to parse merge response:", rawText.slice(0, 200));
      merged = {};
    }

    // Fallback: if parse failed or result is empty, union both section objects
    if (Object.keys(merged).length === 0) {
      merged = { ...existing_sections, ...new_sections };
    }

    return new Response(JSON.stringify({ merged_sections: merged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("merge-entity-sections error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
