import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { stripRtf, parseManuscript } from "@/lib/manuscriptParser";
import OutrunMusicPlayer from "@/components/OutrunMusicPlayer";
import {
  Bold,
  Italic,
  BookOpen,
  Maximize,
  ChevronRight,
  FileText,
  X,
  Plus,
  Loader2,
} from "lucide-react";

// ─── Utilities ────────────────────────────────────────────────────────

const THESAURUS_DATA: Record<string, string[]> = {
  wind: ["gale", "breeze", "gust", "zephyr", "draft", "squall"],
  blade: ["sword", "knife", "edge", "dagger", "steel", "cutlass"],
  cold: ["frigid", "icy", "bitter", "frozen", "chilling", "glacial"],
  dark: ["shadowy", "dim", "murky", "gloomy", "obsidian", "tenebrous"],
  stone: ["rock", "granite", "slab", "boulder", "masonry", "bedrock"],
  fire: ["flame", "blaze", "inferno", "pyre", "ember", "conflagration"],
  fear: ["dread", "terror", "horror", "panic", "fright", "apprehension"],
  wall: ["barrier", "rampart", "bulwark", "fortification", "partition"],
  old: ["ancient", "aged", "venerable", "archaic", "primordial", "antique"],
  voice: ["tone", "utterance", "whisper", "murmur", "call", "cry"],
};

const countWords = (html: string): number => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
};

// ─── Types ────────────────────────────────────────────────────────────

interface Chapter {
  id: string;
  title: string;
  order: number;
  project_id: string;
}

interface Scene {
  id: string;
  title: string;
  chapter_id: string;
  project_id: string;
  order: number;
  content: string | null;
  word_count: number | null;
  pov_character_id: string | null;
}

// ─── Thesaurus Panel ─────────────────────────────────────────────────

