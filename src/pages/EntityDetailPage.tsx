import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_ENTITIES } from "@/lib/placeholder-data";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { ArrowLeft, Plus, X, Image as ImageIcon, Upload, ZoomIn, Search, Check } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

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

const CATEGORY_SECTIONS: Record<string, string[]> = {
  characters: ["Overview", "Background", "Personality", "Relationships", "Notable Events"],
  places: ["Description", "History", "Notable Inhabitants", "Points of Interest"],
  creatures: ["Appearance", "Behaviour", "Abilities", "Habitat", "Lore"],
  artifacts: ["Description", "History", "Powers", "Current Whereabouts"],
  events: ["Summary", "Causes", "Key Participants", "Consequences", "Aftermath"],
  abilities: ["Description", "Rules & Costs", "Who Can Use It", "Known Uses"],
  factions: ["Overview", "History", "Structure", "Notable Members", "Goals"],
  doctrine: ["Core Tenets", "Origins", "Followers", "Contradictions"],
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
  "Rules & Costs": "Describe the rules, limitations, and costs involved…",
  "Who Can Use It": "Note who is capable of using this ability…",
  "Known Uses": "Record known instances of this ability being used…",
  Structure: "Describe the organizational structure and hierarchy…",
  "Notable Members": "List notable past and present members…",
  Goals: "Outline the primary goals and motivations…",
  "Core Tenets": "State the core tenets and fundamental beliefs…",
  Origins: "Describe the origins and founding story…",
  Followers: "Describe the followers and adherents…",
  Contradictions: "Note known contradictions and points of debate…",
};

// Fallback data for when entity isn't in DB yet
const ENTITY_FIELDS_FALLBACK: Record<string, Record<string, string>> = {
  e1: { Age: "34", Title: "Warden of the Northern Watch", Allegiance: "The Vigil", "Notable Trait": "Carries guilt from the Last Siege" },
  e2: { Age: "26", Title: "Apprentice Spymaster", Allegiance: "Ashenmere Intelligence", "Notable Trait": "Eidetic memory" },
  e3: { Age: "41", Title: "Traveling Merchant", Allegiance: "Independent", "Notable Trait": "Smuggles forbidden texts" },
  e4: { Age: "Unknown (ancient)", Title: "Advisor to the Pale Court", Allegiance: "The Pale Court", "Notable Trait": "Trapped in the body of a child" },
  e5: { Location: "Northern border", Status: "Partially destroyed", Built: "Year 245", Significance: "Primary defense line" },
  e6: { Region: "Western coast", Population: "~12,000", Economy: "Trade hub", Hazard: "Poisoned lake" },
  e7: { Date: "15 years ago", Casualties: "Thousands", Outcome: "Wall breached", Legacy: "The Vigil diminished" },
  e8: { Material: "White bone", Power: "Dominion over the dead", Origin: "Unknown", Status: "Lost" },
  e9: { Habitat: "Twilight zones", Trigger: "Strong emotions", Threat: "High", Classification: "Spectral predator" },
  e10: { School: "Blood magic", Cost: "Caster's vitality", Status: "Forbidden", Practitioners: "Very few" },
  e11: { Founded: "Year 0", Purpose: "Defend the wall", Size: "Diminished", Leader: "Unknown" },
  e12: { Faith: "Ashenmere religion", Tenets: "3", Origin: "Ancient", Influence: "Widespread" },
};

// ─── Tag Autocomplete Component ───────────────────────────────────
interface TagAutocompleteProps {
  entityId: string;
  projectId: string;
  tags: { id: string; name: string; color: string | null }[];
  appliedTagIds: string[];
  onTagApplied: (tag: { id: string; name: string; color: string | null }) => void;
  onClose: () => void;
}

