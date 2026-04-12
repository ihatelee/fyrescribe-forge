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
 * Case 1: The first content block is a chapter heading → it becomes the
 *   title of the first chapter. No "Chapter 1" default is created.
 *
 * Case 2: Non-heading content appears before the first heading → that
 *   content goes into a default "Chapter 1"; the heading then starts the
 *   next chapter.
 *
 * Within each chapter, content blocks become Scene 1, Scene 2… (counter
 * resets per chapter). Empty chapters are dropped. If no headings exist
 * the whole text becomes one chapter.
 */
export function parseManuscript(text: string): ParsedChapter[] {
  // Normalise line endings and strip a leading BOM.
  const normalised = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // ── DEBUG LOGGING ────────────────────────────────────────────────────
  console.log("[parseManuscript] first 500 chars of normalised text:");
  console.log(JSON.stringify(normalised.slice(0, 500)));

  // Pre-split and trim so every block we iterate is clean.
  const blocks = normalised
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  console.log(`[parseManuscript] total blocks after split: ${blocks.length}`);
  console.log("[parseManuscript] first 3 blocks:");
  blocks.slice(0, 3).forEach((b, i) => {
    console.log(`  block[${i}] (${b.length} chars): ${JSON.stringify(b.slice(0, 120))}`);
  });
  // ── END DEBUG ────────────────────────────────────────────────────────

  if (blocks.length === 0) {
    return [{ title: "Chapter 1", scenes: [{ title: "Scene 1", content: text.trim() }] }];
  }

  const chapters: ParsedChapter[] = [];
  let currentChapter: ParsedChapter | null = null;
  let sceneNum = 1;

  for (const block of blocks) {
    // Derive the heading candidate: first line of the block, with any
    // invisible prefix characters (BOM, zero-width space, NBSP) stripped.
    const firstLine = block
      .split("\n")[0]
      .trim()
      .replace(INVISIBLE_PREFIX_RE, "");

    const isHeading = HEADING_RE.test(firstLine) && firstLine.length < 100;

    if (isHeading) {
      // ── Start a new chapter ────────────────────────────────────────
      sceneNum = 1;
      currentChapter = { title: firstLine, scenes: [] };
      chapters.push(currentChapter);

      // If the heading and its opening paragraph are in the same block
      // (separated by a single newline), add the body as the first scene.
      const newlineIdx = block.indexOf("\n");
      if (newlineIdx !== -1) {
        const body = block.slice(newlineIdx + 1).trim();
        if (body.length >= 30) {
          currentChapter.scenes.push({ title: "Scene 1", content: body });
          sceneNum = 2;
        }
      }
    } else {
      // ── Content block ──────────────────────────────────────────────
      if (block.length < 30) continue; // skip short separators / artefacts

      if (currentChapter === null) {
        // Content before the first heading → default chapter
        currentChapter = { title: "Chapter 1", scenes: [] };
        chapters.push(currentChapter);
      }

      currentChapter.scenes.push({ title: `Scene ${sceneNum}`, content: block });
      sceneNum++;
    }
  }

  // Drop chapters that ended up with no scenes.
  const result = chapters.filter((ch) => ch.scenes.length > 0);

  if (result.length === 0) {
    return [{ title: "Chapter 1", scenes: [{ title: "Scene 1", content: normalised.trim() }] }];
  }

  return result;
}