const ThesaurusPanel = ({
  word,
  synonyms,
  onClose,
  onReplace,
}: {
  word: string;
  synonyms: string[];
  onClose: () => void;
  onReplace: (s: string) => void;
}) => (
  <div className="absolute right-0 top-0 bottom-0 w-72 bg-fyrescribe-base border-l border-border shadow-xl z-10 flex flex-col">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <h3 className="text-xs font-medium uppercase tracking-widest text-text-dimmed">
        Thesaurus
      </h3>
      <button onClick={onClose} className="text-text-dimmed hover:text-foreground transition-colors">
        <X size={14} />
      </button>
    </div>
    <div className="p-4 flex-1 overflow-y-auto">
      {word ? (
        <>
          <div className="text-sm text-foreground mb-1 font-display">"{word}"</div>
          {synonyms.length > 0 ? (
            <>
              <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-3">Synonyms</div>
              <div className="space-y-1.5">
                {synonyms.map((s) => (
                  <button
                    key={s}
                    onClick={() => onReplace(s)}
                    className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover rounded transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-text-dimmed text-xs mt-3">
              No synonyms found. Try selecting a common word.
            </p>
          )}
        </>
      ) : (
        <p className="text-text-dimmed text-xs">
          Select a word in the editor, then click Thesaurus to see synonyms.
        </p>
      )}
    </div>
  </div>
);

// ─── Editable Scene Title (in editor area) ───────────────────────────

const EditableSceneTitle = ({
  scene,
  onSave,
}: {
  scene: Scene | undefined;
  onSave: (id: string, title: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (!scene) return null;

  const start = () => {
    setValue(scene.title);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== scene.title) {
      onSave(scene.id, trimmed);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="font-display text-sm text-gold mb-6 tracking-wide bg-transparent border-b border-gold/50 outline-none w-full"
      />
    );
  }

  return (
    <div
      onClick={start}
      className="font-display text-sm text-gold mb-6 tracking-wide cursor-text hover:border-b hover:border-gold/30 inline-block"
      title="Click to rename"
    >
      {scene.title}
    </div>
  );
};

// ─── Manuscript Page ──────────────────────────────────────────────────

const ManuscriptPage = () => {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { activeProject } = useActiveProject();
  const { theme } = useTheme();
  const projectId = activeProject?.id || urlProjectId;
  const labelStyle = theme === "outrun" ? { color: "hsl(var(--neon-yellow))" } : undefined;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const [focusMode, setFocusMode] = useState(false);
  const [thesaurusOpen, setThesaurusOpen] = useState(false);
  const [thesaurusWord, setThesaurusWord] = useState("");
  const [thesaurusSynonyms, setThesaurusSynonyms] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);

  type TextSize = "small" | "medium" | "large" | "xl";
  const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
    small: "text-[16px] leading-[1.8]",
    medium: "text-[20px] leading-[1.9]",
    large: "text-[24px] leading-[2.0]",
    xl: "text-[28px] leading-[2.1]",
  };
  const [textSize, setTextSize] = useState<TextSize>("medium");

  type ColumnWidth = "narrow" | "wide" | "full";
  const COLUMN_WIDTH_CLASSES: Record<ColumnWidth, string> = {
    narrow: "max-w-2xl px-8",
    wide: "max-w-4xl px-4",
    full: "w-full px-8",
  };
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>("narrow");

  const editorRef = useRef<HTMLDivElement>(null);
  const focusEditorRef = useRef<HTMLDivElement>(null);
  // Set to true when we auto-create the first chapter+scene so the editor
  // gets focused automatically once it mounts.
  const pendingAutoFocus = useRef(false);

  // Stores the latest in-editor content per scene ID so switching scenes
  // before the debounce fires doesn't lose edits, and switching back shows
  // the correct unsaved content.
  const contentCache = useRef<Map<string, string>>(new Map());

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? null;

  // ─── Data loading ───────────────────────────────────────────────────

  useEffect(() => {
    if (!projectId) return;
    const fetchData = async () => {
      setLoading(true);
      const [chaptersRes, scenesRes] = await Promise.all([
        supabase.from("chapters").select("*").eq("project_id", projectId).order("order"),
        supabase.from("scenes").select("*").eq("project_id", projectId).order("order"),
      ]);
      if (chaptersRes.error) console.error("Failed to fetch chapters:", chaptersRes.error);
      if (scenesRes.error) console.error("Failed to fetch scenes:", scenesRes.error);

      let chapterData: Chapter[] = chaptersRes.data || [];
      let sceneData: Scene[] = scenesRes.data || [];

      if (chapterData.length === 0) {
        // Check whether this project has a manuscript file waiting to be imported
        const { data: projectRow } = await supabase
          .from("projects")
          .select("manuscript_path")
          .eq("id", projectId)
          .single();

        const manuscriptPath = projectRow?.manuscript_path ?? null;

        if (manuscriptPath) {
          // ── Import pipeline ──────────────────────────────────────────
          setImportStatus("Reading manuscript file…");

          const { data: blob, error: dlErr } = await supabase.storage
            .from("manuscripts")
            .download(manuscriptPath);

          if (dlErr || !blob) {
            console.error("Failed to download manuscript:", dlErr);
            setImportStatus(null);
          } else {
            setImportStatus("Parsing text…");
            const rawText = await blob.text();
            const ext = manuscriptPath.split(".").pop()?.toLowerCase() ?? "txt";
            const plainText = ext === "rtf" ? stripRtf(rawText) : rawText;
            const parsedChapters = parseManuscript(plainText);

            // Insert chapters sequentially so each chapter ID is available
            // before its scenes are inserted.
            for (let ci = 0; ci < parsedChapters.length; ci++) {
              const pc = parsedChapters[ci];
              setImportStatus(
                `Saving chapter ${ci + 1} of ${parsedChapters.length}…`
              );

              const { data: ch, error: chErr } = await supabase
                .from("chapters")
                .insert({ project_id: projectId, title: pc.title, order: ci + 1 })
                .select("*")
                .single();

              if (chErr || !ch) {
                console.error("Failed to create chapter:", chErr);
                continue;
              }

              chapterData.push(ch);

              const sceneRows = pc.scenes.map((ps, si) => ({
                project_id: projectId,
                chapter_id: ch.id,
                title: ps.title,
                content: ps.content,
                order: si + 1,
                word_count: ps.content.trim().split(/\s+/).filter(Boolean).length,
                is_dirty: true,
              }));

              const { data: insertedScenes, error: scenesErr } = await supabase
                .from("scenes")
                .insert(sceneRows)
                .select("*");

              if (!scenesErr && insertedScenes) {
                sceneData.push(...(insertedScenes as Scene[]));
              } else {
                console.error("Failed to insert scenes for chapter:", chErr);
              }
            }

            setImportStatus(null);
          }
        } else {
          // ── Blank project — auto-create Chapter 1 / Scene 1 ─────────
          const { data: ch, error: chErr } = await supabase
            .from("chapters")
            .insert({ project_id: projectId, title: "Chapter 1", order: 1 })
            .select("*")
            .single();
          if (!chErr && ch) {
            const { data: sc, error: scErr } = await supabase
              .from("scenes")
              .insert({ project_id: projectId, chapter_id: ch.id, title: "Scene 1", order: 1, content: "", is_dirty: true })
              .select("*")
              .single();
            if (!scErr && sc) {
              chapterData = [ch];
              sceneData = [sc];
              pendingAutoFocus.current = true;
            }
          }
        }
      }

      setChapters(chapterData);
      setScenes(sceneData);

      // Auto-select first chapter + scene
      if (chapterData.length > 0) {
        const first = chapterData[0];
        setActiveChapterId(first.id);
        setExpandedChapters([first.id]);
        const firstScene = sceneData.find((s) => s.chapter_id === first.id);
        if (firstScene) {
          setActiveSceneId(firstScene.id);
          setWordCount(firstScene.word_count ?? 0);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  // ─── Auto-save ──────────────────────────────────────────────────────

  const saveScene = useDebouncedCallback(
    async (sceneId: string, content: string) => {
      setSaving(true);
      const wc = countWords(content);
      const { error } = await supabase
        .from("scenes")
        .update({ content, word_count: wc, is_dirty: true })
        .eq("id", sceneId);
      setSaving(false);
      if (error) {
        console.error("Failed to save scene:", error);
      } else {
        setScenes((prev) =>
          prev.map((s) => (s.id === sceneId ? { ...s, word_count: wc } : s))
        );
      }
    },
    1000
  );

  const handleEditorInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      if (!activeSceneId) return;
      const content = (e.target as HTMLDivElement).innerHTML;
      contentCache.current.set(activeSceneId, content);
      setWordCount(countWords(content));
      saveScene(activeSceneId, content);
    },
    [activeSceneId, saveScene]
  );

  // ─── Scene / chapter selection ──────────────────────────────────────

  const selectScene = (scene: Scene) => {
    setActiveSceneId(scene.id);
    setActiveChapterId(scene.chapter_id);
    setWordCount(scene.word_count ?? 0);
  };

  const handleSceneTitleSave = async (sceneId: string, newTitle: string) => {
    setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, title: newTitle } : s));
    await supabase.from("scenes").update({ title: newTitle }).eq("id", sceneId);
  };

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // Returns the content to display: unsaved cache first, then DB value.
  const getInitialContent = (scene: Scene) =>
    contentCache.current.get(scene.id) ?? scene.content ?? "";

  // ─── Create chapter / scene ─────────────────────────────────────────

  const handleAddChapter = async () => {
    if (!projectId) return;
    const nextOrder =
      chapters.length > 0 ? Math.max(...chapters.map((c) => c.order)) + 1 : 1;
    const { data, error } = await supabase
      .from("chapters")
      .insert({ project_id: projectId, title: `Chapter ${nextOrder}`, order: nextOrder })
      .select("*")
      .single();
    if (error) { console.error("Failed to create chapter:", error); return; }
    setChapters((prev) => [...prev, data]);
    setExpandedChapters((prev) => [...prev, data.id]);
    setActiveChapterId(data.id);
  };

  const handleAddScene = async (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId) return;
    const siblingScenes = scenes.filter((s) => s.chapter_id === chapterId);
    const nextOrder =
      siblingScenes.length > 0
        ? Math.max(...siblingScenes.map((s) => s.order)) + 1
        : 1;
    const { data, error } = await supabase
      .from("scenes")
      .insert({
        project_id: projectId,
        chapter_id: chapterId,
        title: `Scene ${nextOrder}`,
        order: nextOrder,
        content: "",
        is_dirty: true,
      })
      .select("*")
      .single();
    if (error) { console.error("Failed to create scene:", error); return; }
    setScenes((prev) => [...prev, data]);
    setActiveSceneId(data.id);
    setActiveChapterId(chapterId);
    setWordCount(0);
  };

  // ─── Inline rename ──────────────────────────────────────────────────

  const startEditing = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const saveTitle = async (type: "chapter" | "scene", id: string, title: string) => {
    const trimmed = title.trim();
    setEditingId(null);
    if (!trimmed) return;
    const table = type === "chapter" ? "chapters" : "scenes";
    const { error } = await supabase.from(table).update({ title: trimmed }).eq("id", id);
    if (error) { console.error(`Failed to rename ${type}:`, error); return; }
    if (type === "chapter") {
      setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    } else {
      setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s)));
    }
  };

  // ─── Drag and drop scenes ───────────────────────────────────────────

  const handleDropSceneOnChapter = async (targetChapterId: string) => {
    if (!dragSceneId) return;
    const scene = scenes.find((s) => s.id === dragSceneId);
    if (!scene || scene.chapter_id === targetChapterId) {
      setDragSceneId(null);
      setDragOverChapterId(null);
      return;
    }
    const targetChapterScenes = scenes.filter((s) => s.chapter_id === targetChapterId);
    const newOrder =
      targetChapterScenes.length > 0
        ? Math.max(...targetChapterScenes.map((s) => s.order)) + 1
        : 1;
    const { error } = await supabase
      .from("scenes")
      .update({ chapter_id: targetChapterId, order: newOrder })
      .eq("id", dragSceneId);
    if (!error) {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === dragSceneId ? { ...s, chapter_id: targetChapterId, order: newOrder } : s
        )
      );
      setExpandedChapters((prev) =>
        prev.includes(targetChapterId) ? prev : [...prev, targetChapterId]
      );
    }
    setDragSceneId(null);
    setDragOverChapterId(null);
  };

  // ─── Formatting / thesaurus ─────────────────────────────────────────

  const applyFormat = useCallback((command: string) => {
    document.execCommand(command, false);
  }, []);

  const handleThesaurus = useCallback(() => {
    const word = window.getSelection()?.toString().trim().toLowerCase() || "";
    setThesaurusWord(word);
    setThesaurusSynonyms(word ? THESAURUS_DATA[word] || [] : []);
    setThesaurusOpen(true);
  }, []);

  const replaceWithSynonym = useCallback(
    (synonym: string) => {
      const editor = focusMode ? focusEditorRef.current : editorRef.current;
      if (!editor) return;
      editor.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(synonym));
        selection.collapseToEnd();
      }
      setThesaurusOpen(false);
    },
    [focusMode]
  );

  // ─── Shared editor ref callback ─────────────────────────────────────
  // Uses the data-initialized guard (same pattern as EntityDetailPage) to
  // set innerHTML exactly once per mount, so cursor position is never
  // disturbed by re-renders triggered by wordCount / saving state changes.

  const makeEditorRef = (ref: React.RefObject<HTMLDivElement | null>) =>
    (el: HTMLDivElement | null) => {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (el && !el.dataset.initialized && activeScene) {
        el.innerHTML = getInitialContent(activeScene);
        el.dataset.initialized = "true";
        if (pendingAutoFocus.current) {
          el.focus();
          pendingAutoFocus.current = false;
        }
      }
    };

  // ─── Render helpers ─────────────────────────────────────────────────

  const toolbar = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => applyFormat("bold")}
        className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
      >
        <Bold size={14} />
      </button>
      <button
        onClick={() => applyFormat("italic")}
        className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
      >
        <Italic size={14} />
      </button>
      <div className="w-px h-4 bg-border mx-1" />
      <button
        onClick={handleThesaurus}
        className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
      >
        <BookOpen size={14} />
        Thesaurus
      </button>
    </div>
  );

  // ─── Focus mode ─────────────────────────────────────────────────────

  if (focusMode) {
    return (
      <div className="fixed inset-0 bg-background z-[100] flex flex-col">
        <div className="flex items-center justify-between p-3">
          {toolbar}
          <button
            onClick={() => setFocusMode(false)}
            className="text-text-dimmed hover:text-text-secondary text-xs flex items-center gap-1 transition-colors"
          >
            Exit Focus Mode
          </button>
        </div>
        <div className="flex-1 flex justify-center overflow-y-auto pb-24 relative">
          <div className={`w-full ${COLUMN_WIDTH_CLASSES[columnWidth]} mx-auto`}>
            <EditableSceneTitle scene={activeScene} onSave={handleSceneTitleSave} />
            <div
              key={activeSceneId ?? "empty"}
              ref={makeEditorRef(focusEditorRef)}
                    className={`font-prose ${TEXT_SIZE_CLASSES[textSize]} text-foreground/80 whitespace-pre-wrap outline-none min-h-[60vh]`}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
            />
          </div>
          {thesaurusOpen && (
            <ThesaurusPanel
              word={thesaurusWord}
              synonyms={thesaurusSynonyms}
              onClose={() => setThesaurusOpen(false)}
              onReplace={replaceWithSynonym}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Main layout ─────────────────────────────────────────────────────

  const chapterSidebar = (
    <div className="w-[240px] bg-fyrescribe-base border-l border-border overflow-hidden flex-shrink-0 flex flex-col">
      <div className="p-3 flex-1 overflow-y-auto min-h-0">
        <div className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed mb-3 px-2" style={labelStyle}>
          Chapters
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={14} className="animate-spin text-text-dimmed" />
          </div>
        ) : chapters.length === 0 ? (
          <p className="text-text-dimmed text-xs px-2">No chapters yet.</p>
        ) : (
          chapters.map((chapter) => {
            const chapterScenes = scenes
              .filter((s) => s.chapter_id === chapter.id)
              .sort((a, b) => a.order - b.order);
            const isExpanded = expandedChapters.includes(chapter.id);

            return (
              <div
                key={chapter.id}
                className={`mb-1 rounded-sm transition-colors ${
                  dragOverChapterId === chapter.id ? "bg-gold-glow ring-1 ring-gold/30" : ""
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOverChapterId(chapter.id); }}
                onDragLeave={() => setDragOverChapterId(null)}
                onDrop={() => handleDropSceneOnChapter(chapter.id)}
              >
                <div
                  className={`w-full flex items-center gap-1 px-2 py-1.5 text-[13px] rounded-sm transition-colors ${
                    activeChapterId === chapter.id
                      ? "text-foreground"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  {/* Chevron — collapse/expand only */}
                  <button
                    onClick={() => { toggleChapter(chapter.id); setActiveChapterId(chapter.id); }}
                    className="flex-shrink-0 p-0.5"
                  >
                    <ChevronRight
                      size={12}
                      className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  {/* Chapter title — click to rename */}
                  {editingId === chapter.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => saveTitle("chapter", chapter.id, editingTitle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveTitle("chapter", chapter.id, editingTitle); }
                        if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-transparent outline-none border-b border-gold/50 text-[13px] text-foreground"
                    />
                  ) : (
                    <span
                      className="truncate flex-1 cursor-text"
                      onClick={(e) => {
                        setActiveChapterId(chapter.id);
                        if (!isExpanded) toggleChapter(chapter.id);
                        startEditing(chapter.id, chapter.title, e);
                      }}
                    >
                      {chapter.title}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {chapterScenes.map((scene) => (
                      <div
                        key={scene.id}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDragSceneId(scene.id); }}
                        onDragEnd={() => { setDragSceneId(null); setDragOverChapterId(null); }}
                        onClick={() => selectScene(scene)}
                        className={`w-full flex items-center gap-2 px-2 py-1 text-[12px] rounded-sm cursor-pointer transition-colors ${
                          activeSceneId === scene.id
                            ? "text-gold-bright bg-gold-glow"
                            : dragSceneId === scene.id
                            ? "opacity-40"
                            : "text-text-secondary hover:text-foreground"
                        }`}
                      >
                        <FileText size={10} className="flex-shrink-0" />

                        {editingId === scene.id ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => saveTitle("scene", scene.id, editingTitle)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveTitle("scene", scene.id, editingTitle); }
                              if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 min-w-0 bg-transparent outline-none border-b border-gold/50 text-[12px] text-foreground"
                          />
                        ) : (
                          <span
                            className="truncate flex-1 cursor-text"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectScene(scene);
                              startEditing(scene.id, scene.title, e);
                            }}
                          >
                            {scene.title}
                          </span>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={(e) => handleAddScene(chapter.id, e)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-text-dimmed hover:text-text-secondary transition-colors rounded-sm"
                    >
                      <Plus size={9} />
                      Add scene
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {theme === "outrun" && (
        <div className="border-t border-border">
          <OutrunMusicPlayer />
        </div>
      )}

      <div className="p-3 border-t border-border">
        <button
          onClick={handleAddChapter}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 text-[12px] text-text-dimmed hover:text-text-secondary hover:bg-fyrescribe-hover rounded-sm transition-colors"
        >
          <Plus size={11} />
          New chapter
        </button>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-80px)]">
        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-fyrescribe-base">
            <div className="flex items-center gap-1">
              {toolbar}
              <div className="w-px h-4 bg-border mx-1" />
              <div className="flex items-center gap-0.5 bg-fyrescribe-hover rounded-md p-0.5">
                {(["small", "medium", "large", "xl"] as TextSize[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setTextSize(s)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      textSize === s
                        ? "bg-fyrescribe-raised text-foreground"
                        : "text-text-dimmed hover:text-text-secondary"
                    }`}
                  >
                    {s === "xl" ? "XL" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-border mx-1" />
              <div className="flex items-center gap-0.5 bg-fyrescribe-hover rounded-md p-0.5">
                {(["narrow", "wide", "full"] as ColumnWidth[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => setColumnWidth(w)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      columnWidth === w
                        ? "bg-fyrescribe-raised text-foreground"
                        : "text-text-dimmed hover:text-text-secondary"
                    }`}
                  >
                    {w.charAt(0).toUpperCase() + w.slice(1)}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-border mx-1" />
              <button
                onClick={() => setFocusMode(true)}
                className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
              >
                <Maximize size={14} />
                Focus
              </button>
            </div>
            <div className="text-text-dimmed text-xs" style={labelStyle}>
              {activeChapter && activeScene
                ? `Ch ${activeChapter.order} · ${activeScene.title}`
                : "—"}
            </div>
          </div>

          {/* Editor content */}
          <div className="flex-1 overflow-y-auto flex justify-center py-10">
            <div className={`w-full ${COLUMN_WIDTH_CLASSES[columnWidth]} mx-auto`}>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 size={20} className="animate-spin text-text-dimmed" />
                  {importStatus && (
                    <p className="text-text-dimmed text-xs">{importStatus}</p>
                  )}
                </div>
              ) : !activeScene ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-text-secondary text-sm mb-1">No scene selected</p>
                  <p className="text-text-dimmed text-xs">
                    {chapters.length === 0
                      ? "Add a chapter to get started."
                      : "Select a scene from the panel, or add one to a chapter."}
                  </p>
                </div>
              ) : (
                <>
                  <EditableSceneTitle scene={activeScene} onSave={handleSceneTitleSave} />
                  <div
                    key={activeSceneId}
                    ref={makeEditorRef(editorRef)}
                    className={`font-prose ${TEXT_SIZE_CLASSES[textSize]} text-foreground/80 whitespace-pre-wrap outline-none min-h-[60vh]`}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleEditorInput}
                  />
                </>
              )}
            </div>
          </div>

          {/* Thesaurus panel */}
          {thesaurusOpen && (
            <ThesaurusPanel
              word={thesaurusWord}
              synonyms={thesaurusSynonyms}
              onClose={() => setThesaurusOpen(false)}
              onReplace={replaceWithSynonym}
            />
          )}

          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-fyrescribe-base text-text-dimmed text-[11px]">
            <span>{saving ? "Saving…" : "Auto-saved"}</span>
            <span>{wordCount.toLocaleString()} words</span>
          </div>
        </div>

        {/* Chapter/scene sidebar — RIGHT */}
        {chapterSidebar}
      </div>
    </AppLayout>
  );
};

export default ManuscriptPage;
