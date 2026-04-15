import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Loader2, Check, X } from "lucide-react";

interface EntityRef {
  id: string;
  name: string;
  category: string;
}

interface SuggestedLink {
  entity_a: EntityRef;
  entity_b: EntityRef;
  relationship: string;
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
  const [state, setState] = useState<"idle" | "analyzing" | "results" | "error">("idle");
  const [suggestions, setSuggestions] = useState<SuggestedLink[]>([]);
  const [reviewed, setReviewed] = useState<Set<number>>(new Set());
  const [editedRelationships, setEditedRelationships] = useState<Record<number, string>>({});
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const reviewedCount = reviewed.size;
  const totalCount = suggestions.length;

  const handleAnalyze = async () => {
    setState("analyzing");
    setErrorMsg("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setErrorMsg("Not authenticated");
        setState("error");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-lore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ project_id: projectId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Analysis failed");
        setState("error");
        return;
      }

      if (!data.suggestions || data.suggestions.length === 0) {
        setSuggestions([]);
        setState("results");
        return;
      }

      setSuggestions(data.suggestions);
      setReviewed(new Set());
      setEditedRelationships({});
      setState("results");
    } catch (err) {
      console.error("Analyze lore error:", err);
      setErrorMsg("An unexpected error occurred");
      setState("error");
    }
  };

  const handleAccept = async (index: number) => {
    const s = suggestions[index];
    if (!s) return;
    setBusyIndex(index);

    const relationship = editedRelationships[index] ?? s.relationship;

    const { error } = await supabase.from("entity_links").insert({
      entity_a_id: s.entity_a.id,
      entity_b_id: s.entity_b.id,
      relationship,
    });

    if (error) {
      console.error("Failed to create link:", error);
    }

    setReviewed((prev) => new Set(prev).add(index));
    setBusyIndex(null);
  };

  const handleDismiss = (index: number) => {
    setReviewed((prev) => new Set(prev).add(index));
  };

  const handleRelationshipChange = (index: number, value: string) => {
    setEditedRelationships((prev) => ({ ...prev, [index]: value }));
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-gold" />
            <h2 className="font-display text-base text-foreground">Link Lore</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {state === "idle" && (
            <div className="text-center py-8">
              <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                Analyze your world entries to discover relationships between characters, locations, items, and lore.
              </p>
              <button
                onClick={handleAnalyze}
                className="w-full py-2.5 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors"
              >
                Analyze World
              </button>
              <p className="text-[11px] text-text-dimmed mt-3">
                This may take a moment depending on your world's size.
              </p>
            </div>
          )}

          {state === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="animate-spin text-gold" />
              <p className="text-sm text-text-secondary">Analyzing your world…</p>
            </div>
          )}

          {state === "error" && (
            <div className="text-center py-8">
              <p className="text-sm text-destructive mb-4">{errorMsg}</p>
              <button
                onClick={() => setState("idle")}
                className="px-4 py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {state === "results" && suggestions.length === 0 && (
            <div className="text-center py-8">
              <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
              <p className="text-sm text-text-secondary mb-1">No new relationships found</p>
              <p className="text-xs text-text-dimmed">
                All discoverable links may already exist, or more entities are needed.
              </p>
            </div>
          )}

          {state === "results" && suggestions.length > 0 && (
            <div className="space-y-3">
              {/* Counter */}
              <p className="text-[11px] text-text-dimmed mb-4">
                {reviewedCount} of {totalCount} reviewed
              </p>

              {suggestions.map((s, i) => {
                if (reviewed.has(i)) return null;
                const isBusy = busyIndex === i;

                return (
                  <div
                    key={`${s.entity_a.id}-${s.entity_b.id}`}
                    className="bg-fyrescribe-base border border-border rounded-lg p-4 animate-fade-in"
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

                    {/* Relationship */}
                    <div className="flex items-center gap-2 mb-2 pl-2">
                      <span className="text-text-dimmed text-xs">↳</span>
                      <input
                        value={editedRelationships[i] ?? s.relationship}
                        onChange={(e) => handleRelationshipChange(i, e.target.value)}
                        className="flex-1 bg-fyrescribe-hover border border-border rounded px-2 py-1 text-xs text-gold italic outline-none focus:border-gold/40 transition-colors"
                      />
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
                        onClick={() => handleAccept(i)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-40 transition-colors"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Accept
                      </button>
                      <button
                        onClick={() => handleDismiss(i)}
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

              {/* All reviewed */}
              {reviewedCount === totalCount && (
                <div className="text-center py-6">
                  <p className="text-sm text-text-secondary">All suggestions reviewed!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkLoreModal;
