import { X, AlertTriangle, CheckCircle, User, MapPin, Clock, FileText } from "lucide-react";

export interface ContinuityIssue {
  type: "character" | "location" | "timeline" | "fact";
  description: string;
  quote: string;
  entity_name: string;
}

const TYPE_ICON: Record<ContinuityIssue["type"], typeof User> = {
  character: User,
  location: MapPin,
  timeline: Clock,
  fact: FileText,
};

const TYPE_LABEL: Record<ContinuityIssue["type"], string> = {
  character: "Character",
  location: "Location",
  timeline: "Timeline",
  fact: "Fact",
};

interface ContinuityPanelProps {
  chapterTitle: string;
  issues: ContinuityIssue[];
  onClose: () => void;
}

const ContinuityPanel = ({ chapterTitle, issues, onClose }: ContinuityPanelProps) => (
  <div className="absolute right-0 top-0 bottom-0 w-80 bg-fyrescribe-base border-l border-border shadow-xl z-10 flex flex-col">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
      <div className="min-w-0">
        <h3 className="text-xs font-medium uppercase tracking-widest text-text-dimmed">
          Continuity Check
        </h3>
        <p className="text-xs text-foreground mt-0.5 truncate">{chapterTitle}</p>
      </div>
      <button onClick={onClose} className="text-text-dimmed hover:text-foreground transition-colors ml-2 flex-shrink-0">
        <X size={14} />
      </button>
    </div>

    <div className="flex-1 overflow-y-auto p-4">
      {issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <CheckCircle size={20} className="text-emerald-500/70" />
          <p className="text-sm text-text-secondary">No continuity issues found</p>
          <p className="text-xs text-text-dimmed">This chapter is consistent with your lore</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-text-dimmed">
            {issues.length} {issues.length === 1 ? "issue" : "issues"} found
          </p>
          {issues.map((issue, i) => {
            const Icon = TYPE_ICON[issue.type] ?? FileText;
            return (
              <div key={i} className="rounded-lg border border-border bg-fyrescribe-raised p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 font-medium">
                    {TYPE_LABEL[issue.type] ?? issue.type}
                  </span>
                  <Icon size={10} className="text-text-dimmed ml-auto flex-shrink-0" />
                </div>
                <p className="text-[11px] font-medium text-foreground leading-snug">
                  {issue.entity_name}
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {issue.description}
                </p>
                {issue.quote && (
                  <blockquote className="text-[11px] text-text-dimmed italic border-l-2 border-border pl-2 leading-snug">
                    "{issue.quote}"
                  </blockquote>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

export default ContinuityPanel;