const TagAutocomplete = ({ entityId, projectId, tags, appliedTagIds, onTagApplied, onClose }: TagAutocompleteProps) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const filtered = tags.filter(
    (t) => !appliedTagIds.includes(t.id) && t.name.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const handleCreateAndApply = async () => {
    const name = query.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("tags")
      .insert({ name, project_id: projectId })
      .select()
      .single();
    if (error) { console.error("Failed to create tag:", error); return; }
    // Link to entity
    await supabase.from("entity_tags").insert({ entity_id: entityId, tag_id: data.id });
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
              {tag.color && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              )}
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

// ─── Link Entity Modal ───────────────────────────────────────
interface LinkEntityModalProps {
  currentEntityId: string;
  projectId: string;
  linkedIds: string[];
  onLinked: (entity: { id: string; name: string; category: string }) => void;
  onClose: () => void;
}

const LinkEntityModal = ({ currentEntityId, projectId, linkedIds, onLinked, onClose }: LinkEntityModalProps) => {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; name: string; category: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("entities")
        .select("id, name, category")
        .eq("project_id", projectId)
        .neq("id", currentEntityId)
        .order("name");
      if (data) setCandidates(data);
    };
    fetch();

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentEntityId, projectId, onClose]);

  const filtered = candidates.filter(
    (c) => !linkedIds.includes(c.id) && c.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleLink = async (target: { id: string; name: string; category: string }) => {
    const { error } = await supabase.from("entity_links").insert({
      entity_a_id: currentEntityId,
      entity_b_id: target.id,
    });
    if (error) { console.error("Failed to link:", error); return; }
    onLinked(target);
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
          placeholder="Search entities to link…"
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

// ─── Main Entity Detail ───────────────────────────────────────
const EntityDetailInner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Entity data from DB or fallback
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");

  // Editable state
  const [summary, setSummary] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [allProjectTags, setAllProjectTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [linkedEntities, setLinkedEntities] = useState<{ id: string; name: string; category: string }[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  const [isLinkingEntity, setIsLinkingEntity] = useState(false);

  const sectionList = CATEGORY_SECTIONS[entity?.category || "characters"] || [];

  // ─── Fetch entity from DB ─────────────────────────────
  useEffect(() => {
    if (!id) return;
    const fetchEntity = async () => {
      setLoading(true);
      const { data: dbEntity, error } = await supabase
        .from("entities")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (dbEntity) {
        setEntity(dbEntity);
        setProjectId(dbEntity.project_id);
        setSummary(dbEntity.summary || "");
        setFields((dbEntity.fields as Record<string, string>) || {});
        setSections((dbEntity.sections as Record<string, string>) || {});
        setCoverImage(dbEntity.cover_image_url || null);
        setGalleryImages(dbEntity.gallery_image_urls || []);

        // Fetch tags
        const { data: entityTags } = await supabase
          .from("entity_tags")
          .select("tag_id, tags(id, name, color)")
          .eq("entity_id", id);
        if (entityTags) {
          setTags(entityTags.map((et: any) => et.tags).filter(Boolean));
        }

        // Fetch all project tags for autocomplete
        const { data: projTags } = await supabase
          .from("tags")
          .select("id, name, color")
          .eq("project_id", dbEntity.project_id);
        if (projTags) setAllProjectTags(projTags);

        // Fetch linked entities (both directions)
        const { data: linksA } = await supabase
          .from("entity_links")
          .select("entity_b_id, entities!entity_links_entity_b_id_fkey(id, name, category)")
          .eq("entity_a_id", id);
        const { data: linksB } = await supabase
          .from("entity_links")
          .select("entity_a_id, entities!entity_links_entity_a_id_fkey(id, name, category)")
          .eq("entity_b_id", id);

        const linked: { id: string; name: string; category: string }[] = [];
        linksA?.forEach((l: any) => { if (l.entities) linked.push(l.entities); });
        linksB?.forEach((l: any) => { if (l.entities) linked.push(l.entities); });
        setLinkedEntities(linked);
      } else {
        // Fall back to placeholder data
        const placeholder = PLACEHOLDER_ENTITIES.find((e) => e.id === id);
        if (placeholder) {
          setEntity(placeholder);
          setSummary(placeholder.summary);
          setFields(ENTITY_FIELDS_FALLBACK[id] || {});
          setTags(placeholder.tags.map((t) => ({ id: t, name: t, color: null })));
          // Linked from placeholder
          const linked = PLACEHOLDER_ENTITIES.filter(
            (e) => e.id !== id && e.category === placeholder.category
          ).slice(0, 3);
          setLinkedEntities(linked.map((e) => ({ id: e.id, name: e.name, category: e.category })));
        }
      }
      setLoading(false);
    };
    fetchEntity();
  }, [id]);

  // ─── Auto-save sections (debounced) ─────────────────────
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const saveSectionsToDb = useDebouncedCallback(async (newSections: Record<string, string>) => {
    if (!id) return;
    const { error } = await supabase
      .from("entities")
      .update({ sections: newSections as unknown as Json })
      .eq("id", id);
    if (error) console.error("Failed to save sections:", error);
  }, 1000);

  const handleSectionInput = useCallback((sectionName: string, content: string) => {
    const updated = { ...sectionsRef.current, [sectionName]: content };
    sectionsRef.current = updated;
    saveSectionsToDb(updated);
  }, [saveSectionsToDb]);

  // ─── Save summary on blur ──────────────────────────────
  const saveSummary = useCallback(async () => {
    if (!id) return;
    const { error } = await supabase
      .from("entities")
      .update({ summary })
      .eq("id", id);
    if (error) console.error("Failed to save summary:", error);
  }, [id, summary]);

  // ─── Save fields on blur ──────────────────────────────
  const saveFields = useCallback(async (updatedFields: Record<string, string>) => {
    if (!id) return;
    const { error } = await supabase
      .from("entities")
      .update({ fields: updatedFields as unknown as Json })
      .eq("id", id);
    if (error) console.error("Failed to save fields:", error);
  }, [id]);

  const handleSaveFieldEdit = useCallback((key: string) => {
    const updated = { ...fields, [key]: editingFieldValue };
    setFields(updated);
    setEditingField(null);
    saveFields(updated);
  }, [fields, editingFieldValue, saveFields]);

  const handleAddField = useCallback(() => {
    const key = newFieldKey.trim();
    const value = newFieldValue.trim();
    if (key) {
      const updated = { ...fields, [key]: value || "—" };
      setFields(updated);
      saveFields(updated);
    }
    setNewFieldKey("");
    setNewFieldValue("");
    setIsAddingField(false);
  }, [newFieldKey, newFieldValue, fields, saveFields]);

  // ─── Image upload to storage ──────────────────────────
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || "anonymous";
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from("entity-images")
      .upload(path, file, { contentType: file.type });

    if (error) {
      console.error("Upload failed:", error);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("entity-images")
      .getPublicUrl(path);

    return publicUrl;
  }, [id]);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setCoverImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    // Upload and save URL
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
      // Preview
      const previewUrl = URL.createObjectURL(file);
      setGalleryImages((prev) => [...prev, previewUrl]);

      const url = await uploadImage(file);
      if (url) {
        setGalleryImages((prev) => {
          const updated = prev.map((p) => (p === previewUrl ? url : p));
          // Save to DB
          supabase.from("entities").update({ gallery_image_urls: updated }).eq("id", id);
          return updated;
        });
      }
    }
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }, [id, uploadImage]);

  // ─── Tag management ─────────────────────────────────────
  const handleRemoveTag = useCallback(async (tagId: string) => {
    if (!id) return;
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    const { error } = await supabase
      .from("entity_tags")
      .delete()
      .eq("entity_id", id)
      .eq("tag_id", tagId);
    if (error) console.error("Failed to remove tag:", error);
  }, [id]);

  const handleTagApplied = useCallback((tag: { id: string; name: string; color: string | null }) => {
    setTags((prev) => [...prev, tag]);
    setAllProjectTags((prev) => {
      if (prev.some((t) => t.id === tag.id)) return prev;
      return [...prev, tag];
    });
  }, []);

  // ─── Linked entities ─────────────────────────────────────
  const handleEntityLinked = useCallback((ent: { id: string; name: string; category: string }) => {
    setLinkedEntities((prev) => [...prev, ent]);
  }, []);

  if (loading) {
    return (
      <AppLayout projectName="The Shattered Vigil">
        <div className="p-6 text-text-secondary text-sm">Loading entity…</div>
      </AppLayout>
    );
  }

  if (!entity) {
    return (
      <AppLayout projectName="The Shattered Vigil">
        <div className="p-6 text-text-secondary">Entity not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout projectName="The Shattered Vigil">
      <div className="p-6 max-w-5xl">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-text-secondary text-xs hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          Back to gallery
        </button>

        {/* ===== 1. HEADER BLOCK ===== */}
        <div className="flex gap-6 mb-10">
          {/* Cover image portrait */}
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
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverUpload}
              className="hidden"
            />
          </div>

          {/* Header info */}
          <div className="flex-1 min-w-0 pt-1">
            <h1 className="font-display text-3xl text-foreground mb-2 leading-tight">
              {entity.name}
            </h1>
            <span
              className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full mb-4 ${CATEGORY_COLORS[entity.category]}`}
            >
              {entity.category}
            </span>

            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={saveSummary}
              className="block w-full text-sm text-text-secondary bg-transparent border-b border-transparent hover:border-border focus:border-gold/40 outline-none pb-1 mb-4 transition-colors placeholder:text-text-dimmed"
              placeholder="Write a short description…"
            />

            {/* Tags with autocomplete */}
            <div className="flex flex-wrap gap-2 items-center">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-fyrescribe-hover text-text-secondary border border-border"
                >
                  {tag.name}
                  <button onClick={() => handleRemoveTag(tag.id)}>
                    <X size={10} className="text-text-dimmed hover:text-destructive cursor-pointer" />
                  </button>
                </span>
              ))}
              {isAddingTag ? (
                <TagAutocomplete
                  entityId={id!}
                  projectId={projectId}
                  tags={allProjectTags}
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

        {/* ===== BODY + AT A GLANCE LAYOUT ===== */}
        <div className="flex gap-8">
          {/* Left: Article body */}
          <div className="flex-1 min-w-0">
            <div className="space-y-0">
              {sectionList.map((section, i) => (
                <div key={section}>
                  {i > 0 && <div className="border-t border-border" />}
                  <div className="py-6">
                    <h2 className="font-display text-base text-foreground mb-3 tracking-wide">
                      {section}
                    </h2>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="font-prose text-sm leading-[1.85] text-text-secondary outline-none min-h-[3rem] focus:text-foreground transition-colors empty:before:content-[attr(data-placeholder)] empty:before:text-text-dimmed empty:before:pointer-events-none"
                      data-placeholder={SECTION_PLACEHOLDER_TEXT[section] || "Write here…"}
                      onInput={(e) => handleSectionInput(section, (e.target as HTMLDivElement).innerHTML)}
                      ref={(el) => {
                        if (el && !el.dataset.initialized) {
                          el.innerHTML = sections[section] || "";
                          el.dataset.initialized = "true";
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ===== 4. GALLERY ===== */}
            <div className="border-t border-border pt-8 mt-4 mb-8">
              <h2 className="font-display text-base text-foreground mb-4 tracking-wide">
                Gallery
              </h2>
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
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryUpload}
                className="hidden"
              />
            </div>

            {/* ===== 5. LINKED ENTITIES ===== */}
            <div className="border-t border-border pt-8 mb-8">
              <h2 className="font-display text-base text-foreground mb-4 tracking-wide">
                Linked Entities
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {linkedEntities.map((linked) => (
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
          </div>

          {/* ===== 3. AT A GLANCE PANEL ===== */}
          <div className="w-[260px] flex-shrink-0">
            <div className="sticky top-16">
              <div className="bg-fyrescribe-raised border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed">
                    At a Glance
                  </h3>
                </div>
                <div className="divide-y divide-border">
                  {Object.entries(fields).map(([key, value]) => (
                    <div key={key} className="px-4 py-2.5">
                      <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-1">
                        {key}
                      </div>
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
                        <button
                          onClick={() => { setEditingField(key); setEditingFieldValue(value); }}
                          className="text-sm text-foreground hover:text-gold-bright transition-colors text-left w-full"
                        >
                          {value}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {isAddingField ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleAddField(); }}
                    className="px-4 py-3 border-t border-border space-y-2"
                  >
                    <input
                      autoFocus
                      value={newFieldKey}
                      onChange={(e) => setNewFieldKey(e.target.value)}
                      placeholder="Field name"
                      className="text-xs text-foreground bg-transparent border-b border-gold/40 outline-none w-full pb-1"
                    />
                    <input
                      value={newFieldValue}
                      onChange={(e) => setNewFieldValue(e.target.value)}
                      placeholder="Value"
                      className="text-xs text-foreground bg-transparent border-b border-border outline-none w-full pb-1"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="text-[10px] text-gold hover:text-gold-bright">Save</button>
                      <button type="button" onClick={() => setIsAddingField(false)} className="text-[10px] text-text-dimmed hover:text-text-secondary">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setIsAddingField(true)}
                    className="w-full px-4 py-2.5 text-xs text-text-dimmed hover:text-text-secondary flex items-center justify-center gap-1 border-t border-border transition-colors"
                  >
                    <Plus size={11} />
                    Add field
                  </button>
                )}
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
    </AppLayout>
  );
};

const EntityDetailPage = () => {
  const { id } = useParams();
  return <EntityDetailInner key={id} />;
};

export default EntityDetailPage;
