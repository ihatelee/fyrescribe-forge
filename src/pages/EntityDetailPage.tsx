import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_ENTITIES } from "@/lib/placeholder-data";
import { ArrowLeft, Plus, X, Image as ImageIcon, Upload, ZoomIn } from "lucide-react";

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

const ENTITY_FIELDS: Record<string, Record<string, string>> = {
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

const EntityDetailInner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const entity = PLACEHOLDER_ENTITIES.find((e) => e.id === id);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [tags, setTags] = useState<string[]>(entity?.tags || []);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>(ENTITY_FIELDS[id || ""] || {});
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  const [summary, setSummary] = useState(entity?.summary || "");

  const sections = CATEGORY_SECTIONS[entity?.category || "characters"] || [];

  const linkedEntities = PLACEHOLDER_ENTITIES.filter(
    (e) => e.id !== entity?.id && e.category === entity?.category
  ).slice(0, 3);

  const handleAddTag = useCallback(() => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setNewTag("");
    setIsAddingTag(false);
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleCoverUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setCoverImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleGalleryUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setGalleryImages((prev) => [...prev, ev.target?.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }, []);

  const handleAddField = useCallback(() => {
    const key = newFieldKey.trim();
    const value = newFieldValue.trim();
    if (key) {
      setFields((prev) => ({ ...prev, [key]: value || "—" }));
    }
    setNewFieldKey("");
    setNewFieldValue("");
    setIsAddingField(false);
  }, [newFieldKey, newFieldValue]);

  const handleSaveFieldEdit = useCallback((key: string) => {
    setFields((prev) => ({ ...prev, [key]: editingFieldValue }));
    setEditingField(null);
  }, [editingFieldValue]);

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

            {/* Editable summary */}
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="block w-full text-sm text-text-secondary bg-transparent border-b border-transparent hover:border-border focus:border-gold/40 outline-none pb-1 mb-4 transition-colors placeholder:text-text-dimmed"
              placeholder="Write a short description…"
            />

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-fyrescribe-hover text-text-secondary border border-border"
                >
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)}>
                    <X size={10} className="text-text-dimmed hover:text-destructive cursor-pointer" />
                  </button>
                </span>
              ))}
              {isAddingTag ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleAddTag(); }}
                  className="flex items-center"
                >
                  <input
                    autoFocus
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onBlur={handleAddTag}
                    placeholder="Tag name…"
                    className="text-xs px-3 py-1 rounded-full border border-gold/40 bg-fyrescribe-hover text-foreground outline-none w-28"
                  />
                </form>
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
            {/* ===== 2. ARTICLE BODY ===== */}
            <div className="space-y-0">
              {sections.map((section, i) => (
                <div key={section}>
                  {i > 0 && (
                    <div className="border-t border-border my-0" />
                  )}
                  <div className="py-6">
                    <h2 className="font-display text-base text-foreground mb-3 tracking-wide">
                      {section}
                    </h2>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="font-prose text-sm leading-[1.85] text-text-secondary outline-none min-h-[3rem] focus:text-foreground transition-colors"
                      data-placeholder={SECTION_PLACEHOLDER_TEXT[section] || "Write here…"}
                      style={{ position: "relative" }}
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
                    <span className="font-display text-sm text-foreground">
                      {linked.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${CATEGORY_COLORS[linked.category]}`}
                    >
                      {linked.category}
                    </span>
                  </button>
                ))}
                <button className="flex items-center justify-center gap-1.5 px-4 py-3 border border-dashed border-border rounded-lg text-text-dimmed hover:text-text-secondary text-xs transition-colors">
                  <Plus size={12} />
                  Link entity
                </button>
              </div>
            </div>
          </div>

          {/* ===== 3. AT A GLANCE PANEL (right sidebar) ===== */}
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
