import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";
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
  characters: "Characters",
  places: "Locations",
  factions: "Factions",
  events: "Events",
  history: "History",
  artifacts: "Artifacts",
  creatures: "Creatures",
  magic: "Magic",
  doctrine: "Doctrine",
};

const CATEGORY_SINGULAR: Record<string, string> = {
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

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// No-border cell specification (used to suppress default borders on table cells)
const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const lightBottomBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function makeCategoryDivider(category: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: (CATEGORY_LABELS[category] ?? category).toUpperCase(),
        bold: true,
        size: 28, // 14pt
        color: "444444",
      }),
    ],
    spacing: { before: 0, after: 160 },
    border: {
      bottom: { style: BorderStyle.THICK, size: 6, color: "CCCCCC", space: 4 },
    },
  });
}

function makeGlanceTable(entries: Array<[string, string]>): Table {
  const rows = entries.map(
    ([key, value]) =>
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: key, bold: true, size: 18, color: "555555" }),
                ],
              }),
            ],
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: lightBottomBorder,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: value, size: 18 })],
              }),
            ],
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: lightBottomBorder,
          }),
        ],
      }),
  );

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideH: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideV: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  });
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
  if (entities.length === 0) return;

  const entityIds = entities.map((e) => e.id);

  // Fetch all entity_links for these entities (both directions)
  const [linksARes, linksBRes] = await Promise.all([
    supabase
      .from("entity_links")
      .select("entity_a_id, entity_b_id, relationship, entity_b:entity_b_id(id, name, category)")
      .in("entity_a_id", entityIds),
    supabase
      .from("entity_links")
      .select("entity_a_id, entity_b_id, relationship, entity_a:entity_a_id(id, name, category)")
      .in("entity_b_id", entityIds),
  ]);

  const linksA: LinkRow[] = (linksARes.data ?? []) as unknown as LinkRow[];
  const linksB: LinkRow[] = (linksBRes.data ?? []) as unknown as LinkRow[];

  // Build per-entity maps: field links (picker fields) and general relationship links
  const fieldLinkMap = new Map<string, Map<string, string>>();
  const generalLinkMap = new Map<string, Array<{ name: string; relationship: string }>>();

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
  }

  // Sort: by category order, then alphabetically by name
  const categoryIndex = (cat: string) => {
    const idx = CATEGORY_ORDER.indexOf(cat as (typeof CATEGORY_ORDER)[number]);
    return idx === -1 ? 99 : idx;
  };

  const sorted = [...entities].sort((a, b) => {
    const ci = categoryIndex(a.category) - categoryIndex(b.category);
    return ci !== 0 ? ci : a.name.localeCompare(b.name);
  });

  // Build document children
  const children: Array<Paragraph | Table> = [];
  let currentCategory = "";

  sorted.forEach((entity, i) => {
    // Page break before every entity except the very first
    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Category divider when the category changes
    if (entity.category !== currentCategory) {
      currentCategory = entity.category;
      children.push(makeCategoryDivider(entity.category));
    }

    const sections = (entity.sections ?? {}) as Record<string, string>;
    const fields = (entity.fields ?? {}) as Record<string, string>;
    const entityFieldLinks = fieldLinkMap.get(entity.id) ?? new Map<string, string>();
    const linkedEntities = generalLinkMap.get(entity.id) ?? [];

    // ── Entity name (Heading 1) ───────────────────────────────────────
    children.push(
      new Paragraph({
        text: entity.name,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 0, after: 80 },
      }),
    );

    // ── Category label ───────────────────────────────────────────────
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: CATEGORY_SINGULAR[entity.category] ?? entity.category,
            size: 18,
            color: "888888",
            italics: true,
          }),
        ],
        spacing: { before: 0, after: 240 },
      }),
    );

    // ── Sections (non-empty only) ─────────────────────────────────────
    for (const [sectionName, rawContent] of Object.entries(sections)) {
      const content = stripHtml(rawContent ?? "");
      if (!content.trim()) continue;

      // Section label as Heading 2
      children.push(
        new Paragraph({
          text: sectionName,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
        }),
      );

      // Section content — split on newlines to preserve paragraph breaks
      const paras = content.split("\n").filter((l) => l.trim());
      if (paras.length === 0) {
        children.push(new Paragraph({ text: content, spacing: { after: 120 } }));
      } else {
        for (const para of paras) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: para.trim(), size: 22 })],
              spacing: { after: 80 },
            }),
          );
        }
      }
    }

    // ── At a Glance (two-column table) ───────────────────────────────
    const glanceEntries: Array<[string, string]> = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!value?.trim()) continue;
      const linkedVal = entityFieldLinks.get(key);
      glanceEntries.push([key, linkedVal ?? value]);
    }
    // Include any field links not already represented in the fields object
    for (const [key, val] of entityFieldLinks.entries()) {
      if (!glanceEntries.find(([k]) => k === key)) {
        glanceEntries.push([key, val]);
      }
    }

    if (glanceEntries.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "At a Glance", bold: true, size: 20, color: "555555" }),
          ],
          spacing: { before: 240, after: 80 },
        }),
      );
      children.push(makeGlanceTable(glanceEntries));
    }

    // ── Linked entities (bulleted list) ──────────────────────────────
    if (linkedEntities.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Linked Entities", bold: true, size: 20, color: "555555" }),
          ],
          spacing: { before: 240, after: 80 },
        }),
      );
      for (const link of linkedEntities) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${link.name}  ·  ${link.relationship}`,
                size: 20,
              }),
            ],
            bullet: { level: 0 },
          }),
        );
      }
    }
  });

  const doc = new Document({
    creator: "Fyrescribe",
    title: `${projectTitle} — Lore Sheets`,
    styles: {
      default: {
        heading1: {
          run: { size: 36, bold: true, color: "111111" },
          paragraph: { spacing: { before: 0, after: 120 } },
        },
        heading2: {
          run: { size: 22, bold: true, color: "333333" },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeTitle = projectTitle.replace(/[^a-z0-9\s-]/gi, "").trim() || "lore";
  triggerDownload(blob, `${safeTitle}-lore-sheets.docx`);
}
