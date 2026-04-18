import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  AlignmentType,
  PageBreak,
} from "docx";
import { supabase } from "@/integrations/supabase/client";

interface Chapter {
  id: string;
  title: string;
  order: number;
}

interface Scene {
  id: string;
  title: string;
  chapter_id: string;
  order: number;
  content: string | null;
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
    .trim();
}

function contentToParagraphs(html: string): Paragraph[] {
  const text = stripHtml(html);
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 24 })], // 12pt
          spacing: { after: 120 },
        }),
    );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportManuscript(
  projectId: string,
  projectTitle: string,
): Promise<void> {
  const [chaptersRes, scenesRes] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, order")
      .eq("project_id", projectId)
      .order("order"),
    supabase
      .from("scenes")
      .select("id, title, chapter_id, order, content")
      .eq("project_id", projectId)
      .order("order"),
  ]);

  const chapters: Chapter[] = chaptersRes.data ?? [];
  const scenes: Scene[] = scenesRes.data ?? [];

  const children: Paragraph[] = [];

  // Document title
  children.push(
    new Paragraph({
      text: projectTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    }),
  );

  chapters.forEach((chapter, chapterIndex) => {
    // Page break before every chapter except the first
    if (chapterIndex > 0) {
      children.push(
        new Paragraph({ children: [new PageBreak()] }),
      );
    }

    // Chapter heading
    children.push(
      new Paragraph({
        text: chapter.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 240 },
      }),
    );

    const chapterScenes = scenes
      .filter((s) => s.chapter_id === chapter.id)
      .sort((a, b) => a.order - b.order);

    chapterScenes.forEach((scene) => {
      // Scene heading
      children.push(
        new Paragraph({
          text: scene.title,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 160 },
        }),
      );

      // Scene content
      const bodyParagraphs = contentToParagraphs(scene.content ?? "");
      if (bodyParagraphs.length > 0) {
        children.push(...bodyParagraphs);
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "", size: 24 }),
            ],
          }),
        );
      }
    });
  });

  const doc = new Document({
    creator: "Fyrescribe",
    title: projectTitle,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch in twips
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeTitle = projectTitle.replace(/[^a-z0-9\s-]/gi, "").trim() || "manuscript";
  triggerDownload(blob, `${safeTitle}.docx`);
}
