import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import type { Database } from "@/integrations/supabase/types";
import {
  Check,
  X,
  Pencil,
  Sparkles,
  AlertTriangle,
  Tag,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoreSuggestionStatus = Database["public"]["Enums"]["lore_suggestion_status"];
type LoreSuggestionType = Database["public"]["Enums"]["lore_suggestion_type"];
type EntityCategory = Database["public"]["Enums"]["entity_category"];

interface SuggestionPayload {
  name: string;
  category: EntityCategory;
  description: string;
  confidence: number;
  source_scene_title?: string | null;
}

interface LoreSuggestion {
  id: string;
  type: LoreSuggestionType;
  status: LoreSuggestionStatus;
  payload: SuggestionPayload;
  created_at: string;
  entity_id: string | null;
  project_id: string;
  reviewed_at: string | null;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  LoreSuggestionType,
  { icon: typeof Sparkles; label: string; color: string }
> = {
  new_entity: { icon: Sparkles, label: "New Entity", color: "bg-green-500/20 text-green-300" },
  field_update: { icon: FileText, label: "Field Update", color: "bg-blue-500/20 text-blue-300" },
  contradiction: {
    icon: AlertTriangle,
    label: "Contradiction",
    color: "bg-orange-500/20 text-orange-300",
  },
  new_tag: { icon: Tag, label: "New Tag", color: "bg-purple-500/20 text-purple-300" },
};

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

// ─── Confidence Bar ───────────────────────────────────────────────────────────

const ConfidenceBar = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.85 ? "bg-green-400" : value >= 0.7 ? "bg-gold" : "bg-orange-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-text-dimmed w-7 text-right">{pct}%</span>
    </div>
  );
};

// ─── Suggestion Card ──────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: LoreSuggestion;
  onAccept: (suggestion: LoreSuggestion, overrides?: { name: string; description: string }) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

const SuggestionCard = ({ suggestion, onAccept, onReject }: SuggestionCardProps) => {
  const payload = suggestion.payload;
  const config = TYPE_CONFIG[suggestion.type];
  const Icon = config.icon;

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(payload.name ?? "");
  const [editDescription, setEditDescription] = useState(payload.description ?? "");
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    setBusy(true);
    await onAccept(suggestion);
    setBusy(false);
  };

  const handleSaveAndAccept = async () => {
    if (!editName.trim()) return;
    setBusy(true);
    await onAccept(suggestion, { name: editName.trim(), description: editDescription.trim() });
    setBusy(false);
  };

  const handleReject = async () => {
    setBusy(true);
    await onReject(suggestion.id);
    setBusy(false);
  };

  return (
    <div className="bg-fyrescribe-raised border border-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${config.color}`}
            >
              <Icon size={10} />
              {config.label}
            </span>
            {payload.category && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${
                  CATEGORY_COLORS[payload.category] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {payload.category}
              </span>
            )}
          </div>

          {editing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-fyrescribe-hover border border-gold/30 rounded px-2 py-1 text-sm font-medium text-foreground outline-none focus:border-gold/60 mb-1"
              autoFocus
            />
          ) : (
            <p className="text-sm font-medium text-foreground">{payload.name}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSaveAndAccept}
                disabled={busy || !editName.trim()}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded text-green-400 hover:bg-green-500/10 disabled:opacity-40 transition-colors"
                title="Save & Accept"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditName(payload.name ?? "");
                  setEditDescription(payload.description ?? "");
                }}
                className="p-1.5 rounded text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                title="Cancel edit"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAccept}
                disabled={busy}
                className="p-1.5 rounded text-green-400 hover:bg-green-500/10 disabled:opacity-40 transition-colors"
                title="Accept — create entity"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={busy}
                className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover disabled:opacity-40 transition-colors"
                title="Edit before accepting"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={handleReject}
                disabled={busy}
                className="p-1.5 rounded text-text-dimmed hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
                title="Reject"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {editing ? (
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={3}
          className="w-full bg-fyrescribe-hover border border-gold/30 rounded px-2 py-1.5 text-[13px] text-text-secondary outline-none focus:border-gold/60 resize-none leading-relaxed"
          placeholder="Description…"
        />
      ) : (
        payload.description && (
          <p className="text-[13px] text-text-secondary leading-relaxed mb-3">
            {payload.description}
          </p>
        )
      )}

      {/* Footer: confidence + source scene */}
      {!editing && (
        <div className="mt-3 space-y-2">
          {typeof payload.confidence === "number" && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                Confidence
              </p>
              <ConfidenceBar value={payload.confidence} />
            </div>
          )}
          {payload.source_scene_title && (
            <p className="text-[11px] text-text-dimmed">
              from scene:{" "}
              <span className="text-text-secondary italic">{payload.source_scene_title}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const LoreInboxPage = () => {
  const { activeProject } = useActiveProject();
  const navigate = useNavigate();

  const [suggestions, setSuggestions] = useState<LoreSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("lore_suggestions")
      .select("*")
      .eq("project_id", activeProject.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to fetch lore suggestions:", error);
    setSuggestions(
      (data ?? []).map((row) => ({
        ...row,
        payload: (row.payload ?? {}) as unknown as SuggestionPayload,
      })),
    );
    setLoading(false);
  }, [activeProject]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAccept = async (
    suggestion: LoreSuggestion,
    overrides?: { name: string; description: string },
  ) => {
    if (!activeProject) return;
    const payload = suggestion.payload;
    const name = overrides?.name ?? payload.name;
    const description = overrides?.description ?? payload.description;

    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .insert({
        project_id: activeProject.id,
        category: payload.category,
        name,
        summary: description || null,
      })
      .select("id")
      .single();

    if (entityError || !entity) {
      console.error("Failed to create entity:", entityError);
      return;
    }

    await supabase
      .from("lore_suggestions")
      .update({
        status: overrides ? "edited" : "accepted",
        entity_id: entity.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", suggestion.id);

    setAcceptedId(entity.id);
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
  };

  const handleReject = async (id: string) => {
    await supabase
      .from("lore_suggestions")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">Lore Inbox</h1>
          {suggestions.length > 0 && (
            <span className="text-[12px] text-text-dimmed">
              {suggestions.length} pending
            </span>
          )}
        </div>

        {/* Brief accepted banner */}
        {acceptedId && (
          <div className="mb-4 flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
            <p className="text-[13px] text-green-300">Entity created.</p>
            <button
              onClick={() => navigate(`/entity/${acceptedId}`)}
              className="flex items-center gap-1 text-[12px] text-green-400 hover:text-green-300 transition-colors"
            >
              View <ExternalLink size={11} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-text-dimmed" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={32} className="text-text-dimmed mx-auto mb-4" />
            <p className="text-text-secondary text-sm mb-1">
              Your lore inbox is clear
            </p>
            <p className="text-text-dimmed text-[12px]">
              Use <span className="text-text-secondary">Sync Now</span> in the sidebar to analyse your manuscript scenes
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default LoreInboxPage;
