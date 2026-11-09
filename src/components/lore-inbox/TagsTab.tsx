import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, X, Tag } from "lucide-react";
import { CATEGORY_COLORS, capitalize, notifyLoreInboxChanged } from "./shared";

interface PendingTag {
  id: string;
  entity_id: string;
  entity_name: string;
  entity_category: string;
  field_key: string;
  target_entity_id: string;
  target_entity_name: string;
  target_entity_category: string;
}

const CategoryPill = ({ category }: { category: string }) => (
  <span
    className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
      CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground"
    }`}
  >
    {capitalize(category)}
  </span>
);

/** Structured field suggestions (e.g. "Faction: Silver Wardens") from Sync Tags. */
const TagsTab = ({ projectId, refreshKey }: { projectId: string; refreshKey: number }) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingTag[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("tag_suggestions")
      .select("id, entity_id, entity_category, field_key, target_entity_id, target_entity_category")
      .eq("project_id", projectId)
      .eq("status", "pending");
    if (error) {
      console.error("Failed to load tag suggestions:", error);
      setLoading(false);
      return;
    }
    const ids = [...new Set((rows ?? []).flatMap((r) => [r.entity_id, r.target_entity_id]))];
    const { data: ents } = ids.length
      ? await supabase.from("entities").select("id, name").in("id", ids)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map((ents ?? []).map((e) => [e.id, e.name]));
    setItems(
      (rows ?? []).map((r) => ({
        ...r,
        entity_name: nameById.get(r.entity_id) ?? "Unknown",
        target_entity_name: nameById.get(r.target_entity_id) ?? "Unknown",
      })),
    );
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const removeLocal = (ids: string[]) => {
    setItems((prev) => prev.filter((t) => !ids.includes(t.id)));
    notifyLoreInboxChanged();
  };

  const handleAccept = async (t: PendingTag) => {
    setBusyId(t.id);
    try {
      const { error } = await supabase.from("entity_links").insert({
        entity_a_id: t.entity_id,
        entity_b_id: t.target_entity_id,
        relationship: t.field_key,
      });
      if (error) {
        console.error("Failed to accept tag suggestion:", error);
        return;
      }
      await supabase
        .from("tag_suggestions")
        .update({ status: "accepted", reviewed_at: new Date().toISOString() })
        .eq("id", t.id);
      removeLocal([t.id]);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (t: PendingTag) => {
    setBusyId(t.id);
    try {
      const { error } = await supabase
        .from("tag_suggestions")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) console.error("Failed to reject tag suggestion:", error);
      else removeLocal([t.id]);
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptAll = async () => {
    if (items.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const rows = items.map((t) => ({
        entity_a_id: t.entity_id,
        entity_b_id: t.target_entity_id,
        relationship: t.field_key,
      }));
      const { error: insertErr } = await supabase.from("entity_links").insert(rows);
      if (insertErr) {
        console.error("Failed to bulk-accept tag suggestions:", insertErr);
        return;
      }
      const ids = items.map((t) => t.id);
      await supabase
        .from("tag_suggestions")
        .update({ status: "accepted", reviewed_at: new Date().toISOString() })
        .in("id", ids);
      removeLocal(ids);
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
        <Tag size={32} className="text-text-dimmed mx-auto mb-4" />
        <p className="text-text-secondary text-sm mb-1">No tags to review</p>
        <p className="text-text-dimmed text-[12px]">
          Use <span className="text-text-secondary">Sync Tags</span> in the sidebar to fill in structured fields like faction or home
        </p>
      </div>
    );
  }

  const grouped = items.reduce<Record<string, PendingTag[]>>((acc, t) => {
    (acc[t.entity_name] ??= []).push(t);
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
              <CategoryPill category={grouped[name][0].entity_category} />
              <span className="text-[10px] text-text-dimmed">
                {grouped[name].length} field{grouped[name].length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[name].map((t) => {
                const isBusy = busyId === t.id;
                return (
                  <div key={t.id} className="bg-fyrescribe-raised border border-border rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                      {t.field_key}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm text-foreground">{t.target_entity_name}</span>
                      <CategoryPill category={t.target_entity_category} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(t)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-40 transition-colors"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(t)}
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

export default TagsTab;
