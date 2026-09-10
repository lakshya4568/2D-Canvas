/**
 * DXF Import Engine for UPCE-MASTER-1.0
 * UPCE-MASTER-1.0 §69, §17 (Tolerance Discipline), §84 (License Discipline)
 *
 * Uses `dxf-parser` (MIT license) to parse text-heavy AutoCAD DXF files (R12 to R2018+)
 * into typed JavaScript objects, and converts entities (LINE, LWPOLYLINE, POLYLINE,
 * CIRCLE, ARC, ELLIPSE, 3DFACE, SOLID) into canonical UPCE Shape[] models and
 * ParametricSketch objects with full layer resolution and tolerance discipline.
 */

import DxfParser, { IDxf, IEntity } from "dxf-parser";
import { Shape, LineShape, RectangleShape, CircleShape, ArcShape, EllipseShape } from "../geometry/types";
import { ParametricSketch } from "../parametric/schemaTypes";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export interface DxfImportOptions {
  /** Injected model-space millimeter tolerance policy (§17). Default: DEFAULT_TOLERANCE_POLICY */
  policy?: TolerancePolicy;
  /** Filter to import only specific layer name. If omitted, imports all layers. */
  targetLayer?: string;
  /** Default fallback stroke color if entity has none. Default: #4aa8d8 */
  defaultColor?: string;
  /** Default stroke width in mm. Default: 1.5 */
  defaultStrokeWidth?: number;
  /** Whether to detect 4-vertex orthogonal closed polylines as RectangleShape. Default: true */
  detectRectangles?: boolean;
  /** Prefix for generated entity IDs. Default: dxf */
  idPrefix?: string;
  /**
   * Negate Y when mapping DXF model space into the canonical model.
   *
   * DXF is Y-up; the canonical model and canvas are Y-down (SVG convention), so
   * this must be on for a drawing to appear the right way up rather than
   * mirrored. Default: true. Set false only to read raw DXF coordinates.
   */
  flipY?: boolean;
}

/** Standard AutoCAD Color Index (ACI 1–9) and key primary values */
export const ACI_COLOR_MAP: Record<number, string> = {
  1: "#ff0000", // Red
  2: "#ffff00", // Yellow
  3: "#00ff00", // Green
  4: "#00ffff", // Cyan
  5: "#0000ff", // Blue
  6: "#ff00ff", // Magenta
  7: "#ffffff", // White / Black
  8: "#808080", // Dark Grey
  9: "#c0c0c0", // Light Grey
};

/**
 * Converts an AutoCAD Color Index (ACI) or RGB integer into a CSS hex color.
 */
export function aciToHex(colorIndex?: number, defaultColor: string = "#4aa8d8"): string {
  if (colorIndex === undefined || colorIndex === null || colorIndex === 0 || colorIndex === 256) {
    return defaultColor;
  }
  if (ACI_COLOR_MAP[colorIndex]) {
    return ACI_COLOR_MAP[colorIndex];
  }
  // Standard ACI formula for indices 10–249 (approximate HSL wheel)
  if (colorIndex >= 10 && colorIndex <= 249) {
    const hue = Math.floor(((colorIndex - 10) / 240) * 360);
    return `hsl(${hue}, 80%, 50%)`;
  }
  if (colorIndex >= 250 && colorIndex <= 255) {
    const gray = Math.floor(((255 - colorIndex) / 5) * 255);
    return `rgb(${gray}, ${gray}, ${gray})`;
  }
  return defaultColor;
}

/**
 * Parses raw DXF string into typed IDxf structure via dxf-parser.
 */
export function parseDxf(dxfContent: string): IDxf {
  const parser = new DxfParser();
  try {
    const parsed = parser.parseSync(dxfContent);
    if (!parsed) {
      throw new Error("Failed to parse DXF: Parser returned empty result.");
    }
    return parsed;
  } catch (err: any) {
    throw new Error(`[dxf-parser] DXF Syntax Error: ${err?.message || err}`);
  }
}

/**
 * Imports a DXF document and maps its geometric entities into UPCE Canvas Shape[] array.
 * Retains layers, colors, coordinates, and polyline groupings.
 */
