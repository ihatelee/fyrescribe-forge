import { useState } from "react";
import { Check, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";

export interface NewMention {
  /** mention_suggestions.id (when persisted) */
  id?: string;
  entity_id: string;
  entity_name: string;
  scene_id: string;
  scene_title: string;
  context: string;
  position: number;
}

interface SyncMentionsModalProps {
  projectId: string;
  mentions: NewMention[];
  onClose: () => void;
}

const SyncMentionsModal = ({ projectId, mentions, onClose }: SyncMentionsModalProps) => {
  const { icons } = useTheme();
  const SyncIcon = icons.sync;

  // Local state so rejecting a mention immediately removes it from the list.
  const [items, setItems] = useState<NewMention[]>(mentions);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const handleReject = async (m: NewMention) => {
    const key = `${m.entity_id}:${m.scene_id}:${m.context}`;
    setRejecting(key);
    try {
      // 1. Mark the suggestion rejected (drops it from inbox count)
      // 2. Persist a long-term rejection so future syncs don't resurface it
      // 3. Remove the live mention so it stops counting toward the entity
      const ops: Promise<unknown>[] = [
        supabase.from("rejected_mentions").upsert(
          {
            project_id: projectId,
            entity_id: m.entity_id,
            scene_id: m.scene_id,
            context: m.context,
          },
          { onConflict: "project_id,entity_id,scene_id,context" },
        ),
        supabase
          .from("entity_mentions")
          .delete()
          .eq("project_id", projectId)
          .eq("entity_id", m.entity_id)
          .eq("scene_id", m.scene_id)
          .eq("context", m.context),
      ];
      if (m.id) {
        ops.push(
          supabase
            .from("mention_suggestions")
            .update({ status: "rejected", reviewed_at: new Date().toISOString() })
            .eq("id", m.id),
        );
      }
      await Promise.all(ops);
      setItems((prev) =>
        prev.filter(
          (x) =>
            !(
              x.entity_id === m.entity_id &&
              x.scene_id === m.scene_id &&
              x.context === m.context
            ),
        ),
      );
    } finally {
      setRejecting(null);
    }
  };

  // Closing the modal accepts all remaining (matches existing UX).
  const handleClose = async () => {
    if (closing) return;
    const ids = items.map((m) => m.id).filter((v): v is string => Boolean(v));
    if (ids.length > 0) {
      setClosing(true);
      try {
        await supabase
          .from("mention_suggestions")
          .update({ status: "accepted", reviewed_at: new Date().toISOString() })
          .in("id", ids);
      } finally {
        setClosing(false);
      }
    }
    onClose();
  };

  // Group by entity name
  const grouped = items.reduce<Record<string, NewMention[]>>((acc, m) => {
    (acc[m.entity_name] ??= []).push(m);
    return acc;
  }, {});

  const entityNames = Object.keys(grouped).sort();

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <SyncIcon size={16} weight="duotone" className="text-gold" />
            <h2 className="font-display text-base text-foreground">New Mentions</h2>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-text-dimmed">
            {items.length} new
          </span>
          <div className="flex items-center gap-1">
            {items.length > 1 && (
              <button
                onClick={handleClose}
                title="Accept all mentions and close"
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 transition-colors"
              >
                <Check size={11} />
                Accept all
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
              <p className="text-sm text-text-secondary mb-1">No new mentions found</p>
              <p className="text-xs text-text-dimmed">
                Your manuscript hasn't gained any new entity references since the last sync.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {entityNames.map((name) => (
                <div key={name}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground">{name}</span>
                    <span className="text-[10px] text-text-dimmed">
                      {grouped[name].length} mention{grouped[name].length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {grouped[name].map((m, i) => {
                      const key = `${m.entity_id}:${m.scene_id}:${m.context}`;
                      const isRejecting = rejecting === key;
                      return (
                        <div
                          key={`${m.scene_id}-${m.position}-${i}`}
                          className="bg-fyrescribe-base border border-border rounded-lg p-3 group relative"
                        >
                          <button
                            onClick={() => handleReject(m)}
                            disabled={isRejecting}
                            title="Reject this mention"
                            className="absolute top-2 right-2 p-1 rounded-md text-text-dimmed opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-fyrescribe-hover transition-all disabled:opacity-40"
                          >
                            <X size={12} />
                          </button>
                          <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1 pr-6">
                            {m.scene_title}
                          </div>
                          <p className="text-xs text-text-secondary italic leading-relaxed pr-6">
                            …{m.context}…
                          </p>
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

export default SyncMentionsModal;
