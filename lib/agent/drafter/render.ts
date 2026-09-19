/**
 * A picture of the drawing, for the model to look at.
 *
 * The agent is multimodal, and the most useful thing it can do with that is
 * compare what it drew against what it was shown. That needs the drawing as an
 * image, server-side, with no browser. The usual answers — a headless browser,
 * a native rasteriser — are heavy dependencies with licence questions attached
 * (§2.10), and a line drawing does not need them: it is straight segments,
 * circles and a few labels.
 *
 * So this is a small rasteriser and a PNG encoder on top of `node:zlib`. Lines
 * are stamped with soft round pens (good enough anti-aliasing for a model to
 * read), text uses a 5x7 bitmap font. The image is Y-up like the model's own
 * coordinates, fitted to the canvas with a margin, with a scale note so the
 * model can relate pixels back to millimetres.
 */

import { deflateSync } from "node:zlib";

export type P = { x: number; y: number };

export interface RenderScene {
  lines: { a: P; b: P; construction?: boolean; label?: string }[];
  circles: { c: P; r: number; label?: string }[];
  /** Named dimensions: witness points and the text to show. */
  dims: { a: P; b: P; text: string; derived?: boolean }[];
  /** Drafting linework drawn light: hatch patterns, leaders, dimension lines, level ticks. */
  thin?: { a: P; b: P }[];
  /** Text written on the drawing (level callouts, notes, dimension values), at its true place. */
  notes?: { at: P; text: string; align?: "left" | "center" | "right" }[];
  title?: string;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  labels?: boolean;
}

type RGB = [number, number, number];

const INK: RGB = [24, 32, 48];
const CONSTRUCTION: RGB = [140, 150, 170];
const LABEL: RGB = [90, 100, 125];
const DIM: RGB = [20, 100, 220];
const DERIVED: RGB = [150, 90, 200];
const PAPER: RGB = [255, 255, 255];
const THIN: RGB = [150, 160, 178];
const NOTE: RGB = [30, 70, 150];

// prettier-ignore
const FONT: Record<string, number[]> = {
  A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30],
  E:[31,16,16,30,16,16,31], F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17],
  I:[14,4,4,4,4,4,14], J:[7,2,2,2,2,18,12], K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31],
  M:[17,27,21,21,17,17,17], N:[17,17,25,21,19,17,17], O:[14,17,17,17,17,17,14], P:[30,17,17,30,16,16,16],
  Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17],
  Y:[17,17,10,4,4,4,4], Z:[31,1,2,4,8,16,31],
  "0":[14,17,19,21,25,17,14], "1":[4,12,4,4,4,4,14], "2":[14,17,1,2,4,8,31], "3":[31,2,4,2,1,17,14],
  "4":[2,6,10,18,31,2,2], "5":[31,16,30,1,1,17,14], "6":[6,8,16,30,17,17,14], "7":[31,1,2,4,8,8,8],
  "8":[14,17,17,14,17,17,14], "9":[14,17,17,15,1,2,12],
  ".":[0,0,0,0,0,12,12], "-":[0,0,0,31,0,0,0], _:[0,0,0,0,0,0,31], "=":[0,0,31,0,31,0,0],
  "&":[12,18,20,8,21,18,13], "%":[24,25,2,4,8,19,3], "'":[4,4,8,0,0,0,0], "℄":[14,21,20,20,20,21,14],
  "(":[2,4,8,8,8,4,2], ")":[8,4,2,2,2,4,8], ",":[0,0,0,0,12,4,8], ":":[0,12,12,0,12,12,0],
  "/":[1,2,2,4,8,8,16], "+":[0,4,4,31,4,4,0], "*":[0,4,21,14,21,4,0], " ":[0,0,0,0,0,0,0],
};

class Raster {
  readonly data: Float32Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) this.data.set(PAPER, i * 3);
  }

  blend(x: number, y: number, c: RGB, alpha: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || alpha <= 0) return;
    const i = (y * this.w + x) * 3;
    const a = Math.min(1, alpha);
    this.data[i] += (c[0] - this.data[i]) * a;
    this.data[i + 1] += (c[1] - this.data[i + 1]) * a;
    this.data[i + 2] += (c[2] - this.data[i + 2]) * a;
  }

  /** A soft round pen of radius `r` centred on (cx, cy). */
  dot(cx: number, cy: number, r: number, c: RGB, alpha: number) {
    const x0 = Math.floor(cx - r - 1);
    const x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1);
    const y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cover = Math.max(0, Math.min(1, r + 0.5 - d));
        if (cover > 0) this.blend(x, y, c, cover * alpha * 0.55);
      }
    }
  }

  line(a: P, b: P, c: RGB, r: number, dash?: [number, number]) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.6));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (dash) {
        const along = t * len;
        if (along % (dash[0] + dash[1]) > dash[0]) continue;
      }
      this.dot(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r, c, 1);
    }
  }

  text(s: string, x: number, y: number, c: RGB, size = 2, halo = true) {
    const chars = s.toUpperCase().split("");
    const draw = (ox: number, oy: number, col: RGB) => {
      chars.forEach((ch, k) => {
        const g = FONT[ch] ?? FONT[" "];
        for (let row = 0; row < 7; row++) {
          for (let bit = 0; bit < 5; bit++) {
            if (!(g[row] & (1 << (4 - bit)))) continue;
            for (let dy = 0; dy < size; dy++) {
              for (let dx = 0; dx < size; dx++) {
                this.blend(Math.round(x + ox + (k * 6 + bit) * size + dx), Math.round(y + oy + row * size + dy), col, 1);
              }
            }
          }
        }
      });
    };
    if (halo) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) draw(ox, oy, PAPER);
    }
    draw(0, 0, c);
  }

  static textWidth(s: string, size = 2) {
    return s.length * 6 * size;
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      const o = y * (this.w * 3 + 1);
      raw[o] = 0;
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 3;
        raw[o + 1 + x * 3] = this.data[i];
        raw[o + 2 + x * 3] = this.data[i + 1];
        raw[o + 3 + x * 3] = this.data[i + 2];
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 6 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, body])), 0);
  return Buffer.concat([len, tb, body, crc]);
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

