// Generate a one-line summary of the changes between a previous scene version
// and the just-saved version. Uses Lovable AI (google/gemini-2.5-flash) for speed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const stripHtml = (html: string) =>
  (html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use ANON key so RLS is enforced for ownership checks on scene_versions.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
    const versionId: string | undefined = body.versionId;
    if (!versionId || typeof versionId !== "string") {
      return new Response(JSON.stringify({ error: "versionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the version (RLS-safe).
    const { data: version, error: vErr } = await userClient
      .from("scene_versions")
      .select("id, scene_id, content, created_at")
      .eq("id", versionId)
      .maybeSingle();

    if (vErr || !version) {
      return new Response(JSON.stringify({ error: "Version not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find previous version for the same scene to diff against.
    const { data: previous } = await userClient
      .from("scene_versions")
      .select("id, content, created_at")
      .eq("scene_id", version.scene_id)
      .lt("created_at", version.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newText = stripHtml(version.content || "").slice(0, 8000);
    const prevText = stripHtml(previous?.content || "").slice(0, 8000);

    const prompt = previous
      ? `You are summarizing what changed between two versions of a single scene in a novel.
Write ONE concise sentence (max 18 words) describing what was added, removed, or rewritten in the new version compared to the previous version.
Be specific: name characters, events, or structural changes when possible. No preamble, no quotes.

PREVIOUS VERSION:
"""
${prevText}
"""

NEW VERSION:
"""
${newText}
"""

One-sentence summary:`
      : `You are summarizing the contents of a saved scene version for a novel.
Write ONE concise sentence (max 18 words) describing what happens in this scene.
Be specific: name characters and events. No preamble, no quotes.

SCENE:
"""
${newText}
"""

One-sentence summary:`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const summary: string =
      aiJson?.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") ?? "";

    if (summary) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await admin.from("scene_versions").update({ summary }).eq("id", versionId);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-version error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
