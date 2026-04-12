/**
 * Strip RTF control codes to extract plain text.
 * Not a complete RTF parser — handles common novel exports well enough.
 */
export function stripRtf(rtf: string): string {
  let s = rtf;
  // Convert paragraph/line-break control words to newlines BEFORE stripping everything else
  s = s.replace(/\\pard?\b\s*/gi, "\n\n");
  s = s.replace(/\\line\b\s*/gi, "\n");
  s = s.replace(/\\tab\b\s*/gi, "\t");
  // Preserve escaped braces so they survive the group-removal step
  s = s.replace(/\\\{/g, "\x01");
  s = s.replace(/\\\}/g, "\x02");
  // Remove all remaining control words: \word, \word123, \word-123
  s = s.replace(/\\[a-zA-Z]+[-]?\d*[ ]?/g, "");
  // Remove remaining backslash sequences
  s = s.replace(/\\./g, "");
  // Restore and then remove group delimiters
  s = s.replace(/\x01/g, "{");
  s = s.replace(/\x02/g, "}");
  s = s.replace(/[{}]/g, "");
  // Normalize whitespace
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export interface ParsedScene {
  title: string;
  content: string;
}

export interface ParsedChapter {
  title: string;
  scenes: ParsedScene[];
}

// Lines that look like chapter/part headings
const HEADING_RE = /^(chapter|part|prologue|epilogue|interlude)\b/i;

// Invisible characters that can prefix a line and break regex anchors:
// BOM (U+FEFF), zero-width space (U+200B), non-breaking space (U+00A0)
const INVISIBLE_PREFIX_RE = /^[\uFEFF\u200B\u00A0]+/;

/**
 * Parse plain text into chapters and scenes.
 *
 * Two cases:
 *  1. First content block is a chapter heading → that heading becomes the
 *     first chapter's title; no default "Chapter 1" is created.
 *  2. Content exists before the first heading → that content goes into a
 *     default "Chapter 1"; the heading then starts a new chapter.
 *
 * Within each chapter, content blocks become Scene 1, Scene 2… (counter
 * resets per chapter). Chapters with no scenes are dropped. If no headings
 * are found the whole text becomes one chapter.
 */
export function parseManuscript(text: string): ParsedChapter[] {
  // Normalize line endings (handles Windows \r\n and old Mac \r)
  // and strip a leading BOM that some editors prepend to UTF-8 files.
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const chapters: ParsedChapter[] = [];
  let currentChapter: ParsedChapter | null = null;
  let sceneNum = 1;

  const pushScene = (content: string) => {
    if (!currentChapter) {
      // Content before the first heading → default chapter
      currentChapter = { title: "Chapter 1", scenes: [] };
      chapters.push(currentChapter);
    }
    currentChapter.scenes.push({ title: `Scene ${sceneNum}`, content });
    sceneNum++;
  };

  for (const block of normalized.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Strip invisible prefix chars before testing the heading regex so that
    // a BOM or zero-width space at the start of the first block doesn't
    // prevent the heading from being detected.
    const firstLine = trimmed.split("\n")[0].trim().replace(INVISIBLE_PREFIX_RE, "");
    const isHeading = HEADING_RE.test(firstLine) && firstLine.length < 100;

    if (isHeading) {
      // Start a new chapter; reset per-chapter scene counter
      sceneNum = 1;
      currentChapter = { title: firstLine, scenes: [] };
      chapters.push(currentChapter);

      // Body text in the same block as the heading becomes its first scene
      const newlineIdx = trimmed.indexOf("\n");
      if (newlineIdx > -1) {
        const body = trimmed.slice(newlineIdx).trim();
        if (body.length >= 30) {
          currentChapter.scenes.push({ title: "Scene 1", content: body });
          sceneNum = 2;
        }
      }
    } else {
      if (trimmed.length < 30) continue;
      pushScene(trimmed);
    }
  }

  // Drop chapters with no scenes (standalone heading, nothing after it)
  const result = chapters.filter((ch) => ch.scenes.length > 0);

  // Fallback: nothing parsed → single chapter with the full text
  if (result.length === 0) {
    return [{ title: "Chapter 1", scenes: [{ title: "Scene 1", content: normalized.trim() }] }];
  }

  return result;
}
