import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTEXT_WORDS = 6;

/** Strip HTML tags and decode &nbsp; so plain-text offsets are accurate. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract context: up to CONTEXT_WORDS words before and after the match. */
function extractContext(text: string, matchIndex: number, matchLength: number): string {
  const before = text.slice(0, matchIndex).trimEnd();
  const after = text.slice(matchIndex + matchLength).trimStart();

  const beforeWords = before.split(/\s+/).filter(Boolean).slice(-CONTEXT_WORDS).join(" ");
  const matchText = text.slice(matchIndex, matchIndex + matchLength);
  const afterWords = after.split(/\s+/).filter(Boolean).slice(0, CONTEXT_WORDS).join(" ");

  return [beforeWords, matchText, afterWords].filter(Boolean).join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Auth ────────────────────────────────────────────────────────────
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify ownership ────────────────────────────────────────────────
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Fetch entities and scenes ───────────────────────────────────────
    const [entitiesRes, scenesRes] = await Promise.all([
      supabase
        .from("entities")
        .select("id, name")
        .eq("project_id", project_id)
        .is("archived_at", null),
      supabase
        .from("scenes")
        .select("id, content")
        .eq("project_id", project_id)
        .not("content", "is", null),
    ]);

    const entities: { id: string; name: string }[] = entitiesRes.data ?? [];
    const scenes: { id: string; content: string }[] = scenesRes.data ?? [];

    if (entities.length === 0 || scenes.length === 0) {
      // Nothing to scan — clear existing and return early.
      await supabase.from("entity_mentions").delete().eq("project_id", project_id);
      return new Response(JSON.stringify({ mentions_found: 0, new_mentions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Snapshot existing mentions BEFORE refresh, so we can diff ───────
    // Key by (entity_id, scene_id, context) — NOT position, because editing
    // a scene shifts every position downstream of the edit.
    const { data: previousRows } = await supabase
      .from("entity_mentions")
      .select("entity_id, scene_id, context")
      .eq("project_id", project_id);

    const previousKeys = new Set(
      (previousRows ?? []).map((r) => `${r.entity_id}:${r.scene_id}:${r.context}`),
    );

    // ── Scan scenes for entity name matches ─────────────────────────────
    const rows: {
      entity_id: string;
      scene_id: string;
      project_id: string;
      context: string;
      position: number;
    }[] = [];

    for (const scene of scenes) {
      const plainText = stripHtml(scene.content);

      for (const entity of entities) {
        const nameLower = entity.name.toLowerCase();
        const textLower = plainText.toLowerCase();

        let searchFrom = 0;
        while (searchFrom < textLower.length) {
          const idx = textLower.indexOf(nameLower, searchFrom);
          if (idx === -1) break;

          // Word-boundary check: ensure the match isn't mid-word
          const before = idx === 0 ? "" : textLower[idx - 1];
          const after = textLower[idx + nameLower.length] ?? "";
          const boundaryBefore = !before || /\W/.test(before);
          const boundaryAfter = !after || /\W/.test(after);

          if (boundaryBefore && boundaryAfter) {
            rows.push({
              entity_id: entity.id,
              scene_id: scene.id,
              project_id,
              context: extractContext(plainText, idx, entity.name.length),
              position: idx,
            });
          }

          searchFrom = idx + nameLower.length;
        }
      }
    }

    // ── Full refresh: delete then bulk insert ───────────────────────────
    await supabase.from("entity_mentions").delete().eq("project_id", project_id);

    if (rows.length > 0) {
      // Insert in chunks of 500 to stay within payload limits
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insertError } = await supabase
          .from("entity_mentions")
          .insert(rows.slice(i, i + CHUNK));
        if (insertError) {
          console.error("Insert error:", insertError);
        }
      }
    }

    // ── Compute new mentions (not present in previous snapshot) ─────────
    const entityNameById = new Map(entities.map((e) => [e.id, e.name]));
    const sceneTitleById = new Map<string, string>();
    const { data: sceneTitleRows } = await supabase
      .from("scenes")
      .select("id, title")
      .eq("project_id", project_id);
    for (const s of sceneTitleRows ?? []) sceneTitleById.set(s.id, s.title);

    const newMentions = rows
      .filter((r) => !previousKeys.has(`${r.entity_id}:${r.scene_id}:${r.context}`))
      .map((r) => ({
        entity_id: r.entity_id,
        entity_name: entityNameById.get(r.entity_id) ?? "Unknown",
        scene_id: r.scene_id,
        scene_title: sceneTitleById.get(r.scene_id) ?? "Untitled scene",
        context: r.context,
        position: r.position,
      }));

    return new Response(
      JSON.stringify({ mentions_found: rows.length, new_mentions: newMentions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
