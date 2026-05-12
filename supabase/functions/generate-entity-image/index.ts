import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STYLE_PROMPTS: Record<string, string> = {
  "Fantasy Portrait":
    "fantasy character portrait, ornate detail, dramatic cinematic lighting, painterly digital art, intricate, highly detailed, ArtStation trending",
  "Dark Fantasy":
    "dark fantasy concept art, moody atmosphere, deep shadows, gothic, cinematic lighting, painterly, ominous, highly detailed",
  "Realistic":
    "photorealistic, ultra detailed, natural lighting, sharp focus, 8k, cinematic composition",
  "Painterly":
    "oil painting, painterly brush strokes, classical composition, rich color palette, fine art, gallery quality",
  "Sketch":
    "detailed pencil sketch, line art, monochrome, hand-drawn, fine cross-hatching, concept art sketch",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) throw new Error("REPLICATE_API_KEY is not configured");

    const { entityId, appearance, setting, style } = await req.json();
    if (!entityId) throw new Error("entityId is required");

    const stylePrompt = STYLE_PROMPTS[style] ?? STYLE_PROMPTS["Fantasy Portrait"];
    const parts = [appearance, setting, stylePrompt].map((p) => (p ?? "").toString().trim()).filter(Boolean);
    const prompt = parts.join(". ");
    if (!prompt) throw new Error("Prompt is empty");

    // Call Replicate flux-schnell (fast, cheap).
    const predRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: "3:4",
          output_format: "png",
          num_outputs: 1,
          num_inference_steps: 4,
        },
      }),
    });

    if (!predRes.ok) {
      const t = await predRes.text();
      console.error("Replicate error:", predRes.status, t);
      throw new Error(`Replicate error ${predRes.status}`);
    }

    let pred = await predRes.json();

    // Poll if not yet finished.
    while (pred.status === "starting" || pred.status === "processing") {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(pred.urls.get, {
        headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` },
      });
      pred = await poll.json();
    }

    if (pred.status !== "succeeded") {
      console.error("Prediction failed:", pred);
      throw new Error(pred.error || "Image generation failed");
    }

    const imageUrl: string = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    if (!imageUrl) throw new Error("No image returned");

    // Download image and upload to storage so we own the URL.
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("Failed to download generated image");
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

    // Auth header → user id for the storage path.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    let userId = "anonymous";
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data.user) userId = data.user.id;
    }

    const path = `${userId}/${entityId}/generated-${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage
      .from("entity-images")
      .upload(path, imgBytes, { contentType: "image/png" });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("entity-images").getPublicUrl(path);

    return new Response(JSON.stringify({ imageUrl: pub.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-entity-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
