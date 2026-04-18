import { useState } from "react";
import { FileText, BookOpen, Package, Download, Loader2, X } from "lucide-react";
import { exportManuscript } from "@/lib/exportManuscript";
import { exportLore } from "@/lib/exportLore";

type ExportOption = "manuscript" | "lore" | "everything";

interface ExportModalProps {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}

const OPTIONS: Array<{
  value: ExportOption;
  icon: typeof FileText;
  label: string;
  description: string;
}> = [
  {
    value: "manuscript",
    icon: FileText,
    label: "Manuscript",
    description: "Exports as .docx with chapters and scenes in order",
  },
  {
    value: "lore",
    icon: BookOpen,
    label: "Lore Sheets",
    description: "Exports all entities as a .pdf grouped by category",
  },
  {
    value: "everything",
    icon: Package,
    label: "Everything",
    description: "Downloads both the .docx and .pdf",
  },
];

const ExportModal = ({ projectId, projectTitle, onClose }: ExportModalProps) => {
  const [selected, setSelected] = useState<ExportOption>("manuscript");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      if (selected === "manuscript" || selected === "everything") {
        await exportManuscript(projectId, projectTitle);
      }
      if (selected === "lore" || selected === "everything") {
        await exportLore(projectId, projectTitle);
      }
      onClose();
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-gold" />
            <h2 className="font-display text-base text-foreground">Export Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          {OPTIONS.map(({ value, icon: Icon, label, description }) => {
            const active = selected === value;
            return (
              <button
                key={value}
                onClick={() => setSelected(value)}
                className={`w-full flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
                  active
                    ? "border-gold/50 bg-gold/5"
                    : "border-border hover:border-border/80 hover:bg-fyrescribe-hover"
                }`}
              >
                {/* Radio indicator */}
                <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  active ? "border-gold" : "border-text-dimmed"
                }`}>
                  {active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                  )}
                </div>
                <Icon
                  size={15}
                  className={`flex-shrink-0 mt-0.5 ${active ? "text-gold" : "text-text-dimmed"}`}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${active ? "text-gold-bright" : "text-foreground"}`}>
                    {label}
                  </p>
                  <p className="text-xs text-text-dimmed mt-0.5">{description}</p>
                </div>
              </button>
            );
          })}

          {error && (
            <p className="text-xs text-destructive px-1">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] rounded-md text-text-dimmed hover:text-foreground hover:bg-fyrescribe-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] rounded-md bg-gold/15 text-gold hover:bg-gold/25 disabled:opacity-50 transition-colors"
          >
            {exporting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
