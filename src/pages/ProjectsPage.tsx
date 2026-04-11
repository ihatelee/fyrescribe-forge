import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, X } from "lucide-react";
import Titlebar from "@/components/Titlebar";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";

interface Project {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

// ─── New Project Modal ───────────────────────────────────────────────

interface NewProjectModalProps {
  onCreated: (project: { id: string; title: string }) => void;
  onClose: () => void;
}

const NewProjectModal = ({ onCreated, onClose }: NewProjectModalProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setSaving(true);
    setError(null);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Could not read your auth session. Please sign in and try again.");
      setSaving(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("projects")
      .insert({
        title: trimmedTitle,
        description: description.trim() || null,
        user_id: user.id,
      })
      .select("id, title")
      .single();

    if (insertError) {
      setError(insertError.message);
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
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-base text-foreground">New Project</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-dimmed hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Title <span className="text-gold">*</span>
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My fantasy novel…"
            className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed"
          />
        </div>

        <div className="mb-5">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Description <span className="text-text-dimmed normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of your project…"
            rows={3}
            className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed resize-none"
          />
        </div>

        {error && (
          <p className="text-destructive text-xs mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Project"}
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

// ─── Projects Page ───────────────────────────────────────────────────

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
      setProjects(data || []);
      setLoading(false);
    };
    fetchProjects();
  }, []);

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
