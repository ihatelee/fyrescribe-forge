import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_ENTITIES } from "@/lib/placeholder-data";
import { ArrowLeft, Plus, X, Image as ImageIcon, Upload } from "lucide-react";

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

const EntityDetailInner = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const entity = PLACEHOLDER_ENTITIES.find((e) => e.id === id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tags, setTags] = useState<string[]>(entity?.tags || []);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);

  const fields = ENTITY_FIELDS[id || ""] || {};

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

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCoverImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  if (!entity) {
    return (
      <AppLayout projectName="The Shattered Vigil">
        <div className="p-6 text-text-secondary">Entity not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout projectName="The Shattered Vigil">
      <div className="p-6 max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-text-secondary text-xs hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          Back to gallery
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          {/* Cover image */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-28 bg-fyrescribe-raised border border-border rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer hover:border-gold/30 transition-colors overflow-hidden relative group"
          >
            {coverImage ? (
              <>
                <img src={coverImage} alt={entity.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload size={16} className="text-foreground" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 text-text-dimmed group-hover:text-text-secondary transition-colors">
                <ImageIcon size={18} />
                <span className="text-[9px]">Upload</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-display text-2xl text-foreground">
                {entity.name}
              </h1>
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full ${
                  CATEGORY_COLORS[entity.category]
                }`}
              >
                {entity.category}
              </span>
            </div>
            <p className="text-text-secondary text-sm leading-relaxed">
              {entity.summary}
            </p>
          </div>
        </div>

        {/* Custom fields */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium uppercase tracking-widest text-text-dimmed">
              Fields
            </h2>
            <button className="text-text-dimmed hover:text-text-secondary text-xs flex items-center gap-1">
              <Plus size={12} /> Add field
            </button>
          </div>
          <div className="bg-fyrescribe-raised border border-border rounded-lg divide-y divide-border">
            {Object.entries(fields).map(([key, value]) => (
              <div key={key} className="flex items-center px-4 py-2.5">
                <span className="text-text-secondary text-sm w-40 flex-shrink-0">
                  {key}
                </span>
                <span className="text-foreground text-sm">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Tags */}
        <section className="mb-8">
          <h2 className="text-xs font-medium uppercase tracking-widest text-text-dimmed mb-3">
            Tags
          </h2>
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
        </section>

        {/* Linked entities */}
        <section>
          <h2 className="text-xs font-medium uppercase tracking-widest text-text-dimmed mb-3">
            Linked Entities
          </h2>
          <div className="space-y-2">
            {linkedEntities.map((linked) => (
              <button
                key={linked.id}
                onClick={() => navigate(`/entity/${linked.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-fyrescribe-raised border border-border rounded-lg hover:border-gold/20 transition-colors text-left"
              >
                <span className="font-display text-sm text-foreground">
                  {linked.name}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    CATEGORY_COLORS[linked.category]
                  }`}
                >
                  {linked.category}
                </span>
              </button>
            ))}
            <button className="w-full flex items-center justify-center gap-1 px-4 py-2.5 border border-dashed border-border rounded-lg text-text-dimmed hover:text-text-secondary text-xs transition-colors">
              <Plus size={12} />
              Link entity
            </button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

// Use key={id} to force full re-render on entity change
const EntityDetailPage = () => {
  const { id } = useParams();
  return <EntityDetailInner key={id} />;
};

export default EntityDetailPage;
