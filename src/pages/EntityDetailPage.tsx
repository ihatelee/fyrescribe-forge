import { useState, useRef, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { ArrowLeft, Plus, X, Image as ImageIcon, Upload, ZoomIn, Search, MoreVertical, Trash2, Check, Pencil, Loader2, Sparkles } from "lucide-react";
import type { Json, Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import AppearanceLog from "@/components/AppearanceLog";

type EntityCategory = Database["public"]["Enums"]["entity_category"];

// ─── Category metadata ────────────────────────────────────────────────

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

const CATEGORY_SECTIONS: Record<string, string[]> = {
  characters: ["Overview", "Background", "Personality", "Relationships", "Notable Events"],
  places: ["Description", "History", "Notable Inhabitants", "Points of Interest"],
  creatures: ["Appearance", "Behaviour", "Abilities", "Habitat", "Lore"],
  artifacts: ["Description", "History", "Powers", "Current Whereabouts"],
  events: ["Summary", "Causes", "Key Participants", "Consequences", "Aftermath"],
  magic: ["Description", "Regional Origin", "Known Users", "Imbued Weapons & Artifacts"],
  factions: ["Overview", "History", "Structure", "Notable Members", "Goals"],
  doctrine: ["Core Tenets", "Origins", "Followers", "Contradictions"],
  history: ["Overview", "Causes", "Key Figures", "Consequences", "Legacy"],
};

// Standard At a Glance fields per category — seeded on first load if entity has no fields
const CATEGORY_FIELDS: Record<string, string[]> = {
  characters: ["Place of Birth", "Currently Residing", "Eye Color", "Hair Color", "Height", "Allegiance", "First Appearance", "First Mentioned"],
  places: ["Region", "Climate", "Population", "Government", "Notable Landmarks", "First Mentioned"],
  events: ["Date/Era", "Location", "Key Participants", "Outcome", "First Mentioned"],
  artifacts: ["Type", "Origin", "Current Owner", "Powers", "First Mentioned"],
  creatures: ["Classification", "Habitat", "Average Size", "Diet", "Threat Level", "First Mentioned"],
  magic: ["Type", "Regional Origin", "Rarity", "First Recorded Use"],
  factions: ["Type", "Founded", "Leader", "Headquarters", "Allegiance", "First Mentioned"],
  doctrine: ["Type", "Regional Origin", "Followers", "Core Belief", "First Mentioned"],
  history: ["Date/Era", "Location", "Key Factions", "Outcome"],
};

const SECTION_PLACEHOLDER_TEXT: Record<string, string> = {
  Overview: "Write an overview of this entity here…",
  Background: "Describe the background and origin story…",
  Personality: "Detail personality traits, quirks, and temperament…",
  Relationships: "Describe key relationships and connections…",
  "Notable Events": "List notable events involving this entity…",
  Description: "Describe the physical appearance or defining characteristics…",
  History: "Chronicle the history and significant moments…",
  "Notable Inhabitants": "List notable inhabitants and their roles…",
  "Points of Interest": "Describe notable locations, landmarks, or features…",
  Appearance: "Describe the physical appearance in detail…",
  Behaviour: "Detail typical behaviour patterns and instincts…",
  Abilities: "List and describe known abilities…",
  Habitat: "Describe preferred habitat and territories…",
  Lore: "Record myths, legends, and cultural significance…",
  Powers: "Describe the powers and capabilities…",
  "Current Whereabouts": "Note the current known location or status…",
  Summary: "Provide a concise summary of this event…",
  Causes: "Explain the root causes and contributing factors…",
  "Key Participants": "List the key participants and their roles…",
  Consequences: "Describe the immediate consequences…",
  Aftermath: "Detail the long-term aftermath and lasting effects…",
  "Regional Origin": "Describe where this originated geographically…",
  "Known Users": "List characters known to use or possess this…",
  "Imbued Weapons & Artifacts": "List weapons and artifacts associated with this magic…",
  Structure: "Describe the organizational structure and hierarchy…",
  "Notable Members": "List notable past and present members…",
  Goals: "Outline the primary goals and motivations…",
  "Core Tenets": "State the core tenets and fundamental beliefs…",
  Origins: "Describe the origins and founding story…",
  Followers: "Describe the followers and adherents…",
  Contradictions: "Note known contradictions and points of debate…",
  "Key Figures": "List the key figures involved…",
  Legacy: "Describe the lasting legacy and long-term effects…",
  "Magic & Abilities": "Describe the character's relationship with magic and known abilities…",
};

// ─── Types ────────────────────────────────────────────────────────────

/** Typed shape for entities.sections JSONB column (section name → rich text content) */
type EntitySections = Record<string, string>;

/** Typed shape for entities.fields JSONB column (At a Glance key → value) */
type EntityFields = Record<string, string>;

interface LinkedEntityEntry {
  id: string;
  name: string;
  category: string;
  relationship: string | null;
}

// ─── Tag Autocomplete Component ───────────────────────────────────────

interface TagAutocompleteProps {
  entityId: string;
  projectId: string;
  appliedTagIds: string[];
  onTagApplied: (tag: { id: string; name: string; color: string | null }) => void;
  onClose: () => void;
}

const TagAutocomplete = ({ entityId, projectId, appliedTagIds, onTagApplied, onClose }: TagAutocompleteProps) => {
  const [query, setQuery] = useState("");
  const [projectTags, setProjectTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (projectId) {
      supabase.from("tags").select("id, name, color").eq("project_id", projectId).order("name")
        .then(({ data }) => { if (data) setProjectTags(data); });
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, projectId]);

  const filtered = projectTags.filter(
    (t) => !appliedTagIds.includes(t.id) && t.name.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = projectTags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const handleCreateAndApply = async () => {
    const name = query.trim();
    if (!name) return;
    const { data, error } = await supabase.from("tags").insert({ name, project_id: projectId }).select().single();
    if (error) { console.error("Failed to create tag:", error); return; }
    const { error: linkError } = await supabase.from("entity_tags").insert({ entity_id: entityId, tag_id: data.id });
    if (linkError) { console.error("Failed to link tag:", linkError); return; }
    onTagApplied(data);
    onClose();
  };

  const handleSelect = async (tag: { id: string; name: string; color: string | null }) => {
    const { error } = await supabase.from("entity_tags").insert({ entity_id: entityId, tag_id: tag.id });
    if (error) { console.error("Failed to link tag:", error); return; }
    onTagApplied(tag);
    onClose();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center border border-gold/40 bg-fyrescribe-hover rounded-full overflow-hidden">
        <Search size={10} className="ml-2.5 text-text-dimmed" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !exactMatch && query.trim()) {
              e.preventDefault();
              handleCreateAndApply();
            }
          }}
          placeholder="Search or create tag…"
          className="text-xs px-2 py-1 bg-transparent text-foreground outline-none w-40"
        />
      </div>
      {(query.length > 0 || filtered.length > 0) && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-fyrescribe-raised border border-border rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
          {filtered.map((tag) => (
            <button
              key={tag.id}
              onClick={() => handleSelect(tag)}
              className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-2"
            >
              {tag.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />}
              {tag.name}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button
              onClick={handleCreateAndApply}
              className="w-full text-left px-3 py-2 text-xs text-gold hover:text-gold-bright hover:bg-fyrescribe-hover transition-colors flex items-center gap-2 border-t border-border"
            >
              <Plus size={10} />
              Create "{query.trim()}"
            </button>
          )}
          {filtered.length === 0 && (exactMatch || !query.trim()) && (
            <div className="px-3 py-2 text-xs text-text-dimmed">No more tags available</div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Link Entity Modal ────────────────────────────────────────────────

interface LinkEntityModalProps {
  currentEntityId: string;
  projectId: string;
  linkedIds: string[];
  onLinked: (entity: LinkedEntityEntry) => void;
  onClose: () => void;
  filterCategory?: string;
  relationship?: string;
}

const LinkEntityModal = ({
  currentEntityId,
  projectId,
  linkedIds,
  onLinked,
  onClose,
  filterCategory,
  relationship,
}: LinkEntityModalProps) => {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; name: string; category: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetch = async () => {
      let q = supabase
        .from("entities")
        .select("id, name, category")
        .eq("project_id", projectId)
        .neq("id", currentEntityId)
        .order("name");
      if (filterCategory) q = q.eq("category", filterCategory as EntityCategory);
      const { data } = await q;
      if (data) setCandidates(data);
    };
    fetch();

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentEntityId, projectId, filterCategory, onClose]);

  const filtered = candidates.filter(
    (c) => !linkedIds.includes(c.id) && c.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleLink = async (target: { id: string; name: string; category: string }) => {
    const { error } = await supabase.from("entity_links").insert({
      entity_a_id: currentEntityId,
      entity_b_id: target.id,
      relationship: relationship || null,
    });
    if (error) { console.error("Failed to link:", error); return; }
    onLinked({ ...target, relationship: relationship || null });
    onClose();
  };

  return (
    <div ref={containerRef} className="bg-fyrescribe-raised border border-border rounded-lg shadow-xl w-full max-w-md p-4">
      <div className="flex items-center gap-2 mb-3">
        <Search size={14} className="text-text-dimmed" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={filterCategory ? `Search ${filterCategory}…` : "Search entities to link…"}
          className="flex-1 text-sm bg-transparent text-foreground outline-none border-b border-border focus:border-gold/40 pb-1"
        />
        <button onClick={onClose} className="text-text-dimmed hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => handleLink(c)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover rounded transition-colors"
          >
            <span className="font-display text-sm">{c.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS[c.category] || ""}`}>
              {c.category}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-text-dimmed px-3 py-2">No entities found</div>
        )}
      </div>
    </div>
  );
};

// ─── Delete Confirmation Modal ────────────────────────────────────────

interface DeleteModalProps {
  entityName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteModal = ({ entityName, onConfirm, onCancel }: DeleteModalProps) => (
  <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center" onClick={onCancel}>
    <div
      className="bg-fyrescribe-raised border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="font-display text-base text-foreground mb-2">Delete entity?</h2>
      <p className="text-sm text-text-secondary mb-6">
        This cannot be undone. Are you sure you want to delete{" "}
        <span className="text-foreground font-medium">{entityName}</span>?
      </p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          className="flex-1 py-2 bg-destructive text-destructive-foreground text-sm font-medium rounded-lg hover:bg-destructive/90 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ─── Main Entity Detail ───────────────────────────────────────────────

const EntityDetailInner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");

  const [summary, setSummary] = useState("");
  const [fields, setFields] = useState<EntityFields>({});
  const [sections, setSections] = useState<EntitySections>({});
  const [tags, setTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [projectTags, setProjectTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [linkedEntities, setLinkedEntities] = useState<LinkedEntityEntry[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  const [isLinkingEntity, setIsLinkingEntity] = useState(false);
  const [isLinkingSpecies, setIsLinkingSpecies] = useState(false);
  const [isLinkingArtifacts, setIsLinkingArtifacts] = useState(false);
  const [isLinkingMagic, setIsLinkingMagic] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [isPovCharacter, setIsPovCharacter] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const sectionsRef = useRef<EntitySections>({});
  const sectionList = CATEGORY_SECTIONS[entity?.category || "characters"] || [];

  // ─── Fetch ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    const fetchEntity = async () => {
      setLoading(true);
      const { data: dbEntity, error } = await supabase
        .from("entities").select("*").eq("id", id).maybeSingle();
      if (error) console.error("Failed to fetch entity:", error);

      if (dbEntity) {
        setEntity(dbEntity);
        setProjectId(dbEntity.project_id);
        setSummary(dbEntity.summary || "");
        setIsPovCharacter(!!dbEntity.is_pov_character);

        // Structured fields: seed from CATEGORY_FIELDS if entity has none
        const existingFields = (dbEntity.fields as EntityFields) || {};
        const stdKeys = CATEGORY_FIELDS[dbEntity.category] || [];
        const initialFields =
          Object.keys(existingFields).length === 0
            ? Object.fromEntries(stdKeys.map((k) => [k, ""]))
            : existingFields;
        setFields(initialFields);

        const initialSections = (dbEntity.sections as EntitySections) || {};
        setSections(initialSections);
        sectionsRef.current = initialSections;
        setCoverImage(dbEntity.cover_image_url || null);
        setGalleryImages(dbEntity.gallery_image_urls || []);

        // Tags for this entity
        const { data: entityTags } = await supabase
          .from("entity_tags").select("tag_id, tags(id, name, color)").eq("entity_id", id);
        if (entityTags) setTags(entityTags.map((et: any) => et.tags).filter(Boolean));

        // All project tags (for At a Glance auto-conversion)
        const { data: allTags } = await supabase
          .from("tags").select("id, name, color").eq("project_id", dbEntity.project_id);
        if (allTags) setProjectTags(allTags);

        // Linked entities (both directions, include relationship)
        const [{ data: linksA }, { data: linksB }] = await Promise.all([
          supabase.from("entity_links")
            .select("entity_b_id, relationship, entities!entity_links_entity_b_id_fkey(id, name, category)")
            .eq("entity_a_id", id),
          supabase.from("entity_links")
            .select("entity_a_id, relationship, entities!entity_links_entity_a_id_fkey(id, name, category)")
            .eq("entity_b_id", id),
        ]);
        const linked: LinkedEntityEntry[] = [];
        linksA?.forEach((l: any) => { if (l.entities) linked.push({ ...l.entities, relationship: l.relationship }); });
        linksB?.forEach((l: any) => { if (l.entities) linked.push({ ...l.entities, relationship: l.relationship }); });
        setLinkedEntities(linked);
      }
      setLoading(false);
    };
    fetchEntity();
  }, [id]);

  // ─── Auto-save sections ──────────────────────────────────────────

  const saveSectionsToDb = useDebouncedCallback(async (newSections: EntitySections) => {
    if (!id) return;
    const { error } = await supabase
      .from("entities").update({ sections: newSections as Json }).eq("id", id);
    if (error) console.error("Failed to save sections:", error);
  }, 1000);

  const handleSectionInput = useCallback((sectionName: string, content: string) => {
    const updated = { ...sectionsRef.current, [sectionName]: content };
    sectionsRef.current = updated;
    saveSectionsToDb(updated);
  }, [saveSectionsToDb]);

  // ─── Save summary / fields ───────────────────────────────────────

  const saveSummary = useCallback(async () => {
    if (!id) return;
    await supabase.from("entities").update({ summary }).eq("id", id);
  }, [id, summary]);

  const saveFields = useCallback(async (updatedFields: EntityFields) => {
    if (!id) return;
    await supabase.from("entities").update({ fields: updatedFields as Json }).eq("id", id);
  }, [id]);

  const handleSaveFieldEdit = useCallback((key: string) => {
    const updated = { ...fields, [key]: editingFieldValue };
    setFields(updated);
    setEditingField(null);
    saveFields(updated);
  }, [fields, editingFieldValue, saveFields]);

  // ─── Image upload ────────────────────────────────────────────────

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || "anonymous";
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("entity-images").upload(path, file, { contentType: file.type });
    if (error) { console.error("Upload failed:", error); return null; }
    const { data: { publicUrl } } = supabase.storage.from("entity-images").getPublicUrl(path);
    return publicUrl;
  }, [id]);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCoverImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    const url = await uploadImage(file);
    if (url) {
      setCoverImage(url);
      await supabase.from("entities").update({ cover_image_url: url }).eq("id", id);
    }
  }, [id, uploadImage]);

  const handleGalleryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !id) return;
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      setGalleryImages((prev) => [...prev, previewUrl]);
      const url = await uploadImage(file);
      if (url) {
        setGalleryImages((prev) => {
          const updated = prev.map((p) => (p === previewUrl ? url : p));
          supabase.from("entities").update({ gallery_image_urls: updated }).eq("id", id);
          return updated;
        });
      }
    }
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }, [id, uploadImage]);

  // ─── Tag management ──────────────────────────────────────────────

  const handleRemoveTag = useCallback(async (tagId: string) => {
    if (!id) return;
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    await supabase.from("entity_tags").delete().eq("entity_id", id).eq("tag_id", tagId);
  }, [id]);

  const handleTagApplied = useCallback((tag: { id: string; name: string; color: string | null }) => {
    setTags((prev) => [...prev, tag]);
    setProjectTags((prev) => prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]);
  }, []);

  // ─── Smart tag click ─────────────────────────────────────────────

  const handleTagClick = useCallback(async (tag: { id: string; name: string; color: string | null }) => {
    const { count } = await supabase
      .from("entity_tags")
      .select("*", { count: "exact", head: true })
      .eq("tag_id", tag.id);
    if (count === 1) {
      const { data } = await supabase.from("entity_tags").select("entity_id").eq("tag_id", tag.id).single();
      if (data) navigate(`/entity/${data.entity_id}`);
    } else {
      navigate(`/world?tag=${tag.id}`);
    }
  }, [navigate]);

  // ─── Linked entities ─────────────────────────────────────────────

  const handleEntityLinked = useCallback((ent: LinkedEntityEntry) => {
    setLinkedEntities((prev) => [...prev, ent]);
  }, []);

  // ─── Delete entity ───────────────────────────────────────────────

  const handleDeleteEntity = useCallback(async () => {
    if (!id || !entity) return;
    await supabase.from("entity_tags").delete().eq("entity_id", id);
    await supabase.from("entity_links").delete().or(`entity_a_id.eq.${id},entity_b_id.eq.${id}`);
    await supabase.from("entities").delete().eq("id", id);
    navigate(`/world/${entity.category}`);
  }, [id, entity, navigate]);

  // ─── At a Glance helpers ─────────────────────────────────────────

  // Build ordered field key list: standard fields first, then custom
  const stdFieldKeys = CATEGORY_FIELDS[entity?.category] || [];
  const allFieldKeys = [
    ...stdFieldKeys,
    ...Object.keys(fields).filter((k) => !stdFieldKeys.includes(k)),
  ];

  const renderFieldValue = (key: string, value: string) => {
    if (!value) {
      return (
        <button
          onClick={() => { setEditingField(key); setEditingFieldValue(""); }}
          className="text-sm text-text-dimmed hover:text-text-secondary transition-colors text-left w-full"
        >
          —
        </button>
      );
    }
    // Auto-convert: if value exactly matches a tag name, render as clickable pill
    const matchedTag = projectTags.find((t) => t.name.toLowerCase() === value.toLowerCase());
    if (matchedTag) {
      return (
        <button
          onClick={() => handleTagClick(matchedTag)}
          className="text-xs px-2 py-0.5 rounded-full bg-fyrescribe-hover text-gold border border-border hover:border-gold/30 transition-colors"
        >
          {value}
        </button>
      );
    }
    return (
      <button
        onClick={() => { setEditingField(key); setEditingFieldValue(value); }}
        className="text-sm text-foreground hover:text-gold-bright transition-colors text-left w-full"
      >
        {value}
      </button>
    );
  };

  // ─── Derived linked sets ─────────────────────────────────────────

  const speciesCharacters = linkedEntities.filter(
    (e) => e.category === "characters" && e.relationship === "species"
  );
  const relatedArtifacts = linkedEntities.filter((e) => e.category === "artifacts");
  const relatedMagic = linkedEntities.filter((e) => e.category === "magic");
  const genericLinked = linkedEntities.filter((e) => {
    if (entity?.category === "creatures" && e.category === "characters" && e.relationship === "species") return false;
    if (entity?.category === "characters" && (e.category === "artifacts" || e.category === "magic")) return false;
    return true;
  });

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 text-text-secondary text-sm">Loading entity…</div>
      </AppLayout>
    );
  }

  if (!entity) {
    return (
      <AppLayout>
        <div className="p-6 text-text-secondary">Entity not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl relative">
        {/* Top-right controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* POV Character toggle — characters only */}
          {entity.category === "characters" && (
            <button
              type="button"
              role="switch"
              aria-checked={isPovCharacter}
              onClick={async () => {
                const next = !isPovCharacter;
                setIsPovCharacter(next);
                const { error } = await supabase
                  .from("entities")
                  .update({ is_pov_character: next })
                  .eq("id", entity.id);
                if (error) {
                  console.error("Failed to update POV flag:", error);
                  setIsPovCharacter(!next);
                }
              }}
              title={isPovCharacter ? "POV character — click to unmark" : "Mark as POV character"}
              className={cn(
                "h-8 px-2.5 rounded-full border flex items-center gap-1.5 text-[11px] uppercase tracking-wider transition-colors",
                isPovCharacter
                  ? "bg-gold/10 border-gold/40 text-gold hover:bg-gold/15"
                  : "bg-fyrescribe-raised border-border text-text-dimmed hover:text-foreground hover:border-gold/30",
              )}
            >
              <span
                className={cn(
                  "w-3 h-3 rounded-sm border flex items-center justify-center transition-colors",
                  isPovCharacter ? "bg-gold border-gold" : "border-text-dimmed",
                )}
              >
                {isPovCharacter && <Check size={10} className="text-fyrescribe-raised" strokeWidth={3} />}
              </span>
              POV
            </button>
          )}
          {/* Actions menu */}
          <div className="relative">
            <button
              onClick={() => setShowActionsMenu((v) => !v)}
              className="w-8 h-8 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-dimmed hover:text-foreground transition-colors"
            >
              <MoreVertical size={14} />
            </button>
            {showActionsMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-fyrescribe-raised border border-border rounded-lg shadow-xl z-20">
                <button
                  onClick={() => { setShowActionsMenu(false); setDeleteModalOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-fyrescribe-hover transition-colors rounded-lg"
                >
                  <Trash2 size={13} />
                  Delete entity
                </button>
              </div>
            )}
          </div>
          {/* Close */}
          <button
            onClick={() => navigate(`/world/${entity.category}`)}
            className="w-8 h-8 rounded-full bg-fyrescribe-raised border border-border flex items-center justify-center text-text-dimmed hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Breadcrumb */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-text-secondary text-xs hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          Back
        </button>

        {/* ===== HEADER ===== */}
        <div className="flex gap-6 mb-10">
          <div
            onClick={() => coverInputRef.current?.click()}
            className="w-[200px] h-[260px] bg-fyrescribe-raised border border-border rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer hover:border-gold/30 transition-colors overflow-hidden relative group"
          >
            {coverImage ? (
              <>
                <img src={coverImage} alt={entity.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload size={20} className="text-foreground" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-text-dimmed group-hover:text-text-secondary transition-colors">
                <ImageIcon size={28} />
                <span className="text-[10px] uppercase tracking-widest">Upload cover</span>
              </div>
            )}
            <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
          </div>

          <div className="flex-1 min-w-0 pt-1">
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={async () => {
                  const trimmed = nameValue.trim();
                  if (!trimmed) { setEditingName(false); return; }
                  if (trimmed !== entity.name) {
                    const { error } = await supabase.from("entities").update({ name: trimmed }).eq("id", entity.id);
                    if (!error) setEntity((prev: typeof entity) => ({ ...prev, name: trimmed }));
                  }
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { setEditingName(false); }
                }}
                className="font-display text-3xl text-foreground mb-2 leading-tight bg-transparent border-b border-gold/50 outline-none w-full"
              />
            ) : (
              <button
                onClick={() => { setNameValue(entity.name); setEditingName(true); }}
                className="group flex items-center gap-2 font-display text-3xl text-foreground mb-2 leading-tight hover:text-foreground/80 transition-colors text-left"
              >
                <span className="border-b border-transparent group-hover:border-foreground/20 transition-colors">{entity.name}</span>
                <Pencil size={16} className="text-text-dimmed opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </button>
            )}
            <span className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full mb-4 ${CATEGORY_COLORS[entity.category]}`}>
              {entity.category}
            </span>

            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }}
              onBlur={saveSummary}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                }
              }}
              rows={2}
              className="block w-full text-sm text-text-secondary bg-transparent border-b border-transparent hover:border-border focus:border-gold/40 outline-none pb-1 mb-4 transition-colors placeholder:text-text-dimmed resize-none overflow-hidden"
              placeholder="Write a short description…"
            />

            {/* Tags — smart clicking */}
            <div className="flex flex-wrap gap-2 items-center">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-fyrescribe-hover text-text-secondary border border-border cursor-pointer hover:border-gold/30 hover:text-gold transition-colors"
                  onClick={() => handleTagClick(tag)}
                >
                  {tag.name}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag.id); }}
                  >
                    <X size={10} className="text-text-dimmed hover:text-destructive" />
                  </button>
                </span>
              ))}
              {isAddingTag ? (
                <TagAutocomplete
                  entityId={id!}
                  projectId={projectId}
                  appliedTagIds={tags.map((t) => t.id)}
                  onTagApplied={handleTagApplied}
                  onClose={() => setIsAddingTag(false)}
                />
              ) : (
                <button
                  onClick={() => setIsAddingTag(true)}
                  className="text-xs px-3 py-1 rounded-full border border-dashed border-border text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors"
                >
                  + Add tag
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ===== BODY + AT A GLANCE ===== */}
        <div className="flex gap-8">
          {/* Left: Article body */}
          <div className="flex-1 min-w-0">
            <div className="space-y-0">
              {sectionList.map((section, i) => (
                <div key={section}>
                  {i > 0 && <div className="border-t border-border" />}
                  <div className="py-6">
                    <h2 className="font-display text-base text-foreground mb-3 tracking-wide">{section}</h2>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="font-prose text-lg leading-[1.85] text-text-secondary outline-none min-h-[3rem] focus:text-foreground transition-colors empty:before:content-[attr(data-placeholder)] empty:before:text-text-dimmed empty:before:pointer-events-none"
                      data-placeholder={SECTION_PLACEHOLDER_TEXT[section] || "Write here…"}
                      onInput={(e) => handleSectionInput(section, (e.target as HTMLDivElement).innerHTML)}
                      ref={(el) => {
                        if (el && !el.dataset.initialized) {
                          el.innerHTML = DOMPurify.sanitize(sections[section] || "");
                          el.dataset.initialized = "true";
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ===== CHARACTER: Magic & Abilities ===== */}
            {entity.category === "characters" && (
              <div className="border-t border-border pt-8 mb-8">
                <h2 className="font-display text-base text-foreground mb-4 tracking-wide">Magic & Abilities</h2>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  className="font-prose text-lg leading-[1.85] text-text-secondary outline-none min-h-[3rem] focus:text-foreground transition-colors mb-4 empty:before:content-[attr(data-placeholder)] empty:before:text-text-dimmed empty:before:pointer-events-none"
                  data-placeholder={SECTION_PLACEHOLDER_TEXT["Magic & Abilities"]}
                  onInput={(e) => handleSectionInput("Magic & Abilities", (e.target as HTMLDivElement).innerHTML)}
                  ref={(el) => {
                    if (el && !el.dataset.initialized) {
                      el.innerHTML = DOMPurify.sanitize(sections["Magic & Abilities"] || "");
                      el.dataset.initialized = "true";
                    }
                  }}
                />
                <div className="flex flex-wrap gap-2 items-center mt-2">
                  {relatedMagic.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => navigate(`/entity/${m.id}`)}
                      className="text-xs px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
                    >
                      {m.name}
                    </button>
                  ))}
                  {isLinkingMagic ? (
                    <LinkEntityModal
                      currentEntityId={id!}
                      projectId={projectId}
                      linkedIds={linkedEntities.map((e) => e.id)}
                      onLinked={handleEntityLinked}
                      onClose={() => setIsLinkingMagic(false)}
                      filterCategory="magic"
                    />
                  ) : (
                    <button
                      onClick={() => setIsLinkingMagic(true)}
                      className="text-xs px-3 py-1 rounded-full border border-dashed border-border text-text-dimmed hover:text-text-secondary transition-colors"
                    >
                      + Link magic
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ===== CHARACTER: Related Artifacts ===== */}
            {entity.category === "characters" && (
              <div className="border-t border-border pt-8 mb-8">
                <h2 className="font-display text-base text-foreground mb-4 tracking-wide">Related Artifacts</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {relatedArtifacts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/entity/${a.id}`)}
                      className="flex items-center gap-3 px-4 py-3 bg-fyrescribe-raised border border-border rounded-lg hover:border-gold/20 transition-colors text-left"
                    >
                      <span className="font-display text-sm text-foreground">{a.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS["artifacts"]}`}>artifact</span>
                    </button>
                  ))}
                  {isLinkingArtifacts ? (
                    <LinkEntityModal
                      currentEntityId={id!}
                      projectId={projectId}
                      linkedIds={linkedEntities.map((e) => e.id)}
                      onLinked={handleEntityLinked}
                      onClose={() => setIsLinkingArtifacts(false)}
                      filterCategory="artifacts"
                    />
                  ) : (
                    <button
                      onClick={() => setIsLinkingArtifacts(true)}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 border border-dashed border-border rounded-lg text-text-dimmed hover:text-text-secondary text-xs transition-colors"
                    >
                      <Plus size={12} />
                      Link artifact
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ===== CREATURE: Characters of this species ===== */}
            {entity.category === "creatures" && (
              <div className="border-t border-border pt-8 mb-8">
                <h2 className="font-display text-base text-foreground mb-4 tracking-wide">Characters of this Species</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {speciesCharacters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/entity/${c.id}`)}
                      className="flex items-center gap-3 px-4 py-3 bg-fyrescribe-raised border border-border rounded-lg hover:border-gold/20 transition-colors text-left"
                    >
                      <span className="font-display text-sm text-foreground">{c.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS["characters"]}`}>character</span>
                    </button>
                  ))}
                  {isLinkingSpecies ? (
                    <LinkEntityModal
                      currentEntityId={id!}
                      projectId={projectId}
                      linkedIds={linkedEntities.map((e) => e.id)}
                      onLinked={handleEntityLinked}
                      onClose={() => setIsLinkingSpecies(false)}
                      filterCategory="characters"
                      relationship="species"
                    />
                  ) : (
                    <button
                      onClick={() => setIsLinkingSpecies(true)}
                      className="flex items-center justify-center gap-1.5 px-4 py-3 border border-dashed border-border rounded-lg text-text-dimmed hover:text-text-secondary text-xs transition-colors"
                    >
                      <Plus size={12} />
                      Link character
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ===== GALLERY ===== */}
            <div className="border-t border-border pt-8 mt-4 mb-8">
              <h2 className="font-display text-base text-foreground mb-4 tracking-wide">Gallery</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {galleryImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxImage(img)}
                    className="aspect-square bg-fyrescribe-raised border border-border rounded-lg overflow-hidden relative group hover:border-gold/20 transition-colors"
                  >
                    <img src={img} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn size={18} className="text-foreground" />
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="aspect-square bg-fyrescribe-raised border border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1.5 text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors"
                >
                  <Plus size={18} />
                  <span className="text-[10px] uppercase tracking-widest">Add image</span>
                </button>
              </div>
              <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleGalleryUpload} className="hidden" />
            </div>

            {/* ===== GENERIC LINKED ENTITIES ===== */}
            <div className="border-t border-border pt-8 mb-8">
              <h2 className="font-display text-base text-foreground mb-4 tracking-wide">Linked Entities</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {genericLinked.map((linked) => (
                  <button
                    key={linked.id}
                    onClick={() => navigate(`/entity/${linked.id}`)}
                    className="flex items-center gap-3 px-4 py-3 bg-fyrescribe-raised border border-border rounded-lg hover:border-gold/20 transition-colors text-left"
                  >
                    <span className="font-display text-sm text-foreground">{linked.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS[linked.category] || ""}`}>
                      {linked.category}
                    </span>
                  </button>
                ))}
                {isLinkingEntity ? (
                  <LinkEntityModal
                    currentEntityId={id!}
                    projectId={projectId}
                    linkedIds={linkedEntities.map((e) => e.id)}
                    onLinked={handleEntityLinked}
                    onClose={() => setIsLinkingEntity(false)}
                  />
                ) : (
                  <button
                    onClick={() => setIsLinkingEntity(true)}
                    className="flex items-center justify-center gap-1.5 px-4 py-3 border border-dashed border-border rounded-lg text-text-dimmed hover:text-text-secondary text-xs transition-colors"
                  >
                    <Plus size={12} />
                    Link entity
                  </button>
                )}
              </div>
            </div>

            {/* ===== APPEARANCE LOG ===== */}
            <AppearanceLog entityId={entity.id} entityName={entity.name} projectId={projectId} />
          </div>

          {/* ===== AT A GLANCE PANEL ===== */}
          <div className="w-[260px] flex-shrink-0">
            <div className="sticky top-16">
              <div className="bg-fyrescribe-raised border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="font-display text-base text-foreground leading-tight truncate" title={entity?.name}>
                    {entity?.name}
                  </h2>
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed mt-1">
                    At a Glance
                  </h3>
                </div>
                <div className="divide-y divide-border">
                  {allFieldKeys.map((key) => {
                    const value = fields[key] ?? "";
                    return (
                      <div key={key} className="px-4 py-2.5">
                        <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">{key}</div>
                        {editingField === key ? (
                          <input
                            autoFocus
                            value={editingFieldValue}
                            onChange={(e) => setEditingFieldValue(e.target.value)}
                            onBlur={() => handleSaveFieldEdit(key)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveFieldEdit(key)}
                            className="text-sm text-foreground bg-transparent border-b border-gold/40 outline-none w-full"
                          />
                        ) : (
                          renderFieldValue(key, value)
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Add custom field — hidden but functionality preserved */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Gallery preview"
            className="max-w-[85vw] max-h-[85vh] rounded-xl shadow-2xl object-contain"
          />
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-6 right-6 text-foreground/70 hover:text-foreground transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <DeleteModal
          entityName={entity.name}
          onConfirm={handleDeleteEntity}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}

      {/* Close actions menu on outside click */}
      {showActionsMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
      )}
    </AppLayout>
  );
};

const EntityDetailPage = () => {
  const { id } = useParams();
  return <EntityDetailInner key={id} />;
};

export default EntityDetailPage;
