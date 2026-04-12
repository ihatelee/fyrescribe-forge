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

/**
 * Parse plain text into chapters and scenes.
 *
 * Rules:
 *  - A block whose first line matches a heading keyword starts a new chapter.
 *    The heading line becomes the chapter title.
 *  - If the heading block contains body text after the heading line, that body
 *    becomes the chapter's first scene.
 *  - Subsequent content blocks become Scene 1, Scene 2… within that chapter
 *    (counter resets per chapter).
 *  - Content before the first heading goes into a default "Chapter 1".
 *  - Chapters that end up with no scenes (heading-only, no following content)
 *    are dropped.
 *  - If no headings are found at all, the whole text becomes one chapter.
 */
export function parseManuscript(text: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  let currentChapter: ParsedChapter | null = null;
  let sceneNum = 1;

  const pushScene = (content: string) => {
    if (!currentChapter) {
      // Content before the first heading → create a default chapter
      currentChapter = { title: "Chapter 1", scenes: [] };
      chapters.push(currentChapter);
    }
    currentChapter.scenes.push({ title: `Scene ${sceneNum}`, content });
    sceneNum++;
  };

  for (const block of text.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const firstLine = trimmed.split("\n")[0].trim();
    const isHeading = HEADING_RE.test(firstLine) && firstLine.length < 80;

    if (isHeading) {
      // Start a new chapter; reset per-chapter scene counter
      sceneNum = 1;
      currentChapter = { title: firstLine, scenes: [] };
      chapters.push(currentChapter);

      // Body text attached to the heading block becomes its first scene
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

  // Drop any chapters that have no scenes (heading with nothing after it)
  const result = chapters.filter((ch) => ch.scenes.length > 0);

  // Fallback: nothing parsed → single chapter with the whole text
  if (result.length === 0) {
    return [{ title: "Chapter 1", scenes: [{ title: "Scene 1", content: text.trim() }] }];
  }

  return result;
}
