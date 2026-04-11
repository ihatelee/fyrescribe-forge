import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { PLACEHOLDER_CHAPTERS, PLACEHOLDER_SCENE_CONTENT } from "@/lib/placeholder-data";
import {
  Bold,
  Italic,
  Minus,
  BookOpen,
  Maximize,
  ChevronRight,
  FileText,
} from "lucide-react";

const ManuscriptPage = () => {
  const [activeChapter, setActiveChapter] = useState("ch1");
  const [activeScene, setActiveScene] = useState("s1");
  const [focusMode, setFocusMode] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<string[]>(["ch1"]);

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const currentChapter = PLACEHOLDER_CHAPTERS.find((c) => c.id === activeChapter);
  const currentScene = currentChapter?.scenes.find((s) => s.id === activeScene);

  if (focusMode) {
    return (
      <div className="fixed inset-0 bg-fyrescribe-deepest z-[100] flex flex-col">
        <div className="flex items-center justify-end p-3">
          <button
            onClick={() => setFocusMode(false)}
            className="text-text-dimmed hover:text-text-secondary text-xs flex items-center gap-1 transition-colors"
          >
            Exit Focus Mode
          </button>
        </div>
        <div className="flex-1 flex justify-center overflow-y-auto pb-24">
          <div className="w-full max-w-2xl px-8">
            <div className="font-display text-sm text-gold mb-6">
              {currentScene?.title}
            </div>
            <div
              className="font-prose text-base leading-[1.9] text-[#b8c0d4] whitespace-pre-wrap outline-none min-h-[60vh]"
              contentEditable
              suppressContentEditableWarning
            >
              {PLACEHOLDER_SCENE_CONTENT}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppLayout projectName="The Shattered Vigil">
      <div className="flex h-[calc(100vh-48px)]">
        {/* Chapter/Scene sidebar */}
        <div className="w-[240px] bg-fyrescribe-base border-r border-border overflow-y-auto flex-shrink-0">
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

        {/* Editor area */}
        <div className="flex-1 flex flex-col bg-fyrescribe-deepest overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-fyrescribe-base">
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors">
                <Bold size={14} />
              </button>
              <button className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors">
                <Italic size={14} />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button className="p-1.5 rounded text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover transition-colors flex items-center gap-1 text-xs">
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
                className="font-prose text-base leading-[1.9] text-[#b8c0d4] whitespace-pre-wrap outline-none min-h-[60vh]"
                contentEditable
                suppressContentEditableWarning
              >
                {PLACEHOLDER_SCENE_CONTENT}
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-fyrescribe-base text-text-dimmed text-[11px]">
            <span>
              POV: {currentScene?.pov || "—"}
            </span>
            <span>{currentScene?.wordCount?.toLocaleString() || 0} words</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ManuscriptPage;
