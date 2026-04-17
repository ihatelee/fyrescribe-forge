import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface SaveVersionPopoverProps {
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

const SaveVersionPopover = ({ onSave, onClose }: SaveVersionPopoverProps) => {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="absolute bottom-full left-0 mb-2 w-80 bg-fyrescribe-raised border border-border rounded-lg shadow-2xl z-50 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-text-dimmed">
          Save Version
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
          }
        }}
        placeholder="e.g. End of Chapter 3"
        className="w-full bg-fyrescribe-base border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-text-dimmed outline-none focus:border-gold/50 mb-2"
      />
      <div className="text-[10px] text-text-dimmed mb-3">Version name (optional)</div>
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={onClose}
          className="px-2.5 py-1 text-[11px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

export default SaveVersionPopover;
