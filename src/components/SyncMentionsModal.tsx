import { X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export interface NewMention {
  entity_id: string;
  entity_name: string;
  scene_id: string;
  scene_title: string;
  context: string;
  position: number;
}

interface SyncMentionsModalProps {
  mentions: NewMention[];
  onClose: () => void;
}

const SyncMentionsModal = ({ mentions, onClose }: SyncMentionsModalProps) => {
  const { icons } = useTheme();
  const SyncIcon = icons.sync;

  // Group by entity name
  const grouped = mentions.reduce<Record<string, NewMention[]>>((acc, m) => {
    (acc[m.entity_name] ??= []).push(m);
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
            <h2 className="font-display text-base text-foreground">New Mentions</h2>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-text-dimmed">
            {mentions.length} new
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
          {mentions.length === 0 ? (
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
                    {grouped[name].map((m, i) => (
                      <div
                        key={`${m.scene_id}-${m.position}-${i}`}
                        className="bg-fyrescribe-base border border-border rounded-lg p-3"
                      >
                        <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                          {m.scene_title}
                        </div>
                        <p className="text-xs text-text-secondary italic leading-relaxed">
                          …{m.context}…
                        </p>
                      </div>
                    ))}
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
