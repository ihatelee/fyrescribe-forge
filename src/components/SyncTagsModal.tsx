import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";

export interface TagSuggestion {
  entity_id: string;
  entity_name: string;
  entity_category: string;
  field_key: string;
  target_entity_id: string;
  target_entity_name: string;
  target_entity_category: string;
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface SyncTagsModalProps {
  suggestions: TagSuggestion[];
  onClose: () => void;
}

const SyncTagsModal = ({ suggestions, onClose }: SyncTagsModalProps) => {
  const { icons } = useTheme();
  const SyncIcon = icons.sync;

  const [items, setItems] = useState<TagSuggestion[]>(suggestions);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const keyOf = (s: TagSuggestion) => `${s.entity_id}:${s.field_key}`;

  const remove = (s: TagSuggestion) =>
    setItems((prev) => prev.filter((x) => keyOf(x) !== keyOf(s)));

  const handleAccept = async (s: TagSuggestion) => {
    setBusyKey(keyOf(s));
    try {
      const { error } = await supabase.from("entity_links").insert({
        entity_a_id: s.entity_id,
        entity_b_id: s.target_entity_id,
        relationship: s.field_key,
      });
      if (error) {
        console.error("Failed to accept tag suggestion:", error);
      } else {
        remove(s);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleReject = (s: TagSuggestion) => {
    // Tag suggestions are stateless — rejecting just removes locally.
    // If the user runs Sync Tags again the AI may resurface it.
    remove(s);
  };

  const handleAcceptAll = async () => {
    if (items.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const rows = items.map((s) => ({
        entity_a_id: s.entity_id,
        entity_b_id: s.target_entity_id,
        relationship: s.field_key,
      }));
      const { error } = await supabase.from("entity_links").insert(rows);
      if (error) {
        console.error("Failed to bulk-accept tag suggestions:", error);
      } else {
        setItems([]);
      }
    } finally {
      setBulkBusy(false);
    }
  };

  // Group by source entity
  const grouped = items.reduce<Record<string, TagSuggestion[]>>((acc, s) => {
    (acc[s.entity_name] ??= []).push(s);
    return acc;
  }, {});
  const entityNames = Object.keys(grouped).sort();

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SyncIcon size={16} weight="duotone" className="text-gold" />
            <h2 className="font-display text-base text-foreground">Suggested Tags</h2>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-text-dimmed">
            {items.length} suggested
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
              <p className="text-sm text-text-secondary mb-1">No new tag suggestions</p>
              <p className="text-xs text-text-dimmed">
                The AI couldn't find clear evidence to fill any structured fields.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {entityNames.map((name) => (
                <div key={name}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground">{name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                        CATEGORY_COLORS[grouped[name][0].entity_category] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {capitalize(grouped[name][0].entity_category)}
                    </span>
                    <span className="text-[10px] text-text-dimmed">
                      {grouped[name].length} field
                      {grouped[name].length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {grouped[name].map((s) => {
                      const k = keyOf(s);
                      const isBusy = busyKey === k;
                      return (
                        <div
                          key={k}
                          className="bg-fyrescribe-base border border-border rounded-lg p-3"
                        >
                          <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                            {s.field_key}
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm text-foreground">
                              {s.target_entity_name}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                                CATEGORY_COLORS[s.target_entity_category] ??
                                "bg-muted text-muted-foreground"
                              }`}
                            >
                              {capitalize(s.target_entity_category)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAccept(s)}
                              disabled={isBusy}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-40 transition-colors"
                            >
                              {isBusy ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Check size={12} />
                              )}
                              Accept
                            </button>
                            <button
                              onClick={() => handleReject(s)}
                              disabled={isBusy}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40 transition-colors"
                            >
                              <X size={12} />
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SyncTagsModal;