/**
 * 2D affine transform `[a c e; b d f]`, mapping `(x, y)` to
 * `(a·x + c·y + e, b·x + d·y + f)`.
 *
 * Block references (`INSERT`) place a block's geometry under an arbitrary
 * scale / rotation / mirror / translation, and blocks nest. Carrying one matrix
 * down the recursion is what keeps that exact — and it is also how the `flipY`
 * option is applied, as a root transform, rather than as a special case sprinkled
 * through every entity branch.
 */
export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY_MATRIX: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Returns `m ∘ n` — the transform that applies `n` first, then `m`. */
export function multiplyMatrix(m: Matrix2D, n: Matrix2D): Matrix2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

/** Applies `m` to a point. */
export function applyMatrix(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/**
 * The uniform length scale a transform implies, taken as `sqrt(|det|)`.
 *
 * Exact for the conformal transforms real INSERTs use (uniform scale, rotation,
 * mirror). Under a genuinely non-uniform scale a circle becomes an ellipse; this
 * approximates it with the equal-area circle. Arcs and polylines do not rely on
 * this — they are discretised in block space and then transformed point by
 * point, which is exact for any affine.
 */
export function matrixScale(m: Matrix2D): number {
  const det = Math.abs(m.a * m.d - m.b * m.c);
  return det > 1e-12 ? Math.sqrt(det) : 1;
}

/** Builds the placement transform for one INSERT, including the block base point. */
function insertMatrix(insertEnt: any, blockBase: { x: number; y: number }): Matrix2D {
  const rot = ((insertEnt.rotation ?? 0) * Math.PI) / 180;
  const sx = insertEnt.xScale ?? 1;
  const sy = insertEnt.yScale ?? 1;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // Scale, then rotate, then translate to the insertion point.
  const placement: Matrix2D = {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    e: insertEnt.position?.x ?? 0,
    f: insertEnt.position?.y ?? 0,
  };

  // Block geometry is authored about the block's base point, not the origin.
  return multiplyMatrix(placement, { a: 1, b: 0, c: 0, d: 1, e: -blockBase.x, f: -blockBase.y });
}

/** Guard against blocks that reference each other, directly or in a cycle. */
const MAX_BLOCK_DEPTH = 16;

/**
 * Imports a DXF document and maps its geometric entities into UPCE Canvas Shape[] array.
 * Retains layers, colors, coordinates, and polyline groupings, and expands block
 * references (INSERT) recursively so geometry that lives inside blocks is imported
 * rather than silently dropped.
 */
export function importDxfToShapes(
  dxfContent: string,
  options: DxfImportOptions = {}
): Shape[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const dxf = parseDxf(dxfContent);
  const shapes: Shape[] = [];

  const defaultColor = options.defaultColor ?? "#4aa8d8";
  const strokeWidth = options.defaultStrokeWidth ?? 1.5;
  const detectRectangles = options.detectRectangles !== false;
  const idPrefix = options.idPrefix ?? "dxf";
  const flipY = options.flipY !== false;

  // Resolve layer color table
  const layerColors: Record<string, string> = {};
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
      if (layer.colorIndex !== undefined) {
        layerColors[name] = aciToHex(layer.colorIndex, defaultColor);
      }
    }
  }

  const blocks: Record<string, any> = (dxf as any).blocks ?? {};

  const resolveColor = (entity: IEntity): string => {
    if (entity.colorIndex && entity.colorIndex !== 256 && entity.colorIndex !== 0) {
      return aciToHex(entity.colorIndex, defaultColor);
    }
    if (entity.layer && layerColors[entity.layer]) {
      return layerColors[entity.layer];
    }
    return defaultColor;
  };

  let seq = 0;
  const allocId = (type: string, handle?: string | number): string => {
    return `${idPrefix}_${handle ? handle : type.toLowerCase()}_${seq++}`;
  };

  const emitEntities = (entities: IEntity[] | undefined, xf: Matrix2D, depth: number): void => {
    if (!entities || !Array.isArray(entities)) return;

    const pt = (x: number, y: number) => applyMatrix(xf, x, y);
    const lengthScale = matrixScale(xf);

    for (const entity of entities) {
      // Filter by target layer if specified
      if (options.targetLayer && entity.layer !== options.targetLayer) {
        continue;
      }

      const strokeColor = resolveColor(entity);
      const layerName = entity.layer || "0";

      switch (entity.type) {
        case "INSERT": {
          if (depth >= MAX_BLOCK_DEPTH) break;
          const ins = entity as any;
          const block = ins.name ? blocks[ins.name] : undefined;
          if (!block || !block.entities) break;

          const base = { x: block.position?.x ?? 0, y: block.position?.y ?? 0 };
          const placement = multiplyMatrix(xf, insertMatrix(ins, base));

          // MINSERT — a rectangular array of the same block.
          const cols = Math.max(1, ins.columnCount ?? 1);
          const rows = Math.max(1, ins.rowCount ?? 1);
          const colSpacing = ins.columnSpacing ?? 0;
          const rowSpacing = ins.rowSpacing ?? 0;

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const cell =
                r === 0 && c === 0
                  ? placement
                  : multiplyMatrix(placement, {
                      a: 1,
                      b: 0,
                      c: 0,
                      d: 1,
                      e: c * colSpacing,
                      f: r * rowSpacing,
                    });
              emitEntities(block.entities, cell, depth + 1);
            }
          }
          break;
        }

        case "LINE": {
          const lineEnt = entity as any;
          if (lineEnt.vertices && lineEnt.vertices.length >= 2) {
            const v1 = pt(lineEnt.vertices[0].x, lineEnt.vertices[0].y);
            const v2 = pt(lineEnt.vertices[1].x, lineEnt.vertices[1].y);
            shapes.push({
              id: allocId("line", entity.handle),
              type: "line",
              name: `${layerName}_Line_${seq}`,
              x1: v1.x,
              y1: v1.y,
              x2: v2.x,
              y2: v2.y,
              strokeColor,
              strokeWidth,
              opacity: 1,
              rotation: 0,
            });
          }
          break;
        }

        case "CIRCLE": {
          const circleEnt = entity as any;
          if (circleEnt.center && typeof circleEnt.radius === "number") {
            const c = pt(circleEnt.center.x, circleEnt.center.y);
            shapes.push({
              id: allocId("circle", entity.handle),
              type: "circle",
              name: `${layerName}_Circle_${seq}`,
              cx: c.x,
              cy: c.y,
              r: circleEnt.radius * lengthScale,
              strokeColor,
              strokeWidth,
              opacity: 1,
              rotation: 0,
            });
          }
          break;
        }

        case "ARC": {
          const arcEnt = entity as any;
          if (arcEnt.center && typeof arcEnt.radius === "number") {
            const cx = arcEnt.center.x;
            const cy = arcEnt.center.y;
            const r = arcEnt.radius;
            const a1 = arcEnt.startAngle ?? 0;
            const a2 = arcEnt.endAngle ?? Math.PI;

            let span = a2 - a1;
            while (span < 0) span += 2 * Math.PI;
            while (span >= 2 * Math.PI) span -= 2 * Math.PI;
            if (span < 1e-6) span = 2 * Math.PI;

            // Discretize with sagitta <= policy.geometry_mm, measured at the
            // radius the arc will actually have on the sheet.
            const worldR = r * lengthScale;
            const maxSagitta = policy.geometry_mm;
            const maxDTheta =
              worldR > maxSagitta ? 2 * Math.acos(Math.max(-1, 1 - maxSagitta / worldR)) : Math.PI / 4;
            const numSegs = Math.max(8, Math.min(64, Math.ceil(span / Math.max(0.05, maxDTheta))));
            const dTheta = span / numSegs;

            const arcGroupId = `group_arc_${allocId("arc", entity.handle)}`;
            for (let sIdx = 0; sIdx < numSegs; sIdx++) {
              // Sampled in block space, then transformed — exact under any affine.
              const p1 = pt(cx + r * Math.cos(a1 + sIdx * dTheta), cy + r * Math.sin(a1 + sIdx * dTheta));
              const p2 = pt(
                cx + r * Math.cos(a1 + (sIdx + 1) * dTheta),
                cy + r * Math.sin(a1 + (sIdx + 1) * dTheta)
              );
              shapes.push({
                id: allocId("line", `${entity.handle}_arc_seg${sIdx}`),
                type: "line",
                groupId: arcGroupId,
                groupName: `${layerName}_Arc`,
                name: `${layerName}_Arc_${seq}`,
                x1: p1.x,
                y1: p1.y,
                x2: p2.x,
                y2: p2.y,
                strokeColor,
                strokeWidth,
                opacity: 1,
                rotation: 0,
              });
            }
          }
          break;
        }

        case "ELLIPSE": {
          const elEnt = entity as any;
          if (elEnt.center) {
            const c = pt(elEnt.center.x, elEnt.center.y);
            const majorX = elEnt.majorAxisEndPoint?.x ?? 50;
            const majorY = elEnt.majorAxisEndPoint?.y ?? 0;
            const rx = Math.hypot(majorX, majorY) * lengthScale;
            const ry = rx * (elEnt.axisRatio ?? 0.5);
            shapes.push({
              id: allocId("ellipse", entity.handle),
              type: "ellipse",
              name: `${layerName}_Ellipse_${seq}`,
              cx: c.x,
              cy: c.y,
              rx: Math.max(1, rx),
              ry: Math.max(1, ry),
              strokeColor,
              strokeWidth,
              opacity: 1,
              rotation: 0,
            });
          }
          break;
        }

        case "LWPOLYLINE":
        case "POLYLINE": {
          const polyEnt = entity as any;
          const rawVerts: { x: number; y: number; bulge?: number }[] = polyEnt.vertices || [];
          if (rawVerts.length < 2) break;

          const isClosed = polyEnt.shape === true || polyEnt.closed === true;

          // Rectangle recognition: 4 vertices (or 5 with first == last), closed,
          // orthogonal. Tested in world space — a rotated block instance is not
          // axis-aligned and correctly falls through to segments.
          let isRect = false;
          if (
            detectRectangles &&
            isClosed &&
            (rawVerts.length === 4 ||
              (rawVerts.length === 5 &&
                Math.hypot(rawVerts[0].x - rawVerts[4].x, rawVerts[0].y - rawVerts[4].y) < policy.weld_mm))
          ) {
            const corners = rawVerts.slice(0, 4).map((v) => pt(v.x, v.y));
            const xs = corners.map((v) => v.x);
            const ys = corners.map((v) => v.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const w = maxX - minX;
            const h = maxY - minY;

            const matchesBox =
              xs.every((x) => Math.abs(x - minX) < policy.geometry_mm || Math.abs(x - maxX) < policy.geometry_mm) &&
              ys.every((y) => Math.abs(y - minY) < policy.geometry_mm || Math.abs(y - maxY) < policy.geometry_mm);

            if (matchesBox && w > policy.geometry_mm && h > policy.geometry_mm) {
              isRect = true;
              shapes.push({
                id: allocId("rect", entity.handle),
                type: "rectangle",
                name: `${layerName}_Rect_${seq}`,
                x: minX,
                y: minY,
                width: w,
                height: h,
                strokeColor,
                strokeWidth,
                opacity: 1,
                rotation: 0,
              });
            }
          }

          if (!isRect) {
            // Decompose polyline into connected line segments sharing a groupId
            const polyGroupId = `group_poly_${allocId("pline", entity.handle)}`;
            const count = isClosed ? rawVerts.length : rawVerts.length - 1;

            for (let i = 0; i < count; i++) {
              const v1 = rawVerts[i];
              const v2 = rawVerts[(i + 1) % rawVerts.length];

              // If segment has non-zero bulge, it represents an arc. Solved in
              // block space, then each sample is transformed.
              if (v1.bulge && Math.abs(v1.bulge) > 1e-4) {
                const dx = v2.x - v1.x;
                const dy = v2.y - v1.y;
                const chord = Math.hypot(dx, dy);
                if (chord * lengthScale > policy.weld_mm) {
                  const theta = 4 * Math.atan(v1.bulge);
                  const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
                  const sagitta = (chord / 2) * Math.abs(v1.bulge);
                  const midX = (v1.x + v2.x) / 2;
                  const midY = (v1.y + v2.y) / 2;
                  const normalX = -dy / chord;
                  const normalY = dx / chord;
                  const sign = v1.bulge > 0 ? 1 : -1;
                  const bcx = midX + normalX * (radius - sagitta) * sign;
                  const bcy = midY + normalY * (radius - sagitta) * sign;

                  const startAng = Math.atan2(v1.y - bcy, v1.x - bcx);
                  const endAng = Math.atan2(v2.y - bcy, v2.x - bcx);
                  let arcSpan = endAng - startAng;
                  if (v1.bulge > 0 && arcSpan < 0) arcSpan += 2 * Math.PI;
                  if (v1.bulge < 0 && arcSpan > 0) arcSpan -= 2 * Math.PI;

                  const numBulgeSegs = Math.max(4, Math.min(32, Math.ceil(Math.abs(arcSpan) / (Math.PI / 8))));
                  const step = arcSpan / numBulgeSegs;
                  for (let b = 0; b < numBulgeSegs; b++) {
                    const t1 = startAng + b * step;
                    const t2 = startAng + (b + 1) * step;
                    const p1 = pt(bcx + radius * Math.cos(t1), bcy + radius * Math.sin(t1));
                    const p2 = pt(bcx + radius * Math.cos(t2), bcy + radius * Math.sin(t2));
                    shapes.push({
                      id: allocId("line", `${entity.handle}_seg${i}_b${b}`),
                      type: "line",
                      groupId: polyGroupId,
                      groupName: `${layerName}_Polyline`,
                      x1: p1.x,
                      y1: p1.y,
                      x2: p2.x,
                      y2: p2.y,
                      strokeColor,
                      strokeWidth,
                      opacity: 1,
                      rotation: 0,
                    });
                  }
                  continue;
                }
              }

              const p1 = pt(v1.x, v1.y);
              const p2 = pt(v2.x, v2.y);
              shapes.push({
                id: allocId("line", `${entity.handle}_seg${i}`),
                type: "line",
                groupId: polyGroupId,
                groupName: `${layerName}_Polyline`,
                x1: p1.x,
                y1: p1.y,
                x2: p2.x,
                y2: p2.y,
                strokeColor,
                strokeWidth,
                opacity: 1,
                rotation: 0,
              });
            }
          }
          break;
        }

        case "SOLID":
        case "3DFACE": {
          const solidEnt = entity as any;
          const verts = solidEnt.vertices;
          if (verts && verts.length >= 3) {
            const groupId = `group_solid_${allocId("solid", entity.handle)}`;
            for (let i = 0; i < verts.length; i++) {
              const p1 = pt(verts[i].x, verts[i].y);
              const p2 = pt(verts[(i + 1) % verts.length].x, verts[(i + 1) % verts.length].y);
              shapes.push({
                id: allocId("line", `${entity.handle}_edge${i}`),
                type: "line",
                groupId,
                groupName: `${layerName}_Solid`,
                x1: p1.x,
                y1: p1.y,
                x2: p2.x,
                y2: p2.y,
                strokeColor,
                strokeWidth,
                opacity: 1,
                rotation: 0,
              });
            }
          }
          break;
        }

        default:
          // Ignore unsupported non-geometric entities
          break;
      }
    }
  };

  // `flipY` is applied once, as the root transform, so it composes correctly
  // through nested block references.
  const rootMatrix: Matrix2D = flipY ? { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 } : IDENTITY_MATRIX;
  emitEntities(dxf.entities, rootMatrix, 0);

  return shapes;
}

