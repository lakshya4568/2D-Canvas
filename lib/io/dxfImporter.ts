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
  /** Invert Y axis if source CAD uses inverted orientation. Default: false */
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
  const flipY = options.flipY === true;

  // Resolve layer color table
  const layerColors: Record<string, string> = {};
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
      if (layer.colorIndex !== undefined) {
        layerColors[name] = aciToHex(layer.colorIndex, defaultColor);
      }
    }
  }

  const resolveColor = (entity: IEntity): string => {
    if (entity.colorIndex && entity.colorIndex !== 256 && entity.colorIndex !== 0) {
      return aciToHex(entity.colorIndex, defaultColor);
    }
    if (entity.layer && layerColors[entity.layer]) {
      return layerColors[entity.layer];
    }
    return defaultColor;
  };

  const transformY = (y: number): number => (flipY ? -y : y);

  let seq = 0;
  const allocId = (type: string, handle?: string | number): string => {
    return `${idPrefix}_${handle ? handle : type.toLowerCase()}_${seq++}`;
  };

  if (!dxf.entities || !Array.isArray(dxf.entities)) {
    return shapes;
  }

  for (const entity of dxf.entities) {
    // Filter by target layer if specified
    if (options.targetLayer && entity.layer !== options.targetLayer) {
      continue;
    }

    const strokeColor = resolveColor(entity);
    const layerName = entity.layer || "0";

    switch (entity.type) {
      case "LINE": {
        const lineEnt = entity as any;
        if (lineEnt.vertices && lineEnt.vertices.length >= 2) {
          const v1 = lineEnt.vertices[0];
          const v2 = lineEnt.vertices[1];
          shapes.push({
            id: allocId("line", entity.handle),
            type: "line",
            name: `${layerName}_Line_${seq}`,
            x1: v1.x,
            y1: transformY(v1.y),
            x2: v2.x,
            y2: transformY(v2.y),
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
          shapes.push({
            id: allocId("circle", entity.handle),
            type: "circle",
            name: `${layerName}_Circle_${seq}`,
            cx: circleEnt.center.x,
            cy: transformY(circleEnt.center.y),
            r: circleEnt.radius,
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
          const cy = transformY(arcEnt.center.y);
          const r = arcEnt.radius;
          let a1 = arcEnt.startAngle ?? 0;
          let a2 = arcEnt.endAngle ?? Math.PI;
          if (flipY) {
            const tmp = -a1;
            a1 = -a2;
            a2 = tmp;
          }
          let span = a2 - a1;
          while (span < 0) span += 2 * Math.PI;
          while (span >= 2 * Math.PI) span -= 2 * Math.PI;
          if (span < 1e-6) span = 2 * Math.PI;

          // Discretize arc into chord segments with sagitta <= policy.geometry_mm
          const maxSagitta = policy.geometry_mm;
          const maxDTheta = r > maxSagitta ? 2 * Math.acos(Math.max(-1, 1 - maxSagitta / r)) : Math.PI / 4;
          const numSegs = Math.max(8, Math.min(64, Math.ceil(span / Math.max(0.05, maxDTheta))));
          const dTheta = span / numSegs;

          const arcGroupId = `group_arc_${allocId("arc", entity.handle)}`;
          for (let s = 0; s < numSegs; s++) {
            const thetaStart = a1 + s * dTheta;
            const thetaEnd = a1 + (s + 1) * dTheta;
            shapes.push({
              id: allocId("line", `${entity.handle}_arc_seg${s}`),
              type: "line",
              groupId: arcGroupId,
              groupName: `${layerName}_Arc`,
              name: `${layerName}_Arc_${seq}`,
              x1: cx + r * Math.cos(thetaStart),
              y1: cy + r * Math.sin(thetaStart),
              x2: cx + r * Math.cos(thetaEnd),
              y2: cy + r * Math.sin(thetaEnd),
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
          const majorX = elEnt.majorAxisEndPoint?.x ?? 50;
          const majorY = elEnt.majorAxisEndPoint?.y ?? 0;
          const rx = Math.hypot(majorX, majorY);
          const ry = rx * (elEnt.axisRatio ?? 0.5);
          shapes.push({
            id: allocId("ellipse", entity.handle),
            type: "ellipse",
            name: `${layerName}_Ellipse_${seq}`,
            cx: elEnt.center.x,
            cy: transformY(elEnt.center.y),
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

        // Rectangle recognition: 4 vertices (or 5 with first == last), closed, orthogonal
        let isRect = false;
        if (detectRectangles && isClosed && (rawVerts.length === 4 || (rawVerts.length === 5 && Math.hypot(rawVerts[0].x - rawVerts[4].x, rawVerts[0].y - rawVerts[4].y) < policy.weld_mm))) {
          const xs = rawVerts.slice(0, 4).map((v) => v.x);
          const ys = rawVerts.slice(0, 4).map((v) => transformY(v.y));
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const w = maxX - minX;
          const h = maxY - minY;

          // Check if all 4 corners align to bounding box within geometry tolerance
          const matchesBox = xs.every((x) => Math.abs(x - minX) < policy.geometry_mm || Math.abs(x - maxX) < policy.geometry_mm) &&
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

            // If segment has non-zero bulge, it represents an arc
            if (v1.bulge && Math.abs(v1.bulge) > 1e-4) {
              const dx = v2.x - v1.x;
              const dy = transformY(v2.y) - transformY(v1.y);
              const chord = Math.hypot(dx, dy);
              if (chord > policy.weld_mm) {
                const theta = 4 * Math.atan(v1.bulge);
                const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
                const sagitta = (chord / 2) * Math.abs(v1.bulge);
                const midX = (v1.x + v2.x) / 2;
                const midY = (transformY(v1.y) + transformY(v2.y)) / 2;
                const normalX = -dy / chord;
                const normalY = dx / chord;
                const sign = v1.bulge > 0 ? 1 : -1;
                const cx = midX + normalX * (radius - sagitta) * sign;
                const cy = midY + normalY * (radius - sagitta) * sign;

                const startAng = Math.atan2(transformY(v1.y) - cy, v1.x - cx);
                const endAng = Math.atan2(transformY(v2.y) - cy, v2.x - cx);
                let arcSpan = endAng - startAng;
                if (v1.bulge > 0 && arcSpan < 0) arcSpan += 2 * Math.PI;
                if (v1.bulge < 0 && arcSpan > 0) arcSpan -= 2 * Math.PI;

                const numBulgeSegs = Math.max(4, Math.min(32, Math.ceil(Math.abs(arcSpan) / (Math.PI / 8))));
                const step = arcSpan / numBulgeSegs;
                for (let b = 0; b < numBulgeSegs; b++) {
                  const t1 = startAng + b * step;
                  const t2 = startAng + (b + 1) * step;
                  shapes.push({
                    id: allocId("line", `${entity.handle}_seg${i}_b${b}`),
                    type: "line",
                    groupId: polyGroupId,
                    groupName: `${layerName}_Polyline`,
                    x1: cx + radius * Math.cos(t1),
                    y1: cy + radius * Math.sin(t1),
                    x2: cx + radius * Math.cos(t2),
                    y2: cy + radius * Math.sin(t2),
                    strokeColor,
                    strokeWidth,
                    opacity: 1,
                    rotation: 0,
                  });
                }
                continue;
              }
            }

            shapes.push({
              id: allocId("line", `${entity.handle}_seg${i}`),
              type: "line",
              groupId: polyGroupId,
              groupName: `${layerName}_Polyline`,
              x1: v1.x,
              y1: transformY(v1.y),
              x2: v2.x,
              y2: transformY(v2.y),
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
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];
            shapes.push({
              id: allocId("line", `${entity.handle}_edge${i}`),
              type: "line",
              groupId,
              groupName: `${layerName}_Solid`,
              x1: v1.x,
              y1: transformY(v1.y),
              x2: v2.x,
              y2: transformY(v2.y),
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

  const flipY = options.flipY === true;
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
              startAngle: a.startAngle ?? 0,
              endAngle: a.endAngle ?? Math.PI,
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
