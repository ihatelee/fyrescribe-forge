/**
 * CP1252 → Unicode mapping for the printable range that differs from Latin-1.
 * Used to decode RTF \'XX escapes correctly (e.g. \'97 → em dash).
 */
const CP1252_EXTRAS: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

function cp1252ToChar(byte: number): string {
  return String.fromCodePoint(CP1252_EXTRAS[byte] ?? byte);
}

// Control words whose entire group contents should be discarded (header tables).
const SKIP_GROUPS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object",
  "themedata", "colorschememapping", "latentstyles", "datastore",
  "listtable", "listoverridetable", "rsidtbl", "generator", "filetbl",
  "revtbl", "wgrffmtfilter", "xmlnstbl",
]);

/**
 * Proper(-ish) RTF → plain text. Handles:
 *  - \par / \line / \tab → newlines & tabs
 *  - \'XX hex escapes (decoded as CP1252)
 *  - \uN unicode escapes (with \ucN skip-count handling)
 *  - {\fonttbl ...}, {\colortbl ...}, {\*\...} ignorable groups
 *  - bare backslash + newline used as soft line breaks (Cocoa RTF)
 *  - escaped \\, \{, \}
 */
export function stripRtf(rtf: string): string {
  const out: string[] = [];
  // Stack of per-group state: { skip: boolean, ucSkip: number }
  const stack: { skip: boolean; ucSkip: number; pendingSkip: number }[] = [
    { skip: false, ucSkip: 1, pendingSkip: 0 },
  ];
  const top = () => stack[stack.length - 1];
  const emit = (s: string) => {
    const cur = top();
    if (cur.skip) return;
    if (cur.pendingSkip > 0) {
      // Skip ahead into the literal text that follows a \uN escape
      const drop = Math.min(cur.pendingSkip, s.length);
      cur.pendingSkip -= drop;
      s = s.slice(drop);
      if (!s) return;
    }
    out.push(s);
  };

  let i = 0;
  const n = rtf.length;
  while (i < n) {
    const c = rtf[i];

    if (c === "{") {
      const parent = top();
      stack.push({ skip: parent.skip, ucSkip: parent.ucSkip, pendingSkip: 0 });
      i++;
      // Ignorable destination: {\*\foo ...}
      if (rtf[i] === "\\" && rtf[i + 1] === "*") {
        top().skip = true;
        i += 2;
      }
      continue;
    }
    if (c === "}") {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }

    if (c === "\\") {
      const next = rtf[i + 1];

      // Escaped literal characters
      if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        i += 2;
        continue;
      }
      // Backslash + newline = soft line break (Cocoa/TextEdit RTF)
      if (next === "\n" || next === "\r") {
        emit("\n");
        i += 2;
        if (next === "\r" && rtf[i] === "\n") i++;
        continue;
      }
      // \'XX hex byte (CP1252)
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          emit(cp1252ToChar(parseInt(hex, 16)));
          i += 4;
          continue;
        }
        i += 2;
        continue;
      }
      // Control word: \word[-N][ ]
      const m = /^\\([a-zA-Z]+)(-?\d+)?[ ]?/.exec(rtf.slice(i));
      if (m) {
        const word = m[1];
        const param = m[2] ? parseInt(m[2], 10) : null;
        i += m[0].length;

        if (word === "u" && param !== null) {
          // \uN — signed 16-bit codepoint
          const cp = param < 0 ? param + 0x10000 : param;
          emit(String.fromCodePoint(cp));
          top().pendingSkip = top().ucSkip;
          continue;
        }
        if (word === "uc" && param !== null) {
          top().ucSkip = param;
          continue;
        }
        if (word === "par" || word === "pard" || word === "sect" || word === "page") {
          emit("\n\n");
          continue;
        }
        if (word === "line") { emit("\n"); continue; }
        if (word === "tab")  { emit("\t"); continue; }
        if (word === "emdash") { emit("\u2014"); continue; }
        if (word === "endash") { emit("\u2013"); continue; }
        if (word === "lquote") { emit("\u2018"); continue; }
        if (word === "rquote") { emit("\u2019"); continue; }
        if (word === "ldblquote") { emit("\u201c"); continue; }
        if (word === "rdblquote") { emit("\u201d"); continue; }
        if (word === "bullet") { emit("\u2022"); continue; }
        if (SKIP_GROUPS.has(word)) {
          top().skip = true;
          continue;
        }
        // Unknown control word — silently consumed (formatting only)
        continue;
      }
      // Lone backslash with nothing recognisable — skip it
      i++;
      continue;
    }

    // Literal character
    emit(c);
    i++;
  }

  let s = out.join("");
  // Normalise whitespace
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ ?\n ?/g, "\n");
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
 * If a block contains chapter/part/etc. heading lines embedded among
 * single-newline-separated paragraphs, split the block at those heading
 * lines so each heading starts its own sub-block.
 *
 * Example: "The Ember Crown\nChapter One: …\nContent…"
 * becomes: ["The Ember Crown", "Chapter One: …\nContent…"]
 */
function splitBlockAtEmbeddedHeadings(block: string): string[] {
  const lines = block.split("\n");
  const result: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const cleaned = line.trim().replace(INVISIBLE_PREFIX_RE, "");
    if (HEADING_RE.test(cleaned) && cleaned.length < 100) {
      // Flush accumulated lines before this heading
      const flushed = current.join("\n").trim();
      if (flushed) result.push(flushed);
      current = [line]; // heading starts a new sub-block
    } else {
      current.push(line);
    }
  }

  const last = current.join("\n").trim();
  if (last) result.push(last);

  return result.length > 0 ? result : [block];
}

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

  // Split on double newlines, then re-split any block that contains an
  // embedded heading on its own line (handles single-newline manuscripts).
  const blocks = normalised
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .flatMap(splitBlockAtEmbeddedHeadings);

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

      // Skip single-line blocks that appear before the first heading —
      // these are typically the book title, not story content.
      if (currentChapter === null && !block.includes("\n")) continue;

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
