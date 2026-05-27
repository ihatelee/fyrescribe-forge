// Generate a one-line summary of the changes between a previous entity version
// and the just-saved version (sections + summary + fields).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const stripHtml = (html: string) =>
  (html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const snapshotText = (v: {
  sections?: Record<string, string> | null;
  fields?: Record<string, string> | null;
  summary?: string | null;
}) => {
  const parts: string[] = [];
  if (v.summary) parts.push(`DESCRIPTION: ${v.summary}`);
  const fields = v.fields || {};
  const fieldStr = Object.entries(fields)
    .filter(([, val]) => val && String(val).trim())
    .map(([k, val]) => `${k}: ${val}`)
    .join(" | ");
  if (fieldStr) parts.push(`AT-A-GLANCE: ${fieldStr}`);
  const sections = v.sections || {};
  for (const [name, content] of Object.entries(sections)) {
    const t = stripHtml(String(content || ""));
    if (t) parts.push(`### ${name}\n${t}`);
  }
  return parts.join("\n\n").slice(0, 8000);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

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

    const { data: version, error: vErr } = await userClient
      .from("entity_versions")
      .select("id, entity_id, sections, fields, summary, created_at")
      .eq("id", versionId)
      .maybeSingle();

    if (vErr || !version) {
      return new Response(JSON.stringify({ error: "Version not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: previous } = await userClient
      .from("entity_versions")
      .select("id, sections, fields, summary, created_at")
      .eq("entity_id", version.entity_id)
      .lt("created_at", version.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const newText = snapshotText(version);
    const prevText = previous ? snapshotText(previous) : "";

    const prompt = previous
      ? `You are summarizing what changed between two saved versions of an entity profile (a character, place, item, etc.) in a novelist's world-building tool.
Write ONE concise sentence (max 14 words) naming which sections or fields were added, removed, or rewritten.
Examples: "Overview and Personality updated", "Added Magic & Abilities section", "Rewrote backstory; cleared appearance".
No preamble, no quotes.

PREVIOUS VERSION:
"""
${prevText}
"""

NEW VERSION:
"""
${newText}
"""

One-sentence change summary:`
      : `You are summarizing the contents of the very first saved version of an entity profile.
Write ONE concise sentence (max 14 words) describing what this profile contains.
No preamble, no quotes.

PROFILE:
"""
${newText}
"""

One-sentence summary:`;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Anthropic API error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const change_summary: string =
      aiJson?.content?.[0]?.text?.trim().replace(/^["']|["']$/g, "") ?? "";

    if (change_summary) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await admin.from("entity_versions").update({ change_summary }).eq("id", versionId);
    }

    return new Response(JSON.stringify({ change_summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-entity-version error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
