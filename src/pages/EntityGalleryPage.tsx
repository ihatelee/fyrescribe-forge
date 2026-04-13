import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import {
  Plus,
  Loader2,
  MoreVertical,
  Archive,
  Trash2,
  LayoutGrid,
  List,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Database } from "@/integrations/supabase/types";

type EntityCategory = Database["public"]["Enums"]["entity_category"];
type ViewMode = "card" | "list";

const VIEW_MODE_KEY = "fyrescribe_entity_view_mode";

const ENTITY_CATEGORIES: { value: EntityCategory; label: string }[] = [
  { value: "characters", label: "Characters" },
  { value: "places", label: "Places" },
  { value: "events", label: "Events" },
  { value: "history", label: "History" },
  { value: "artifacts", label: "Artifacts" },
  { value: "creatures", label: "Creatures" },
  { value: "magic", label: "Magic" },
  { value: "factions", label: "Factions" },
  { value: "doctrine", label: "Doctrine" },
];

const CATEGORIES = [{ value: "all", label: "All" }, ...ENTITY_CATEGORIES];

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

interface EntityRow {
  id: string;
  name: string;
  category: string;
  summary: string | null;
  archived_at: string | null;
  entity_tags: { tags: { id: string; name: string; color: string | null } | null }[];
}

// ─── New Entity Modal ────────────────────────────────────────────────

interface NewEntityModalProps {
  projectId: string;
  defaultCategory: EntityCategory;
  onCreated: (entity: { id: string }) => void;
  onClose: () => void;
}

