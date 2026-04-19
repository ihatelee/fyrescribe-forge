// Run: bun scripts/gen-textures.ts > src/lib/whimsicalTextures.ts
import { deflateSync } from "node:zlib";

/* ─── PNG builder ─────────────────────────────────────────────────────────── */
function makeCrcTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC = makeCrcTable();
function crc32(d: Uint8Array): number {
  let v = 0xffffffff;
  for (let i = 0; i < d.length; i++) v = CRC[(v ^ d[i]) & 0xff] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
}
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const tb = new TextEncoder().encode(type);
  const td = new Uint8Array(tb.length + data.length);
  td.set(tb); td.set(data, tb.length);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(u32(data.length), 0);
  out.set(tb, 4);
  out.set(data, 8);
  out.set(u32(crc32(td)), 8 + data.length);
  return out;
}
function buildPng(w: number, h: number, gray: Uint8Array): string {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w, false);
  new DataView(ihdr.buffer).setUint32(4, h, false);
  ihdr[8] = 8; // bit depth
  // color type 0 = grayscale
  const raw = new Uint8Array(h * (1 + w));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w)] = 0;
    for (let x = 0; x < w; x++) raw[y * (1 + w) + 1 + x] = gray[y * w + x];
  }
  const comp = new Uint8Array(deflateSync(Buffer.from(raw)));
  const chunks = [pngChunk("IHDR", ihdr), pngChunk("IDAT", comp), pngChunk("IEND", new Uint8Array(0))];
  const total = sig.length + chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  out.set(sig, off); off += sig.length;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return Buffer.from(out).toString("base64");
}

/* ─── Seeded XORShift RNG ─────────────────────────────────────────────────── */
function rng(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5; s = s >>> 0;
    return s / 0x100000000;
  };
}

/* ─── Parchment texture — 64×64 warm cream grain ─────────────────────────── */
function genParchment(): string {
  const w = 64, h = 64, rand = rng(0xdeadbeef);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 222; // warm cream base
      v += (rand() - 0.5) * 30; // grain ±15
      v += Math.sin(y * 1.05 + x * 0.08) * 6; // horizontal fiber
      v += Math.cos(x * 0.85 + y * 0.12) * 3; // vertical secondary
      v += Math.sin((x + y) * 0.4) * 2; // diagonal texture
      px[y * w + x] = Math.max(185, Math.min(252, Math.round(v)));
    }
  }
  return buildPng(w, h, px);
}

/* ─── Ghost background — 128×128 faint manuscript marks ─────────────────── */
function genGhost(): string {
  const w = 128, h = 128, rand = rng(0xcafebabe);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 15 + rand() * 8; // near-black base with subtle variation
      const lineY = y % 14;
      if (lineY === 0) v = 190; // ruled line: strong mark
      else if (lineY === 1) v = 80; // ruled line: fade
      else if (lineY === 13) v = 40; // pre-rule shadow
      if (rand() > 0.994) v = 210; // sparse ink speck
      else if (rand() > 0.992) v = 120; // medium mark
      // Faint margin line at x=10 and x=118
      if ((x === 10 || x === 118) && rand() > 0.3) v = Math.max(v, 90);
      px[y * w + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return buildPng(w, h, px);
}

/* ─── Deckled edge SVG masks ──────────────────────────────────────────────── */
// Left edge: white area has organic right boundary (torn paper edge)
const leftMaskSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 200' preserveAspectRatio='none'><path d='M 0,0 L 12,0 C 15,14 10,28 13,42 C 11,56 15,70 11,84 C 14,98 11,112 14,126 C 11,140 14,154 10,168 C 14,182 11,196 13,200 L 0,200 Z' fill='white'/></svg>`;
const rightMaskSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 200' preserveAspectRatio='none'><path d='M 18,0 L 6,0 C 3,14 8,28 5,42 C 7,56 3,70 7,84 C 4,98 7,112 4,126 C 7,140 4,154 8,168 C 4,182 7,196 5,200 L 18,200 Z' fill='white'/></svg>`;

const leftMaskB64 = Buffer.from(leftMaskSvg).toString("base64");
const rightMaskB64 = Buffer.from(rightMaskSvg).toString("base64");

/* ─── Output ─────────────────────────────────────────────────────────────── */
const parchmentB64 = genParchment();
const ghostB64 = genGhost();

process.stderr.write(`Parchment: ~${Math.round(parchmentB64.length * 3 / 4)} bytes\n`);
process.stderr.write(`Ghost:     ~${Math.round(ghostB64.length * 3 / 4)} bytes\n`);
process.stderr.write(`Left mask: ~${Math.round(leftMaskB64.length * 3 / 4)} bytes\n`);

process.stdout.write(
`// Auto-generated — run: bun scripts/gen-textures.ts > src/lib/whimsicalTextures.ts
/* eslint-disable */

export const PARCHMENT_B64 = "${parchmentB64}";
export const GHOST_B64 = "${ghostB64}";
export const DECKLE_LEFT_B64 = "${leftMaskB64}";
export const DECKLE_RIGHT_B64 = "${rightMaskB64}";
`);
