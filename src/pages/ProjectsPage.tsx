import { Plus } from "lucide-react";
import Titlebar from "@/components/Titlebar";
import { PLACEHOLDER_PROJECTS } from "@/lib/placeholder-data";
import { useNavigate } from "react-router-dom";

const ProjectsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-fyrescribe-deepest">
      <Titlebar />
      <main className="pt-12">
        <div className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-2xl text-foreground tracking-wide">
              Your Projects
            </h1>
            <button className="flex items-center gap-2 px-4 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors">
              <Plus size={16} />
              New Project
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {PLACEHOLDER_PROJECTS.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate("/manuscript")}
                className="text-left bg-fyrescribe-raised border border-border rounded-xl p-5 hover:border-gold/20 transition-all group animate-fade-in"
              >
                <h2 className="font-display text-lg text-foreground group-hover:text-gold-bright transition-colors mb-1">
                  {project.title}
                </h2>
                <p className="text-text-secondary text-sm mb-4 line-clamp-2">
                  {project.description}
                </p>
                <div className="flex items-center justify-between text-text-dimmed text-xs">
                  <span>{project.last_edited}</span>
                  <span>{project.word_count.toLocaleString()} words</span>
                </div>
              </button>
            ))}

            {/* New project ghost card */}
            <button className="border border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors min-h-[140px]">
              <Plus size={24} />
              <span className="text-sm">Create new project</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProjectsPage;