/** Renders the scene fitted to the image. Returns base64 PNG. */
export function renderScene(scene: RenderScene, options: RenderOptions = {}): { data: string; width: number; height: number; mmPerPixel: number } {
  const W = options.width ?? 1024;
  const H = options.height ?? 768;
  const labels = options.labels ?? true;
  const img = new Raster(W, H);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const l of scene.lines) xs.push(l.a.x, l.b.x), ys.push(l.a.y, l.b.y);
  for (const c of scene.circles) xs.push(c.c.x - c.r, c.c.x + c.r), ys.push(c.c.y - c.r, c.c.y + c.r);
  for (const l of scene.thin ?? []) xs.push(l.a.x, l.b.x), ys.push(l.a.y, l.b.y);
  for (const n of scene.notes ?? []) xs.push(n.at.x), ys.push(n.at.y);

  if (xs.length === 0) {
    img.text("EMPTY DRAWING", 20, 20, LABEL, 3);
    return { data: img.png().toString("base64"), width: W, height: H, mmPerPixel: 1 };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const margin = 70;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const k = Math.min((W - 2 * margin) / spanX, (H - 2 * margin - 30) / spanY);
  const ox = (W - spanX * k) / 2;
  const oy = (H - 30 - spanY * k) / 2 + 30;
  const map = (p: P): P => ({ x: ox + (p.x - minX) * k, y: oy + (maxY - p.y) * k });

  for (const l of scene.thin ?? []) img.line(map(l.a), map(l.b), THIN, 0.45);
  for (const l of scene.lines) {
    if (l.construction) img.line(map(l.a), map(l.b), CONSTRUCTION, 0.7, [10, 6]);
  }
  for (const l of scene.lines) {
    if (!l.construction) img.line(map(l.a), map(l.b), INK, 1.1);
  }
  for (const c of scene.circles) {
    const cc = map(c.c);
    const rr = c.r * k;
    const steps = Math.max(24, Math.ceil(rr * 2));
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * Math.PI * 2;
      const t1 = ((i + 1) / steps) * Math.PI * 2;
      img.line(
        { x: cc.x + rr * Math.cos(t0), y: cc.y + rr * Math.sin(t0) },
        { x: cc.x + rr * Math.cos(t1), y: cc.y + rr * Math.sin(t1) },
        INK,
        1.1
      );
    }
  }

  // Dimensions: witness line plus label, placed off the measured points. Labels
  // are nudged down until they clear the ones already placed, so thin layers
  // stacked on top of each other stay readable.
  const taken: { x: number; y: number; w: number }[] = [];
  const free = (x: number, y: number, w: number) =>
    !taken.some((t) => x < t.x + t.w + 4 && t.x < x + w + 4 && Math.abs(t.y - y) < 16);
  for (const d of scene.dims) {
    const a = map(d.a);
    const b = map(d.b);
    const colour = d.derived ? DERIVED : DIM;
    img.line(a, b, colour, 0.6, [4, 3]);
    img.dot(a.x, a.y, 2, colour, 1);
    img.dot(b.x, b.y, 2, colour, 1);
    const tw = Raster.textWidth(d.text, 2);
    const tx = Math.max(2, Math.min(W - tw - 2, (a.x + b.x) / 2 - tw / 2));
    let ty = Math.max(32, Math.min(H - 16, (a.y + b.y) / 2 - 7));
    for (let k = 0; k < 12 && !free(tx, ty, tw); k++) ty = Math.min(H - 16, ty + 16);
    taken.push({ x: tx, y: ty, w: tw });
    img.text(d.text, tx, ty, colour, 2);
  }

  for (const n of scene.notes ?? []) {
    const p = map(n.at);
    const w = Raster.textWidth(n.text, 1);
    const x = n.align === "center" ? p.x - w / 2 : n.align === "right" ? p.x - w : p.x;
    img.text(n.text, x, p.y - 7, NOTE, 1);
  }

  if (labels) {
    const placed: { x: number; y: number; w: number }[] = [];
    const place = (text: string, p: P) => {
      const w = Raster.textWidth(text, 1) + 2;
      if (placed.some((q) => Math.abs(q.x - p.x) < (q.w + w) / 2 && Math.abs(q.y - p.y) < 9)) return;
      placed.push({ x: p.x, y: p.y, w });
      img.text(text, p.x - w / 2, p.y - 3, LABEL, 1);
    };
    for (const l of scene.lines) {
      if (!l.label) continue;
      const a = map(l.a);
      const b = map(l.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 18) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      place(l.label, { x: (a.x + b.x) / 2 + nx * 8, y: (a.y + b.y) / 2 + ny * 8 });
    }
    for (const c of scene.circles) if (c.label) place(c.label, map(c.c));
  }

  const header = `${scene.title ? scene.title + "   " : ""}EXTENT ${fmt(spanX)} X ${fmt(spanY)} MM   Y UP   LOWER LEFT (${fmt(minX)}, ${fmt(minY)})`;
  img.text(header.slice(0, 80), 10, 8, INK, 2, false);

  return { data: img.png().toString("base64"), width: W, height: H, mmPerPixel: 1 / k };
}
