import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, X, Link2 } from "lucide-react";
import { CATEGORY_COLORS, capitalize, notifyLoreInboxChanged } from "./shared";

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

const confidenceColor = (c: number) => {
  if (c >= 9) return "text-gold-bright";
  if (c >= 7) return "text-gold/80";
  return "text-text-dimmed";
};

const EntityLine = ({ entity }: { entity: EntityRef }) => (
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium text-foreground">{entity.name}</span>
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
        CATEGORY_COLORS[entity.category] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {capitalize(entity.category)}
    </span>
  </div>
);

/** Suggested relationships between lore entries (from Sync Connections / link-lore). */
const ConnectionsTab = ({ projectId, refreshKey }: { projectId: string; refreshKey: number }) => {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<SuggestedLink[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("lore_link_suggestions")
      .select(
        "id, relationship, confidence, entity_a:entities!entity_a_id(id, name, category), entity_b:entities!entity_b_id(id, name, category)",
      )
      .eq("project_id", projectId)
      .eq("status", "pending")
      .order("confidence", { ascending: false });
    if (error) console.error("Failed to load connection suggestions:", error);
    else setSuggestions((data ?? []) as unknown as SuggestedLink[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const removeLocal = (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    notifyLoreInboxChanged();
  };

  const handleAccept = async (s: SuggestedLink) => {
    setBusyId(s.id);
    try {
      const { error: insertErr } = await supabase.from("entity_links").insert({
        entity_a_id: s.entity_a.id,
        entity_b_id: s.entity_b.id,
        relationship: s.relationship,
      });
      if (insertErr) {
        console.error("Failed to accept connection:", insertErr);
        return;
      }
      await supabase.from("lore_link_suggestions").update({ status: "accepted" }).eq("id", s.id);
      removeLocal(s.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (s: SuggestedLink) => {
    setBusyId(s.id);
    try {
      const { error } = await supabase
        .from("lore_link_suggestions")
        .update({ status: "dismissed" })
        .eq("id", s.id);
      if (error) console.error("Failed to dismiss connection:", error);
      else removeLocal(s.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptAll = async () => {
    if (suggestions.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const rows = suggestions.map((s) => ({
        entity_a_id: s.entity_a.id,
        entity_b_id: s.entity_b.id,
        relationship: s.relationship,
      }));
      const { error: insertErr } = await supabase.from("entity_links").insert(rows);
      if (insertErr) {
        console.error("Bulk accept insert failed:", insertErr);
        return;
      }
      const { error: updateErr } = await supabase
        .from("lore_link_suggestions")
        .update({ status: "accepted" })
        .in("id", suggestions.map((s) => s.id));
      if (updateErr) console.error("Bulk accept status update failed:", updateErr);
      setSuggestions([]);
      notifyLoreInboxChanged();
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-text-dimmed" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-20">
        <Link2 size={32} className="text-text-dimmed mx-auto mb-4" />
        <p className="text-text-secondary text-sm mb-1">No connections to review</p>
        <p className="text-text-dimmed text-[12px]">
          Use <span className="text-text-secondary">Sync Connections</span> in the sidebar to find relationships between your lore
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-4">
        <span className="text-[12px] text-text-dimmed">{suggestions.length} pending</span>
        {suggestions.length > 1 && (
          <button
            onClick={handleAcceptAll}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-40 transition-colors"
          >
            {bulkBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Accept all
          </button>
        )}
      </div>
      <div className="space-y-3">
        {suggestions.map((s) => {
          const isBusy = busyId === s.id;
          return (
            <div key={s.id} className="bg-fyrescribe-raised border border-border rounded-lg p-4">
              <div className="mb-2">
                <EntityLine entity={s.entity_a} />
              </div>
              <div className="flex items-center gap-2 mb-2 pl-2">
                <span className="text-text-dimmed text-xs">↳</span>
                <span className="flex-1 text-xs text-gold italic">{s.relationship}</span>
                <span className={`text-[10px] font-mono ${confidenceColor(s.confidence)}`}>
                  {s.confidence}/10
                </span>
              </div>
              <div className="mb-3">
                <EntityLine entity={s.entity_b} />
              </div>
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
    </div>
  );
};

export default ConnectionsTab;
