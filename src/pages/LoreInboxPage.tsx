import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  ChevronDown,
  ChevronRight,
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
  /** "Chapter Title › Scene Title" — preferred display label */
  source_location?: string | null;
  source_sentence?: string | null;
  /** At-a-Glance key/value pairs emitted by sync-lore */
  at_a_glance?: Record<string, string>;
  /** Article section content — only sections the AI had evidence for */
  sections?: Record<string, string>;
  /** Verbatim sentence where entity first appears — stamped server-side */
  first_mentioned?: string | null;
  /** Scene UUID where entity first appears — stamped server-side */
  first_appearance?: string | null;
  /** Suggested tag strings */
  tags?: string[];
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

interface DebugEntityEntry {
  name: string;
  entity_type: string;
  update_type: string;
  routed_to: "inbox_new" | "inbox_contradiction" | "direct_update" | "no_new_content";
  ai_sections: string[];
  raw_sections: Record<string, string>;
}

interface SyncDebugResult {
  scenes_processed: number;
  suggestions_created: number;
  entities_updated: number;
  debug_data?: DebugEntityEntry[];
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
  const navigate = useNavigate();

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
      <div className="min-w-0">
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

      {/* Source sentence */}
      {!editing && payload.source_sentence && (
        <div className="mt-3">
          <blockquote className="border-l-2 border-gold/40 pl-3 py-0.5">
            <p className="text-[12px] text-text-dimmed italic leading-relaxed">
              {payload.source_sentence}
            </p>
          </blockquote>
          <button
            onClick={() => navigate("/manuscript")}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-text-dimmed hover:text-gold transition-colors"
          >
            View in manuscript <ExternalLink size={10} />
          </button>
        </div>
      )}