/**
 * Imports a DXF document and converts it directly into a canonical UPCE ParametricSketch.
 */
export function importDxfToSketch(
  dxfContent: string,
  options: DxfImportOptions = {}
): ParametricSketch {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const dxf = parseDxf(dxfContent);

  const points: ParametricSketch["primitives"]["points"] = {};
  const lines: ParametricSketch["primitives"]["lines"] = {};
  const circles: ParametricSketch["primitives"]["circles"] = {};
  const arcs: ParametricSketch["primitives"]["arcs"] = {};
  const polylines: NonNullable<ParametricSketch["primitives"]["polylines"]> = {};

  const flipY = options.flipY !== false;
  const transformY = (y: number) => (flipY ? -y : y);

  let ptSeq = 0;
  // Point deduplication within tolerance policy weld_mm
  const pointEntries: { id: string; x: number; y: number }[] = [];

  const getOrCreatePoint = (x: number, y: number, isConstruction = false): string => {
    for (const p of pointEntries) {
      if (Math.hypot(p.x - x, p.y - y) <= policy.weld_mm) {
        return p.id;
      }
    }
    const id = `pt_${ptSeq++}`;
    points[id] = { id, x, y, isConstruction, fixed: false };
    pointEntries.push({ id, x, y });
    return id;
  };

  let lineSeq = 0;
  let circleSeq = 0;
  let arcSeq = 0;
  let polySeq = 0;

  if (dxf.entities && Array.isArray(dxf.entities)) {
    for (const entity of dxf.entities) {
      if (options.targetLayer && entity.layer !== options.targetLayer) continue;
      const isConstruction = entity.layer?.toLowerCase().includes("centre") ||
                             entity.layer?.toLowerCase().includes("center") ||
                             entity.layer?.toLowerCase().includes("construction");

      switch (entity.type) {
        case "LINE": {
          const l = entity as any;
          if (l.vertices && l.vertices.length >= 2) {
            const p1 = getOrCreatePoint(l.vertices[0].x, transformY(l.vertices[0].y), isConstruction);
            const p2 = getOrCreatePoint(l.vertices[1].x, transformY(l.vertices[1].y), isConstruction);
            const id = `l_${entity.handle || lineSeq++}`;
            lines[id] = {
              id,
              startPointId: p1,
              endPointId: p2,
              isConstruction,
              semanticRole: entity.layer,
            };
          }
          break;
        }

        case "CIRCLE": {
          const c = entity as any;
          if (c.center && typeof c.radius === "number") {
            const centerPt = getOrCreatePoint(c.center.x, transformY(c.center.y), isConstruction);
            const id = `ci_${entity.handle || circleSeq++}`;
            circles[id] = {
              id,
              centerPointId: centerPt,
              radius: c.radius,
            };
          }
          break;
        }

        case "ARC": {
          const a = entity as any;
          if (a.center && typeof a.radius === "number") {
            const centerPt = getOrCreatePoint(a.center.x, transformY(a.center.y), isConstruction);
            const id = `a_${entity.handle || arcSeq++}`;
            arcs[id] = {
              id,
              centerPointId: centerPt,
              radius: a.radius,
              // Negating Y reflects the plane, reversing the sense of sweep: an
              // arc running CCW from a to b becomes one running CCW from -b to -a.
              startAngle: flipY ? -(a.endAngle ?? Math.PI) : a.startAngle ?? 0,
              endAngle: flipY ? -(a.startAngle ?? 0) : a.endAngle ?? Math.PI,
            };
          }
          break;
        }

        case "LWPOLYLINE":
        case "POLYLINE": {
          const p = entity as any;
          const verts = p.vertices || [];
          if (verts.length >= 2) {
            const vertIds: string[] = verts.map((v: any) =>
              getOrCreatePoint(v.x, transformY(v.y), isConstruction)
            );
            const id = `pl_${entity.handle || polySeq++}`;
            polylines[id] = {
              id,
              vertices: vertIds,
              closed: p.shape === true || p.closed === true,
            };
          }
          break;
        }
      }
    }
  }

  return {
    sketchId: "imported_dxf",
    schemaVersion: "1.0",
    name: "Imported AutoCAD Drawing",
    units: { length: "mm", angle: "rad" },
    tolerances: { ...policy },
    parameters: {},
    formulas: [],
    primitives: {
      points,
      lines,
      circles,
      arcs,
      polylines,
    },
    topology: {
      halfEdges: {},
      faces: {},
    },
    constraints: {},
  };
}
