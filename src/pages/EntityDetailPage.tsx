import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_ENTITIES } from "@/lib/placeholder-data";
import { ArrowLeft, Plus, X, Image } from "lucide-react";

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

const PLACEHOLDER_FIELDS: Record<string, string> = {
  "Age": "34",
  "Title": "Warden of the Northern Watch",
  "Allegiance": "The Vigil",
  "Notable Trait": "Carries guilt from the Last Siege",
};

const EntityDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const entity = PLACEHOLDER_ENTITIES.find((e) => e.id === id);

  if (!entity) {
    return (
      <AppLayout projectName="The Shattered Vigil">
        <div className="p-6 text-text-secondary">Entity not found.</div>
      </AppLayout>
    );
  }

  const linkedEntities = PLACEHOLDER_ENTITIES.filter(
    (e) => e.id !== entity.id && e.category === entity.category
  ).slice(0, 3);

  return (
    <AppLayout projectName="The Shattered Vigil">
      <div className="p-6 max-w-3xl">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-text-secondary text-xs hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          Back to gallery
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          {/* Cover image placeholder */}
          <div className="w-24 h-28 bg-fyrescribe-raised border border-border rounded-lg flex items-center justify-center flex-shrink-0">
            <Image size={20} className="text-text-dimmed" />
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
            {Object.entries(PLACEHOLDER_FIELDS).map(([key, value]) => (
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
            {entity.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-fyrescribe-hover text-text-secondary border border-border"
              >
                {tag}
                <X size={10} className="text-text-dimmed hover:text-destructive cursor-pointer" />
              </span>
            ))}
            <button className="text-xs px-3 py-1 rounded-full border border-dashed border-border text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors">
              + Add tag
            </button>
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

export default EntityDetailPage;
