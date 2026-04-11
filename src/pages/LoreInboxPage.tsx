import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_LORE_SUGGESTIONS } from "@/lib/placeholder-data";
import { Check, X, Sparkles, AlertTriangle, Tag, FileText } from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; color: string }> = {
  new_entity: { icon: Sparkles, label: "New Entity", color: "bg-green-500/20 text-green-300" },
  field_update: { icon: FileText, label: "Field Update", color: "bg-blue-500/20 text-blue-300" },
  contradiction: { icon: AlertTriangle, label: "Contradiction", color: "bg-orange-500/20 text-orange-300" },
  new_tag: { icon: Tag, label: "New Tag", color: "bg-purple-500/20 text-purple-300" },
};

const LoreInboxPage = () => {
  const [suggestions, setSuggestions] = useState(PLACEHOLDER_LORE_SUGGESTIONS);

  const dismiss = (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <AppLayout projectName="The Shattered Vigil">
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="font-display text-xl text-foreground tracking-wide mb-6">
          Lore Inbox
        </h1>

        {suggestions.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={32} className="text-text-dimmed mx-auto mb-4" />
            <p className="text-text-secondary text-sm">
              No suggestions yet — your lore is up to date
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, i) => {
              const config = TYPE_CONFIG[suggestion.type];
              const Icon = config.icon;
              return (
                <div
                  key={suggestion.id}
                  className="bg-fyrescribe-raised border border-border rounded-lg p-4 animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${config.color}`}
                        >
                          <Icon size={10} />
                          {config.label}
                        </span>
                      </div>
                      <p className="text-text-secondary text-sm leading-relaxed">
                        {suggestion.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => dismiss(suggestion.id)}
                        className="p-2 rounded-md text-green-400 hover:bg-green-500/10 transition-colors"
                        title="Accept"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => dismiss(suggestion.id)}
                        className="p-2 rounded-md text-text-dimmed hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Dismiss"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default LoreInboxPage;
