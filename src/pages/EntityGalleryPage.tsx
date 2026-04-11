import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { Plus, Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type EntityCategory = Database["public"]["Enums"]["entity_category"];

const ENTITY_CATEGORIES: { value: EntityCategory; label: string }[] = [
  { value: "characters", label: "Characters" },
  { value: "places", label: "Places" },
  { value: "events", label: "Events" },
  { value: "artifacts", label: "Artifacts" },
  { value: "creatures", label: "Creatures" },
  { value: "abilities", label: "Abilities" },
  { value: "factions", label: "Factions" },
  { value: "doctrine", label: "Doctrine" },
];

const CATEGORIES = [{ value: "all", label: "All" }, ...ENTITY_CATEGORIES];

const CATEGORY_COLORS: Record<string, string> = {
  characters: "bg-blue-500/20 text-blue-300",
  places: "bg-green-500/20 text-green-300",
  events: "bg-orange-500/20 text-orange-300",
  artifacts: "bg-purple-500/20 text-purple-300",
  creatures: "bg-red-500/20 text-red-300",
  abilities: "bg-cyan-500/20 text-cyan-300",
  factions: "bg-yellow-500/20 text-yellow-300",
  doctrine: "bg-pink-500/20 text-pink-300",
};

interface EntityRow {
  id: string;
  name: string;
  category: string;
  summary: string | null;
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
            onChange={(e) => setCategory(e.target.value as EntityCategory)}
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
  const { activeProject } = useActiveProject();
  const [activeFilter, setActiveFilter] = useState(category || "all");
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    setActiveFilter(category || "all");
  }, [category]);

  // Redirect to projects page if no active project is set
  useEffect(() => {
    if (!activeProject) {
      navigate("/");
    }
  }, [activeProject, navigate]);

  // Fetch entities (with tags) for the active project
  useEffect(() => {
    if (!activeProject) return;
    const fetchEntities = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("entities")
        .select("id, name, category, summary, entity_tags(tags(id, name, color))")
        .eq("project_id", activeProject.id)
        .order("name");
      if (error) console.error("Failed to fetch entities:", error);
      setEntities((data as any) || []);
      setLoading(false);
    };
    fetchEntities();
  }, [activeProject]);

  const filteredEntities =
    activeFilter === "all"
      ? entities
      : entities.filter((e) => e.category === activeFilter);

  const handleFilterChange = (value: string) => {
    setActiveFilter(value);
    if (value === "all") navigate("/world");
    else navigate(`/world/${value}`);
  };

  const defaultNewCategory: EntityCategory =
    (activeFilter !== "all" ? activeFilter : "characters") as EntityCategory;

  const heading = category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : "World & Lore";

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">{heading}</h1>
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

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleFilterChange(cat.value)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activeFilter === cat.value
                  ? "border-gold text-gold bg-gold-glow"
                  : "border-border text-text-secondary hover:text-foreground hover:border-text-dimmed"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin text-text-dimmed" />
          </div>
        ) : filteredEntities.length === 0 ? (
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
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors"
            >
              <Plus size={14} />
              {activeFilter === "all"
                ? "Create your first entity"
                : `Create a ${activeFilter.replace(/s$/, "")}`}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredEntities.map((entity) => {
              const tags = entity.entity_tags
                .map((et: any) => et.tags)
                .filter(Boolean);
              return (
                <button
                  key={entity.id}
                  onClick={() => navigate(`/entity/${entity.id}`)}
                  className="text-left bg-fyrescribe-raised border border-border rounded-xl p-4 hover:border-gold/20 transition-all group animate-fade-in"
                >
                  <div className="flex items-start justify-between mb-2">
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
                          className="text-[10px] px-2 py-0.5 rounded-full bg-fyrescribe-hover text-text-dimmed"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
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
    </AppLayout>
  );
};

export default EntityGalleryPage;
