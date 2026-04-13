import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, X, Loader2, FileText, Check, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type EntityCategory = Database["public"]["Enums"]["entity_category"];

const ENTITY_CATEGORIES: { value: EntityCategory; label: string }[] = [
  { value: "characters", label: "Characters" },
  { value: "places", label: "Places" },
  { value: "events", label: "Events" },
  { value: "history", label: "History" },
  { value: "artifacts", label: "Artifacts" },
  { value: "creatures", label: "Creatures" },
  { value: "magic", label: "Magic" },
  { value: "factions", label: "Factions" },
  { value: "doctrine", label: "Doctrine" },
];

// Category-specific fields that the parser should try to extract
const CATEGORY_FIELDS: Record<string, string[]> = {
  characters: ["Name", "Place of Birth", "Currently Residing", "Eye Color", "Hair Color", "Height", "Allegiance", "Description"],
  places: ["Name", "Region", "Climate", "Population", "Government", "Notable Landmarks", "Description"],
  events: ["Name", "Date/Era", "Location", "Key Participants", "Outcome", "Description"],
  history: ["Name", "Date/Era", "Location", "Key Factions", "Outcome", "Description"],
  artifacts: ["Name", "Type", "Origin", "Current Owner", "Powers", "Description"],
  creatures: ["Name", "Classification", "Habitat", "Average Size", "Diet", "Threat Level", "Description"],
  magic: ["Name", "Type", "Regional Origin", "Rarity", "Description"],
  factions: ["Name", "Type", "Founded", "Leader", "Headquarters", "Allegiance", "Description"],
  doctrine: ["Name", "Type", "Regional Origin", "Followers", "Core Belief", "Description"],
};

interface ExtractedField {
  key: string;
  value: string;
  included: boolean;
}

type ModalState = "empty" | "file_selected" | "parsing" | "parse_error" | "fields_ready" | "applying" | "success";

interface LoreUploadModalProps {
  projectId: string;
  defaultCategory: EntityCategory;
  onClose: () => void;
}

// ── Mock parser (placeholder until edge function is wired) ──────────
function mockParse(category: EntityCategory, fileName: string): ExtractedField[] {
  const fields = CATEGORY_FIELDS[category] ?? ["Name", "Description"];
  return fields.map((key) => ({
    key,
    value: key === "Name" ? fileName.replace(/\.(pdf|txt)$/i, "") : "",
    included: true,
  }));
}

