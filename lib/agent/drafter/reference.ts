/**
 * Comparing the construction with the reference image the author attached.
 *
 * Looking at two pictures side by side is where a multimodal model is weakest:
 * it misses a slab 5 % too thick or a wall drawn on the wrong face. So this
 * compares them the way a checker with tracing paper would — deterministically:
 *
 *   1. the reference is decoded (PNG) and its ink (anything not paper) marked;
 *   2. a distance map says, for every pixel, how far the nearest ink is;
 *   3. the agent pins the drawing to the image with two points it recognises
 *      (a corner of the structure, the foot of the centre line); the fit is
 *      then refined by sliding and scaling the drawing until its lines sit on
 *      the reference's ink (chamfer matching);
 *   4. every constructed outline is sampled and scored: how far, in model mm,
 *      its line runs from the nearest reference line.
 *
 * The overlay image shows the reference faded and the construction on top —
 * blue where it lies on the reference's lines, red where it does not.
 *
 * No new dependencies: PNG decoding is `node:zlib` plus the filter rules.
 */

import { inflateSync } from "node:zlib";

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  rgba: Uint8Array;
}

export function decodePng(buf: Uint8Array): Bitmap {
  const b = Buffer.from(buf);
  if (b.length < 8 || b.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG image");
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let colour = 6;
  let interlace = 0;
  let palette: Buffer | null = null;
  let alphaTable: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos + 8 <= b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString("ascii", pos + 4, pos + 8);
    const body = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") alphaTable = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error("PNG has no header");
  if (interlace) throw new Error("interlaced PNG is not supported");
  if (depth !== 8 && depth !== 16) throw new Error(`PNG bit depth ${depth} is not supported`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colour as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error(`PNG colour type ${colour} is not supported`);
  const bps = depth / 8;
  const bpp = channels * bps;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const u = up ? up[i] : 0;
      const c = up && i >= bpp ? up[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += u;
      else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) {
        const p = a + u - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - u);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c;
      }
      out[i] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp;
    const at = (k: number) => px[s + k * bps];
    let r: number;
    let g: number;
    let bl: number;
    let al = 255;
    if (colour === 0) r = g = bl = at(0);
    else if (colour === 4) {
      r = g = bl = at(0);
      al = at(1);
    } else if (colour === 2) [r, g, bl] = [at(0), at(1), at(2)];
    else if (colour === 6) [r, g, bl, al] = [at(0), at(1), at(2), at(3)];
    else {
      const k = at(0);
      r = palette?.[k * 3] ?? 0;
      g = palette?.[k * 3 + 1] ?? 0;
      bl = palette?.[k * 3 + 2] ?? 0;
      al = alphaTable && k < alphaTable.length ? alphaTable[k] : 255;
    }
    rgba.set([r, g, bl, al], i * 4);
  }
  return { width, height, rgba };
}

/** Is this pixel drawing (ink) rather than paper? Coloured or dark, and opaque. */
export function inkMask(img: Bitmap): Uint8Array {
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0; i < m.length; i++) {
    const r = img.rgba[i * 4];
    const g = img.rgba[i * 4 + 1];
    const b = img.rgba[i * 4 + 2];
    const a = img.rgba[i * 4 + 3];
    if (a < 128) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    m[i] = lum < 190 || chroma > 70 ? 1 : 0;
  }
  return m;
}