      {/* Footer: fields preview, tags, confidence, source */}
      {!editing && (
        <div className="mt-3 space-y-2.5">
          {/* Populated At a Glance fields */}
          {(() => {
            const fields = (payload as unknown as Record<string, unknown>).fields as Record<string, string> | undefined;
            const populated = Object.entries(fields ?? {}).filter(([, v]) => typeof v === "string" && v.trim());
            if (!populated.length) return null;
            return (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5">
                  At a Glance
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {populated.map(([k, v]) => (
                    <div key={k} className="flex gap-1.5 min-w-0">
                      <span className="text-[11px] text-text-dimmed shrink-0">{k}:</span>
                      <span className="text-[11px] text-text-secondary truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Sections preview — show section names that have content */}
          {(() => {
            const populated = Object.keys(payload.sections ?? {}).filter(
              (k) => (payload.sections?.[k] ?? "").trim(),
            );
            if (!populated.length) return null;
            return (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5">
                  Article sections
                </p>
                <div className="flex flex-wrap gap-1">
                  {populated.map((k) => (
                    <span
                      key={k}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-fyrescribe-hover text-text-secondary"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Suggested tags */}
          {(payload.tags ?? []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1.5">
                Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {(payload.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Confidence bar */}
          {typeof payload.confidence === "number" && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                Confidence
              </p>
              <ConfidenceBar value={payload.confidence} />
            </div>
          )}

          {/* Source location */}
          {(payload.source_location || payload.source_scene_title) && (
            <p className="text-[11px] text-text-dimmed">
              from{" "}
              <span className="text-text-secondary italic">
                {payload.source_location || payload.source_scene_title}
              </span>
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

// ─── Debug Panel ─────────────────────────────────────────────────────────────

const EXPECTED_SECTIONS: Record<string, string[]> = {
  character: ["Overview", "Background", "Personality", "Relationships", "Notable Events"],
  location: ["Description", "History", "Notable Inhabitants", "Points of Interest"],
  item: ["Description", "History", "Powers", "Current Whereabouts"],
  lore: ["Description", "Regional Origin", "Known Users", "Imbued Weapons & Artifacts"],
};

const ROUTE_LABELS: Record<string, { label: string; color: string }> = {
  inbox_new:            { label: "new → inbox",            color: "bg-green-500/20 text-green-300" },
  inbox_contradiction:  { label: "contradiction → inbox",  color: "bg-orange-500/20 text-orange-300" },
  direct_update:        { label: "merged directly",        color: "bg-blue-500/20 text-blue-300" },
  no_new_content:       { label: "no new content",         color: "bg-muted text-text-dimmed" },
};

const DebugPanel = ({ result }: { result: SyncDebugResult }) => {
  const [open, setOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const entries = result.debug_data ?? [];

  return (
    <div className="mt-8 border border-amber-500/30 rounded-lg bg-amber-500/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[11px] uppercase tracking-widest text-amber-400 font-medium">
          DEBUG — Last sync result
        </span>
        <div className="flex items-center gap-3 text-text-dimmed">
          <span className="text-[11px]">
            {result.scenes_processed} scenes · {result.suggestions_created} to inbox · {result.entities_updated} direct updates · {entries.length} entities total
          </span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-amber-500/20 pt-3">
          {entries.length === 0 ? (
            <p className="text-[12px] text-text-dimmed py-2">No entities processed in this sync.</p>
          ) : (
            entries.map((entry, i) => {
              const key = `${entry.name}:${i}`;
              const expected = EXPECTED_SECTIONS[entry.entity_type] ?? [];
              const returned = new Set(entry.ai_sections);
              const missing = expected.filter((s) => !returned.has(s));
              const routeConfig = ROUTE_LABELS[entry.routed_to] ?? { label: entry.routed_to, color: "bg-muted text-text-dimmed" };
              const isExpanded = expandedKey === key;

              return (
                <div key={key} className="border border-border rounded bg-fyrescribe-raised">
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-medium text-foreground truncate">{entry.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-fyrescribe-hover text-text-dimmed shrink-0">{entry.entity_type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${routeConfig.color}`}>{routeConfig.label}</span>
                    </div>
                    {isExpanded ? <ChevronDown size={12} className="text-text-dimmed shrink-0" /> : <ChevronRight size={12} className="text-text-dimmed shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border space-y-2 pt-2">
                      <p className="text-[10px] uppercase tracking-widest text-text-dimmed">
                        AI returned: {entry.ai_sections.length > 0 ? entry.ai_sections.join(", ") : "(no sections)"}
                      </p>
                      {entry.ai_sections.map((section) => (
                        <div key={section}>
                          <p className="text-[11px] text-text-secondary font-medium mb-0.5">{section}</p>
                          <pre className="text-[11px] text-text-dimmed bg-fyrescribe-hover rounded px-2 py-1.5 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                            {(entry.raw_sections[section] ?? "").trim() || "(empty string)"}
                          </pre>
                        </div>
                      ))}
                      {missing.length > 0 && (
                        <div className="space-y-0.5 pt-1 border-t border-border">
                          {missing.map((section) => (
                            <p key={section} className="text-[11px] text-amber-500/70 font-mono">
                              {section}: NOT RETURNED
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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
  const [searchParams] = useSearchParams();
  const isDebugMode = searchParams.get("debug") === "true";

  const [suggestions, setSuggestions] = useState<LoreSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const [acceptedMerged, setAcceptedMerged] = useState(false);
  const [acceptedNoNewInfo, setAcceptedNoNewInfo] = useState(false);
  const [acceptAllStatus, setAcceptAllStatus] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [lastSyncDebug, setLastSyncDebug] = useState<SyncDebugResult | null>(null);
  const [debugSyncing, setDebugSyncing] = useState(false);

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

  // Core accept logic — shared by individual accept and Accept All.
  // Returns { entityId, isMerge, noNewInfo } on success or null on failure.
  // Dismisses the card immediately; if a duplicate exists the AI merge
  // runs in the background and silently patches the entity when done.
  const acceptOneSuggestion = async (
    suggestion: LoreSuggestion,
    overrides?: { name: string; description: string },
  ): Promise<{ entityId: string; isMerge: boolean; noNewInfo: boolean } | null> => {
    if (!activeProject) return null;
    const payload = suggestion.payload;
    const name = overrides?.name ?? payload.name;
    const description = overrides?.description ?? payload.description;

    // Build fields from AI at_a_glance + server-stamped first_mentioned / first_appearance.
    const fieldsToWrite: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload.at_a_glance ?? {})) {
      if (v.trim()) fieldsToWrite[k] = v.trim();
    }
    if (payload.first_mentioned?.trim()) {
      fieldsToWrite["First Mentioned"] = payload.first_mentioned.trim();
    }
    if (payload.first_appearance?.trim() && payload.category === "characters") {
      fieldsToWrite["First Appearance"] = payload.first_appearance.trim();
    }

    // Keep only non-empty section values.
    const sectionsToWrite: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload.sections ?? {})) {
      if (v.trim()) sectionsToWrite[k] = v.trim();
    }

    // For characters, the first name should always be a moniker so manuscript
    // mentions of just the first name resolve to this character.
    const firstToken = name.split(/\s+/)[0];
    const shouldSeedFirstName =
      payload.category === "characters" &&
      !!firstToken &&
      firstToken.toLowerCase() !== name.toLowerCase();

    // ── Check for existing entity with fuzzy name match + same category ──
    // Fetches all entities of the same category and finds a match where either
    // name contains the other (case-insensitive). This handles renames like
    // "Evette" → "Evette Koval" without creating a duplicate.
    const { data: categoryEntities } = await supabase
      .from("entities")
      .select("id, name, summary, sections, aliases")
      .eq("project_id", activeProject.id)
      .eq("category", payload.category);

    const nameLower = name.toLowerCase();
    const existing = (categoryEntities ?? []).find((e) => {
      const allNames = [e.name, ...((e.aliases as string[] | null) ?? [])].map((n) => n.toLowerCase());
      return allNames.some((n) => n === nameLower || n.includes(nameLower) || nameLower.includes(n));
    }) ?? null;

    let entityId: string;
    let isMerge = false;
    let noNewInfo = false;

    if (existing) {
      isMerge = true;
      const existingSections = (existing.sections ?? {}) as Record<string, string>;
      const hasExisting = Object.values(existingSections).some((v) => (v ?? "").trim());
      const hasNew = Object.values(sectionsToWrite).some((v) => (v ?? "").trim());

      if (!hasNew) noNewInfo = true;

      // ── Optimistic: apply shallow merge immediately so the card can dismiss ──
      const optimisticSections = hasNew
        ? { ...existingSections, ...sectionsToWrite }
        : existingSections;
      const updates: {
        sections: Record<string, string>;
        summary?: string;
        aliases?: string[];
      } = {
        sections: optimisticSections,
      };
      if (!existing.summary && description) updates.summary = description;

      // Ensure first-name alias exists on the existing character entity too.
      if (shouldSeedFirstName) {
        const existingAliases = (existing.aliases ?? []) as string[];
        const hasFirstName = existingAliases.some(
          (a) => a.toLowerCase() === firstToken.toLowerCase(),
        );
        if (!hasFirstName) updates.aliases = [...existingAliases, firstToken];
      }

      await supabase.from("entities").update(updates).eq("id", existing.id);
      entityId = existing.id;

      // ── Background AI merge — fire and forget ──────────────────────────
      if (hasExisting && hasNew) {
        const bgEntityId = entityId;
        supabase.functions
          .invoke("merge-entity-sections", {
            body: { existing_sections: existingSections, new_sections: sectionsToWrite },
          })
          .then(({ data: mergeResult, error: mergeError }) => {
            if (mergeError) {
              console.error("[merge] edge function error:", mergeError);
              return;
            }
            const merged = mergeResult?.merged_sections as Record<string, string> | undefined;
            if (!merged) {
              console.error("[merge] no merged_sections in response:", mergeResult);
              return;
            }
            return supabase
              .from("entities")
              .update({ sections: merged })
              .eq("id", bgEntityId)
              .then(({ error: updateError }) => {
                if (updateError) console.error("[merge] entity update error:", updateError);
              });
          })
          .catch((e) => console.error("[merge] background merge exception:", e));
      }
    } else {
      // ── Create path: insert new entity ───────────────────────────────────
      const seedAliases = shouldSeedFirstName ? [firstToken] : [];
      const { data: entity, error: entityError } = await supabase
        .from("entities")
        .insert({
          project_id: activeProject.id,
          category: payload.category,
          name,
          summary: description || null,
          fields: fieldsToWrite,
          sections: sectionsToWrite,
          aliases: seedAliases,
        } as never)
        .select("id")
        .single();

      if (entityError || !entity) {
        console.error("Failed to create entity:", entityError);
        return null;
      }
      entityId = entity.id;
    }

    // ── Create / link tags (shared by both paths) ─────────────────────────
    const tagNames = (payload.tags ?? []).filter(Boolean);
    if (tagNames.length > 0) {
      const { data: existingTags } = await supabase
        .from("tags")
        .select("id, name")
        .eq("project_id", activeProject.id)
        .in("name", tagNames);

      const existingNameSet = new Set((existingTags ?? []).map((t) => t.name.toLowerCase()));
      const newTagNames = tagNames.filter((n) => !existingNameSet.has(n.toLowerCase()));

      let createdTags: { id: string }[] = [];
      if (newTagNames.length > 0) {
        const { data: inserted } = await supabase
          .from("tags")
          .insert(newTagNames.map((tagName) => ({ project_id: activeProject.id, name: tagName })))
          .select("id");
        createdTags = inserted ?? [];
      }

      const allTagIds = [
        ...(existingTags ?? []).map((t) => t.id),
        ...createdTags.map((t) => t.id),
      ];
      if (allTagIds.length > 0) {
        await supabase
          .from("entity_tags")
          .insert(allTagIds.map((tag_id) => ({ entity_id: entityId, tag_id })));
      }
    }

    // ── Mark suggestion reviewed ──────────────────────────────────────────
    await supabase
      .from("lore_suggestions")
      .update({
        status: overrides ? "edited" : "accepted",
        entity_id: entityId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", suggestion.id);

    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    return { entityId, isMerge, noNewInfo };
  };

  const handleAccept = async (
    suggestion: LoreSuggestion,
    overrides?: { name: string; description: string },
  ) => {
    const result = await acceptOneSuggestion(suggestion, overrides);
    if (result) {
      setAcceptedMerged(result.isMerge);
      setAcceptedNoNewInfo(result.noNewInfo);
      setAcceptedId(result.entityId);
    }
  };

  const handleAcceptAll = async () => {
    if (!activeProject || suggestions.length === 0 || acceptingAll) return;
    setAcceptingAll(true);
    setAcceptedId(null); // clear any individual accept banner
    const toAccept = [...suggestions]; // snapshot before cards start dismissing
    let count = 0;
    for (const s of toAccept) {
      const result = await acceptOneSuggestion(s);
      if (result) count++;
    }
    setAcceptAllStatus(`Accepted ${count} ${count === 1 ? "entity" : "entities"}`);
    setAcceptingAll(false);
    setTimeout(() => setAcceptAllStatus(null), 4000);
  };

  const handleDebugSync = async () => {
    if (!activeProject) return;
    setDebugSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lore", {
        body: { project_id: activeProject.id, trigger: "manual", force: true, debug: true },
      });
      if (error) {
        console.error("[debug sync] error:", error);
      } else {
        const firstResult = (data?.results?.[0] ?? null) as SyncDebugResult | null;
        if (firstResult) setLastSyncDebug(firstResult);
      }
      await fetchSuggestions();
    } finally {
      setDebugSyncing(false);
    }
  };

  const handleReject = async (id: string) => {
    await supabase
      .from("lore_suggestions")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };

  // Re-fetch when page becomes visible (e.g. after sync adds new suggestions)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchSuggestions();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchSuggestions]);

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">Lore Inbox</h1>
          <div className="flex items-center gap-3">
            {suggestions.length > 0 && (
              <>
                <span className="text-[12px] text-text-dimmed">{suggestions.length} pending</span>
                <button
                  onClick={handleAcceptAll}
                  disabled={acceptingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                >
                  {acceptingAll ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Accept All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Accept All status banner */}
        {acceptAllStatus && (
          <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
            <p className="text-[13px] text-green-300">{acceptAllStatus}</p>
          </div>
        )}

        {/* Brief accepted banner */}
        {acceptedId && (
          <div className="mb-4 flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
            <p className="text-[13px] text-green-300">
              {acceptedNoNewInfo ? "No new information to add." : acceptedMerged ? "Entity merged." : "Entity created."}
            </p>
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
              Use <span className="text-text-secondary">Sync Lore</span> in the sidebar to analyse your manuscript scenes
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
        {isDebugMode && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-widest text-amber-400">Debug Mode</span>
              <button
                onClick={handleDebugSync}
                disabled={debugSyncing || !activeProject}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              >
                {debugSyncing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Sync Lore (debug)
              </button>
            </div>
            {lastSyncDebug && <DebugPanel result={lastSyncDebug} />}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default LoreInboxPage;