const LoreUploadModal = ({ projectId, defaultCategory, onClose }: LoreUploadModalProps) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<EntityCategory>(defaultCategory);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ModalState>("empty");
  const [errorMessage, setErrorMessage] = useState("");
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [createdEntityId, setCreatedEntityId] = useState<string | null>(null);

  // Drag state
  const [dragOver, setDragOver] = useState(false);

  const acceptedTypes = [".pdf", ".txt", "application/pdf", "text/plain"];

  const isValidFile = (f: File) => {
    return f.type === "application/pdf" || f.type === "text/plain" || f.name.endsWith(".pdf") || f.name.endsWith(".txt");
  };

  const handleFileSelect = (f: File) => {
    if (!isValidFile(f)) {
      setErrorMessage("Only PDF and plain text (.txt) files are accepted.");
      setState("parse_error");
      return;
    }
    setFile(f);
    setState("file_selected");
    setErrorMessage("");
    setFields([]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const clearFile = () => {
    setFile(null);
    setState("empty");
    setFields([]);
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleParse = async () => {
    if (!file) return;
    setState("parsing");
    setErrorMessage("");

    try {
      // TODO: Replace with real edge function call
      await new Promise((r) => setTimeout(r, 1500)); // simulate latency
      const extracted = mockParse(category, file.name);
      setFields(extracted);
      setState("fields_ready");
    } catch (err) {
      console.error("Parse error:", err);
      setErrorMessage("Failed to extract fields. Please try again.");
      setState("parse_error");
    }
  };

  const toggleField = (index: number) => {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, included: !f.included } : f));
  };

  const updateFieldValue = (index: number, value: string) => {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, value } : f));
  };

  const hasIncluded = fields.some((f) => f.included && f.value.trim());

  const handleCreate = async () => {
    setState("applying");

    const included = fields.filter((f) => f.included && f.value.trim());
    const nameField = included.find((f) => f.key === "Name");
    const entityName = nameField?.value.trim() || file?.name.replace(/\.(pdf|txt)$/i, "") || "Unnamed Entity";
    const descField = included.find((f) => f.key === "Description");

    // Build fields object (exclude Name and Description — those go to dedicated columns)
    const entityFields: Record<string, string> = {};
    for (const f of included) {
      if (f.key !== "Name" && f.key !== "Description") {
        entityFields[f.key] = f.value;
      }
    }

    const { data, error } = await supabase
      .from("entities")
      .insert({
        name: entityName,
        category,
        project_id: projectId,
        summary: descField?.value.trim() || null,
        fields: entityFields,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create entity:", error);
      setErrorMessage("Failed to create entity. Please try again.");
      setState("fields_ready");
      return;
    }

    setCreatedEntityId(data.id);
    setState("success");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-fyrescribe-raised border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-base text-foreground">Upload Lore Entry</h2>
          <button onClick={onClose} className="text-text-dimmed hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {state === "success" ? (
          /* ─── Success state ─── */
          <div className="flex flex-col items-center py-8">
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center mb-4">
              <Check size={20} className="text-gold" />
            </div>
            <p className="text-sm text-foreground mb-1">Entity created successfully</p>
            {createdEntityId && (
              <button
                onClick={() => {
                  onClose();
                  navigate(`/entity/${createdEntityId}`);
                }}
                className="flex items-center gap-1 text-gold text-sm hover:text-gold-bright transition-colors mt-3"
              >
                View Entity <ChevronRight size={14} />
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Category selector */}
            <div className="mb-4">
              <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
                Entity Type
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const found = ENTITY_CATEGORIES.find((c) => c.value === e.target.value);
                  if (found) setCategory(found.value);
                }}
                disabled={state === "parsing" || state === "applying"}
                className="w-full bg-fyrescribe-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-gold/40 disabled:opacity-50"
              >
                {ENTITY_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Upload dropzone / file display */}
            <div className="mb-5">
              <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
                Document
              </label>
              {!file ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`w-full bg-fyrescribe-hover border border-dashed rounded-lg px-3 py-4 text-sm text-text-dimmed hover:text-text-secondary hover:border-text-dimmed transition-colors flex flex-col items-center gap-1 ${
                    dragOver ? "border-gold text-gold" : "border-border"
                  }`}
                >
                  <Upload size={18} />
                  <span>Drop a file here, or click to browse</span>
                  <span className="text-[11px] text-text-dimmed">PDF or plain text (.txt)</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-fyrescribe-hover border border-border rounded-lg px-3 py-2.5">
                  <FileText size={16} className="text-gold shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{file.name}</p>
                    <p className="text-[11px] text-text-dimmed">{formatFileSize(file.size)}</p>
                  </div>
                  {state !== "parsing" && state !== "applying" && (
                    <button
                      onClick={clearFile}
                      className="text-text-dimmed hover:text-foreground transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Error message */}
            {state === "parse_error" && errorMessage && (
              <p className="text-destructive text-xs mb-4">{errorMessage}</p>
            )}

            {/* Parsing spinner */}
            {state === "parsing" && (
              <div className="flex items-center justify-center gap-2 py-4 mb-4">
                <Loader2 size={14} className="animate-spin text-gold" />
                <span className="text-sm text-text-secondary">Reading your lore entry…</span>
              </div>
            )}

            {/* Field preview */}
            {(state === "fields_ready" || state === "applying") && fields.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto mb-4 space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
                  Extracted Fields
                </label>
                {fields.map((field, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                      field.included
                        ? "border-border bg-fyrescribe-hover"
                        : "border-transparent bg-transparent opacity-40"
                    }`}
                  >
                    <button
                      onClick={() => toggleField(i)}
                      disabled={state === "applying"}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        field.included
                          ? "bg-gold border-gold text-primary-foreground"
                          : "border-border hover:border-text-dimmed"
                      }`}
                    >
                      {field.included && <Check size={10} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-text-dimmed uppercase tracking-wide mb-1">{field.key}</p>
                      <input
                        value={field.value}
                        onChange={(e) => updateFieldValue(i, e.target.value)}
                        disabled={state === "applying" || !field.included}
                        placeholder={`Enter ${field.key.toLowerCase()}…`}
                        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-text-dimmed disabled:opacity-60"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Applying spinner */}
            {state === "applying" && (
              <div className="flex items-center justify-center gap-2 py-3 mb-4">
                <Loader2 size={14} className="animate-spin text-gold" />
                <span className="text-sm text-text-secondary">Creating entity…</span>
              </div>
            )}

            {/* Action bar — always visible, matches Import modal layout */}
            {state !== "parsing" && state !== "applying" && (
              <div className="flex gap-3">
                {(state === "file_selected" || state === "parse_error") && (
                  <button
                    onClick={handleParse}
                    disabled={!file}
                    className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50"
                  >
                    Read Entry
                  </button>
                )}
                {state === "fields_ready" && (
                  <button
                    onClick={handleCreate}
                    disabled={!hasIncluded}
                    className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50"
                  >
                    Create Entity
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LoreUploadModal;
