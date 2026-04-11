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

// Lines that look like chapter/part headings
const HEADING_RE = /^(chapter|part|prologue|epilogue|interlude)\b/i;

/**
 * Split plain text into scenes.
 *
 * Rules (in priority order):
 *  1. A block that starts with a chapter/part heading AND has body text → scene
 *     titled after the heading.
 *  2. A heading-only block (no body) → its text becomes the title of the *next*
 *     content block.
 *  3. Any other block ≥ 30 chars → "Scene N".
 *
 * Blocks are separated by two or more newlines.
 */
export function splitIntoScenes(text: string): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  let pendingTitle: string | null = null;
  let sceneNum = 1;

  for (const block of text.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (trimmed.length < 30) continue;

    const firstLine = trimmed.split("\n")[0].trim();
    const isHeading = HEADING_RE.test(firstLine) && firstLine.length < 80;

    if (isHeading) {
      const newlineIdx = trimmed.indexOf("\n");
      const body = newlineIdx > -1 ? trimmed.slice(newlineIdx).trim() : "";

      if (body.length >= 30) {
        // Heading + body in same block → one scene
        scenes.push({ title: firstLine, content: body });
        pendingTitle = null;
        sceneNum++;
      } else {
        // Heading only → carry as title for the next block
        pendingTitle = firstLine;
      }
    } else {
      const title = pendingTitle ?? `Scene ${sceneNum}`;
      scenes.push({ title, content: trimmed });
      pendingTitle = null;
      sceneNum++;
    }
  }

  // Fallback: if nothing passed the length filter, use the raw text as one scene
  if (scenes.length === 0) {
    scenes.push({ title: "Scene 1", content: text.trim() });
  }

  return scenes;
}
