/**
 * Draw list → DXF (AutoCAD R12 / AC1009), model space, 1 unit = 1 mm.
 *
 * R12 is chosen for reach: every CAD package opens it. What it costs is said
 * plainly rather than hidden: R12 has no HATCH entity and no lineweights, so
 * hatches arrive exploded as lines on the hatch layer and plotted weights are
 * carried by the layer colour (the usual CTB convention). Layers keep their
 * names, colours and linetypes; text stays text; polylines stay polylines.
 * Coordinates flip from canvas (Y down) to CAD (Y up) here and nowhere else.
 */

import type { DrawPrim } from "./drawList";
import type { Layer, LineType } from "./types";
import { INK } from "./layers";

/** A small ACI palette: index → rgb. Enough to map layer colours sensibly. */
const ACI: [number, number, number, number][] = [
  [1, 255, 0, 0],
  [2, 255, 255, 0],
  [3, 0, 255, 0],
  [4, 0, 255, 255],
  [5, 0, 0, 255],
  [6, 255, 0, 255],
  [7, 255, 255, 255],
  [8, 128, 128, 128],
  [9, 192, 192, 192],
  [30, 255, 127, 0],
  [40, 255, 191, 0],
  [140, 0, 127, 255],
  [150, 0, 63, 255],
  [200, 191, 0, 255],
  [220, 255, 0, 191],
  [34, 153, 76, 0],
];

