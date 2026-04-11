import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_TIMELINE } from "@/lib/placeholder-data";
import { Plus } from "lucide-react";

const TimelinePage = () => {
  const [filter, setFilter] = useState<"all" | "world_history" | "story_event">("all");

  const filtered =
    filter === "all"
      ? PLACEHOLDER_TIMELINE
      : PLACEHOLDER_TIMELINE.filter((e) => e.type === filter);

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">
            Timeline
          </h1>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors">
            <Plus size={14} />
            Add Event
          </button>
        </div>

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
        <div className="relative">
          {/* Central axis */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-6">
            {filtered.map((event, i) => (
              <div key={event.id} className="relative pl-12 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                {/* Dot */}
                <div
                  className={`absolute left-[14px] top-3 w-3 h-3 rounded-full border-2 ${
                    event.type === "world_history"
                      ? "border-gold bg-gold/30"
                      : "border-blue-400 bg-blue-400/30"
                  }`}
                />

                <div className="bg-fyrescribe-raised border border-border rounded-lg p-4 hover:border-gold/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-text-dimmed text-xs">
                      {event.dateLabel}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        event.type === "world_history"
                          ? "bg-gold/10 text-gold"
                          : "bg-blue-500/20 text-blue-300"
                      }`}
                    >
                      {event.type === "world_history"
                        ? "World History"
                        : "Story Event"}
                    </span>
                  </div>
                  <h3 className="font-display text-sm text-foreground">
                    {event.label}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default TimelinePage;
