import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Loader2, Check, X } from "lucide-react";

interface EntityRef {
  id: string;
  name: string;
  category: string;
}

interface SuggestedLink {
  id: string;
  entity_a: EntityRef;
  entity_b: EntityRef;
  relationship: string;
  confidence: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  characters: "bg-blue-500/20 text-blue-300",
  places: "bg-green-500/20 text-green-300",
  events: "bg-orange-500/20 text-orange-300",
  history: "bg-amber-500/20 text-amber-300",
  artifacts: "bg-purple-500/20 text-purple-300",
  creatures: "bg-red-500/20 text-red-300",
  magic: "bg-cyan-500/20 text-cyan-300",
  factions: "bg-yellow-500/20 text-yellow-300",
  doctrine: "bg-pink-500/20 text-pink-300",
};

interface LinkLoreModalProps {
  projectId: string;
  onClose: () => void;
}

const LinkLoreModal = ({ projectId, onClose }: LinkLoreModalProps) => {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestedLink[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reviewedCount = totalCount - suggestions.length;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("lore_link_suggestions")
        .select(
          "id, relationship, confidence, entity_a:entity_a_id(id, name, category), entity_b:entity_b_id(id, name, category)",
        )
        .eq("project_id", projectId)
        .eq("status", "pending")
        .order("confidence", { ascending: false });

      if (!error && data) {
        const mapped: SuggestedLink[] = (data as any[]).map((row) => ({
          id: row.id,
          entity_a: row.entity_a,
          entity_b: row.entity_b,
          relationship: row.relationship,
          confidence: row.confidence,
        }));
        setSuggestions(mapped);
        setTotalCount(mapped.length);
      }
      setLoading(false);
    };
    load();
  }, [projectId]);

  const handleAccept = async (suggestion: SuggestedLink) => {
    setBusyId(suggestion.id);
    await supabase.from("entity_links").insert({
      entity_a_id: suggestion.entity_a.id,
      entity_b_id: suggestion.entity_b.id,
      relationship: suggestion.relationship,
    });
    await supabase
      .from("lore_link_suggestions")
      .update({ status: "accepted" })
      .eq("id", suggestion.id);
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    setBusyId(null);
  };

  const handleDismiss = async (suggestion: SuggestedLink) => {
    setBusyId(suggestion.id);
    await supabase
      .from("lore_link_suggestions")
      .update({ status: "dismissed" })
      .eq("id", suggestion.id);
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    setBusyId(null);
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const confidenceColor = (c: number) => {
    if (c >= 9) return "text-gold-bright";
    if (c >= 7) return "text-gold/80";
    return "text-text-dimmed";
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-gold" />
            <h2 className="font-display text-base text-foreground">Link Lore</h2>
          </div>
          {!loading && totalCount > 0 && (
            <span className="text-[10px] uppercase tracking-widest text-text-dimmed">
              {reviewedCount} of {totalCount} reviewed
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="animate-spin text-gold" />
              <p className="text-sm text-text-secondary">Loading suggestions…</p>
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="text-center py-8">
              <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
              {totalCount > 0 ? (
                <>
                  <p className="text-sm text-text-secondary mb-1">All suggestions reviewed!</p>
                  <p className="text-xs text-text-dimmed">Run Link Lore again to find new relationships.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-text-secondary mb-1">No pending link suggestions</p>
                  <p className="text-xs text-text-dimmed">
                    Click "Link Lore" in the sidebar to analyse your world.
                  </p>
                </>
              )}
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions.map((s) => {
                const isBusy = busyId === s.id;
                return (
                  <div
                    key={s.id}
                    className="bg-fyrescribe-base border border-border rounded-lg p-4"
                  >
                    {/* Entity A */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-foreground">{s.entity_a.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                          CATEGORY_COLORS[s.entity_a.category] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {capitalize(s.entity_a.category)}
                      </span>
                    </div>

                    {/* Relationship + confidence */}
                    <div className="flex items-center gap-2 mb-2 pl-2">
                      <span className="text-text-dimmed text-xs">↳</span>
                      <span className="flex-1 text-xs text-gold italic">{s.relationship}</span>
                      <span className={`text-[10px] font-mono ${confidenceColor(s.confidence)}`}>
                        {s.confidence}/10
                      </span>
                    </div>

                    {/* Entity B */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-foreground">{s.entity_b.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                          CATEGORY_COLORS[s.entity_b.category] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {capitalize(s.entity_b.category)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(s)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-40 transition-colors"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Accept
                      </button>
                      <button
                        onClick={() => handleDismiss(s)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40 transition-colors"
                      >
                        <X size={12} />
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkLoreModal;
