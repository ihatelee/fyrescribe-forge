import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, X, Loader2, FileText, Check, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import ModalSelect from "@/components/ModalSelect";

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
  group: "field" | "section";
}

// "ready" = initial form (category + file), "importing" = parsing in progress,
// "fields_ready" = showing extracted fields, "applying" = creating entity, "success" = done
type ModalState = "ready" | "importing" | "fields_ready" | "applying" | "success";

interface LoreUploadModalProps {
  projectId: string;
  defaultCategory: EntityCategory;
  onClose: () => void;
}


const LoreUploadModal = ({ projectId, defaultCategory, onClose }: LoreUploadModalProps) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<EntityCategory>(defaultCategory);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ModalState>("ready");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [extractedName, setExtractedName] = useState("");
  const [extractedSummary, setExtractedSummary] = useState("");
  const [extractedTags, setExtractedTags] = useState<string[]>([]);
  const [createdEntityId, setCreatedEntityId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isValidFile = (f: File) =>
    f.type === "application/pdf" || f.type === "text/plain" || f.name.endsWith(".pdf") || f.name.endsWith(".txt");

  const acceptFile = (f: File) => {
    if (!isValidFile(f)) {
      setError("Only PDF and plain text (.txt) files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) acceptFile(dropped);
  }, []);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setState("importing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      const { data, error: invokeError } = await supabase.functions.invoke(
        "parse-lore-file",
        { body: formData },
      );

      if (invokeError || (!data?.fields && !data?.sections)) {
        throw new Error(data?.error ?? invokeError?.message ?? "Unknown error");
      }

      setExtractedName(typeof data.name === "string" ? data.name : "");
      setExtractedSummary(typeof data.summary === "string" ? data.summary : "");
      setExtractedTags(Array.isArray(data.tags) ? (data.tags as string[]).filter(Boolean) : []);

      const fieldEntries: ExtractedField[] = Object.entries(
        (data.fields ?? {}) as Record<string, string>,
      ).map(([key, value]) => ({ key, value, included: true, group: "field" as const }));

      const sectionEntries: ExtractedField[] = Object.entries(
        (data.sections ?? {}) as Record<string, string>,
      ).map(([key, value]) => ({ key, value, included: true, group: "section" as const }));

      setFields([...fieldEntries, ...sectionEntries]);
      setState("fields_ready");
    } catch (err) {
      console.error("Parse error:", err);
      setError("Failed to extract fields. Please try again.");
      setState("ready");
    }
  };

  const toggleField = (index: number) => {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, included: !f.included } : f));
  };

  const updateFieldValue = (index: number, value: string) => {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, value } : f));
  };

  const hasIncluded = fields.some((f) => f.included && f.value.trim()) || !!extractedName.trim();

  const handleCreate = async () => {
    setState("applying");

    const entityName =
      extractedName.trim() ||
      file?.name.replace(/\.(pdf|txt)$/i, "") ||
      "Unnamed Entity";

    const entityFields: Record<string, string> = {};
    const entitySections: Record<string, string> = {};
    for (const f of fields) {
      if (!f.included) continue;
      if (f.group === "field") entityFields[f.key] = f.value;
      else entitySections[f.key] = f.value;
    }

    const { data, error: insertError } = await supabase
      .from("entities")
      .insert({
        name: entityName,
        category,
        project_id: projectId,
        summary: extractedSummary.trim() || null,
        fields: entityFields,
        sections: entitySections,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to create entity:", insertError);
      setError("Failed to create entity. Please try again.");
      setState("fields_ready");
      return;
    }

    const tagNames = extractedTags.filter(Boolean);
    if (tagNames.length > 0) {
      const { data: existingTags } = await supabase
        .from("tags")
        .select("id, name")
        .eq("project_id", projectId)
        .in("name", tagNames);

      const existingNameSet = new Set((existingTags ?? []).map((t) => t.name.toLowerCase()));
      const newTagNames = tagNames.filter((n) => !existingNameSet.has(n.toLowerCase()));

      let createdTags: { id: string }[] = [];
      if (newTagNames.length > 0) {
        const { data: inserted } = await supabase
          .from("tags")
          .insert(newTagNames.map((name) => ({ project_id: projectId, name })))
          .select("id");
        createdTags = inserted ?? [];
      }

      const allTagIds = [
        ...(existingTags ?? []).map((t) => t.id),
        ...createdTags.map((t) => t.id),
      ];
      if (allTagIds.length > 0) {
        await supabase
          .from("entity_tags")
          .insert(allTagIds.map((tag_id) => ({ entity_id: data.id, tag_id })));
      }
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
          <button type="button" onClick={onClose} className="text-text-dimmed hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {state === "success" ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center mb-4">
              <Check size={20} className="text-gold" />
            </div>
            <p className="text-sm text-foreground mb-1">Entry created successfully</p>
            {createdEntityId && (
              <button
                onClick={() => { onClose(); navigate(`/entity/${createdEntityId}`); }}
                className="flex items-center gap-1 text-gold text-sm hover:text-gold-bright transition-colors mt-3"
              >
                View Entry <ChevronRight size={14} />
              </button>
            )}
          </div>
        ) : state === "fields_ready" || state === "applying" ? (
          /* ─── Field preview (after import/parse) ─── */
          <>
            {(extractedName || extractedSummary || fields.length > 0) && (
              <div className="flex-1 min-h-0 overflow-y-auto mb-4 space-y-4">
                {/* Name + summary read-only preview */}
                {(extractedName || extractedSummary) && (
                  <div className="space-y-1 pb-2 border-b border-border">
                    {extractedName && (
                      <p className="text-sm text-foreground font-medium">{extractedName}</p>
                    )}
                    {extractedSummary && (
                      <p className="text-xs text-text-secondary leading-relaxed">{extractedSummary}</p>
                    )}
                  </div>
                )}

                {/* At a Glance fields */}
                {fields.filter((f) => f.group === "field").length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-text-dimmed">At a Glance</p>
                    {fields.map((field, i) => field.group !== "field" ? null : (
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

                {/* Sections */}
                {fields.filter((f) => f.group === "section").length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-text-dimmed">Sections</p>
                    {fields.map((field, i) => field.group !== "section" ? null : (
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
              </div>
            )}

            {error && <p className="text-destructive text-xs mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={!hasIncluded || state === "applying"}
                className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {state === "applying" ? (
                  <><Loader2 size={14} className="animate-spin" /> Creating…</>
                ) : (
                  "Create Entry"
                )}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </>
        ) : (
          /* ─── Initial form: category + file + Import button ─── */
          <form onSubmit={handleImport}>
            {/* Category */}
            <div className="mb-4">
              <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
                Entity Type
              </label>
              <ModalSelect
                value={category}
                onChange={(e) => {
                  const found = ENTITY_CATEGORIES.find((c) => c.value === e.target.value);
                  if (found) setCategory(found.value);
                }}
                disabled={state === "importing"}
              >
                {ENTITY_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </ModalSelect>
            </div>

            {/* File upload */}
            <div className="mb-5">
              <label className="text-[10px] uppercase tracking-widest text-text-dimmed mb-2 block">
                Document <span className="text-gold">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
                className="hidden"
              />
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
                {file ? (
                  <span className="text-foreground truncate max-w-full">{file.name}</span>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>Drop a file here, or click to browse</span>
                    <span className="text-[11px] text-text-dimmed">PDF or plain text (.txt)</span>
                  </>
                )}
              </button>
            </div>

            {error && <p className="text-destructive text-xs mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!file || state === "importing"}
                className="flex-1 py-2 bg-gold text-primary-foreground text-sm font-medium rounded-lg hover:bg-gold-bright transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {state === "importing" ? (
                  <><Loader2 size={14} className="animate-spin" /> Importing…</>
                ) : (
                  "Import"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoreUploadModal;