/** Distance (px) from each pixel to the nearest ink pixel — two-pass 3-4 chamfer, divided by 3. */
export function distanceMap(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** Model (mm, Y up) → image pixels: u = ox + s·x, v = oy − s·y. */
export interface Registration {
  s: number;
  ox: number;
  oy: number;
}

export const toImage = (r: Registration, p: { x: number; y: number }) => ({ x: r.ox + r.s * p.x, y: r.oy - r.s * p.y });

/** From two correspondences (model point ↔ image pixel): uniform scale, no rotation. */
export function registrationFromPairs(pairs: { model: { x: number; y: number }; px: { x: number; y: number } }[]): Registration {
  if (pairs.length < 2) throw new Error("two point pairs are needed");
  const [a, b] = pairs;
  const dm = Math.hypot(b.model.x - a.model.x, b.model.y - a.model.y);
  const di = Math.hypot(b.px.x - a.px.x, b.px.y - a.px.y);
  if (dm <= 0 || di <= 0) throw new Error("the two points must be apart");
  const s = di / dm;
  const ox = (a.px.x + b.px.x) / 2 - s * ((a.model.x + b.model.x) / 2);
  const oy = (a.px.y + b.px.y) / 2 + s * ((a.model.y + b.model.y) / 2);
  return { s, ox, oy };
}

function sampleDistance(d: Float32Array, w: number, h: number, x: number, y: number, cap: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return cap;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const v =
    d[y0 * w + x0] * (1 - fx) * (1 - fy) + d[y0 * w + x1] * fx * (1 - fy) + d[y1 * w + x0] * (1 - fx) * fy + d[y1 * w + x1] * fx * fy;
  return Math.min(v, cap);
}

/** Points every `step` mm along a polyline. */
export function samplePolyline(pts: { x: number; y: number }[], closed: boolean, step: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed && pts.length) out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Slides and scales the drawing to sit on the reference's ink: minimises the
 * mean (capped) distance from the sampled construction lines to the nearest
 * ink, by pattern search from the given start. The cap keeps lines the
 * reference does not have from dragging the fit.
 */
export function refineRegistration(start: Registration, samples: { x: number; y: number }[], d: Float32Array, w: number, h: number, capPx: number): { reg: Registration; meanPx: number } {
  const cost = (r: Registration) => {
    let t = 0;
    for (const p of samples) {
      const q = toImage(r, p);
      t += sampleDistance(d, w, h, q.x, q.y, capPx);
    }
    return samples.length ? t / samples.length : capPx;
  };
  let best = start;
  let bestCost = cost(best);
  const spanPx = Math.max(w, h);
  for (let step = capPx; step >= 0.25; step /= 2) {
    let improved = true;
    for (let guard = 0; improved && guard < 60; guard++) {
      improved = false;
      const ds = (step / spanPx) * best.s;
      for (const [dx, dy, dS] of [
        [step, 0, 0],
        [-step, 0, 0],
        [0, step, 0],
        [0, -step, 0],
        [0, 0, ds],
        [0, 0, -ds],
      ]) {
        // Scale about the image centre of the samples so it does not also translate.
        const c = samples.length ? toImage(best, samples[Math.floor(samples.length / 2)]) : { x: 0, y: 0 };
        const s = best.s + dS;
        const k = s / best.s;
        const cand: Registration = { s, ox: c.x - (c.x - best.ox) * k + dx, oy: c.y - (c.y - best.oy) * k + dy };
        const cc = cost(cand);
        if (cc < bestCost - 1e-6) {
          best = cand;
          bestCost = cc;
          improved = true;
        }
      }
    }
  }
  return { reg: best, meanPx: bestCost };
}

export interface EntityDeviation {
  id: string;
  /** Model mm: mean distance of the parts that are off the reference's lines. */
  mean: number;
  worst: number;
  worstAt: { x: number; y: number };
  /** Share of the entity's length lying on reference ink (within the fit tolerance). */
  onInk: number;
}

/**
 * How far each entity runs from the reference's lines. A sample is "on" within
 * `onPx`; runs of off samples no longer than `gapPx` between on samples count
 * as on, so a dashed or dash-dot reference line is not read as missing.
 */
export function deviations(
  entities: { id: string; samples: { x: number; y: number }[] }[],
  reg: Registration,
  d: Float32Array,
  w: number,
  h: number,
  capPx: number,
  onPx: number,
  gapPx = 0
): EntityDeviation[] {
  return entities
    .filter((e) => e.samples.length)
    .map((e) => {
      let sum = 0;
      let worst = -1;
      let worstAt = e.samples[0];
      const dist = e.samples.map((p) => {
        const q = toImage(reg, p);
        return sampleDistance(d, w, h, q.x, q.y, capPx);
      });
      const on = dist.map((v) => v <= onPx);
      // Close short gaps (dashes), measured along the samples in image pixels.
      const stepPx = e.samples.length > 1 ? Math.max(1e-6, Math.hypot(e.samples[1].x - e.samples[0].x, e.samples[1].y - e.samples[0].y) * reg.s) : 1;
      const bridge = Math.floor(gapPx / stepPx);
      for (let i = 0; i < on.length; ) {
        if (on[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j < on.length && !on[j]) j++;
        if (i > 0 && j < on.length && j - i <= bridge) for (let k = i; k < j; k++) on[k] = true;
        i = j;
      }
      dist.forEach((v, i) => {
        if (on[i]) return;
        sum += v;
        if (v > worst) {
          worst = v;
          worstAt = e.samples[i];
        }
      });
      const offCount = on.filter((x) => !x).length;
      return { id: e.id, mean: offCount ? sum / offCount / reg.s : 0, worst: Math.max(0, worst) / reg.s, worstAt, onInk: 1 - offCount / e.samples.length };
    });
}
