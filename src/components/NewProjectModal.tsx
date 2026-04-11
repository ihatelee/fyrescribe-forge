import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

export default NewProjectModal;
