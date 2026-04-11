import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_ENTITIES } from "@/lib/placeholder-data";
import { Plus } from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "characters", label: "Characters" },
  { value: "places", label: "Places" },
  { value: "events", label: "Events" },
  { value: "artifacts", label: "Artifacts" },
  { value: "creatures", label: "Creatures" },
  { value: "abilities", label: "Abilities" },
  { value: "factions", label: "Factions" },
  { value: "doctrine", label: "Doctrine" },
];

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

const EntityGalleryPage = () => {
  const { category } = useParams();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState(category || "all");

  // Sync filter when URL param changes
  useEffect(() => {
    setActiveFilter(category || "all");
  }, [category]);

  const filteredEntities =
    activeFilter === "all"
      ? PLACEHOLDER_ENTITIES
      : PLACEHOLDER_ENTITIES.filter((e) => e.category === activeFilter);

  const handleFilterChange = (value: string) => {
    setActiveFilter(value);
    if (value === "all") {
      navigate("/world");
    } else {
      navigate(`/world/${value}`);
    }
  };

  return (
    <AppLayout projectName="The Shattered Vigil">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-xl text-foreground tracking-wide">
            {category
              ? category.charAt(0).toUpperCase() + category.slice(1)
              : "World & Lore"}
          </h1>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors">
            <Plus size={14} />
            New Entity
          </button>
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

        {/* Entity grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredEntities.map((entity) => (
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
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    CATEGORY_COLORS[entity.category]
                  }`}
                >
                  {entity.category}
                </span>
              </div>
              <p className="text-text-secondary text-xs mb-3 line-clamp-2">
                {entity.summary}
              </p>
              <div className="flex flex-wrap gap-1">
                {entity.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-fyrescribe-hover text-text-dimmed"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default EntityGalleryPage;
