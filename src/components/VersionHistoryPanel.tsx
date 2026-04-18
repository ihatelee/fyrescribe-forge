import { useEffect, useState } from "react";
import { X, RotateCcw, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface SceneVersion {
  id: string;
  scene_id: string;
  project_id: string;
  name: string | null;
  content: string;
  word_count: number;
  word_delta: number;
  summary: string | null;
  created_at: string;
}

interface VersionHistoryPanelProps {
  sceneId: string;
  sceneTitle: string;
  onClose: () => void;
  onRestore: (version: SceneVersion) => Promise<void>;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const VersionHistoryPanel = ({
  sceneId,
  sceneTitle,
  onClose,
  onRestore,
}: VersionHistoryPanelProps) => {
  const [versions, setVersions] = useState<SceneVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let isInitial = true;
    const load = async () => {
      if (isInitial) setLoading(true);
      const { data, error } = await supabase
        .from("scene_versions")
        .select("*")
        .eq("scene_id", sceneId)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        if (error) console.error("Failed to load versions:", error);
        setVersions((data as SceneVersion[]) ?? []);
        if (isInitial) {
          setLoading(false);
          isInitial = false;
        }
      }
    };
    load();
    // Re-poll every 4s while panel is open so AI summaries appear when ready.
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sceneId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmId) setConfirmId(null);
        else if (confirmDeleteId) setConfirmDeleteId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmId, confirmDeleteId, onClose]);

  const handleRestore = async (v: SceneVersion) => {
    setRestoring(v.id);
    try {
      await onRestore(v);
    } finally {
      setRestoring(null);
      setConfirmId(null);
    }
  };

  const handleDelete = async (v: SceneVersion) => {
    setDeleting(v.id);
    try {
      const { error } = await supabase
        .from("scene_versions")
        .delete()
        .eq("id", v.id);
      if (error) {
        console.error("Failed to delete version:", error);
      } else {
        setVersions((prev) => prev.filter((x) => x.id !== v.id));
      }
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[90]"
        onClick={onClose}
      />

      {/* Slide-over */}
      <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-fyrescribe-base border-l border-border z-[100] flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display text-base text-foreground">Version History</h2>
            <p className="text-[10px] uppercase tracking-widest text-text-dimmed mt-0.5">
              {sceneTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Warning banner */}
        <div className="px-5 py-3 bg-destructive/10 border-b border-destructive/20 flex items-start gap-2">
          <AlertTriangle size={12} className="text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Restoring a version will overwrite any changes made after it was saved.
            This cannot be undone.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={16} className="animate-spin text-text-dimmed" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-text-dimmed text-3xl mb-4 leading-none">✦</div>
              <p className="text-sm text-text-secondary mb-1">No versions saved yet</p>
              <p className="text-xs text-text-dimmed">
                Click Save Version to create your first checkpoint.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v, idx) => {
                const displayName =
                  v.name && v.name.trim().length > 0
                    ? v.name
                    : `Version ${versions.length - idx}`;
                const isConfirming = confirmId === v.id;
                const isConfirmingDelete = confirmDeleteId === v.id;
                const isRestoring = restoring === v.id;
                const isDeleting = deleting === v.id;
                const deltaSign = v.word_delta > 0 ? "+" : "";
                const deltaColor =
                  v.word_delta > 0
                    ? "text-gold"
                    : v.word_delta < 0
                    ? "text-destructive"
                    : "text-text-dimmed";

                return (
                  <div
                    key={v.id}
                    className="bg-fyrescribe-raised border border-border rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground font-medium truncate">
                          {displayName}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-text-dimmed mt-0.5">
                          {formatDate(v.created_at)}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded bg-fyrescribe-base border border-border ${deltaColor} flex-shrink-0`}
                      >
                        {deltaSign}
                        {v.word_delta} words
                      </span>
                    </div>

                    <p className="text-[11px] text-text-secondary italic leading-relaxed mt-2 min-h-[1.2em]">
                      {v.summary ?? (
                        <span className="text-text-dimmed not-italic inline-flex items-center gap-1">
                          <Loader2 size={9} className="animate-spin" />
                          Generating summary…
                        </span>
                      )}
                    </p>

                    <div className="flex items-center justify-end mt-3 gap-1.5">
                      {isConfirming ? (
                        <>
                          <span className="text-[10px] text-text-dimmed mr-auto">
                            Overwrite current scene?
                          </span>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-2 py-1 text-[10px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRestore(v)}
                            disabled={isRestoring}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
                          >
                            {isRestoring ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <RotateCcw size={10} />
                            )}
                            Confirm restore
                          </button>
                        </>
                      ) : isConfirmingDelete ? (
                        <>
                          <span className="text-[10px] text-text-dimmed mr-auto">
                            Delete this version?
                          </span>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[10px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(v)}
                            disabled={isDeleting}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <Trash2 size={10} />
                            )}
                            Confirm delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setConfirmDeleteId(v.id)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-text-dimmed hover:text-destructive hover:bg-fyrescribe-hover transition-colors"
                          >
                            <Trash2 size={10} />
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmId(v.id)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                          >
                            <RotateCcw size={10} />
                            Restore
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default VersionHistoryPanel;
