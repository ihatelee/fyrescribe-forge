import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) throw new Error("REPLICATE_API_KEY is not configured");

    const body = await req.json();
    const entity_id: string = body.entity_id ?? body.entityId;
    const art_style: string = body.art_style ?? body.style ?? "Fantasy Portrait";

    // Appearance can be a structured object (new modal) or a string (legacy).
    const appearanceRaw = body.appearance;
    let appearanceParts: string[] = [];
    if (appearanceRaw && typeof appearanceRaw === "object") {
      const a = appearanceRaw as Record<string, string | undefined>;
      appearanceParts = [
        a.age_build,
        a.hair,
        a.eyes,
        a.distinguishing_features,
        a.clothing_style,
      ]
        .map((v) => (v ?? "").trim())
        .filter(Boolean);
    } else if (typeof appearanceRaw === "string" && appearanceRaw.trim()) {
      appearanceParts = [appearanceRaw.trim()];
    }

    const background: string =
      (body.background ?? body.setting_mood ?? body.setting ?? "").toString().trim();

    if (!entity_id) throw new Error("entity_id is required");

    // Appearance weighted first; background is supporting context.
    const appearanceText = appearanceParts.join(", ");
    const promptSegments = [
      `${art_style} style portrait`,
      appearanceText && `Subject: ${appearanceText}`,
      background && `Background: ${background}`,
      "High quality, detailed, dramatic lighting.",
    ].filter(Boolean);
    const prompt = promptSegments.join(". ");

    // ── Call Replicate FLUX Dev ──────────────────────────────────────────────
    const predRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REPLICATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            prompt,
            aspect_ratio: "2:3",
            output_format: "webp",
            output_quality: 80,
          },
        }),
      },
    );

    if (!predRes.ok) {
      const t = await predRes.text();
      console.error("Replicate error:", predRes.status, t);
      throw new Error(`Replicate error ${predRes.status}`);
    }

    let pred = await predRes.json();

    // ── Poll until succeeded or failed ───────────────────────────────────────
    while (pred.status !== "succeeded" && pred.status !== "failed") {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(pred.urls.get, {
        headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` },
      });
      pred = await poll.json();
    }

    if (pred.status !== "succeeded") {
      console.error("Prediction failed:", pred);
      throw new Error(pred.error || "Image generation failed");
    }

    const replicateUrl: string = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!replicateUrl) throw new Error("No image returned from Replicate");

    // ── Download and re-upload to Supabase storage ───────────────────────────
    const imgRes = await fetch(replicateUrl);
    if (!imgRes.ok) throw new Error("Failed to download generated image");
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    let userId = "anonymous";
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data.user) userId = data.user.id;
    }

    const fileName = `generated-${crypto.randomUUID()}.webp`;
    const path = `${userId}/${entity_id}/${fileName}`;

    const { error: upErr } = await supabase.storage
      .from("entity-images")
      .upload(path, imgBytes, { contentType: "image/webp" });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("entity-images").getPublicUrl(path);
    const image_url = pub.publicUrl;

    // ── Append to gallery_image_urls ─────────────────────────────────────────
    const { data: entityRow } = await supabase
      .from("entities")
      .select("gallery_image_urls")
      .eq("id", entity_id)
      .single();

    const existing: string[] = entityRow?.gallery_image_urls ?? [];
    await supabase
      .from("entities")
      .update({ gallery_image_urls: [...existing, image_url] })
      .eq("id", entity_id);

    return new Response(JSON.stringify({ image_url, imageUrl: image_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-entity-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
