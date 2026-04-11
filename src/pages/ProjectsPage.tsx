import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2 } from "lucide-react";
import Titlebar from "@/components/Titlebar";
import NewProjectModal from "@/components/NewProjectModal";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";

interface Project {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { setActiveProject } = useActiveProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, description, created_at")
        .order("created_at", { ascending: false });
      if (error) console.error("Failed to fetch projects:", error);

      const list = data || [];
      if (list.length === 0) {
        navigate("/onboarding", { replace: true });
        return;
      }

      setProjects(list);
      setLoading(false);
    };
    fetchProjects();
  }, [navigate]);

  const openProject = (project: { id: string; title: string }) => {
    setActiveProject({ id: project.id, title: project.title });
    navigate(`/project/${project.id}/manuscript`);
  };

  const handleProjectCreated = (project: { id: string; title: string }) => {
    openProject(project);
  };

  return (
    <div className="min-h-screen bg-fyrescribe-deepest">
      <Titlebar />
      <main className="pt-12">
        <div className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-2xl text-foreground tracking-wide">
              Your Projects
            </h1>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors"
            >
              <Plus size={16} />
              New Project
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={20} className="animate-spin text-text-dimmed" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => openProject(project)}
                  className="text-left bg-fyrescribe-raised border border-border rounded-xl p-5 hover:border-gold/20 transition-all group animate-fade-in"
                >
                  <h2 className="font-display text-lg text-foreground group-hover:text-gold-bright transition-colors mb-1">
                    {project.title}
                  </h2>
                  {project.description && (
                    <p className="text-text-secondary text-sm mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <div className="text-text-dimmed text-xs">
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                </button>
              ))}

              <button
                onClick={() => setShowModal(true)}
                className="border border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors min-h-[140px]"
              >
                <Plus size={24} />
                <span className="text-sm">Create new project</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <NewProjectModal
          onCreated={handleProjectCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

export default ProjectsPage;
