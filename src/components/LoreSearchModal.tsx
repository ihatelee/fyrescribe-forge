import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
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

interface LoreSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LoreSearchModal = ({ open, onOpenChange }: LoreSearchModalProps) => {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const [query, setQuery] = useState("");

  const { results, isLoading } = useLoreSearch(activeProject?.id, query);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;

  const handleSelect = (id: string) => {
    navigate(`/entity/${id}`);
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
            placeholder="Search entities by name, description, or lore content"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-text-dimmed outline-none"
          />
        </div>

        {/* Results / states */}
        <div className="max-h-80 overflow-y-auto">
          {!hasQuery ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-dimmed">
              Search entities by name, description, or lore content
            </p>
          ) : results.length === 0 && !isLoading ? (
            <p className="px-4 py-8 text-center text-[13px] text-text-dimmed">
              No entities found
            </p>
          ) : (
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoreSearchModal;
