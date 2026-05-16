import { useState, useCallback } from "react";
import { X, Loader2, Sparkles, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ART_STYLES = ["Fantasy Portrait", "Dark Fantasy", "Realistic", "Painterly", "Sketch"] as const;
type ArtStyle = (typeof ART_STYLES)[number];

interface GenerateImageModalProps {
  entityId: string;
  projectId?: string;
  initialAppearance?: string;
  initialSetting?: string;
  onClose: () => void;
  onUseImage: (url: string) => void | Promise<void>;
}

const GenerateImageModal = ({
  entityId,
  projectId,
  initialAppearance = "",
  initialSetting = "",
  onClose,
  onUseImage,
}: GenerateImageModalProps) => {
  const [appearance, setAppearance] = useState(initialAppearance);
  const [setting, setSetting] = useState(initialSetting);
  const [style, setStyle] = useState<ArtStyle>("Fantasy Portrait");
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setError(null);
    setGenerating(true);
    setImageUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-entity-image", {
        body: {
          entity_id: entityId,
          project_id: projectId,
          appearance,
          setting_mood: setting,
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
  }, [entityId, appearance, setting, style]);

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
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
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
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5">
                  Appearance
                </label>
                <textarea
                  value={appearance}
                  onChange={(e) => setAppearance(e.target.value)}
                  rows={3}
                  placeholder="e.g. tall woman with green eyes and black hair, scarred cheek…"
                  className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5">
                  Setting / Mood
                </label>
                <textarea
                  value={setting}
                  onChange={(e) => setSetting(e.target.value)}
                  rows={2}
                  placeholder="e.g. standing in a moonlit forest, mist rising…"
                  className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5">
                  Art Style
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as ArtStyle)}
                  className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40"
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
                disabled={generating || (!appearance.trim() && !setting.trim())}
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
