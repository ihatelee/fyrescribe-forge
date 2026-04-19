import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User, Check, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface CharacterOption {
  id: string;
  name: string;
}

interface POVSelectorProps {
  projectId: string | undefined;
  sceneId: string | null;
  povCharacterId: string | null;
  onChange: (sceneId: string, povCharacterId: string | null) => void;
}

const POVSelector = ({ projectId, sceneId, povCharacterId, onChange }: POVSelectorProps) => {
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load POV-flagged character entities for the project
  useEffect(() => {
    if (!projectId) {
      setCharacters([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, name")
        .eq("project_id", projectId)
        .eq("category", "characters")
        .eq("is_pov_character", true)
        .is("archived_at", null)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch POV characters:", error);
        setCharacters([]);
        return;
      }
      setCharacters((data ?? []) as CharacterOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = characters.find((c) => c.id === povCharacterId) ?? null;

  const handleToggle = () => {
    if (!sceneId) return;
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((o) => !o);
  };

  const handleSelect = async (nextId: string | null) => {
    setOpen(false);
    if (!sceneId || nextId === povCharacterId) return;
    setSaving(true);
    const { error } = await supabase
      .from("scenes")
      .update({ pov_character_id: nextId })
      .eq("id", sceneId);
    setSaving(false);
    if (error) {
      console.error("Failed to update POV:", error);
      return;
    }
    onChange(sceneId, nextId);
  };

  const label = selected ? selected.name : "POV";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={!sceneId}
        title={selected ? `POV: ${selected.name}` : "Set point-of-view character"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
          "text-text-secondary hover:text-foreground hover:bg-fyrescribe-hover",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          open && "bg-fyrescribe-hover text-foreground",
        )}
      >
        <User size={14} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown
          size={12}
          className={cn("text-text-dimmed transition-transform", open && "rotate-180")}
        />
      </button>

      {open && dropdownPos && createPortal(
        <div
          role="listbox"
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            backgroundColor: "hsl(var(--bg-raised))",
          }}
          className={cn(
            "z-[9999]",
            "min-w-[200px] max-h-72 overflow-y-auto",
            "border border-border rounded-md shadow-xl",
            "animate-fade-in py-1",
          )}
        >
          <div className="px-3 pt-2 pb-1.5 text-[10px] uppercase tracking-widest text-text-dimmed">
            Point of view
          </div>

          <button
            type="button"
            role="option"
            aria-selected={!povCharacterId}
            onClick={() => handleSelect(null)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors",
              "hover:bg-fyrescribe-hover",
              !povCharacterId ? "text-gold" : "text-text-secondary",
            )}
          >
            <span className="italic">No POV</span>
            {!povCharacterId && <Check size={12} />}
          </button>

          {characters.length > 0 && <div className="my-1 mx-2 h-px bg-border" />}

          {characters.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-dimmed">
              No POV characters set. Mark characters as POV on their entity pages.
            </div>
          ) : (
            characters.map((c) => {
              const active = c.id === povCharacterId;
              return (
                <button
                  type="button"
                  key={c.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSelect(c.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                    "hover:bg-fyrescribe-hover",
                    active ? "text-gold" : "text-text-secondary hover:text-foreground",
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {active && <Check size={12} className="flex-shrink-0" />}
                </button>
              );
            })
          )}

          {saving && (
            <div className="px-3 py-1.5 text-[10px] text-text-dimmed border-t border-border mt-1">
              Saving…
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default POVSelector;
