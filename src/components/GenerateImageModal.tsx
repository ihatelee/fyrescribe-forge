import { useState, useCallback } from "react";
import { X, Loader2, Sparkles, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ART_STYLES = ["Fantasy Portrait", "Dark Fantasy", "Realistic", "Painterly", "Sketch"] as const;
type ArtStyle = (typeof ART_STYLES)[number];

export interface AppearanceFields {
  age_build?: string;
  hair?: string;
  eyes?: string;
  distinguishing_features?: string;
  clothing_style?: string;
}

interface GenerateImageModalProps {
  entityId: string;
  projectId?: string;
  initialAppearanceFields?: AppearanceFields;
  initialBackground?: string;
  onClose: () => void;
  onUseImage: (url: string) => void | Promise<void>;
}

const inputCls =
  "w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed";

const labelCls = "block text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5";

const GenerateImageModal = ({
  entityId,
  projectId,
  initialAppearanceFields = {},
  initialBackground = "",
  onClose,
  onUseImage,
}: GenerateImageModalProps) => {
  const [ageBuild, setAgeBuild] = useState(initialAppearanceFields.age_build ?? "");
  const [hair, setHair] = useState(initialAppearanceFields.hair ?? "");
  const [eyes, setEyes] = useState(initialAppearanceFields.eyes ?? "");
  const [distinguishing, setDistinguishing] = useState(
    initialAppearanceFields.distinguishing_features ?? "",
  );
  const [clothing, setClothing] = useState(initialAppearanceFields.clothing_style ?? "");
  const [background, setBackground] = useState(initialBackground);
  const [style, setStyle] = useState<ArtStyle>("Fantasy Portrait");
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAnyAppearance =
    !!(ageBuild.trim() || hair.trim() || eyes.trim() || distinguishing.trim() || clothing.trim());

  const generate = useCallback(async () => {
    setError(null);
    setGenerating(true);
    setImageUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-entity-image", {
        body: {
          entity_id: entityId,
          project_id: projectId,
          appearance: {
            age_build: ageBuild,
            hair,
            eyes,
            distinguishing_features: distinguishing,
            clothing_style: clothing,
          },
          background,
          art_style: style,
        },
      });
      if (error) throw error;
      const url = data?.image_url ?? data?.imageUrl;
      if (!url) throw new Error("No image returned");
      setImageUrl(url);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [entityId, projectId, ageBuild, hair, eyes, distinguishing, clothing, background, style]);

  const handleUse = useCallback(async () => {
    if (!imageUrl) return;
    setSaving(true);
    try {
      await onUseImage(imageUrl);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [imageUrl, onUseImage, onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Sparkles size={14} className="text-gold" />
            Generate Cover Image
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dimmed hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
          {imageUrl ? (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-border bg-fyrescribe-hover">
                <img src={imageUrl} alt="Generated preview" className="w-full h-auto block" />
              </div>
              <p className="text-[11px] text-text-dimmed">
                Preview only — choose to use this image or try another generation.
              </p>
            </div>
          ) : (
            <>
              {/* Appearance (primary) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest text-gold/90 font-medium">
                    Appearance
                  </span>
                </div>

                <div>
                  <label className={labelCls}>Age &amp; Build</label>
                  <input
                    type="text"
                    value={ageBuild}
                    onChange={(e) => setAgeBuild(e.target.value)}
                    placeholder="e.g. late 30s, tall and lean"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Hair</label>
                  <input
                    type="text"
                    value={hair}
                    onChange={(e) => setHair(e.target.value)}
                    placeholder="e.g. long black hair, braided"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Eyes</label>
                  <input
                    type="text"
                    value={eyes}
                    onChange={(e) => setEyes(e.target.value)}
                    placeholder="e.g. piercing green eyes"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Distinguishing Features</label>
                  <input
                    type="text"
                    value={distinguishing}
                    onChange={(e) => setDistinguishing(e.target.value)}
                    placeholder="e.g. scar across left cheek"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Clothing / Style</label>
                  <input
                    type="text"
                    value={clothing}
                    onChange={(e) => setClothing(e.target.value)}
                    placeholder="e.g. weathered leather armor"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Background (secondary) */}
              <div className="pt-1 border-t border-border/60">
                <label className="block text-[10px] uppercase tracking-widest text-text-dimmed/80 mt-3 mb-1.5">
                  Background / Setting
                </label>
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  rows={2}
                  placeholder="e.g. moonlit forest, mist rising"
                  className="w-full bg-fyrescribe-hover/60 border border-border/60 rounded-lg px-3 py-2 text-xs text-text-secondary outline-none focus:border-gold/30 focus:text-foreground placeholder:text-text-dimmed resize-none"
                />
              </div>

              {/* Art style */}
              <div>
                <label className={labelCls}>Art Style</label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as ArtStyle)}
                  className={inputCls}
                >
                  {ART_STYLES.map((s) => (
                    <option key={s} value={s} className="bg-fyrescribe-raised">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-5">
          {imageUrl ? (
            <>
              <button
                onClick={generate}
                disabled={generating || saving}
                className="flex-1 py-2 bg-fyrescribe-hover border border-border text-foreground text-sm font-medium rounded-lg hover:border-gold/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin" /> Generating…</>
                ) : (
                  <><RefreshCw size={14} /> Try again</>
                )}
              </button>
              <button
                onClick={handleUse}
                disabled={generating || saving}
                className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving…</>
                ) : (
                  <><Check size={14} /> Use this image</>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={generating}
                className="flex-1 py-2 bg-transparent border border-border text-text-secondary text-sm rounded-lg hover:text-foreground hover:border-text-dimmed transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={generating || (!hasAnyAppearance && !background.trim())}
                className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles size={14} /> Generate</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateImageModal;
