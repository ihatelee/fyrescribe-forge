import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import NewProjectModal from "@/components/NewProjectModal";

const ACCEPTED_TYPES = ".txt,.rtf,.docx";

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { setActiveProject } = useActiveProject();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const handleProjectCreated = (project: { id: string; title: string }) => {
    setActiveProject({ id: project.id, title: project.title });
    navigate(`/project/${project.id}/manuscript`);
  };

  return (
    <div className="min-h-screen bg-[#0a0c12] flex flex-col items-center justify-center px-4">
      <img src={logoSrc} alt="Fyrescribe" className="h-8 mb-8" />

      <h1 className="font-display text-3xl text-foreground tracking-wide mb-2">
        Welcome to Fyrescribe
      </h1>
      <p className="text-text-dimmed text-sm mb-10">
        How would you like to begin?
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Start fresh */}
        <button
          onClick={() => setShowNewProject(true)}
          className="group text-left bg-fyrescribe-raised border border-border rounded-xl p-8 hover:border-gold/30 transition-all flex flex-col items-center text-center"
        >
          <div className="w-14 h-14 rounded-full bg-fyrescribe-hover border border-border flex items-center justify-center mb-5 group-hover:border-gold/30 transition-colors">
            <FileText size={24} className="text-text-secondary group-hover:text-gold transition-colors" />
          </div>
          <h2 className="font-display text-lg text-foreground mb-2">Start fresh</h2>
          <p className="text-text-dimmed text-sm leading-relaxed">
            Begin a new project from scratch
          </p>
        </button>

        {/* Import a manuscript */}
        <button
          onClick={() => setShowImport(true)}
          className="group text-left bg-fyrescribe-raised border border-border rounded-xl p-8 hover:border-gold/30 transition-all flex flex-col items-center text-center relative"
        >
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-medium text-gold bg-gold/10 border border-gold/20 rounded-full px-2.5 py-0.5">
            Uses AI credits
          </span>
          <div className="w-14 h-14 rounded-full bg-fyrescribe-hover border border-border flex items-center justify-center mb-5 group-hover:border-gold/30 transition-colors">
            <Upload size={24} className="text-text-secondary group-hover:text-gold transition-colors" />
          </div>
          <h2 className="font-display text-lg text-foreground mb-2">Import a manuscript</h2>
          <p className="text-text-dimmed text-sm leading-relaxed">
            Upload an existing story and we'll build your world bible automatically
          </p>
        </button>
      </div>

      {showNewProject && (
        <NewProjectModal
          onCreated={handleProjectCreated}
          onClose={() => setShowNewProject(false)}
        />
      )}

      {showImport && (
        <ImportModal
          onCreated={handleProjectCreated}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
};

/* ── Import modal ──────────────────────────────────────────────── */

interface ImportModalProps {
  onCreated: (project: { id: string; title: string }) => void;
  onClose: () => void;
}

const ImportModal = ({ onCreated, onClose }: ImportModalProps) => {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !title.trim()) {
      setTitle(f.name.replace(/\.\w+$/, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !file) return;

    setSaving(true);
    setError(null);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Could not read your auth session. Please sign in and try again.");
      setSaving(false);
      return;
    }

    // 1. Create the project
    const { data: project, error: insertError } = await supabase
      .from("projects")
      .insert({ title: trimmedTitle, user_id: user.id })
      .select("id, title")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    // 2. Upload file to storage
    const ext = file.name.split(".").pop() ?? "txt";
    const storagePath = `${user.id}/${project.id}/manuscript.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("manuscripts")
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      setError(`Project created but file upload failed: ${uploadError.message}`);
      setSaving(false);
      // Still navigate — the project exists
      onCreated(project);
      return;
    }

    onCreated(project);
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
          <h2 className="font-display text-base text-foreground">Import Manuscript</h2>
          <button type="button" onClick={onClose} className="text-text-dimmed hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Project Title <span className="text-gold">*</span>
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My fantasy novel…"
            className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 placeholder:text-text-dimmed"
          />
        </div>

        {/* File upload */}
        <div className="mb-5">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Manuscript file <span className="text-gold">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full bg-fyrescribe-hover border border-dashed border-border rounded-lg px-3 py-4 text-sm text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors flex flex-col items-center gap-1"
          >
            {file ? (
              <span className="text-foreground truncate max-w-full">{file.name}</span>
            ) : (
              <>
                <Upload size={18} />
                <span>.txt, .rtf, or .docx</span>
              </>
            )}
          </button>
        </div>

        {error && <p className="text-destructive text-xs mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!title.trim() || !file || saving}
            className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Importing…
              </>
            ) : (
              "Import & Analyse"
            )}
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

export default OnboardingPage;
