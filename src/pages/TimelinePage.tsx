import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import ModalSelect from "@/components/ModalSelect";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { Plus, Loader2, Sparkles, Trash2, Check } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TimelineEventType = Database["public"]["Enums"]["timeline_event_type"];

interface TimelineEvent {
  id: string;
  label: string;
  date_label: string | null;
  date_sort: number | null;
  type: TimelineEventType;
  project_id: string;
  entity_id: string | null;
  significance_score: number | null;
}

const ERA_OPTIONS = [
  { label: "Ancient Times", sort: 100 },
  { label: "Distant Past", sort: 200 },
  { label: "Generations Ago", sort: 300 },
  { label: "Years Ago", sort: 400 },
  { label: "Recent Past", sort: 500 },
  { label: "Present Day", sort: 600 },
] as const;

// ─── Add Event Modal ─────────────────────────────────────────────────

interface AddEventModalProps {
  projectId: string;
  onCreated: (event: TimelineEvent) => void;
  onClose: () => void;
}

const AddEventModal = ({ projectId, onCreated, onClose }: AddEventModalProps) => {
  const [label, setLabel] = useState("");
  const [dateLabel, setDateLabel] = useState<string>(ERA_OPTIONS[0].label);
  const [type, setType] = useState<TimelineEventType>("story_event");
  const [createEntity, setCreateEntity] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);

    // Insert timeline event
    const { data: eventData, error: eventError } = await supabase
      .from("timeline_events")
      .insert({
        label: trimmed,
        date_label: dateLabel || null,
        date_sort: ERA_OPTIONS.find((o) => o.label === dateLabel)?.sort ?? 0,
        type,
        project_id: projectId,
        significance_score: 10,
      })
      .select("*")
      .single();

    if (eventError) {
      console.error("Failed to create timeline event:", eventError);
      setSaving(false);
      return;
    }

    // Also create a corresponding "events" entity and link it back
    if (createEntity) {
      const fields: Record<string, string> = {
        "Date/Era": dateLabel,
        "Location": "",
        "Key Participants": "",
        "Outcome": "",
        "First Mentioned": "",
      };

      const sections: Record<string, string> = {
        Overview: "",
        "Key Figures": "",
        Consequences: "",
      };

      const { data: entityData, error: entityError } = await supabase
        .from("entities")
        .insert({
          name: trimmed,
          category: "events" as Database["public"]["Enums"]["entity_category"],
          project_id: projectId,
          summary: dateLabel ? `Event occurring in the ${dateLabel}` : null,
          fields,
          sections,
        })
        .select("id")
        .single();

      if (entityError) {
        console.error("Failed to create entity for timeline event:", entityError);
        // Non-blocking — the timeline event was still created
      } else if (entityData) {
        await supabase
          .from("timeline_events")
          .update({ entity_id: entityData.id })
          .eq("id", eventData.id);
        (eventData as TimelineEvent).entity_id = entityData.id;
      }
    }

    onCreated(eventData as TimelineEvent);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl"
      >
        <h2 className="font-display text-base text-foreground mb-5">Add Event</h2>

        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Event Name
          </label>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. The Fall of Eldrath"
            className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed"
          />
        </div>

        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Date / Era
          </label>
          <ModalSelect
            value={dateLabel}
            onChange={(e) => setDateLabel(e.target.value)}
          >
            {ERA_OPTIONS.map((era) => (
              <option key={era.label} value={era.label}>
                {era.label}
              </option>
            ))}
          </ModalSelect>
        </div>

        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Type
          </label>
          <ModalSelect
            value={type}
            onChange={(e) => setType(e.target.value as TimelineEventType)}
          >
            <option value="story_event">Story Event</option>
            <option value="world_history">World History</option>
          </ModalSelect>
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createEntity}
              onChange={(e) => setCreateEntity(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-gold cursor-pointer"
            />
            <span className="text-xs text-text-secondary">
              Also create an Events lore entry
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!label.trim() || saving}
            className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Add Event"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

// ─── Timeline Page ───────────────────────────────────────────────────

const TimelinePage = () => {
  const { activeProject } = useActiveProject();
  const [filter, setFilter] = useState<"all" | TimelineEventType>("all");
  const [majorOnly, setMajorOnly] = useState(true);
  const MAJOR_THRESHOLD = 9;
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Drag-and-drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "above" | "below" } | null>(null);

  const toggleSelectEvent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      await supabase.from("timeline_events").delete().eq("id", id);
    }
    setEvents((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
    setBulkBusy(false);
  };

  useEffect(() => {
    if (!activeProject) return;
    const fetchEvents = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("project_id", activeProject.id)
        .order("date_sort", { ascending: true, nullsFirst: false });
      if (error) console.error("Failed to fetch timeline events:", error);
      setEvents((data as TimelineEvent[]) || []);
      setLoading(false);
    };
    fetchEvents();
  }, [activeProject]);

  const filtered = events
    .filter((e) => filter === "all" || e.type === filter)
    .filter((e) => !majorOnly || (e.significance_score ?? 5) >= MAJOR_THRESHOLD);

  const handleGenerate = async () => {
    if (!activeProject) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-timeline", {
        body: { project_id: activeProject.id },
      });
      if (error) {
        setGenerateError("Generation failed. Check that ANTHROPIC_API_KEY is set in your Supabase Edge Function secrets.");
        return;
      }
      if (data?.events) {
        setEvents((prev) => {
          const newIds = new Set((data.events as TimelineEvent[]).map((e) => e.id));
          const merged = [...prev.filter((e) => !newIds.has(e.id)), ...data.events];
          return merged.sort((a, b) => (a.date_sort ?? 0) - (b.date_sort ?? 0));
        });
      }
    } catch (err) {
      setGenerateError(String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    const { error } = await supabase.from("timeline_events").delete().eq("id", id);
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleEventCreated = (event: TimelineEvent) => {
    setEvents((prev) => {
      const merged = [...prev, event];
      return merged.sort((a, b) => (a.date_sort ?? 0) - (b.date_sort ?? 0));
    });
    setShowAddModal(false);
  };

  // ─── Drag-and-drop handlers ─────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image slightly transparent
    const el = e.currentTarget as HTMLElement;
    setTimeout(() => el.style.opacity = "0.4", 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDragId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragId || dragId === targetId) {
      setDropTarget(null);
      return;
    }
    // Determine above/below based on mouse position within the card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "above" : "below";
    setDropTarget({ id: targetId, position });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId || !dropTarget) {
      setDragId(null);
      setDropTarget(null);
      return;
    }

    const currentList = [...filtered];
    const dragIndex = currentList.findIndex((ev) => ev.id === dragId);
    const targetIndex = currentList.findIndex((ev) => ev.id === targetId);
    if (dragIndex === -1 || targetIndex === -1) return;

    // Calculate the insertion index
    const insertIndex = dropTarget.position === "above" ? targetIndex : targetIndex + 1;

    // Remove dragged item and insert at new position
    const dragged = currentList[dragIndex];
    const withoutDragged = currentList.filter((_, i) => i !== dragIndex);
    const adjustedInsert = insertIndex > dragIndex ? insertIndex - 1 : insertIndex;
    withoutDragged.splice(adjustedInsert, 0, dragged);

    // Calculate new date_sort: interpolate between neighbors
    const prev = adjustedInsert > 0 ? withoutDragged[adjustedInsert - 1] : null;
    const next = adjustedInsert < withoutDragged.length - 1 ? withoutDragged[adjustedInsert + 1] : null;

    let newDateSort: number;
    if (prev && next) {
      newDateSort = Math.round(((prev.date_sort ?? 0) + (next.date_sort ?? 0)) / 2);
      // If same value (events in same timeframe), just use the value — they share the slot
      if (newDateSort === (prev.date_sort ?? 0)) {
        newDateSort = (prev.date_sort ?? 0);
      }
    } else if (prev) {
      newDateSort = (prev.date_sort ?? 0) + 1;
    } else if (next) {
      newDateSort = (next.date_sort ?? 0) - 1;
    } else {
      newDateSort = 0;
    }

    // Optimistic update
    const updatedDragged = { ...dragged, date_sort: newDateSort };
    const newEvents = events.map((ev) =>
      ev.id === dragId ? updatedDragged : ev
    ).sort((a, b) => (a.date_sort ?? 0) - (b.date_sort ?? 0));
    setEvents(newEvents);

    setDragId(null);
    setDropTarget(null);

    // Persist
    await supabase
      .from("timeline_events")
      .update({ date_sort: newDateSort })
      .eq("id", dragId);
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">
            Timeline
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating || !activeProject}
              className="flex items-center gap-2 px-3 py-1.5 bg-fyrescribe-raised border border-border text-sm text-text-secondary hover:text-foreground hover:border-gold/30 rounded-lg transition-colors disabled:opacity-50"
            >
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generating ? "Generating…" : "Generate from Lore"}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              disabled={!activeProject}
              className="flex items-center gap-2 px-3 py-1.5 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50"
            >
              <Plus size={14} />
              Add Event
            </button>
          </div>
        </div>

        {generateError && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
            {generateError}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-40 transition-colors"
            >
              {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Selected ({selectedIds.size})
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-[12px] rounded-md text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="flex items-center mb-8">
          <div className="flex gap-2">
            {(["all", "world_history", "story_event"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  filter === type
                    ? "border-gold text-gold bg-gold-glow"
                    : "border-border text-text-secondary hover:text-foreground"
                }`}
              >
                {type === "all"
                  ? "All"
                  : type === "world_history"
                  ? "World History"
                  : "Story Events"}
              </button>
            ))}
            <button
              onClick={() => setMajorOnly((v) => !v)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                majorOnly
                  ? "border-gold text-gold bg-gold-glow"
                  : "border-border text-text-secondary hover:text-foreground"
              }`}
            >
              Major events
            </button>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-text-dimmed" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
            <p className="text-text-secondary text-sm mb-1">No timeline events yet</p>
            <p className="text-text-dimmed text-xs mb-6">
              {majorOnly && events.length > 0
                ? `No major events (score 9+). Toggle "All events" to see everything.`
                : `Add events manually or click "Generate from Lore" to build the timeline from your world-building entities and manuscript scenes.`}
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Central axis */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-6">
              {filtered.map((event, i) => (
                <div
                  key={event.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, event.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, event.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, event.id)}
                  className={`relative pl-12 animate-fade-in group cursor-grab active:cursor-grabbing ${
                    dragId === event.id ? "opacity-40" : ""
                  }`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {/* Drop indicator — above */}
                  {dropTarget?.id === event.id && dropTarget.position === "above" && (
                    <div className="absolute -top-3 left-12 right-0 h-0.5 bg-gold rounded-full shadow-[0_0_6px_hsl(var(--gold))]" />
                  )}

                  {/* Dot */}
                  <div
                    className={`absolute left-[14px] top-3 w-3 h-3 rounded-full border-2 ${
                      event.type === "world_history"
                        ? "border-gold bg-gold/30"
                        : "border-blue-400 bg-blue-400/30"
                    }`}
                  />

                  <div className={`bg-fyrescribe-raised border rounded-lg p-4 transition-colors ${
                    dropTarget?.id === event.id
                      ? "border-gold/40"
                      : "border-border hover:border-gold/20"
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-text-dimmed text-xs">
                            {event.date_label ?? "—"}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              event.type === "world_history"
                                ? "bg-gold/10 text-gold"
                                : "bg-blue-500/20 text-blue-300"
                            }`}
                          >
                            {event.type === "world_history" ? "World History" : "Story Event"}
                          </span>
                          {event.significance_score != null && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                                event.significance_score >= 8
                                  ? "bg-gold/10 text-gold"
                                  : event.significance_score >= 5
                                  ? "bg-fyrescribe-hover text-text-secondary"
                                  : "bg-fyrescribe-hover text-text-dimmed"
                              }`}
                              title="Significance score"
                            >
                              {event.significance_score}/10
                            </span>
                          )}
                        </div>
                        <h3 className="font-display text-sm text-foreground">
                          {event.label}
                        </h3>
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-text-dimmed hover:text-red-400 transition-all flex-shrink-0"
                        title="Delete event"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div
                      className="flex items-center justify-end gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={selectedIds.has(event.id) ? { opacity: 1 } : undefined}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelectEvent(event.id); }}
                        className={`flex items-center gap-1.5 cursor-pointer px-1.5 py-0.5 rounded border transition-colors ${
                          selectedIds.has(event.id)
                            ? "bg-gold/10 border-gold/30 text-gold-bright"
                            : "border-transparent text-text-dimmed hover:text-destructive hover:bg-destructive/5 hover:border-destructive/20"
                        }`}
                      >
                        <span className="text-[10px]">delete</span>
                        <span
                          className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-colors flex-shrink-0 ${
                            selectedIds.has(event.id) ? "bg-gold border-gold" : "border-current"
                          }`}
                        >
                          {selectedIds.has(event.id) && <Check size={10} className="text-fyrescribe-raised" strokeWidth={3} />}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Drop indicator — below */}
                  {dropTarget?.id === event.id && dropTarget.position === "below" && (
                    <div className="absolute -bottom-3 left-12 right-0 h-0.5 bg-gold rounded-full shadow-[0_0_6px_hsl(var(--gold))]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Event Modal */}
      {showAddModal && activeProject && (
        <AddEventModal
          projectId={activeProject.id}
          onCreated={handleEventCreated}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </AppLayout>
  );
};

export default TimelinePage;
