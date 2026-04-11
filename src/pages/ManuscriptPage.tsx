import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useDebouncedCallback } from "@/hooks/use-debounce";
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

// ─── Manuscript Page ──────────────────────────────────────────────────

const ManuscriptPage = () => {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id || urlProjectId;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const [focusMode, setFocusMode] = useState(false);
  const [thesaurusOpen, setThesaurusOpen] = useState(false);
  const [thesaurusWord, setThesaurusWord] = useState("");
  const [thesaurusSynonyms, setThesaurusSynonyms] = useState<string[]>([]);

  const editorRef = useRef<HTMLDivElement>(null);
  const focusEditorRef = useRef<HTMLDivElement>(null);

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

      const chapterData: Chapter[] = chaptersRes.data || [];
      const sceneData: Scene[] = scenesRes.data || [];
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
      })
      .select("*")
      .single();
    if (error) { console.error("Failed to create scene:", error); return; }
    setScenes((prev) => [...prev, data]);
    setActiveSceneId(data.id);
    setActiveChapterId(chapterId);
    setWordCount(0);
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
      <div className="fixed inset-0 bg-fyrescribe-deepest z-[100] flex flex-col">
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
          <div className="w-full max-w-2xl px-8">
            <div className="font-display text-sm text-gold mb-6">{activeScene?.title}</div>
            <div
              key={activeSceneId ?? "empty"}
              ref={makeEditorRef(focusEditorRef)}
              className="font-prose text-base leading-[1.9] text-[#b8c0d4] whitespace-pre-wrap outline-none min-h-[60vh]"
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
    <div className="w-[240px] bg-fyrescribe-base border-l border-border overflow-y-auto flex-shrink-0 flex flex-col">
      <div className="p-3 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed mb-3 px-2">
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
              <div key={chapter.id} className="mb-1">
                <button
                  onClick={() => {
                    toggleChapter(chapter.id);
                    setActiveChapterId(chapter.id);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-[13px] rounded-sm transition-colors ${
                    activeChapterId === chapter.id
                      ? "text-foreground"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  <ChevronRight
                    size={12}
                    className={`transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                  />
                  <span className="truncate flex-1 text-left">{chapter.title}</span>
                </button>

                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {chapterScenes.map((scene) => (
                      <button
                        key={scene.id}
                        onClick={() => selectScene(scene)}
                        className={`w-full flex items-center gap-2 px-2 py-1 text-[12px] rounded-sm transition-colors ${
                          activeSceneId === scene.id
                            ? "text-gold-bright bg-gold-glow"
                            : "text-text-secondary hover:text-foreground"
                        }`}
                      >
                        <FileText size={10} className="flex-shrink-0" />
                        <span className="truncate">{scene.title}</span>
                      </button>
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
      <div className="flex h-[calc(100vh-48px)]">
        {/* Editor area */}
        <div className="flex-1 flex flex-col bg-fyrescribe-deepest overflow-hidden relative">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-fyrescribe-base">
            <div className="flex items-center gap-1">
              {toolbar}
              <button
                onClick={() => setFocusMode(true)}
                className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
              >
                <Maximize size={14} />
                Focus
              </button>
            </div>
            <div className="text-text-dimmed text-xs">
              {activeChapter && activeScene
                ? `Ch ${activeChapter.order} · ${activeScene.title}`
                : "—"}
            </div>
          </div>

          {/* Editor content */}
          <div className="flex-1 overflow-y-auto flex justify-center py-10">
            <div className="w-full max-w-2xl px-8">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={20} className="animate-spin text-text-dimmed" />
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
                  <div className="font-display text-sm text-gold mb-6 tracking-wide">
                    {activeScene.title}
                  </div>
                  <div
                    key={activeSceneId}
                    ref={makeEditorRef(editorRef)}
                    className="font-prose text-base leading-[1.9] text-[#b8c0d4] whitespace-pre-wrap outline-none min-h-[60vh]"
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
