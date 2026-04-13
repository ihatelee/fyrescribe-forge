import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { Plus, Loader2, Sparkles, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type TimelineEventType = Database["public"]["Enums"]["timeline_event_type"];

interface TimelineEvent {
  id: string;
  label: string;
  date_label: string | null;
  date_sort: number | null;
  type: TimelineEventType;
  project_id: string;
}

const TimelinePage = () => {
  const { activeProject } = useActiveProject();
  const [filter, setFilter] = useState<"all" | TimelineEventType>("all");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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

  const filtered =
    filter === "all" ? events : events.filter((e) => e.type === filter);

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

        <div className="flex gap-2 mb-8">
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
              Add events manually or click "Generate from Lore" to build the timeline from your world-building entities and manuscript scenes.
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
                  className="relative pl-12 animate-fade-in group"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {/* Dot */}
                  <div
                    className={`absolute left-[14px] top-3 w-3 h-3 rounded-full border-2 ${
                      event.type === "world_history"
                        ? "border-gold bg-gold/30"
                        : "border-blue-400 bg-blue-400/30"
                    }`}
                  />

                  <div className="bg-fyrescribe-raised border border-border rounded-lg p-4 hover:border-gold/20 transition-colors">
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
                      <label className="flex items-center gap-1.5 cursor-pointer text-text-dimmed hover:text-destructive transition-colors">
                        <span className="text-[10px]">delete</span>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(event.id)}
                          onChange={() => toggleSelectEvent(event.id)}
                          className="w-3.5 h-3.5 rounded border-border accent-gold cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TimelinePage;
