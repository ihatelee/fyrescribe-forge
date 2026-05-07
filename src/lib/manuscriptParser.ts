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
 * Detect a scene-break separator line. Common forms include:
 *   ***   * * *   #   # # #   ---   ###
 *   — ⚜ —   ◆   ❖   ✦   ✧   ⁂   ❦   ‖
 * The line must be short and contain ONLY separator-class characters.
 */
const SEPARATOR_CHAR_RE =
  /^[\s\-\u2010-\u2015_*#=~•·∙‧⋅・◆◇◈◉○●◯◍◎❖❉✦✧✶✷✹✺✻❀❦⚜⁂⸫⸪‡†§¶‖|]+$/;

function isSceneBreak(line: string): boolean {
  const t = line.trim().replace(INVISIBLE_PREFIX_RE, "");
  if (!t || t.length > 40) return false;
  return SEPARATOR_CHAR_RE.test(t);
}

function isChapterHeading(line: string): boolean {
  const t = line.trim().replace(INVISIBLE_PREFIX_RE, "");
  return t.length > 0 && t.length < 100 && HEADING_RE.test(t);
}

/**
 * Parse plain text into chapters and scenes.
 *
 * - Chapter breaks: lines starting with chapter/part/prologue/etc.
 * - Scene breaks: ONLY explicit separator lines (***, ⚜, — ⚜ —, ###).
 *   Plain paragraph breaks stay inside the same scene.
 * - Subtitles: short title-like lines right after a chapter heading get
 *   folded into the chapter title, joined with " — ".
 */
export function parseManuscript(text: string): ParsedChapter[] {
  const normalised = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = normalised.split("\n");

  type RawScene = { lines: string[] };
  type RawChapter = { title: string; scenes: RawScene[] };

  const chapters: RawChapter[] = [];
  let currentChapter: RawChapter | null = null;
  let currentScene: RawScene | null = null;
  let collectingSubtitle = false;

  const startScene = () => {
    if (!currentChapter) return;
    currentScene = { lines: [] };
    currentChapter.scenes.push(currentScene);
  };

  const startChapter = (title: string) => {
    currentChapter = { title, scenes: [] };
    chapters.push(currentChapter);
    currentScene = null;
    collectingSubtitle = true;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(INVISIBLE_PREFIX_RE, "");
    const trimmed = line.trim();

    if (isChapterHeading(trimmed)) {
      startChapter(trimmed);
      continue;
    }

    if (isSceneBreak(trimmed)) {
      currentScene = null;
      collectingSubtitle = false;
      continue;
    }

    if (!trimmed) {
      if (currentScene && currentScene.lines.length > 0) {
        const last = currentScene.lines[currentScene.lines.length - 1];
        if (last !== "") currentScene.lines.push("");
      }
      continue;
    }

    // Subtitle right after chapter heading (only the first such line)
    if (
      currentChapter &&
      collectingSubtitle &&
      !currentScene &&
      trimmed.length < 80 &&
      !/[.!?"]$/.test(trimmed)
    ) {
      currentChapter.title = `${currentChapter.title} — ${trimmed}`;
      collectingSubtitle = false;
      continue;
    }

    collectingSubtitle = false;

    if (!currentChapter) {
      // Skip lone short lines before any chapter (book title, etc.)
      if (trimmed.length < 80 && !/[.!?"]$/.test(trimmed)) continue;
      startChapter("Chapter 1");
    }
    if (!currentScene) startScene();
    currentScene!.lines.push(trimmed);
  }

  // Materialise: rebuild paragraph text, drop empty scenes/chapters.
  const result: ParsedChapter[] = [];
  for (const ch of chapters) {
    const scenes: ParsedScene[] = [];
    for (const sc of ch.scenes) {
      while (sc.lines.length && sc.lines[sc.lines.length - 1] === "") sc.lines.pop();
      if (sc.lines.length === 0) continue;

      // If the first line of the scene looks like a short title (no terminal
      // punctuation, < 80 chars), promote it to the scene title.
      let sceneTitle = `Scene ${scenes.length + 1}`;
      let bodyLines = sc.lines;
      const first = bodyLines[0];
      if (first && first.length < 80 && !/[.!?"]$/.test(first) && bodyLines.length > 1) {
        sceneTitle = first;
        bodyLines = bodyLines.slice(1);
        while (bodyLines.length && bodyLines[0] === "") bodyLines.shift();
      }

      const paragraphs: string[] = [];
      let buf: string[] = [];
      for (const l of bodyLines) {
        if (l === "") {
          if (buf.length) { paragraphs.push(buf.join(" ")); buf = []; }
        } else {
          buf.push(l);
        }
      }
      if (buf.length) paragraphs.push(buf.join(" "));
      const content = paragraphs.join("\n\n").trim();
      if (!content) continue;
      scenes.push({ title: sceneTitle, content });
    }
    if (scenes.length > 0) result.push({ title: ch.title, scenes });
  }

  if (result.length === 0) {
    return [{ title: "Chapter 1", scenes: [{ title: "Scene 1", content: normalised.trim() }] }];
  }
  return result;
}
