import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { stripRtf, parseManuscript } from "@/lib/manuscriptParser";

import POVSelector from "@/components/POVSelector";
import SaveVersionPopover from "@/components/SaveVersionPopover";
import VersionHistoryPanel, { SceneVersion } from "@/components/VersionHistoryPanel";
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
  History,
  BookmarkPlus,
  PanelRight,
  Type,
  MoreHorizontal,
  MoreVertical,
  ScanSearch,
} from "lucide-react";
import ContinuityPanel, { type ContinuityIssue } from "@/components/ContinuityPanel";

// ─── Utilities ────────────────────────────────────────────────────────


const countWords = (html: string): number => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
};

function _highlightTextNode(textNode: Text, entities: { id: string; name: string }[]) {
  const text = textNode.textContent ?? "";
  if (!text.trim()) return;

  const matches: { start: number; end: number; entityId: string; matched: string }[] = [];
  for (const entity of entities) {
    const escaped = entity.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (!matches.some((ex) => m!.index < ex.end && m!.index + m![0].length > ex.start)) {
        matches.push({ start: m.index, end: m.index + m[0].length, entityId: entity.id, matched: m[0] });
      }
    }
  }

  if (!matches.length) return;
  matches.sort((a, b) => a.start - b.start);

  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, match.start)));
    const span = document.createElement("span");
    span.dataset.entityId = match.entityId;
    span.className = "entity-link";
    span.textContent = match.matched;
    frag.appendChild(span);
    cursor = match.end;
  }
  if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
  textNode.parentNode!.replaceChild(frag, textNode);
}

function applyEntityHighlights(el: HTMLDivElement, entities: { id: string; name: string }[]) {
  // Remove existing spans (normalises DOM before re-scan)
  el.querySelectorAll("span[data-entity-id]").forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  });

  if (!entities.length) return;

  // Longest names first so "Aragorn" beats "Ara" when both match
  const sorted = [...entities].sort((a, b) => b.name.length - a.name.length);

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    if ((textNode.parentElement as Element)?.closest("[data-entity-id]")) continue;
    _highlightTextNode(textNode, sorted);
  }
}

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
  loading,
  onClose,
  onReplace,
}: {
  word: string;
  synonyms: string[];
  loading: boolean;
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
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-text-dimmed" />
            </div>
          ) : synonyms.length > 0 ? (
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
          Select a word in the editor to see synonyms.
        </p>
      )}
    </div>
  </div>
);

// ─── Editable Scene Title (in editor area) ───────────────────────────

const EditableSceneTitle = ({
  scene,
  onSave,
  sizeClass = "text-sm",
}: {
  scene: Scene | undefined;
  onSave: (id: string, title: string) => void;
  sizeClass?: string;
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
        className={`font-display ${sizeClass} text-gold mb-6 tracking-wide bg-transparent border-b border-gold/50 outline-none w-full`}
      />
    );
  }

  return (
    <div
      onClick={start}
      className={`font-display ${sizeClass} text-gold mb-6 tracking-wide cursor-text hover:border-b hover:border-gold/30 inline-block`}
      title="Click to rename"
    >
      {scene.title}
    </div>
  );
};

// ─── Manuscript Page ──────────────────────────────────────────────────

