import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, X, AtSign } from "lucide-react";
import { notifyLoreInboxChanged } from "./shared";

interface PendingMention {
  id: string;
  entity_id: string;
  entity_name: string;
  scene_id: string;
  scene_title: string;
  context: string;
  position: number;
}

/**
 * Places an entry is mentioned in the manuscript (from Sync Mentions).
 * Mentions are already live on the entity when found; accepting just marks
 * them reviewed, rejecting removes the mention and stops future syncs
 * from bringing it back.
 */
const MentionsTab = ({ projectId, refreshKey }: { projectId: string; refreshKey: number }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingMention[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("mention_suggestions")
      .select("id, entity_id, scene_id, context, position")
      .eq("project_id", projectId)
      .eq("status", "pending");
    if (error) {
      console.error("Failed to load mention suggestions:", error);
      setLoading(false);
      return;
    }
    const entityIds = [...new Set((rows ?? []).map((r) => r.entity_id))];
    const sceneIds = [...new Set((rows ?? []).map((r) => r.scene_id))];
    const [{ data: ents }, { data: scenes }] = await Promise.all([
      entityIds.length
        ? supabase.from("entities").select("id, name").in("id", entityIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      sceneIds.length
        ? supabase.from("scenes").select("id, title").in("id", sceneIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const nameById = new Map((ents ?? []).map((e) => [e.id, e.name]));
    const titleById = new Map((scenes ?? []).map((s) => [s.id, s.title]));
    setItems(
      (rows ?? []).map((r) => ({
        id: r.id,
        entity_id: r.entity_id,
        entity_name: nameById.get(r.entity_id) ?? "Unknown",
        scene_id: r.scene_id,
        scene_title: titleById.get(r.scene_id) ?? "Untitled scene",
        context: r.context,
        position: r.position ?? 0,
      })),
    );
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const removeLocal = (ids: string[]) => {
    setItems((prev) => prev.filter((m) => !ids.includes(m.id)));
    notifyLoreInboxChanged();
  };

  const handleAccept = async (m: PendingMention) => {
    setBusyId(m.id);
    try {
      const { error } = await supabase
        .from("mention_suggestions")
        .update({ status: "accepted", reviewed_at: new Date().toISOString() })
        .eq("id", m.id);
      if (error) console.error("Failed to accept mention:", error);
      else removeLocal([m.id]);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (m: PendingMention) => {
    setBusyId(m.id);
    try {
      // 1. Persist a long-term rejection so future syncs don't resurface it
      // 2. Remove the live mention so it stops counting toward the entity
      // 3. Mark the suggestion rejected (drops it from the inbox count)
      await supabase.from("rejected_mentions").upsert(
        { project_id: projectId, entity_id: m.entity_id, scene_id: m.scene_id, context: m.context },
        { onConflict: "project_id,entity_id,scene_id,context" },
      );
      await supabase
        .from("entity_mentions")
        .delete()
        .eq("project_id", projectId)
        .eq("entity_id", m.entity_id)
        .eq("scene_id", m.scene_id)
        .eq("context", m.context);
      const { error } = await supabase
        .from("mention_suggestions")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", m.id);
      if (error) console.error("Failed to reject mention:", error);
      else removeLocal([m.id]);
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptAll = async () => {
    if (items.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const ids = items.map((m) => m.id);
      const { error } = await supabase
        .from("mention_suggestions")
        .update({ status: "accepted", reviewed_at: new Date().toISOString() })
        .in("id", ids);
      if (error) console.error("Failed to accept all mentions:", error);
      else removeLocal(ids);
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

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <AtSign size={32} className="text-text-dimmed mx-auto mb-4" />
        <p className="text-text-secondary text-sm mb-1">No mentions to review</p>
        <p className="text-text-dimmed text-[12px]">
          Use <span className="text-text-secondary">Sync Mentions</span> in the sidebar to find where your lore appears in the manuscript
        </p>
      </div>
    );
  }

  const grouped = items.reduce<Record<string, PendingMention[]>>((acc, m) => {
    (acc[m.entity_name] ??= []).push(m);
    return acc;
  }, {});
  const entityNames = Object.keys(grouped).sort();

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-4">
        <span className="text-[12px] text-text-dimmed">{items.length} pending</span>
        {items.length > 1 && (
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
              {grouped[name].map((m) => {
                const isBusy = busyId === m.id;
                return (
                  <div key={m.id} className="bg-fyrescribe-raised border border-border rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                      {m.scene_title}
                    </div>
                    <p className="text-xs text-text-secondary italic leading-relaxed mb-3">…{m.context}…</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(m)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-40 transition-colors"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(m)}
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
    </div>
  );
};

export default MentionsTab;
