import { useState, useEffect, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Plus,
  MoreVertical,
  Trash2,
  Loader2,
  StickyNote,
  PanelLeft,
  X,
} from "lucide-react";

interface Note {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: string;
  updated_at: string;
}

const snippetOf = (html: string): string => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
};

const NotesPage = () => {
  const { activeProject } = useActiveProject();
  const { theme } = useTheme();
  const { user } = useAuth();
  const labelStyle = theme === "outrun" ? { color: "hsl(var(--neon-yellow))" } : undefined;

  type TextSize = "small" | "medium" | "large" | "xl";
  const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
    small: "text-[16px]",
    medium: "text-[20px]",
    large: "text-[24px]",
    xl: "text-[28px]",
  };
  const [textSize, setTextSize] = useState<TextSize>("small");

  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const contentCache = useRef<Map<string, string>>(new Map());
  const titleCache = useRef<Map<string, string>>(new Map());

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  // ─── Load notes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("project_id", activeProject.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("Failed to load notes:", error);
        setNotes([]);
      } else {
        setNotes(data ?? []);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  // ─── Close menu on outside click ────────────────────────────────────
  useEffect(() => {
    if (!menuOpenId) return;
    const onDown = () => setMenuOpenId(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpenId]);

  // ─── Save (debounced) ───────────────────────────────────────────────
  const persistNote = useDebouncedCallback(
    async (noteId: string, patch: { title?: string; content?: string }) => {
      setSaving(true);
      const { error } = await supabase.from("notes").update(patch).eq("id", noteId);
      setSaving(false);
      if (error) {
        console.error("Failed to save note:", error);
        return;
      }
      // refresh the in-memory updated_at so the list resorts after persist
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, ...patch, updated_at: new Date().toISOString() } : n,
        ),
      );
    },
    800,
  );

  // ─── Selection ──────────────────────────────────────────────────────
  const selectNote = (note: Note) => {
    setNotesPanelOpen(false);
    if (note.id === activeNoteId) return;
    setActiveNoteId(note.id);
  };

  // ─── New note ───────────────────────────────────────────────────────
  const handleNewNote = async () => {
    if (!activeProject || !user) return;
    const { data, error } = await supabase
      .from("notes")
      .insert({ project_id: activeProject.id, user_id: user.id, title: "Untitled", content: "" })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Failed to create note:", error);
      return;
    }
    setNotes((prev) => [data, ...prev]);
    setActiveNoteId(data.id);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  // ─── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (noteId: string) => {
    setMenuOpenId(null);
    const { error } = await supabase.from("notes").delete().eq("id", noteId);
    if (error) {
      console.error("Failed to delete note:", error);
      return;
    }
    contentCache.current.delete(noteId);
    titleCache.current.delete(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (activeNoteId === noteId) setActiveNoteId(null);
  };

  // ─── Editor ref / contentEditable init ──────────────────────────────
  const setEditorRef = (el: HTMLDivElement | null) => {
    editorRef.current = el;
    if (el && !el.dataset.initialized && activeNote) {
      el.innerHTML = DOMPurify.sanitize(
        contentCache.current.get(activeNote.id) ?? activeNote.content ?? "",
      );
      el.dataset.initialized = "true";
    }
  };

  const handleEditorInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      if (!activeNoteId) return;
      const html = (e.target as HTMLDivElement).innerHTML;
      contentCache.current.set(activeNoteId, html);
      // patch list snippet locally for responsiveness
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNoteId ? { ...n, content: html } : n)),
      );
      persistNote(activeNoteId, { content: html });
    },
    [activeNoteId, persistNote],
  );

  const handleTitleChange = (value: string) => {
    if (!activeNoteId) return;
    titleCache.current.set(activeNoteId, value);
    setNotes((prev) =>
      prev.map((n) => (n.id === activeNoteId ? { ...n, title: value } : n)),
    );
    persistNote(activeNoteId, { title: value || "Untitled" });
  };

  // ─── Formatting ─────────────────────────────────────────────────────
  const applyFormat = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    if (activeNoteId && editorRef.current) {
      const html = editorRef.current.innerHTML;
      contentCache.current.set(activeNoteId, html);
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNoteId ? { ...n, content: html } : n)),
      );
      persistNote(activeNoteId, { content: html });
    }
  };

  const insertCheckbox = () => {
    editorRef.current?.focus();
    // insert a checkbox + space at the caret
    document.execCommand(
      "insertHTML",
      false,
      '<input type="checkbox" class="note-checkbox" />&nbsp;',
    );
    if (activeNoteId && editorRef.current) {
      const html = editorRef.current.innerHTML;
      contentCache.current.set(activeNoteId, html);
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNoteId ? { ...n, content: html } : n)),
      );
      persistNote(activeNoteId, { content: html });
    }
  };

  // Allow checkbox toggling within the editor (since contentEditable normally blocks it)
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
      const cb = target as HTMLInputElement;
      // Toggle the underlying attribute so it persists in innerHTML
      if (cb.checked) {
        cb.setAttribute("checked", "");
      } else {
        cb.removeAttribute("checked");
      }
      if (activeNoteId && editorRef.current) {
        const html = editorRef.current.innerHTML;
        contentCache.current.set(activeNoteId, html);
        persistNote(activeNoteId, { content: html });
      }
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────
  const TextSizeSelector = () => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-dimmed uppercase tracking-wider">Size</span>
      <div className="flex items-center gap-0.5">
        {(["small", "medium", "large", "xl"] as TextSize[]).map((s) => (
          <button
            key={s}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTextSize(s)}
            title={s === "xl" ? "Extra Large" : s.charAt(0).toUpperCase() + s.slice(1)}
            className={`px-1.5 py-0.5 rounded transition-colors font-serif ${
              textSize === s
                ? "text-foreground bg-fyrescribe-raised"
                : "text-text-dimmed hover:text-text-secondary"
            }`}
            style={{ fontSize: s === "small" ? 10 : s === "medium" ? 12 : s === "large" ? 14 : 16 }}
          >
            Aa
          </button>
        ))}
      </div>
    </div>
  );

  const ToolbarButton = ({
    onClick,
    title,
    children,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
    >
      {children}
    </button>
  );

  return (
    <AppLayout>
      <div className="flex h-full relative">
        {/* Mobile/tablet-portrait notes-list toggle (shown when panel closed) */}
        {!notesPanelOpen && (
          <button
            onClick={() => setNotesPanelOpen(true)}
            title="Show notes"
            className="lg:hidden fixed left-2 top-24 z-30 w-9 h-9 rounded-md bg-fyrescribe-raised border border-border text-text-secondary hover:text-foreground hover:border-gold/30 flex items-center justify-center shadow-lg"
          >
            <PanelLeft size={16} />
          </button>
        )}

        {/* Mobile drawer overlay */}
        {notesPanelOpen && (
          <div
            className="lg:hidden fixed inset-0 top-20 bg-background/70 backdrop-blur-sm z-40"
            onClick={() => setNotesPanelOpen(false)}
          />
        )}

        {/* ─── Left panel: note list ─────────────────────────────── */}
        <div
          data-tour="notes-panel"
          className={`bg-fyrescribe-base border-r border-border flex flex-col flex-shrink-0
            lg:relative lg:w-[280px] lg:translate-x-0
            fixed left-0 top-20 bottom-0 w-[280px] z-50 transition-transform duration-200
            ${notesPanelOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          <div className="p-3 border-b border-border flex items-center gap-2">
            <button
              onClick={handleNewNote}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[13px] rounded-sm bg-fyrescribe-raised text-foreground hover:bg-fyrescribe-hover border border-border transition-colors"
            >
              <Plus size={14} />
              New Note
            </button>
            <button
              onClick={() => setNotesPanelOpen(false)}
              title="Close"
              className="lg:hidden w-9 h-9 rounded-sm border border-border text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover flex items-center justify-center flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <div
              className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed mb-2 px-2"
              style={labelStyle}
            >
              Notes
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={14} className="animate-spin text-text-dimmed" />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-text-dimmed text-xs px-2 py-3">No notes yet.</p>
            ) : (
              <div className="space-y-0.5">
                {notes.map((note) => {
                  const active = note.id === activeNoteId;
                  const snippet = snippetOf(note.content);
                  return (
                    <div
                      key={note.id}
                      onClick={() => selectNote(note)}
                      className={`group relative px-2.5 py-2 rounded-sm cursor-pointer transition-colors border ${
                        active
                          ? "text-gold-bright bg-gold-glow border-gold/40"
                          : "text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover border-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0 pr-5">
                          <div className="text-[13px] truncate font-medium">
                            {note.title || "Untitled"}
                          </div>
                          <div className="text-[11px] text-text-dimmed truncate mt-0.5">
                            {snippet || "Empty note"}
                          </div>
                        </div>
                      </div>

                      {/* 3-dot menu */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === note.id ? null : note.id);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded text-text-dimmed hover:text-foreground hover:bg-fyrescribe-raised opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical size={12} />
                      </button>

                      {menuOpenId === note.id && (
                        <div
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute top-7 right-1 z-30 min-w-[140px] bg-fyrescribe-base border border-border rounded-md shadow-xl py-1"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(note.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right panel: editor ───────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!activeNote ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <StickyNote
                  size={36}
                  className="text-text-dimmed mx-auto mb-3 opacity-50"
                  strokeWidth={1.25}
                />
                <p className="text-text-dimmed text-sm mb-1">No note selected</p>
                <p className="text-text-dimmed text-xs">
                  Pick a note on the left, or create a new one.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-fyrescribe-base/40">
                <div className="flex items-center gap-1">
                  <ToolbarButton onClick={() => applyFormat("bold")} title="Bold">
                    <Bold size={14} />
                  </ToolbarButton>
                  <ToolbarButton onClick={() => applyFormat("italic")} title="Italic">
                    <Italic size={14} />
                  </ToolbarButton>
                  <div className="w-px h-4 bg-border mx-1" />
                  <ToolbarButton
                    onClick={() => applyFormat("insertUnorderedList")}
                    title="Bullet list"
                  >
                    <List size={14} />
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={() => applyFormat("insertOrderedList")}
                    title="Numbered list"
                  >
                    <ListOrdered size={14} />
                  </ToolbarButton>
                  <ToolbarButton onClick={insertCheckbox} title="Insert checkbox">
                    <CheckSquare size={14} />
                  </ToolbarButton>
                  <div className="w-px h-4 bg-border mx-1" />
                  <TextSizeSelector />
                </div>

                <div className="text-[10px] text-text-dimmed">
                  {saving ? "Saving…" : "Saved"}
                </div>
              </div>

              {/* Editor body */}
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-10 py-10">
                  <textarea
                    ref={titleInputRef}
                    key={`title-${activeNote.id}`}
                    value={activeNote.title}
                    onChange={(e) => {
                      handleTitleChange(e.target.value);
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      t.style.height = `${t.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        editorRef.current?.focus();
                      }
                    }}
                    placeholder="Untitled"
                    rows={1}
                    className="w-full bg-transparent outline-none border-none font-display text-3xl text-foreground mb-6 placeholder:text-text-dimmed/60 resize-none overflow-hidden leading-tight break-words"
                  />

                  <div
                    key={`editor-${activeNote.id}`}
                    ref={setEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleEditorInput}
                    onClick={handleEditorClick}
                    className={`notes-editor font-prose ${TEXT_SIZE_CLASSES[textSize]} leading-[1.7] text-foreground/85 outline-none min-h-[60vh] whitespace-pre-wrap`}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editor styling for lists + checkboxes */}
      <style>{`
        .notes-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .notes-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .notes-editor li { margin: 0.15rem 0; }
        .notes-editor .note-checkbox,
        .notes-editor input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--fyrescribe-raised));
          border-radius: 3px;
          vertical-align: -2px;
          margin-right: 4px;
          cursor: pointer;
          position: relative;
        }
        .notes-editor input[type="checkbox"]:checked {
          background: hsl(var(--gold));
          border-color: hsl(var(--gold));
        }
        .notes-editor input[type="checkbox"]:checked::after {
          content: "";
          position: absolute;
          left: 3px;
          top: 0px;
          width: 4px;
          height: 8px;
          border: solid hsl(var(--background));
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
      `}</style>
    </AppLayout>
  );
};

export default NotesPage;