const ManuscriptPage = () => {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject } = useActiveProject();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const projectId = activeProject?.id || urlProjectId;
  const targetSceneId = searchParams.get("scene");
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
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionToast, setVersionToast] = useState<string | null>(null);

  const [focusMode, setFocusMode] = useState(false);
  const [chapterPanelOpen, setChapterPanelOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [formatMenuPos, setFormatMenuPos] = useState({ top: 0, left: 0 });
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [versionMenuPos, setVersionMenuPos] = useState({ bottom: 0, left: 0 });
  const [thesaurusOpen, setThesaurusOpen] = useState(false);
  const [thesaurusWord, setThesaurusWord] = useState("");
  const [thesaurusSynonyms, setThesaurusSynonyms] = useState<string[]>([]);
  const [thesaurusLoading, setThesaurusLoading] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);
  const formatButtonRef = useRef<HTMLButtonElement>(null);
  const versionMenuButtonRef = useRef<HTMLButtonElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const [dragOverChapterId, setDragOverChapterId] = useState<string | null>(null);

  const [chapterMenuOpenId, setChapterMenuOpenId] = useState<string | null>(null);
  const [continuityCheckingId, setContinuityCheckingId] = useState<string | null>(null);
  const [continuityPanel, setContinuityPanel] = useState<{ chapterTitle: string; issues: ContinuityIssue[] } | null>(null);

  type TextSize = "small" | "medium" | "large" | "xl";
  const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
    small: "text-[16px]",
    medium: "text-[20px]",
    large: "text-[24px]",
    xl: "text-[28px]",
  };
  const SCENE_TITLE_CLASSES: Record<TextSize, string> = {
    small: "text-[16px]",
    medium: "text-[20px]",
    large: "text-[24px]",
    xl: "text-[28px]",
  };
  const CHAPTER_TITLE_CLASSES: Record<TextSize, string> = {
    small: "text-[32px]",
    medium: "text-[40px]",
    large: "text-[48px]",
    xl: "text-[56px]",
  };
  // Default to smallest text size on mobile/tablet-portrait, medium on desktop (>=lg)
  const [textSize, setTextSize] = useState<TextSize>(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      return "small";
    }
    return "medium";
  });

  type LineHeight = "single" | "1.5" | "double";
  const LINE_HEIGHT_CLASSES: Record<LineHeight, string> = {
    single: "leading-[1.4]",
    "1.5": "leading-[1.7]",
    double: "leading-[2.0]",
  };
  const [lineHeight, setLineHeight] = useState<LineHeight>("1.5");

  type ColumnWidth = "narrow" | "wide" | "full";
  const COLUMN_WIDTH_CLASSES: Record<ColumnWidth, string> = {
    narrow: "max-w-2xl px-8",
    wide: "max-w-4xl px-4",
    full: "w-full px-8",
  };
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>("narrow");

  const editorRef = useRef<HTMLDivElement>(null);
  const focusEditorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Set to true when we auto-create the first chapter+scene so the editor
  // gets focused automatically once it mounts.
  const pendingAutoFocus = useRef(false);
  const entityNamesRef = useRef<{ id: string; name: string }[]>([]);
  const pendingScrollRef = useRef<number | null>(null);

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
      const [chaptersRes, scenesRes, entitiesRes] = await Promise.all([
        supabase.from("chapters").select("*").eq("project_id", projectId).order("order"),
        supabase.from("scenes").select("*").eq("project_id", projectId).order("order"),
        supabase.from("entities").select("id, name").eq("project_id", projectId).is("archived_at", null),
      ]);
      if (chaptersRes.error) console.error("Failed to fetch chapters:", chaptersRes.error);
      if (scenesRes.error) console.error("Failed to fetch scenes:", scenesRes.error);
      entityNamesRef.current = (entitiesRes.data ?? []) as { id: string; name: string }[];

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

      // Default: expand all chapters; user can collapse manually
      setExpandedChapters(chapterData.map((c) => c.id));

      // Auto-select: prefer scene from URL ?scene=<id>, otherwise first scene
      if (chapterData.length > 0) {
        const urlScene = targetSceneId ? sceneData.find((s) => s.id === targetSceneId) : null;
        if (urlScene) {
          setActiveSceneId(urlScene.id);
          setActiveChapterId(urlScene.chapter_id);
          setWordCount(urlScene.word_count ?? 0);
        } else {
          const first = chapterData[0];
          setActiveChapterId(first.id);
          const firstScene = sceneData.find((s) => s.chapter_id === first.id);
          if (firstScene) {
            setActiveSceneId(firstScene.id);
            setWordCount(firstScene.word_count ?? 0);
          }
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [projectId]);

  // If ?scene= changes after initial load, jump to that scene
  useEffect(() => {
    if (!targetSceneId || scenes.length === 0) return;
    const target = scenes.find((s) => s.id === targetSceneId);
    if (target && target.id !== activeSceneId) {
      setActiveSceneId(target.id);
      setActiveChapterId(target.chapter_id);
      setExpandedChapters((prev) =>
        prev.includes(target.chapter_id) ? prev : [...prev, target.chapter_id],
      );
      setWordCount(target.word_count ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSceneId, scenes]);

  // ─── Entity highlights ──────────────────────────────────────────────

  useEffect(() => {
    if (loading || focusMode || !activeSceneId) return;
    const id = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (editor) {
        applyEntityHighlights(editor, entityNamesRef.current);
        if (pendingScrollRef.current !== null && scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = pendingScrollRef.current;
          pendingScrollRef.current = null;
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [activeSceneId, loading, focusMode]);

  // Esc exits focus mode (ignored when typing in an input/textarea so it
  // doesn't conflict with inline title editing).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  // ─── sessionStorage scroll/scene restore ────────────────────────────

  useEffect(() => {
    if (loading) return;
    const raw = sessionStorage.getItem("manuscriptReturn");
    if (!raw) return;
    sessionStorage.removeItem("manuscriptReturn");
    try {
      const { sceneId, scrollTop } = JSON.parse(raw) as { sceneId: string; scrollTop: number };
      if (sceneId && sceneId !== activeSceneId) {
        const target = scenes.find((s) => s.id === sceneId);
        if (target) {
          setActiveSceneId(target.id);
          setActiveChapterId(target.chapter_id);
          setExpandedChapters((prev) =>
            prev.includes(target.chapter_id) ? prev : [...prev, target.chapter_id],
          );
          setWordCount(target.word_count ?? 0);
          pendingScrollRef.current = scrollTop ?? 0;
        }
      } else if (scrollTop != null && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollTop;
      }
    } catch {
      // ignore corrupt sessionStorage
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

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

  // ─── Versioning ─────────────────────────────────────────────────────

  const handleSaveVersion = useCallback(
    async (name: string) => {
      if (!activeSceneId || !projectId || !activeScene) return;
      // Use the freshest content (cache > DB).
      const content = contentCache.current.get(activeSceneId) ?? activeScene.content ?? "";
      const wc = countWords(content);

      // Compute delta vs the most recent prior version (if any).
      const { data: prior } = await supabase
        .from("scene_versions")
        .select("word_count")
        .eq("scene_id", activeSceneId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const baseline = prior?.word_count ?? 0;
      const delta = wc - baseline;

      const { data: inserted, error } = await supabase
        .from("scene_versions")
        .insert({
          scene_id: activeSceneId,
          project_id: projectId,
          name: name || null,
          content,
          word_count: wc,
          word_delta: delta,
        })
        .select("id")
        .single();

      setSaveVersionOpen(false);

      if (error || !inserted) {
        console.error("Failed to save version:", error);
        setVersionToast("Failed to save version");
      } else {
        setVersionToast("Version saved");
        // Fire-and-forget AI summary (panel will poll for it).
        supabase.functions
          .invoke("summarize-version", { body: { versionId: inserted.id } })
          .catch((e) => console.error("Summary generation failed:", e));
      }
      setTimeout(() => setVersionToast(null), 2500);
    },
    [activeSceneId, projectId, activeScene],
  );

  const handleRestoreVersion = useCallback(
    async (v: SceneVersion) => {
      if (!activeSceneId || v.scene_id !== activeSceneId) return;
      const wc = countWords(v.content);
      const { error } = await supabase
        .from("scenes")
        .update({ content: v.content, word_count: wc, is_dirty: true })
        .eq("id", activeSceneId);

      if (error) {
        console.error("Failed to restore version:", error);
        return;
      }

      // Update local state + editor DOM.
      contentCache.current.set(activeSceneId, v.content);
      setScenes((prev) =>
        prev.map((s) => (s.id === activeSceneId ? { ...s, content: v.content, word_count: wc } : s)),
      );
      setWordCount(wc);

      const editor = focusMode ? focusEditorRef.current : editorRef.current;
      if (editor) {
        editor.innerHTML = DOMPurify.sanitize(v.content);
        // Re-apply highlights after DOM swap.
        requestAnimationFrame(() => {
          if (editor) applyEntityHighlights(editor, entityNamesRef.current);
        });
      }

      setVersionHistoryOpen(false);
      setVersionToast("Version restored");
      setTimeout(() => setVersionToast(null), 2500);
    },
    [activeSceneId, focusMode],
  );

  const handleEditorInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      if (!activeSceneId) return;
      const raw = (e.target as HTMLDivElement).innerHTML;
      // Strip display-only entity spans before persisting — they must never reach the DB
      const content = raw.replace(/<span\b[^>]*\bdata-entity-id="[^"]*"[^>]*>([\s\S]*?)<\/span>/g, "$1");
      contentCache.current.set(activeSceneId, content);
      setWordCount(countWords(content));
      saveScene(activeSceneId, content);
    },
    [activeSceneId, saveScene]
  );

  // Custom Enter handling:
  //   Enter        → paragraph break (two <br>s, producing a blank line gap)
  //   Shift+Enter  → single line break (one <br>)
  // Uses execCommand("insertHTML") so the change is captured by the browser's
  // native undo stack and triggers the standard `input` event for autosave.
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const html = e.shiftKey
      ? "<br>"
      // Two <br>s yields a visible blank line between paragraphs.
      // The trailing zero-width space keeps the caret on the new line in all browsers.
      : "<br><br>\u200B";
    document.execCommand("insertHTML", false, html);
  }, []);

  // ─── Scene / chapter selection ──────────────────────────────────────

  const selectScene = (scene: Scene) => {
    setActiveSceneId(scene.id);
    setActiveChapterId(scene.chapter_id);
    setWordCount(scene.word_count ?? 0);
    // Auto-close mobile chapter drawer after selecting a scene
    setChapterPanelOpen(false);
  };

  const handleSceneTitleSave = async (sceneId: string, newTitle: string) => {
    setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, title: newTitle } : s));
    await supabase.from("scenes").update({ title: newTitle }).eq("id", sceneId);
  };

  const handlePOVChange = (sceneId: string, povCharacterId: string | null) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, pov_character_id: povCharacterId } : s)),
    );
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

  // ─── Continuity check ───────────────────────────────────────────────

  const handleCheckContinuity = async (chapterId: string) => {
    setChapterMenuOpenId(null);
    setContinuityCheckingId(chapterId);
    try {
      const res = await supabase.functions.invoke("check-continuity", {
        body: { chapter_id: chapterId, project_id: projectId },
      });
      if (res.error) throw res.error;
      setContinuityPanel({ chapterTitle: res.data.chapter_title, issues: res.data.issues ?? [] });
    } catch (err) {
      console.error("Continuity check failed:", err);
    } finally {
      setContinuityCheckingId(null);
    }
  };

  // ─── Formatting / thesaurus ─────────────────────────────────────────

  const applyFormat = useCallback((command: string) => {
    document.execCommand(command, false);
  }, []);

  const openFormatMenu = useCallback(() => {
    if (formatButtonRef.current) {
      const rect = formatButtonRef.current.getBoundingClientRect();
      setFormatMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setFormatMenuOpen((v) => !v);
  }, []);

  const openVersionMenu = useCallback(() => {
    if (versionMenuButtonRef.current) {
      const rect = versionMenuButtonRef.current.getBoundingClientRect();
      setVersionMenuPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
    }
    setVersionMenuOpen((v) => !v);
  }, []);

  const handleThesaurus = useCallback(async () => {
    const sel = window.getSelection();
    const raw = sel?.toString().trim() ?? "";
    const word = raw.toLowerCase().replace(/[^a-z'-]/g, "");
    if (word.length < 3 || raw.includes(" ")) return;

    savedRangeRef.current = (sel && sel.rangeCount > 0)
      ? sel.getRangeAt(0).cloneRange()
      : null;

    setThesaurusWord(raw);
    setThesaurusSynonyms([]);
    setThesaurusLoading(true);
    setThesaurusOpen(true);

    try {
      const encoded = encodeURIComponent(word);
      let res = await fetch(`https://api.datamuse.com/words?rel_syn=${encoded}&max=10`);
      let data: { word: string }[] = await res.json();
      if (data.length === 0) {
        res = await fetch(`https://api.datamuse.com/words?ml=${encoded}&max=10`);
        data = await res.json();
      }
      setThesaurusSynonyms(data.map((d) => d.word));
    } catch {
      setThesaurusSynonyms([]);
    } finally {
      setThesaurusLoading(false);
    }
  }, []);

  const replaceWithSynonym = useCallback(
    (synonym: string) => {
      const editor = focusMode ? focusEditorRef.current : editorRef.current;
      if (!editor) return;
      const range = savedRangeRef.current;
      if (range) {
        editor.focus();
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        range.deleteContents();
        range.insertNode(document.createTextNode(synonym));
        sel?.collapseToEnd();
        savedRangeRef.current = null;
        const content = editor.innerHTML;
        if (activeSceneId) {
          contentCache.current.set(activeSceneId, content);
          setWordCount(countWords(content));
          saveScene(activeSceneId, content);
        }
      }
      setThesaurusOpen(false);
    },
    [focusMode, activeSceneId, saveScene]
  );

  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const entityId =
        target.dataset?.entityId ??
        (target.closest("[data-entity-id]") as HTMLElement | null)?.dataset?.entityId;
      if (!entityId) return;
      e.preventDefault();
      sessionStorage.setItem(
        "manuscriptReturn",
        JSON.stringify({ sceneId: activeSceneId, scrollTop: scrollContainerRef.current?.scrollTop ?? 0 }),
      );
      navigate(`/entity/${entityId}`);
    },
    [activeSceneId, navigate],
  );

  // ─── Shared editor ref callback ─────────────────────────────────────
  // Uses the data-initialized guard (same pattern as EntityDetailPage) to
  // set innerHTML exactly once per mount, so cursor position is never
  // disturbed by re-renders triggered by wordCount / saving state changes.

  const makeEditorRef = (ref: React.RefObject<HTMLDivElement | null>) =>
    (el: HTMLDivElement | null) => {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (el && !el.dataset.initialized && activeScene) {
        el.innerHTML = DOMPurify.sanitize(getInitialContent(activeScene));
        el.dataset.initialized = "true";
        if (pendingAutoFocus.current) {
          el.focus();
          pendingAutoFocus.current = false;
        }
      }
    };

  // ─── Render helpers ─────────────────────────────────────────────────

  // ─── Icon-based toolbar selectors ────────────────────────────────────

  const TextSizeSelector = () => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-dimmed uppercase tracking-wider">Size</span>
      <div className="flex items-center gap-0.5">
        {(["small", "medium", "large", "xl"] as TextSize[]).map((s) => (
          <button
            key={s}
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

  const LineHeightSelector = () => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-dimmed uppercase tracking-wider">Height</span>
      <div className="flex items-center gap-0.5">
        {([
          { value: "single" as LineHeight, label: "1×", title: "Single spacing" },
          { value: "1.5" as LineHeight, label: "1.5×", title: "1.5 spacing" },
          { value: "double" as LineHeight, label: "2×", title: "Double spacing" },
        ]).map((h) => (
          <button
            key={h.value}
            onClick={() => setLineHeight(h.value)}
            title={h.title}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors font-mono ${
              lineHeight === h.value
                ? "text-foreground bg-fyrescribe-raised"
                : "text-text-dimmed hover:text-text-secondary"
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>
    </div>
  );

  const ColumnWidthSelector = () => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-dimmed uppercase tracking-wider">Width</span>
      <div className="flex items-center gap-0.5">
        {([
          { value: "narrow" as ColumnWidth, title: "Narrow" },
          { value: "wide" as ColumnWidth, title: "Wide" },
          { value: "full" as ColumnWidth, title: "Full width" },
        ]).map((w) => (
          <button
            key={w.value}
            onClick={() => setColumnWidth(w.value)}
            title={w.title}
            className={`p-1 rounded transition-colors ${
              columnWidth === w.value
                ? "text-foreground bg-fyrescribe-raised"
                : "text-text-dimmed hover:text-text-secondary"
            }`}
          >
            {/* Column width icons as inline SVGs */}
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              {w.value === "narrow" && (
                <>
                  <rect x="4" y="1" width="8" height="10" rx="1" />
                </>
              )}
              {w.value === "wide" && (
                <>
                  <rect x="2" y="1" width="12" height="10" rx="1" />
                </>
              )}
              {w.value === "full" && (
                <>
                  <rect x="0.5" y="1" width="15" height="10" rx="1" />
                </>
              )}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );

  const formattingControls = (
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
      <TextSizeSelector />
      <div className="w-px h-4 bg-border mx-1" />
      <LineHeightSelector />
      <div className="w-px h-4 bg-border mx-1" />
      <ColumnWidthSelector />
      <div className="w-px h-4 bg-border mx-1" />
      <button
        onClick={handleThesaurus}
        title="Thesaurus — select a word first"
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
      <div className="fixed inset-0 bg-background z-[100] flex flex-col" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center gap-2 p-3">
          {/* Desktop: all formatting controls inline */}
          <div className="hidden lg:flex items-center gap-1 flex-1 min-w-0">
            {formattingControls}
          </div>
          {/* Mobile: compact Format button (uses same ref + handler as main toolbar) */}
          <div className="lg:hidden">
            <button
              ref={formatButtonRef}
              onClick={openFormatMenu}
              className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
            >
              <Type size={14} />
              Format
            </button>
          </div>
          {/* Exit — always visible, flex-shrink-0 so it can never be pushed off-screen */}
          <button
            onClick={() => setFocusMode(false)}
            className="ml-auto flex-shrink-0 text-text-dimmed hover:text-text-secondary text-xs flex items-center gap-1.5 transition-colors"
          >
            <X size={14} />
            <span className="hidden sm:inline">Exit Focus Mode</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <div className={`w-full ${COLUMN_WIDTH_CLASSES[columnWidth]} mx-auto pb-[250px]`}>
            {activeChapter &&
              activeScene &&
              scenes
                .filter((s) => s.chapter_id === activeChapter.id)
                .sort((a, b) => a.order - b.order)[0]?.id === activeScene.id && (
                <h1 className={`font-display ${CHAPTER_TITLE_CLASSES[textSize]} text-foreground/80 mb-2 tracking-wide`}>
                  {activeChapter.title}
                </h1>
              )}
            <EditableSceneTitle scene={activeScene} onSave={handleSceneTitleSave} sizeClass={SCENE_TITLE_CLASSES[textSize]} />
            <div
              key={activeSceneId ?? "empty"}
              ref={makeEditorRef(focusEditorRef)}
              className={`font-prose ${TEXT_SIZE_CLASSES[textSize]} ${LINE_HEIGHT_CLASSES[lineHeight]} text-foreground/80 whitespace-pre-wrap outline-none min-h-[60vh]`}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
            />
          </div>
          {thesaurusOpen && (
            <ThesaurusPanel
              word={thesaurusWord}
              synonyms={thesaurusSynonyms}
              loading={thesaurusLoading}
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
    <div data-tour="chapter-panel" className="w-[240px] bg-fyrescribe-base border-l border-border overflow-hidden flex-shrink-0 flex flex-col">
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
                className={`mb-1 rounded-sm transition-colors group ${
                  dragOverChapterId === chapter.id ? "bg-gold-glow ring-1 ring-gold/30" : ""
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOverChapterId(chapter.id); }}
                onDragLeave={() => setDragOverChapterId(null)}
                onDrop={() => handleDropSceneOnChapter(chapter.id)}
              >
                <div className="relative">
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

                  {/* 3-dots menu trigger */}
                  {continuityCheckingId === chapter.id ? (
                    <Loader2 size={11} className="ml-auto flex-shrink-0 animate-spin text-text-dimmed" />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setChapterMenuOpenId(chapterMenuOpenId === chapter.id ? null : chapter.id); }}
                      className="ml-auto flex-shrink-0 p-0.5 rounded hover:bg-fyrescribe-hover transition-all text-text-dimmed hover:text-foreground"
                    >
                      <MoreVertical size={12} />
                    </button>
                  )}
                </div>

                {/* Chapter context menu */}
                {chapterMenuOpenId === chapter.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setChapterMenuOpenId(null)} />
                    <div className="absolute left-0 right-0 top-full z-50 bg-fyrescribe-base border border-border rounded-md shadow-xl py-1 mt-0.5">
                      <button
                        onClick={() => handleCheckContinuity(chapter.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                      >
                        <ScanSearch size={12} />
                        Check Continuity
                      </button>
                    </div>
                  </>
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
      <div className="flex h-[calc(100dvh-80px)]">
        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Subtle white overlay to lift legibility on dark themes */}
          {(theme === "midnight" ||
            theme === "fireside" ||
            theme === "lavender" ||
            theme === "enchanted") && (
            <div
              className="pointer-events-none absolute inset-0 z-0"
              style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
            />
          )}
          {/* Toolbar */}
          <div className="relative z-10 flex items-center justify-between px-2 lg:px-4 py-2 border-b border-border bg-fyrescribe-base">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {/* Desktop formatting controls */}
              <div className="hidden lg:flex items-center gap-1">
                {formattingControls}
              </div>

              {/* Mobile / tablet-portrait: Format menu */}
              <div className="lg:hidden flex items-center gap-1">
                <button
                  ref={formatButtonRef}
                  onClick={openFormatMenu}
                  className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
                >
                  <Type size={14} />
                  Format
                </button>
                <button
                  onClick={handleThesaurus}
                  className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
                  aria-label="Thesaurus"
                >
                  <BookOpen size={14} />
                  Thesaurus
                </button>
                {formatMenuOpen && (
                  createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setFormatMenuOpen(false)}
                      />
                      <div
                        className="fixed z-[9999] border border-border rounded-md shadow-xl p-3 flex flex-col gap-3 min-w-[260px]"
                        style={{
                          top: formatMenuPos.top,
                          left: formatMenuPos.left,
                          backgroundColor: "hsl(var(--bg-raised))",
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { applyFormat("bold"); setFormatMenuOpen(false); }}
                            className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                            aria-label="Bold"
                          >
                            <Bold size={14} />
                          </button>
                          <button
                            onClick={() => { applyFormat("italic"); setFormatMenuOpen(false); }}
                            className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                            aria-label="Italic"
                          >
                            <Italic size={14} />
                          </button>
                        </div>
                        <TextSizeSelector />
                        <LineHeightSelector />
                        <ColumnWidthSelector />
                      </div>
                    </>,
                    document.body
                  )
                )}
              </div>

              <div className="flex-1" />
              <POVSelector
                projectId={projectId}
                sceneId={activeSceneId}
                povCharacterId={activeScene?.pov_character_id ?? null}
                onChange={handlePOVChange}
              />
              <div className="w-px h-4 bg-border mx-1 hidden lg:block" />
              <button
                onClick={() => setFocusMode(true)}
                className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
              >
                <Maximize size={14} />
                <span className="hidden lg:inline">Focus</span>
              </button>
              {/* Mobile / tablet-portrait: chapter panel trigger or close button (same slot) */}
              <button
                onClick={() => setChapterPanelOpen((v) => !v)}
                aria-label={chapterPanelOpen ? "Close chapters" : "Open chapters"}
                className="lg:hidden p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
              >
                {chapterPanelOpen ? <X size={16} /> : <PanelRight size={16} />}
              </button>
            </div>
          </div>

          {/* Editor content */}
          <div ref={scrollContainerRef} data-tour="editor" className="relative z-10 flex-1 overflow-y-auto pt-10">
            <div className={`w-full ${COLUMN_WIDTH_CLASSES[columnWidth]} mx-auto pb-[250px]`}>
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
                  {activeChapter &&
                    activeScene &&
                    scenes
                      .filter((s) => s.chapter_id === activeChapter.id)
                      .sort((a, b) => a.order - b.order)[0]?.id === activeScene.id && (
                      <h1 className={`font-display ${CHAPTER_TITLE_CLASSES[textSize]} text-foreground/80 mb-2 tracking-wide`}>
                        {activeChapter.title}
                      </h1>
                    )}
                  <EditableSceneTitle scene={activeScene} onSave={handleSceneTitleSave} sizeClass={SCENE_TITLE_CLASSES[textSize]} />
                  <div
                    key={activeSceneId}
                    ref={makeEditorRef(editorRef)}
                    className={`font-prose ${TEXT_SIZE_CLASSES[textSize]} ${LINE_HEIGHT_CLASSES[lineHeight]} text-foreground/80 whitespace-pre-wrap outline-none min-h-[60vh]`}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleEditorInput}
                    onKeyDown={handleEditorKeyDown}
                    onClick={handleEditorClick}
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
              loading={thesaurusLoading}
              onClose={() => setThesaurusOpen(false)}
              onReplace={replaceWithSynonym}
            />
          )}

          {/* Continuity panel */}
          {continuityPanel && (
            <ContinuityPanel
              chapterTitle={continuityPanel.chapterTitle}
              issues={continuityPanel.issues}
              onClose={() => setContinuityPanel(null)}
            />
          )}

          {/* Status bar */}
          <div className="flex items-center justify-between px-3 lg:px-4 py-1.5 border-t border-border bg-fyrescribe-base text-text-dimmed text-[11px]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="truncate">
                {versionToast
                  ? versionToast
                  : saving
                  ? "Saving…"
                  : "Auto-saved"}
              </span>
              <div className="w-px h-3 bg-border hidden lg:block" />

              {/* Desktop: inline version controls */}
              <div className="hidden lg:flex items-center gap-3">
                <div className="relative">
                  <button
                    onClick={() => setSaveVersionOpen((v) => !v)}
                    disabled={!activeSceneId}
                    className="flex items-center gap-1 hover:text-text-secondary transition-colors disabled:opacity-40"
                  >
                    <BookmarkPlus size={11} />
                    Save Version
                  </button>
                  {saveVersionOpen && (
                    <SaveVersionPopover
                      onSave={handleSaveVersion}
                      onClose={() => setSaveVersionOpen(false)}
                    />
                  )}
                </div>
                <button
                  onClick={() => setVersionHistoryOpen(true)}
                  disabled={!activeSceneId}
                  className="flex items-center gap-1 hover:text-text-secondary transition-colors disabled:opacity-40"
                >
                  <History size={11} />
                  Version History
                </button>
              </div>

              {/* Mobile / tablet-portrait: overflow menu */}
              <div className="lg:hidden">
                <div className="w-px h-3 bg-border inline-block mr-3 align-middle" />
                <button
                  ref={versionMenuButtonRef}
                  onClick={openVersionMenu}
                  disabled={!activeSceneId}
                  aria-label="Version actions"
                  className="hover:text-text-secondary transition-colors disabled:opacity-40 align-middle"
                >
                  <MoreHorizontal size={14} />
                </button>
                {versionMenuOpen && createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[9998]"
                      onClick={() => setVersionMenuOpen(false)}
                    />
                    <div
                      className="fixed z-[9999] border border-border rounded-md shadow-xl py-1 min-w-[180px]"
                      style={{
                        bottom: versionMenuPos.bottom,
                        left: versionMenuPos.left,
                        backgroundColor: "hsl(var(--bg-raised))",
                      }}
                    >
                      <button
                        onClick={() => {
                          setVersionMenuOpen(false);
                          setSaveVersionOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                      >
                        <BookmarkPlus size={12} />
                        Save Version
                      </button>
                      <button
                        onClick={() => {
                          setVersionMenuOpen(false);
                          setVersionHistoryOpen(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
                      >
                        <History size={12} />
                        Version History
                      </button>
                    </div>
                  </>,
                  document.body
                )}
                {saveVersionOpen && (
                  <SaveVersionPopover
                    onSave={handleSaveVersion}
                    onClose={() => setSaveVersionOpen(false)}
                  />
                )}
              </div>
            </div>
            <span className="flex-shrink-0">{wordCount.toLocaleString()} words</span>
          </div>

          {versionHistoryOpen && activeSceneId && activeScene && (
            <VersionHistoryPanel
              sceneId={activeSceneId}
              sceneTitle={activeScene.title}
              onClose={() => setVersionHistoryOpen(false)}
              onRestore={handleRestoreVersion}
            />
          )}
        </div>

        {/* Chapter/scene sidebar — RIGHT (desktop only, >= lg) */}
        <div className="hidden lg:flex">{chapterSidebar}</div>

        {/* Mobile / tablet-portrait chapter slide-over.
            Close button is positioned to mirror the open trigger
            (top-right of the toolbar area). */}
        {chapterPanelOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 top-20 bg-background/70 backdrop-blur-sm z-40"
              onClick={() => setChapterPanelOpen(false)}
            />
            <div className="lg:hidden fixed right-0 top-20 bottom-0 z-50 animate-in slide-in-from-right duration-200">
              {chapterSidebar}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default ManuscriptPage;
