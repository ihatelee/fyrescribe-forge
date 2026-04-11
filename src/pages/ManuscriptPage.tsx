import { useState, useRef, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_CHAPTERS, PLACEHOLDER_SCENE_CONTENT } from "@/lib/placeholder-data";
import {
  Bold,
  Italic,
  BookOpen,
  Maximize,
  ChevronRight,
  FileText,
  X,
} from "lucide-react";

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

const ManuscriptPage = () => {
  const [activeChapter, setActiveChapter] = useState("ch1");
  const [activeScene, setActiveScene] = useState("s1");
  const [focusMode, setFocusMode] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<string[]>(["ch1"]);
  const [thesaurusOpen, setThesaurusOpen] = useState(false);
  const [thesaurusWord, setThesaurusWord] = useState("");
  const [thesaurusSynonyms, setThesaurusSynonyms] = useState<string[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const focusEditorRef = useRef<HTMLDivElement>(null);

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const currentChapter = PLACEHOLDER_CHAPTERS.find((c) => c.id === activeChapter);
  const currentScene = currentChapter?.scenes.find((s) => s.id === activeScene);

  const applyFormat = useCallback((command: string) => {
    document.execCommand(command, false);
  }, []);

  const handleThesaurus = useCallback(() => {
    const selection = window.getSelection();
    const word = selection?.toString().trim().toLowerCase() || "";
    if (word) {
      setThesaurusWord(word);
      const synonyms = THESAURUS_DATA[word] || [];
      setThesaurusSynonyms(synonyms);
      setThesaurusOpen(true);
    } else {
      setThesaurusWord("");
      setThesaurusSynonyms([]);
      setThesaurusOpen(true);
    }
  }, []);

  const replaceWithSynonym = useCallback((synonym: string) => {
    const editor = focusMode ? focusEditorRef.current : editorRef.current;
    if (!editor) return;
    editor.focus();
    // Try to use the current selection to replace
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(synonym));
      selection.collapseToEnd();
    }
    setThesaurusOpen(false);
  }, [focusMode]);

  if (focusMode) {
    return (
      <div className="fixed inset-0 bg-fyrescribe-deepest z-[100] flex flex-col">
        <div className="flex items-center justify-between p-3">
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
          <button
            onClick={() => setFocusMode(false)}
            className="text-text-dimmed hover:text-text-secondary text-xs flex items-center gap-1 transition-colors"
          >
            Exit Focus Mode
          </button>
        </div>
        <div className="flex-1 flex justify-center overflow-y-auto pb-24 relative">
          <div className="w-full max-w-2xl px-8">
            <div className="font-display text-sm text-gold mb-6">
              {currentScene?.title}
            </div>
            <div
              ref={focusEditorRef}
              className="font-prose text-base leading-[1.9] text-[#b8c0d4] whitespace-pre-wrap outline-none min-h-[60vh]"
              contentEditable
              suppressContentEditableWarning
            >
              {PLACEHOLDER_SCENE_CONTENT}
            </div>
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

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-48px)]">
        {/* Editor area */}
        <div className="flex-1 flex flex-col bg-fyrescribe-deepest overflow-hidden relative">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-fyrescribe-base">
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
              <button
                onClick={() => setFocusMode(true)}
                className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs"
              >
                <Maximize size={14} />
                Focus
              </button>
            </div>
            <div className="text-text-dimmed text-xs">
              Ch {currentChapter?.order} · {currentScene?.title}
            </div>
          </div>

          {/* Editor content */}
          <div className="flex-1 overflow-y-auto flex justify-center py-10">
            <div className="w-full max-w-2xl px-8">
              <div className="font-display text-sm text-gold mb-6 tracking-wide">
                {currentScene?.title}
              </div>
              <div
                ref={editorRef}
                className="font-prose text-base leading-[1.9] text-[#b8c0d4] whitespace-pre-wrap outline-none min-h-[60vh]"
                contentEditable
                suppressContentEditableWarning
              >
                {PLACEHOLDER_SCENE_CONTENT}
              </div>
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
            <span>
              POV: {currentScene?.pov || "—"}
            </span>
            <span>{currentScene?.wordCount?.toLocaleString() || 0} words</span>
          </div>
        </div>

        {/* Chapter/Scene sidebar — RIGHT side */}
        <div className="w-[240px] bg-fyrescribe-base border-l border-border overflow-y-auto flex-shrink-0">
          <div className="p-3">
            <div className="text-[10px] font-medium uppercase tracking-widest text-text-dimmed mb-3 px-2">
              Chapters
            </div>
            {PLACEHOLDER_CHAPTERS.map((chapter) => (
              <div key={chapter.id} className="mb-1">
                <button
                  onClick={() => {
                    toggleChapter(chapter.id);
                    setActiveChapter(chapter.id);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-[13px] rounded-sm transition-colors ${
                    activeChapter === chapter.id
                      ? "text-foreground"
                      : "text-text-secondary hover:text-foreground"
                  }`}
                >
                  <ChevronRight
                    size={12}
                    className={`transition-transform flex-shrink-0 ${
                      expandedChapters.includes(chapter.id) ? "rotate-90" : ""
                    }`}
                  />
                  <span className="truncate">{chapter.title}</span>
                </button>

                {expandedChapters.includes(chapter.id) && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {chapter.scenes.map((scene) => (
                      <button
                        key={scene.id}
                        onClick={() => {
                          setActiveChapter(chapter.id);
                          setActiveScene(scene.id);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1 text-[12px] rounded-sm transition-colors ${
                          activeScene === scene.id
                            ? "text-gold-bright bg-gold-glow"
                            : "text-text-secondary hover:text-foreground"
                        }`}
                      >
                        <FileText size={10} className="flex-shrink-0" />
                        <span className="truncate">{scene.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

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
              <div className="text-[10px] uppercase tracking-widest text-text-dimmed mb-3">
                Synonyms
              </div>
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
              No synonyms found for this word. Try selecting a common word.
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

export default ManuscriptPage;
