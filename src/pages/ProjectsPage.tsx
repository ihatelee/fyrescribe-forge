import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, MoreVertical, Copy, Archive, Trash2, ChevronDown, Pencil, Download } from "lucide-react";
import Titlebar from "@/components/Titlebar";
import ExportModal from "@/components/ExportModal";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Project {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  archived_at: string | null;
}

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { setActiveProject } = useActiveProject();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Unarchive confirmation state
  const [unarchiveTarget, setUnarchiveTarget] = useState<Project | null>(null);

  // Export modal state
  const [exportTarget, setExportTarget] = useState<Project | null>(null);

  // Inline title editing
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState("");

  const saveProjectTitle = async (projectId: string) => {
    const trimmed = editingProjectTitle.trim();
    setEditingProjectId(null);
    if (!trimmed) return;
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, title: trimmed } : p));
    await supabase.from("projects").update({ title: trimmed }).eq("id", projectId);
  };

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id, title, description, created_at, archived_at")
      .order("created_at", { ascending: false });
    if (error) console.error("Failed to fetch projects:", error);

    const list = (data as Project[]) || [];
    if (list.length === 0) {
      navigate("/onboarding", { replace: true });
      return;
    }

    setProjects(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, [navigate]);

  const activeProjects = projects.filter((p) => !p.archived_at);
  const archivedProjects = projects.filter((p) => !!p.archived_at);

  const openProject = (project: { id: string; title: string }) => {
    setActiveProject({ id: project.id, title: project.title });
    navigate(`/project/${project.id}/manuscript`);
  };

  const handleDuplicate = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .insert({
        title: `${project.title} (copy)`,
        description: project.description,
        user_id: user.id,
      })
      .select("id, title, description, created_at, archived_at")
      .single();
    if (error) {
      console.error("Failed to duplicate:", error);
      return;
    }
    if (data) setProjects((prev) => [data as Project, ...prev]);
  };

  const handleArchive = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", project.id);
    if (error) {
      console.error("Failed to archive:", error);
      return;
    }
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id ? { ...p, archived_at: new Date().toISOString() } : p
      )
    );
  };

  const handleUnarchive = async () => {
    if (!unarchiveTarget) return;
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: null })
      .eq("id", unarchiveTarget.id);
    if (error) {
      console.error("Failed to unarchive:", error);
      return;
    }
    setProjects((prev) =>
      prev.map((p) =>
        p.id === unarchiveTarget.id ? { ...p, archived_at: null } : p
      )
    );
    setUnarchiveTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const pid = deleteTarget.id;
    // Delete related records first, then project
    await supabase.from("scenes").delete().eq("project_id", pid);
    await supabase.from("chapters").delete().eq("project_id", pid);
    await supabase.from("entities").delete().eq("project_id", pid);
    await supabase.from("tags").delete().eq("project_id", pid);
    await supabase.from("timeline_events").delete().eq("project_id", pid);
    await supabase.from("lore_suggestions").delete().eq("project_id", pid);
    await supabase.from("sync_log").delete().eq("project_id", pid);
    const { error } = await supabase.from("projects").delete().eq("id", pid);
    if (error) {
      console.error("Failed to delete:", error);
      return;
    }
    const remaining = projects.filter((p) => p.id !== pid);
    setProjects(remaining);
    setDeleteTarget(null);
    setDeleteConfirmText("");
    if (remaining.length === 0) {
      navigate("/onboarding", { replace: true });
    }
  };

  return (
    <div className="min-h-screen">
      <Titlebar />
      <main className="pt-20">
        <div className="max-w-5xl mx-auto px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-display text-2xl text-foreground tracking-wide">
              Your Projects
            </h1>
            <button
              onClick={() => navigate("/onboarding")}
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
            <>
              {/* Active projects */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => openProject(project)}
                    className="relative text-left bg-fyrescribe-raised border border-border rounded-xl p-5 hover:border-gold/20 transition-all group animate-fade-in cursor-pointer"
                  >
                    {/* Three-dot menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center text-text-dimmed hover:text-foreground hover:bg-fyrescribe-base transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        <DropdownMenuItem onClick={(e) => handleDuplicate(project, e)} className="cursor-pointer">
                          <Copy size={14} className="mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setExportTarget(project);
                          }}
                          className="cursor-pointer"
                        >
                          <Download size={14} className="mr-2" />
                          Export
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleArchive(project, e)} className="cursor-pointer">
                          <Archive size={14} className="mr-2" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(project);
                          }}
                          className="text-destructive cursor-pointer"
                        >
                          <Trash2 size={14} className="mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex items-center gap-1.5 pr-8 mb-1">
                      {editingProjectId === project.id ? (
                        <input
                          autoFocus
                          value={editingProjectTitle}
                          onChange={(e) => setEditingProjectTitle(e.target.value)}
                          onBlur={() => saveProjectTitle(project.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveProjectTitle(project.id);
                            if (e.key === "Escape") setEditingProjectId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="font-display text-lg text-foreground bg-transparent outline-none border-b border-gold/50 flex-1 min-w-0"
                        />
                      ) : (
                        <>
                          <h2 className="font-display text-lg text-foreground group-hover:text-gold-bright transition-colors truncate">
                            {project.title}
                          </h2>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProjectId(project.id);
                              setEditingProjectTitle(project.title);
                            }}
                            className="text-text-dimmed hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          >
                            <Pencil size={12} />
                          </button>
                        </>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-text-secondary text-sm mb-4 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    <div className="text-text-dimmed text-xs">
                      {new Date(project.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => navigate("/onboarding")}
                  className="border border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors min-h-[140px]"
                >
                  <Plus size={24} />
                  <span className="text-sm">Create new project</span>
                </button>
              </div>

              {/* Archived projects */}
              {archivedProjects.length > 0 && (
                <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen} className="mt-10">
                  <CollapsibleTrigger className="flex items-center gap-2 text-text-dimmed hover:text-text-secondary transition-colors text-sm mb-4">
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${archiveOpen ? "rotate-0" : "-rotate-90"}`}
                    />
                    Archived projects ({archivedProjects.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {archivedProjects.map((project) => (
                        <button
                          key={project.id}
                          onClick={() => setUnarchiveTarget(project)}
                          className="text-left bg-fyrescribe-raised/50 border border-border/50 rounded-xl p-5 opacity-60 hover:opacity-80 transition-all cursor-pointer"
                        >
                          <h2 className="font-display text-lg text-foreground mb-1">
                            {project.title}
                          </h2>
                          {project.description && (
                            <p className="text-text-secondary text-sm mb-4 line-clamp-2">
                              {project.description}
                            </p>
                          )}
                          <div className="text-text-dimmed text-xs">
                            Archived {project.archived_at ? new Date(project.archived_at).toLocaleDateString() : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </div>
      </main>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete project</AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              This action cannot be undone. Type{" "}
              <span className="font-mono text-destructive font-semibold">PERMANENTLY DELETE</span>{" "}
              to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type PERMANENTLY DELETE"
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-text-dimmed focus:outline-none focus:ring-1 focus:ring-destructive"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-fyrescribe-raised border-border text-foreground hover:bg-fyrescribe-base">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmText !== "PERMANENTLY DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:pointer-events-none"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unarchive confirmation dialog */}
      <AlertDialog open={!!unarchiveTarget} onOpenChange={(open) => { if (!open) setUnarchiveTarget(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Unarchive this project?</AlertDialogTitle>
            <AlertDialogDescription className="text-text-secondary">
              This will move "{unarchiveTarget?.title}" back to your active projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-fyrescribe-raised border-border text-foreground hover:bg-fyrescribe-base">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnarchive}
              className="bg-gold text-primary-foreground hover:bg-gold-bright"
            >
              Unarchive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {exportTarget && (
        <ExportModal
          projectId={exportTarget.id}
          projectTitle={exportTarget.title}
          onClose={() => setExportTarget(null)}
        />
      )}
    </div>
  );
};

export default ProjectsPage;
