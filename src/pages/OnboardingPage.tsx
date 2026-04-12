import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import logoSrc from "@/assets/fyrescribe_logo_white.svg";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import NewProjectModal from "@/components/NewProjectModal";
import StarfieldBackground from "@/components/StarfieldBackground";

const ACCEPTED_EXTENSIONS = ["txt", "rtf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative">
      <StarfieldBackground />

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo with amber glow */}
        <div className="mb-10 relative">
          <div
            className="absolute inset-0 rounded-full blur-3xl opacity-30"
            style={{ background: "radial-gradient(circle, hsl(var(--gold)) 0%, transparent 70%)", transform: "scale(1.5)" }}
          />
          <img
            src={logoSrc}
            alt="Fyrescribe"
            className="w-[300px] relative z-10"
          />
        </div>

        <h1 className="font-display text-3xl text-foreground tracking-wide mb-10">
          How would you like to begin?
        </h1>

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
            <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-medium text-gold bg-gold-glow border border-gold/20 rounded-full px-2.5 py-0.5">
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
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateFile = (f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Only .txt and .rtf files are accepted. You dropped a .${ext} file.`;
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File is too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`;
    }
    return null;
  };

  const acceptFile = (f: File) => {
    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setFile(f);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.\w+$/, ""));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
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

    const ext = file.name.split(".").pop() ?? "txt";
    const storagePath = `${user.id}/${project.id}/manuscript.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("manuscripts")
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      setError(`Project created but file upload failed: ${uploadError.message}`);
      setSaving(false);
      onCreated(project);
      return;
    }

    const { error: updateError } = await supabase
      .from("projects")
      .update({ manuscript_path: storagePath } as any)
      .eq("id", project.id);

    if (updateError) {
      console.error("Failed to save manuscript path:", updateError);
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

        {/* File upload with drag & drop */}
        <div className="mb-5">
          <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
            Manuscript file <span className="text-gold">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.rtf"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`w-full bg-fyrescribe-hover border border-dashed rounded-lg px-3 py-4 text-sm text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors flex flex-col items-center gap-1 ${
              dragOver ? "border-gold text-gold" : "border-border"
            }`}
          >
            {file ? (
              <span className="text-foreground truncate max-w-full">{file.name}</span>
            ) : (
              <>
                <Upload size={18} />
                <span>Drop a file here, or click to browse</span>
                <span className="text-[11px] text-text-dimmed">.txt or .rtf — max 10MB</span>
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
              "Import"
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