export function hexToAci(hex: string | undefined): number {
  if (!hex || hex.toLowerCase() === INK) return 7;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 7;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  let best = 7;
  let bd = Infinity;
  for (const [i, R, G, B] of ACI) {
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

const LTYPES: Record<LineType, { name: string; desc: string; pattern: number[] }> = {
  continuous: { name: "CONTINUOUS", desc: "Solid line", pattern: [] },
  hidden: { name: "HIDDEN", desc: "Hidden __ __ __", pattern: [6, -3] },
  center: { name: "CENTER", desc: "Center ____ _ ____", pattern: [16, -3, 3, -3] },
  phantom: { name: "PHANTOM", desc: "Phantom ____ _ _ ____", pattern: [16, -3, 3, -3, 3, -3] },
  dashdot: { name: "DASHDOT", desc: "Dash dot __ . __", pattern: [10, -3, 0, -3] },
  dotted: { name: "DOT", desc: "Dot . . .", pattern: [0, -3] },
};

class W {
  private out: string[] = [];
  g(code: number, v: string | number) {
    this.out.push(String(code), typeof v === "number" ? (Number.isInteger(v) && (code < 10 || code >= 60) ? String(v) : v.toFixed(6)) : v);
  }
  str() {
    return this.out.join("\r\n") + "\r\n";
  }
}

function asciiText(s: string): string {
  return s
    .replace(/×/g, "x")
    .replace(/Ø/g, "%%c")
    .replace(/°/g, "%%d")
    .replace(/±/g, "%%p")
    .replace(/℄/g, "CL")
    .replace(/[—–]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[^\x20-\x7e%]/g, "?");
}

export interface DxfOptions {
  /** Global linetype scale; pattern units are paper mm, so this is the annotation scale. */
  ltscale: number;
  /** Include layers set not to plot. */
  includeNonPlot?: boolean;
}

export function drawListToDxf(prims: DrawPrim[], layers: Layer[], o: DxfOptions): string {
  const w = new W();
  const used = new Set(prims.map((p) => p.layerId));
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const allLayers = [...layers, ...[...used].filter((id) => !layerMap.has(id)).map((id) => ({ id, name: id, color: INK, lineType: "continuous" as LineType, visible: true, frozen: false, locked: false, plot: true, lineWeight: 0.25, category: "general" as const }))];

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const ext = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, -y);
    maxY = Math.max(maxY, -y);
  };
  for (const p of prims) {
    if (p.k === "line") {
      ext(p.x1, p.y1);
      ext(p.x2, p.y2);
    } else if (p.k === "polyline" || p.k === "fill") p.points.forEach((q) => ext(q.x, q.y));
  }
  if (!Number.isFinite(minX)) [minX, minY, maxX, maxY] = [0, 0, 1000, 1000];

  // HEADER
  w.g(0, "SECTION");
  w.g(2, "HEADER");
  w.g(9, "$ACADVER");
  w.g(1, "AC1009");
  w.g(9, "$INSUNITS");
  w.g(70, 4);
  w.g(9, "$EXTMIN");
  w.g(10, minX);
  w.g(20, minY);
  w.g(9, "$EXTMAX");
  w.g(10, maxX);
  w.g(20, maxY);
  w.g(9, "$LTSCALE");
  w.g(40, o.ltscale);
  w.g(0, "ENDSEC");

  // TABLES: LTYPE, LAYER, STYLE
  w.g(0, "SECTION");
  w.g(2, "TABLES");
  const lts = Object.values(LTYPES);
  w.g(0, "TABLE");
  w.g(2, "LTYPE");
  w.g(70, lts.length);
  for (const lt of lts) {
    w.g(0, "LTYPE");
    w.g(2, lt.name);
    w.g(70, 0);
    w.g(3, lt.desc);
    w.g(72, 65);
    w.g(73, lt.pattern.length);
    w.g(40, lt.pattern.reduce((s, v) => s + Math.abs(v), 0));
    for (const d of lt.pattern) w.g(49, d);
  }
  w.g(0, "ENDTAB");
  w.g(0, "TABLE");
  w.g(2, "LAYER");
  w.g(70, allLayers.length);
  for (const l of allLayers) {
    w.g(0, "LAYER");
    w.g(2, l.name.toUpperCase().replace(/[^A-Z0-9_\-$]/g, "_"));
    // 1 = frozen, 4 = locked.
    w.g(70, (l.frozen ? 1 : 0) | (l.locked ? 4 : 0));
    // Negative colour = layer off.
    w.g(62, (l.visible ? 1 : -1) * hexToAci(l.color));
    w.g(6, LTYPES[l.lineType]?.name ?? "CONTINUOUS");
  }
  w.g(0, "ENDTAB");
  w.g(0, "TABLE");
  w.g(2, "STYLE");
  w.g(70, 1);
  w.g(0, "STYLE");
  w.g(2, "STANDARD");
  w.g(70, 0);
  w.g(40, 0);
  w.g(41, 1);
  w.g(50, 0);
  w.g(71, 0);
  w.g(42, 2.5);
  w.g(3, "romans.shx");
  w.g(4, "");
  w.g(0, "ENDTAB");
  w.g(0, "ENDSEC");

  // ENTITIES
  w.g(0, "SECTION");
  w.g(2, "ENTITIES");
  const layerName = (id: string) => (layerMap.get(id)?.name ?? id).toUpperCase().replace(/[^A-Z0-9_\-$]/g, "_");
  const common = (p: DrawPrim) => {
    w.g(8, layerName(p.layerId));
    if (p.color) w.g(62, hexToAci(p.color));
    if (p.dash) w.g(6, LTYPES[p.dash]?.name ?? "CONTINUOUS");
  };
  const line = (p: DrawPrim, x1: number, y1: number, x2: number, y2: number) => {
    w.g(0, "LINE");
    common(p);
    w.g(10, x1);
    w.g(20, -y1);
    w.g(30, 0);
    w.g(11, x2);
    w.g(21, -y2);
    w.g(31, 0);
  };
  const poly = (p: DrawPrim, pts: { x: number; y: number }[], closed: boolean) => {
    w.g(0, "POLYLINE");
    common(p);
    w.g(66, 1);
    w.g(10, 0);
    w.g(20, 0);
    w.g(30, 0);
    w.g(70, closed ? 1 : 0);
    for (const q of pts) {
      w.g(0, "VERTEX");
      w.g(8, layerName(p.layerId));
      w.g(10, q.x);
      w.g(20, -q.y);
      w.g(30, 0);
    }
    w.g(0, "SEQEND");
    w.g(8, layerName(p.layerId));
  };
  for (const p of prims) {
    const layer = layerMap.get(p.layerId);
    if (layer && !o.includeNonPlot && !layer.plot) continue;
    switch (p.k) {
      case "line":
        line(p, p.x1, p.y1, p.x2, p.y2);
        break;
      case "polyline":
        poly(p, p.points, p.closed);
        break;
      case "circle":
        w.g(0, "CIRCLE");
        common(p);
        w.g(10, p.cx);
        w.g(20, -p.cy);
        w.g(30, 0);
        w.g(40, p.r);
        break;
      case "arc":
        w.g(0, "ARC");
        common(p);
        w.g(10, p.cx);
        w.g(20, -p.cy);
        w.g(30, 0);
        w.g(40, p.r);
        // Canvas angles run clockwise on screen; DXF counter-clockwise.
        w.g(50, (-p.end * 180) / Math.PI);
        w.g(51, (-p.start * 180) / Math.PI);
        break;
      case "fill":
        if (p.points.length >= 3 && p.points.length <= 4 && !p.holes?.length) {
          const q = p.points;
          const v = [q[0], q[1], q[q.length - 1], q[q.length === 4 ? 2 : 2]];
          w.g(0, "SOLID");
          common(p);
          v.forEach((pt, i) => {
            w.g(10 + i, pt.x);
            w.g(20 + i, -pt.y);
            w.g(30 + i, 0);
          });
        } else {
          poly(p, p.points, true);
          for (const h of p.holes ?? []) poly(p, h, true);
        }
        break;
      case "dots":
        for (const q of p.points) {
          w.g(0, "POINT");
          common(p);
          w.g(10, q.x);
          w.g(20, -q.y);
          w.g(30, 0);
        }
        break;
      case "segments":
        for (let i = 0; i + 3 < p.segs.length; i += 4) line(p, p.segs[i], p.segs[i + 1], p.segs[i + 2], p.segs[i + 3]);
        break;
      case "text": {
        const lines = p.text.split("\n");
        const lh = p.height * 1.4;
        lines.forEach((t, i) => {
          const rad = ((p.rotation ?? 0) * Math.PI) / 180;
          const baseDy = p.baseline === "top" ? p.height : p.baseline === "middle" ? p.height * 0.5 - ((lines.length - 1) * lh) / 2 : -(lines.length - 1) * lh;
          const dy = baseDy + i * lh;
          const x = p.x + dy * Math.sin(rad);
          const y = p.y + dy * Math.cos(rad);
          w.g(0, "TEXT");
          common(p);
          w.g(10, x);
          w.g(20, -y);
          w.g(30, 0);
          w.g(40, p.height);
          w.g(1, asciiText(t));
          w.g(50, p.rotation ?? 0);
          w.g(7, "STANDARD");
          const h = p.align === "center" ? 1 : p.align === "right" ? 2 : 0;
          if (h) {
            w.g(72, h);
            w.g(11, x);
            w.g(21, -y);
            w.g(31, 0);
          }
        });
        break;
      }
    }
  }
  w.g(0, "ENDSEC");
  w.g(0, "EOF");
  return w.str();
}
