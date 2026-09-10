/**
 * SVG export, read directly from the canonical model.
 * UPCE-MASTER-1.0 §69.
 *
 * The repository already has `lib/serialization/exportSvg.ts`, which serialises
 * the CANVAS `Shape[]` for the editor. This exporter is the canonical-model path
 * required by §69's rule that "every exporter reads the canonical model
 * directly" — the two are deliberately separate, and neither is chained through
 * the other.
 */

import { ParametricSketch } from "../parametric/schemaTypes";

export interface CanonicalSvgOptions {
  includeConstruction?: boolean;
  /** Padding around the geometry, in model mm. */
  padding?: number;
  strokeWidth?: number;
  title?: string;
}

export function exportCanonicalSvg(
  sketch: ParametricSketch,
  options: CanonicalSvgOptions = {}
): string {
  const padding = options.padding ?? 20;
  const stroke = options.strokeWidth ?? 2;
  const points = sketch.primitives.points ?? {};

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const p of Object.values(points)) extend(p.x, p.y);
  for (const c of Object.values(sketch.primitives.circles ?? {})) {
    const centre = points[c.centerPointId];
    if (!centre) continue;
    extend(centre.x - c.radius, centre.y - c.radius);
    extend(centre.x + c.radius, centre.y + c.radius);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const width = maxX - minX + 2 * padding;
  const height = maxY - minY + 2 * padding;
  const body: string[] = [];

  const cls = (isConstruction: boolean | undefined) =>
    isConstruction ? ' class="construction"' : "";

  for (const line of Object.values(sketch.primitives.lines ?? {})) {
    if (line.isConstruction === true && options.includeConstruction !== true) continue;
    const a = points[line.startPointId];
    const b = points[line.endPointId];
    if (!a || !b) continue;
    body.push(
      `  <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"${cls(line.isConstruction)} />`
    );
  }

  for (const poly of Object.values(sketch.primitives.polylines ?? {})) {
    if (poly.isConstruction === true && options.includeConstruction !== true) continue;
    const verts = poly.vertices.map((v) => points[v]).filter(Boolean);
    if (verts.length < 2) continue;
    const d = verts.map((v) => `${v.x},${v.y}`).join(" ");
    const tag = poly.closed ? "polygon" : "polyline";
    body.push(`  <${tag} points="${d}"${cls(poly.isConstruction)} />`);
  }

  for (const circle of Object.values(sketch.primitives.circles ?? {})) {
    if (circle.isConstruction === true && options.includeConstruction !== true) continue;
    const c = points[circle.centerPointId];
    if (!c) continue;
    body.push(
      `  <circle cx="${c.x}" cy="${c.y}" r="${circle.radius}"${cls(circle.isConstruction)} />`
    );
  }

  for (const arc of Object.values(sketch.primitives.arcs ?? {})) {
    if (arc.isConstruction === true && options.includeConstruction !== true) continue;
    const c = points[arc.centerPointId];
    if (!c) continue;
    const x0 = c.x + arc.radius * Math.cos(arc.startAngle);
    const y0 = c.y + arc.radius * Math.sin(arc.startAngle);
    const x1 = c.x + arc.radius * Math.cos(arc.endAngle);
    const y1 = c.y + arc.radius * Math.sin(arc.endAngle);
    let sweep = arc.endAngle - arc.startAngle;
    while (sweep <= 0) sweep += 2 * Math.PI;
    const largeArc = sweep > Math.PI ? 1 : 0;
    body.push(
      `  <path d="M ${x0} ${y0} A ${arc.radius} ${arc.radius} 0 ${largeArc} 1 ${x1} ${y1}"` +
        `${cls(arc.isConstruction)} />`
    );
  }

  const title = options.title ?? sketch.name ?? sketch.sketchId;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="${minX - padding} ${minY - padding} ${width} ${height}">`,
    `  <title>${escapeXml(title)}</title>`,
    "  <style>",
    `    line, polyline, polygon, circle, path { fill: none; stroke: #111; stroke-width: ${stroke}; }`,
    "    .construction { stroke: #b3261e; stroke-dasharray: 8 6; stroke-width: 1; }",
    "  </style>",
    ...body,
    "</svg>",
  ].join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
