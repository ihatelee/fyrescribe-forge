import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveProject } from "@/contexts/ProjectContext";
import { useLoreSearch } from "@/hooks/useLoreSearch";

const CATEGORY_COLORS: Record<string, string> = {
  characters: "bg-blue-500/20 text-blue-300",
  places: "bg-green-500/20 text-green-300",
  events: "bg-orange-500/20 text-orange-300",
  history: "bg-amber-500/20 text-amber-300",
  artifacts: "bg-purple-500/20 text-purple-300",
  creatures: "bg-red-500/20 text-red-300",
  magic: "bg-cyan-500/20 text-cyan-300",
  factions: "bg-yellow-500/20 text-yellow-300",
  doctrine: "bg-pink-500/20 text-pink-300",
};

function extractSnippet(html: string, query: string): string {
  const text = (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 100) + (text.length > 100 ? "…" : "");
  const CONTEXT = 60;
  const start = Math.max(0, idx - CONTEXT);
  const end = Math.min(text.length, idx + query.length + CONTEXT);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

interface LoreSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LoreSearchModal = ({ open, onOpenChange }: LoreSearchModalProps) => {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const [query, setQuery] = useState("");

  const { results, sceneResults, isLoading } = useLoreSearch(activeProject?.id, query);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const hasAnyResults = results.length > 0 || sceneResults.length > 0;

  const handleSelect = (id: string) => {
    navigate(`/entity/${id}`);
    onOpenChange(false);
    setQuery("");
  };

  const handleSceneSelect = (sceneId: string) => {
    if (!activeProject?.id) return;
    navigate(`/project/${activeProject.id}/manuscript?scene=${sceneId}`);
    onOpenChange(false);
    setQuery("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg bg-fyrescribe-base border-border overflow-hidden">
        <DialogTitle className="sr-only">Search Lore</DialogTitle>

        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {isLoading ? (
            <Loader2 size={15} className="text-text-dimmed shrink-0 animate-spin" />
          ) : (
            <Search size={15} className="text-text-dimmed shrink-0" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities and manuscript content"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-text-dimmed outline-none"
          />
        </div>

        {/* Results / states */}
        <div className="max-h-96 overflow-y-auto">
          {!hasQuery ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-dimmed">
              Search entities by name, description, or lore content
            </p>
          ) : !hasAnyResults && !isLoading ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-dimmed">
              No results found
            </p>
          ) : (
            <>
              {/* Entity results */}
              {results.length > 0 && (
                <>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-text-dimmed border-b border-border/50">
                    Entities
                  </div>
                  <ul>
                    {results.map((result) => (
                      <li key={result.id}>
                        <button
                          onClick={() => handleSelect(result.id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-fyrescribe-hover transition-colors border-b border-border/50 last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[13px] font-medium text-foreground truncate">
                                {result.name}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize shrink-0 ${
                                  CATEGORY_COLORS[result.category] ?? "bg-muted text-muted-foreground"
                                }`}
                              >
                                {result.category}
                              </span>
                            </div>
                            {result.summary && (
                              <p className="text-[12px] text-text-dimmed truncate">
                                {result.summary.slice(0, 80)}
                                {result.summary.length > 80 ? "…" : ""}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Manuscript results */}
              {sceneResults.length > 0 && (
                <>
                  <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-text-dimmed border-b border-border/50">
                    Manuscript
                  </div>
                  <ul>
                    {sceneResults.map((scene) => (
                      <li key={scene.id}>
                        <button
                          onClick={() => handleSceneSelect(scene.id)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-fyrescribe-hover transition-colors border-b border-border/50 last:border-b-0"
                        >
                          <FileText size={13} className="text-text-dimmed shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[13px] font-medium text-foreground truncate">
                                {scene.title}
                              </span>
                              {scene.chapterTitle && (
                                <span className="text-[10px] text-text-dimmed shrink-0 truncate">
                                  {scene.chapterTitle}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-text-dimmed line-clamp-2">
                              {extractSnippet(scene.content, trimmed)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoreSearchModal;