const NewEntityModal = ({ projectId, defaultCategory, onCreated, onClose }: NewEntityModalProps) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<EntityCategory>(defaultCategory);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("entities")
      .insert({ name: trimmed, category, project_id: projectId })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to create entity:", error);
      setSaving(false);
      return;
    }
    onCreated(data);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleCreate}
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl"
      >
        <h2 className="font-display text-base text-foreground mb-5">New Entity</h2>

        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter entity name…"
            className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed"
          />
        </div>

        <div className="mb-6">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => {
              const found = ENTITY_CATEGORIES.find((c) => c.value === e.target.value);
              if (found) setCategory(found.value);
            }}
            className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40"
          >
            {ENTITY_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Entity"}
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

// ─── Gallery Page ────────────────────────────────────────────────────

const EntityGalleryPage = () => {
  const { category } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeProject } = useActiveProject();
  const [activeFilter, setActiveFilter] = useState<EntityCategory | "all">(
    ENTITY_CATEGORIES.find((c) => c.value === category)?.value ?? "all",
  );
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // View mode persisted to localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === "list" ? "list" : "card";
  });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<EntityRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const tagFilter = searchParams.get("tag");

  useEffect(() => {
    setActiveFilter(ENTITY_CATEGORIES.find((c) => c.value === category)?.value ?? "all");
  }, [category]);

  useEffect(() => {
    if (!activeProject) {
      navigate("/projects");
    }
  }, [activeProject, navigate]);

  useEffect(() => {
    if (!activeProject) return;
    const fetchEntities = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("entities")
        .select("id, name, category, summary, archived_at, entity_tags(tags(id, name, color))")
        .eq("project_id", activeProject.id)
        .order("name");
      if (error) console.error("Failed to fetch entities:", error);
      setEntities((data as EntityRow[]) || []);
      setLoading(false);
    };
    fetchEntities();
  }, [activeProject]);

  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  // Smart tag click: 1 entity → go to it directly; >1 → filtered gallery
  const handleTagClick = (tag: { id: string; name: string; color: string | null }, e: React.MouseEvent) => {
    e.stopPropagation();
    const matching = entities.filter((ent) =>
      ent.entity_tags.some((et: any) => et.tags?.id === tag.id)
    );
    if (matching.length === 1) {
      navigate(`/entity/${matching[0].id}`);
    } else {
      navigate(`/world?tag=${tag.id}`);
    }
  };

  const handleArchive = async (entity: EntityRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    await supabase.from("entities").update({ archived_at: now } as any).eq("id", entity.id);
    setEntities((prev) => prev.map((ent) => ent.id === entity.id ? { ...ent, archived_at: now } : ent));
  };

  const handleUnarchive = async (entity: EntityRow) => {
    await supabase.from("entities").update({ archived_at: null } as any).eq("id", entity.id);
    setEntities((prev) => prev.map((ent) => ent.id === entity.id ? { ...ent, archived_at: null } : ent));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const eid = deleteTarget.id;
    await supabase.from("entity_links").delete().or(`entity_a_id.eq.${eid},entity_b_id.eq.${eid}`);
    await supabase.from("entity_tags").delete().eq("entity_id", eid);
    await supabase.from("entities").delete().eq("id", eid);
    setEntities((prev) => prev.filter((ent) => ent.id !== eid));
    setDeleteTarget(null);
    setDeleteConfirmText("");
  };

  const toggleSelectEntity = (id: string) => {
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
    for (const eid of ids) {
      await supabase.from("entity_links").delete().or(`entity_a_id.eq.${eid},entity_b_id.eq.${eid}`);
      await supabase.from("entity_tags").delete().eq("entity_id", eid);
      await supabase.from("entities").delete().eq("id", eid);
    }
    setEntities((prev) => prev.filter((ent) => !selectedIds.has(ent.id)));
    setSelectedIds(new Set());
    setBulkBusy(false);
  };

  // Apply category + optional tag filters, exclude archived
  const activeEntities = entities.filter((e) => !e.archived_at);
  const archivedEntities = entities.filter((e) => !!e.archived_at);

  const filteredEntities = activeEntities
    .filter((e) => activeFilter === "all" || e.category === activeFilter)
    .filter((e) =>
      !tagFilter || e.entity_tags.some((et: any) => et.tags?.id === tagFilter)
    );

  // Find tag name for display when tag filter is active
  const activeTagName = tagFilter
    ? entities
        .flatMap((e) => e.entity_tags)
        .map((et: any) => et.tags)
        .find((t: any) => t?.id === tagFilter)?.name
    : null;

  const handleFilterChange = (value: string) => {
    setActiveFilter(value as EntityCategory | "all");
    if (value === "all") navigate("/world");
    else navigate(`/world/${value}`);
  };

  const defaultNewCategory: EntityCategory =
    activeFilter !== "all" ? activeFilter : "characters";

  const heading = activeTagName
    ? `Tagged: ${activeTagName}`
    : category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : "World & Lore";

  // ─── Entity action menu (shared between card/list views) ──────────────

  const EntityMenu = ({ entity }: { entity: EntityRow }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="w-7 h-7 rounded-md flex items-center justify-center text-text-dimmed hover:text-foreground hover:bg-fyrescribe-base transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreVertical size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border">
        <DropdownMenuItem onClick={(e) => handleArchive(entity, e)} className="cursor-pointer">
          <Archive size={14} className="mr-2" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(entity);
          }}
          className="text-destructive cursor-pointer"
        >
          <Trash2 size={14} className="mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">{heading}</h1>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => handleViewMode("card")}
                className={`p-1.5 transition-colors ${
                  viewMode === "card"
                    ? "bg-fyrescribe-raised text-foreground"
                    : "text-text-dimmed hover:text-text-secondary"
                }`}
                title="Card view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => handleViewMode("list")}
                className={`p-1.5 transition-colors ${
                  viewMode === "list"
                    ? "bg-fyrescribe-raised text-foreground"
                    : "text-text-dimmed hover:text-text-secondary"
                }`}
                title="List view"
              >
                <List size={14} />
              </button>
            </div>

            {activeProject && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors"
              >
                <Plus size={14} />
                New Entity
              </button>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleFilterChange(cat.value)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activeFilter === cat.value && !tagFilter
                  ? "border-gold text-gold bg-gold-glow"
                  : "border-border text-text-secondary hover:text-foreground hover:border-text-dimmed"
              }`}
            >
              {cat.label}
            </button>
          ))}
          {tagFilter && (
            <button
              onClick={() => navigate("/world")}
              className="px-3 py-1 text-xs rounded-full border border-gold text-gold bg-gold-glow flex items-center gap-1"
            >
              × Clear tag filter
            </button>
          )}
        </div>

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

        {/* Content area */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-text-dimmed" />
          </div>
        ) : filteredEntities.length === 0 && archivedEntities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
            <p className="text-text-secondary text-sm mb-1">
              {activeFilter === "all" ? "No entities yet" : `No ${activeFilter} yet`}
            </p>
            <p className="text-text-dimmed text-xs mb-6">
              {activeFilter === "all"
                ? "Start building your world by creating your first entity."
                : `Add your first ${activeFilter.replace(/s$/, "")} to bring your world to life.`}
            </p>
            {!tagFilter && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors"
              >
                <Plus size={14} />
                {activeFilter === "all"
                  ? "Create your first entity"
                  : `Create a ${activeFilter.replace(/s$/, "")}`}
              </button>
            )}
          </div>
        ) : viewMode === "card" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredEntities.map((entity) => {
                const tags = entity.entity_tags.map((et: any) => et.tags).filter(Boolean);
                return (
                  <div
                    key={entity.id}
                    onClick={() => navigate(`/entity/${entity.id}`)}
                    className="relative text-left bg-fyrescribe-raised border border-border rounded-xl p-4 hover:border-gold/20 transition-all group animate-fade-in cursor-pointer"
                  >
                    <div
                      className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={selectedIds.has(entity.id) ? { opacity: 1 } : undefined}
                    >
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 cursor-pointer text-text-dimmed hover:text-destructive transition-colors"
                      >
                        <span className="text-[10px]">delete</span>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entity.id)}
                          onChange={(e) => { e.stopPropagation(); toggleSelectEntity(entity.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-border accent-gold cursor-pointer"
                        />
                      </label>
                    </div>
                    <div className="absolute top-3 right-3">
                      <EntityMenu entity={entity} />
                    </div>
                    <div className="flex items-start justify-between mb-2 pr-8">
                      <h3 className="font-display text-sm text-foreground group-hover:text-gold-bright transition-colors">
                        {entity.name}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                          CATEGORY_COLORS[entity.category] || ""
                        }`}
                      >
                        {entity.category}
                      </span>
                    </div>
                    {entity.summary && (
                      <p className="text-text-secondary text-xs mb-3 line-clamp-2">
                        {entity.summary}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag: any) => (
                          <span
                            key={tag.id}
                            onClick={(e) => handleTagClick(tag, e)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-fyrescribe-hover text-text-dimmed hover:text-gold hover:bg-gold-glow transition-colors cursor-pointer"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Archived entities collapsible */}
            {archivedEntities.length > 0 && (
              <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen} className="mt-10">
                <CollapsibleTrigger className="flex items-center gap-2 text-text-dimmed hover:text-text-secondary transition-colors text-sm mb-4">
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${archiveOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                  Archived ({archivedEntities.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {archivedEntities.map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => handleUnarchive(entity)}
                        className="text-left bg-fyrescribe-raised/50 border border-border/50 rounded-xl p-4 opacity-60 hover:opacity-80 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-display text-sm text-foreground">{entity.name}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${CATEGORY_COLORS[entity.category] || ""}`}>
                            {entity.category}
                          </span>
                        </div>
                        {entity.summary && (
                          <p className="text-text-dimmed text-xs line-clamp-1">{entity.summary}</p>
                        )}
                        <p className="text-text-dimmed text-[10px] mt-2">Click to unarchive</p>
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        ) : (
          /* List view */
          <>
            <div className="border border-border rounded-xl overflow-hidden">
              {filteredEntities.length === 0 ? (
                <div className="px-4 py-8 text-center text-text-dimmed text-sm">
                  {activeFilter === "all" ? "No entities yet" : `No ${activeFilter} yet`}
                </div>
              ) : (
                filteredEntities.map((entity, i) => {
                  const tags = entity.entity_tags.map((et: any) => et.tags).filter(Boolean);
                  return (
                    <div
                      key={entity.id}
                      onClick={() => navigate(`/entity/${entity.id}`)}
                      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-fyrescribe-hover transition-colors ${
                        i !== 0 ? "border-t border-border" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entity.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelectEntity(entity.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded border-border accent-gold cursor-pointer flex-shrink-0"
                      />
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 w-[80px] text-center ${
                          CATEGORY_COLORS[entity.category] || ""
                        }`}
                      >
                        {entity.category}
                      </span>
                      <span className="font-display text-sm text-foreground group-hover:text-gold-bright transition-colors flex-shrink-0 w-[180px] truncate">
                        {entity.name}
                      </span>
                      <span className="text-xs text-text-secondary truncate flex-1 min-w-0">
                        {entity.summary ?? ""}
                      </span>
                      {tags.length > 0 && (
                        <div className="flex gap-1 flex-shrink-0">
                          {tags.slice(0, 3).map((tag: any) => (
                            <span
                              key={tag.id}
                              onClick={(e) => handleTagClick(tag, e)}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-fyrescribe-hover text-text-dimmed hover:text-gold hover:bg-gold-glow transition-colors cursor-pointer"
                            >
                              {tag.name}
                            </span>
                          ))}
                          {tags.length > 3 && (
                            <span className="text-[10px] text-text-dimmed px-1">+{tags.length - 3}</span>
                          )}
                        </div>
                      )}
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <EntityMenu entity={entity} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Archived entities collapsible */}
            {archivedEntities.length > 0 && (
              <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen} className="mt-10">
                <CollapsibleTrigger className="flex items-center gap-2 text-text-dimmed hover:text-text-secondary transition-colors text-sm mb-4">
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${archiveOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                  Archived ({archivedEntities.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border border-border/50 rounded-xl overflow-hidden opacity-60">
                    {archivedEntities.map((entity, i) => (
                      <button
                        key={entity.id}
                        onClick={() => handleUnarchive(entity)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity ${
                          i !== 0 ? "border-t border-border/50" : ""
                        }`}
                      >
                        <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 w-[80px] text-center ${CATEGORY_COLORS[entity.category] || ""}`}>
                          {entity.category}
                        </span>
                        <span className="font-display text-sm text-foreground flex-shrink-0 w-[180px] truncate">
                          {entity.name}
                        </span>
                        <span className="text-xs text-text-dimmed truncate flex-1">Click to unarchive</span>
                      </button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>

      {showNewModal && activeProject && (
        <NewEntityModal
          projectId={activeProject.id}
          defaultCategory={defaultNewCategory}
          onCreated={(entity) => navigate(`/entity/${entity.id}`)}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) { setDeleteTarget(null); setDeleteConfirmText(""); }
        }}
      >
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete entity</AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              This action cannot be undone. Type{" "}
              <span className="font-mono text-destructive font-semibold">PERMANENTLY DELETE</span>{" "}
              to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type PERMANENTLY DELETE"
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-text-dimmed focus:outline-none focus:ring-1 focus:ring-destructive"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-fyrescribe-raised border-border text-foreground hover:bg-fyrescribe-base">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmText !== "PERMANENTLY DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:pointer-events-none"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default EntityGalleryPage;
