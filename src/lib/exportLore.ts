import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

// Category display order and singular labels
const CATEGORY_ORDER = [
  "characters",
  "places",
  "factions",
  "events",
  "history",
  "artifacts",
  "creatures",
  "magic",
  "doctrine",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  characters: "Character",
  places: "Location",
  factions: "Faction",
  events: "Event",
  history: "History",
  artifacts: "Artifact",
  creatures: "Creature",
  magic: "Magic",
  doctrine: "Doctrine",
};

// Fields that are entity-picker linked (relationship = field name in entity_links)
const ENTITY_PICKER_FIELDS = new Set([
  "Place of Birth",
  "Currently Residing",
  "Allegiance",
  "Current Owner",
  "Origin",
  "Leader",
  "Headquarters",
  "Government",
  "Habitat",
  "Regional Origin",
  "Location",
]);

interface Entity {
  id: string;
  name: string;
  category: string;
  summary: string | null;
  sections: Record<string, string> | null;
  fields: Record<string, string> | null;
}

interface LinkRow {
  entity_a_id: string;
  entity_b_id: string;
  relationship: string | null;
  entity_a: { id: string; name: string; category: string } | null;
  entity_b: { id: string; name: string; category: string } | null;
}

function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Wraps text into lines that fit within maxWidth at the given font size.
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    const wrapped = doc.splitTextToSize(para.trim(), maxWidth) as string[];
    lines.push(...wrapped);
  }
  return lines;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportLore(
  projectId: string,
  projectTitle: string,
): Promise<void> {
  // Fetch entities
  const { data: entitiesRaw } = await supabase
    .from("entities")
    .select("id, name, category, summary, sections, fields")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("name");

  const entities: Entity[] = (entitiesRaw ?? []) as Entity[];

  if (entities.length === 0) {
    return;
  }

  const entityIds = entities.map((e) => e.id);

  // Fetch all entity_links for these entities
  const [linksARes, linksBRes] = await Promise.all([
    supabase
      .from("entity_links")
      .select(
        "entity_a_id, entity_b_id, relationship, entity_b:entity_b_id(id, name, category)",
      )
      .in("entity_a_id", entityIds),
    supabase
      .from("entity_links")
      .select(
        "entity_a_id, entity_b_id, relationship, entity_a:entity_a_id(id, name, category)",
      )
      .in("entity_b_id", entityIds),
  ]);

  const linksA: LinkRow[] = (linksARes.data ?? []) as unknown as LinkRow[];
  const linksB: LinkRow[] = (linksBRes.data ?? []) as unknown as LinkRow[];

  // Build per-entity maps of field links and general links
  const fieldLinkMap = new Map<string, Map<string, string>>(); // entityId → fieldKey → targetName
  const generalLinkMap = new Map<string, Array<{ name: string; relationship: string }>>(); // entityId → [{name, relationship}]

  for (const l of linksA) {
    const targetName = (l.entity_b as any)?.name;
    const rel = l.relationship ?? "linked";
    if (!targetName) continue;

    if (ENTITY_PICKER_FIELDS.has(rel)) {
      if (!fieldLinkMap.has(l.entity_a_id)) fieldLinkMap.set(l.entity_a_id, new Map());
      fieldLinkMap.get(l.entity_a_id)!.set(rel, targetName);
    } else {
      if (!generalLinkMap.has(l.entity_a_id)) generalLinkMap.set(l.entity_a_id, []);
      generalLinkMap.get(l.entity_a_id)!.push({ name: targetName, relationship: rel });
    }
  }

  for (const l of linksB) {
    const sourceName = (l.entity_a as any)?.name;
    const rel = l.relationship ?? "linked";
    if (!sourceName) continue;

    if (!ENTITY_PICKER_FIELDS.has(rel)) {
      if (!generalLinkMap.has(l.entity_b_id)) generalLinkMap.set(l.entity_b_id, []);
      generalLinkMap.get(l.entity_b_id)!.push({ name: sourceName, relationship: rel });
    }
    // Field links from direction B are already mirrored in entity.fields text — skip
  }

  // Sort entities by category order, then name
  const categoryIndex = (cat: string) => {
    const idx = CATEGORY_ORDER.indexOf(cat as typeof CATEGORY_ORDER[number]);
    return idx === -1 ? 99 : idx;
  };

  const sorted = [...entities].sort((a, b) => {
    const ci = categoryIndex(a.category) - categoryIndex(b.category);
    if (ci !== 0) return ci;
    return a.name.localeCompare(b.name);
  });

  // PDF layout constants
  const PAGE_W = 210; // A4 mm
  const PAGE_H = 297;
  const MARGIN = 18;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const COL_W = (CONTENT_W - 6) / 2; // two columns with gap

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = MARGIN;
  let isFirstPage = true;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  const addLine = (height = 5) => {
    y += height;
  };

  for (const entity of sorted) {
    if (!isFirstPage) {
      doc.addPage();
      y = MARGIN;
    }
    isFirstPage = false;

    const sections = (entity.sections ?? {}) as Record<string, string>;
    const fields = (entity.fields ?? {}) as Record<string, string>;
    const entityFieldLinks = fieldLinkMap.get(entity.id) ?? new Map<string, string>();
    const linkedEntities = generalLinkMap.get(entity.id) ?? [];

    // ── Entity name ──────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text(entity.name, MARGIN, y);
    y += 8;

    // ── Category label ───────────────────────────────────────────────
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(
      (CATEGORY_LABELS[entity.category] ?? entity.category).toUpperCase(),
      MARGIN,
      y,
    );
    y += 5;

    // ── Divider line ─────────────────────────────────────────────────
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;

    // ── Sections ─────────────────────────────────────────────────────
    for (const [sectionName, rawContent] of Object.entries(sections)) {
      const content = stripHtml(rawContent ?? "");
      if (!content.trim()) continue;

      checkPageBreak(14);

      // Section label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(sectionName.toUpperCase(), MARGIN, y);
      y += 4;

      // Section content
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);

      const lines = wrapText(doc, content, CONTENT_W);
      for (const line of lines) {
        checkPageBreak(5);
        if (line === "") {
          y += 2;
        } else {
          doc.text(line, MARGIN, y);
          y += 4.5;
        }
      }
      y += 3;
    }

    // ── At a Glance grid ─────────────────────────────────────────────
    // Collect all non-empty field values (merging field links + text fields)
    const glanceEntries: Array<[string, string]> = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!value?.trim()) continue;
      // Use linked entity name if available (field link overrides text)
      const linkedVal = entityFieldLinks.get(key);
      glanceEntries.push([key, linkedVal ?? value]);
    }
    // Add any field links not already in fields object
    for (const [key, val] of entityFieldLinks.entries()) {
      if (!glanceEntries.find(([k]) => k === key)) {
        glanceEntries.push([key, val]);
      }
    }

    if (glanceEntries.length > 0) {
      checkPageBreak(12);

      doc.setDrawColor(200, 200, 200);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text("AT A GLANCE", MARGIN, y);
      y += 5;

      // Two-column layout
      for (let i = 0; i < glanceEntries.length; i += 2) {
        checkPageBreak(9);
        const left = glanceEntries[i];
        const right = glanceEntries[i + 1];

        // Left key
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(90, 90, 90);
        doc.text(left[0].toUpperCase(), MARGIN, y);

        if (right) {
          doc.text(right[0].toUpperCase(), MARGIN + COL_W + 6, y);
        }
        y += 3.5;

        // Left value
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(20, 20, 20);
        const leftLines = doc.splitTextToSize(left[1], COL_W) as string[];
        doc.text(leftLines[0] ?? "", MARGIN, y);

        if (right) {
          const rightLines = doc.splitTextToSize(right[1], COL_W) as string[];
          doc.text(rightLines[0] ?? "", MARGIN + COL_W + 6, y);
        }
        y += 5;
      }
      y += 2;
    }

    // ── Linked entities ──────────────────────────────────────────────
    if (linkedEntities.length > 0) {
      checkPageBreak(12);

      doc.setDrawColor(200, 200, 200);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text("LINKED ENTITIES", MARGIN, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(30, 30, 30);

      for (const link of linkedEntities) {
        checkPageBreak(5);
        doc.text(`${link.name}  ·  ${link.relationship}`, MARGIN, y);
        y += 4.5;
      }
    }
  }

  const blob = doc.output("blob");
  const safeTitle = projectTitle.replace(/[^a-z0-9\s-]/gi, "").trim() || "lore";
  triggerDownload(blob, `${safeTitle}-lore-sheets.pdf`);
}
