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

/**
 * Find sentence boundaries (start, endExclusive) so we can dedupe mentions
 * that fall in the same sentence. Splits on . ! ? followed by whitespace,
 * and on line breaks. Returns segments covering the whole text.
 */
function findSentenceRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const re = /[.!?]+(?=\s|$)|\n+/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const end = match.index + match[0].length;
    ranges.push({ start: lastEnd, end });
    lastEnd = end;
  }
  if (lastEnd < text.length) ranges.push({ start: lastEnd, end: text.length });
  return ranges;
}

function sentenceIndexFor(ranges: { start: number; end: number }[], pos: number): number {
  for (let i = 0; i < ranges.length; i++) {
    if (pos >= ranges[i].start && pos < ranges[i].end) return i;
  }
  return ranges.length - 1;
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

    // ── Fetch entities (with aliases) and scenes ────────────────────────
    const [entitiesRes, scenesRes] = await Promise.all([
      supabase
        .from("entities")
        .select("id, name, aliases")
        .eq("project_id", project_id)
        .is("archived_at", null),
      supabase
        .from("scenes")
        .select("id, content")
        .eq("project_id", project_id)
        .not("content", "is", null),
    ]);

    const entities: { id: string; name: string; aliases: string[] | null }[] =
      entitiesRes.data ?? [];
    const scenes: { id: string; content: string }[] = scenesRes.data ?? [];

    if (entities.length === 0 || scenes.length === 0) {
      await supabase.from("entity_mentions").delete().eq("project_id", project_id);
      return new Response(JSON.stringify({ mentions_found: 0, new_mentions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Snapshot existing mentions and rejections BEFORE refresh ────────
    const [{ data: previousRows }, { data: rejectedRows }] = await Promise.all([
      supabase
        .from("entity_mentions")
        .select("entity_id, scene_id, context")
        .eq("project_id", project_id),
      supabase
        .from("rejected_mentions")
        .select("entity_id, scene_id, context")
        .eq("project_id", project_id),
    ]);

    const previousKeys = new Set(
      (previousRows ?? []).map((r) => `${r.entity_id}:${r.scene_id}:${r.context}`),
    );
    const rejectedKeys = new Set(
      (rejectedRows ?? []).map((r) => `${r.entity_id}:${r.scene_id}:${r.context}`),
    );

    // ── Build search terms per entity (name + aliases) ──────────────────
    type EntityTerm = { entityId: string; entityName: string; term: string };
    const allTerms: EntityTerm[] = [];
    for (const e of entities) {
      const seen = new Set<string>();
      const push = (t: string) => {
        const trimmed = t.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        allTerms.push({ entityId: e.id, entityName: e.name, term: trimmed });
      };
      push(e.name);
      for (const a of e.aliases ?? []) push(a);
    }

    // ── Scan scenes for entity name + alias matches, dedupe by sentence ─
    const rows: {
      entity_id: string;
      scene_id: string;
      project_id: string;
      context: string;
      position: number;
    }[] = [];

    for (const scene of scenes) {
      const plainText = stripHtml(scene.content);
      const textLower = plainText.toLowerCase();
      const sentenceRanges = findSentenceRanges(plainText);
      // Track which (entity, sentenceIndex) pairs have been recorded for this scene
      const sceneSentenceSeen = new Set<string>();

      for (const { entityId, term } of allTerms) {
        const termLower = term.toLowerCase();
        let searchFrom = 0;
        while (searchFrom < textLower.length) {
          const idx = textLower.indexOf(termLower, searchFrom);
          if (idx === -1) break;

          const before = idx === 0 ? "" : textLower[idx - 1];
          const after = textLower[idx + termLower.length] ?? "";
          const boundaryBefore = !before || /\W/.test(before);
          const boundaryAfter = !after || /\W/.test(after);

          if (boundaryBefore && boundaryAfter) {
            const sIdx = sentenceIndexFor(sentenceRanges, idx);
            const dedupeKey = `${entityId}:${sIdx}`;
            if (!sceneSentenceSeen.has(dedupeKey)) {
              sceneSentenceSeen.add(dedupeKey);
              rows.push({
                entity_id: entityId,
                scene_id: scene.id,
                project_id,
                context: extractContext(plainText, idx, term.length),
                position: idx,
              });
            }
          }

          searchFrom = idx + termLower.length;
        }
      }
    }

    // ── Full refresh: delete then bulk insert ───────────────────────────
    await supabase.from("entity_mentions").delete().eq("project_id", project_id);

    if (rows.length > 0) {
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

    // ── Compute new mentions (not previously known, not rejected) ───────
    const entityNameById = new Map(entities.map((e) => [e.id, e.name]));
    const sceneTitleById = new Map<string, string>();
    const { data: sceneTitleRows } = await supabase
      .from("scenes")
      .select("id, title")
      .eq("project_id", project_id);
    for (const s of sceneTitleRows ?? []) sceneTitleById.set(s.id, s.title);

    const newMentions = rows
      .filter((r) => {
        const k = `${r.entity_id}:${r.scene_id}:${r.context}`;
        return !previousKeys.has(k) && !rejectedKeys.has(k);
      })
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
