/**
 * Component instance → drawing entities.
 *
 * The evaluation is in the component's root frame (Y up, mm). An instance puts
 * that frame on the sheet: at its canvas origin, rotated and mirrored, or — for
 * assemblies drawn at true reduced levels — with local Y read as elevation
 * above the drawing datum, so every level marker is correct by construction.
 *
 * Every entity produced carries `componentInstanceId`, a layer from the
 * document's own layer standard (looked up by category, never by name), its
 * semantic role and an id that is a pure function of the instance id and the
 * primitive path. Regenerating after a parameter change therefore replaces
 * entities one for one, and anything keyed on an id (selection, a note's
 * anchor) survives unless the thing it pointed at genuinely went away.
 */

import type { LineShape, CircleShape, Point, Shape } from "@/lib/geometry/types";
import type {
  Annotation,
  DimensionAnnotation,
  DrawingSettings,
  HatchAnnotation,
  Layer,
  LeaderAnnotation,
  LevelAnnotation,
  TextAnnotation,
} from "@/lib/cad/types";
import { canvasYOfLevel } from "@/lib/cad/types";
import { layerIdFor } from "@/lib/cad/layers";
import {
  IDENTITY_FRAME,
  evaluateComponent,
  hasBlockingIssues,
  readingDegrees,
  type ComponentEvaluation,
  type ComponentRegistry,
} from "./evaluate";
import type { ComponentDefinition, ComponentInstance } from "./types";

export type ComponentShape = Shape & {
  layerId: string;
  semanticRole: string;
  componentInstanceId: string;
  source: "component";
};

export interface InstanceOutput {
  evaluation: ComponentEvaluation;
  shapes: ComponentShape[];
  annotations: Annotation[];
  /** Named anchors in canvas coordinates. */
  anchors: Record<string, Point>;
  blocked: boolean;
}

/** Root frame → canvas. */
export function instanceTransform(inst: ComponentInstance, settings: Pick<DrawingSettings, "datumRL">): (p: Point) => Point {
  const a = ((inst.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (p: Point) => {
    const lx = inst.mirror ? -p.x : p.x;
    const rx = c * lx - s * p.y;
    const ry = s * lx + c * p.y;
    if (inst.absoluteElevation) {
      return { x: inst.x + rx, y: canvasYOfLevel(ry / 1000, settings) };
    }
    return { x: inst.x + rx, y: inst.y - ry };
  };
}

/**
 * Annotation spacing a definition may read: `DIM` is the gap between rows of
 * dimension lines and `TXT` the text height, both in model mm for the drawing's
 * annotation scale, so a definition's dimensions read the same at 1:50 and 1:200.
 */
export function annotationGlobals(settings: Pick<DrawingSettings, "annotationScale" | "textHeight">): Record<string, number> {
  return { DIM: 8 * settings.annotationScale, TXT: settings.textHeight * settings.annotationScale, SCALE: settings.annotationScale };
}

/** A root-frame angle (degrees, Y up) as it reads on the sheet after the instance's mirror and rotation. */
function instanceAngle(inst: ComponentInstance, deg: number): number {
  const a = (deg * Math.PI) / 180;
  const lx = inst.mirror ? -Math.cos(a) : Math.cos(a);
  const ly = Math.sin(a);
  const r = ((inst.rotation ?? 0) * Math.PI) / 180;
  const x = Math.cos(r) * lx - Math.sin(r) * ly;
  const y = Math.sin(r) * lx + Math.cos(r) * ly;
  return readingDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function lineId(inst: string, path: string, k: number): string {
  return `${inst}:${path}:e${k + 1}`;
}

export function instantiateComponent(
  inst: ComponentInstance,
  def: ComponentDefinition,
  registry: ComponentRegistry,
  layers: Layer[],
  settings: DrawingSettings
): InstanceOutput {
  const evaluation = evaluateComponent(def, inst.values, registry, IDENTITY_FRAME, {
    globals: annotationGlobals(settings),
    relations: inst.relations,
    customValues: inst.customValues,
    tables: inst.tables,
  });
  const T = instanceTransform(inst, settings);
  const L = (cat: Parameters<typeof layerIdFor>[1]) => layerIdFor(layers, cat);
  const shapes: ComponentShape[] = [];
  const annotations: Annotation[] = [];
  const meta = { componentInstanceId: inst.id, source: "component" as const };

  for (const loop of evaluation.loops) {
    if (!loop.draw) continue;
    const pts = loop.points.map(T);
    const n = loop.closed ? pts.length : pts.length - 1;
    const groupId = `${inst.id}:${loop.path}`;
    for (let k = 0; k < n; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % pts.length];
      const line: LineShape & ComponentShape = {
        id: lineId(inst.id, loop.path, k),
        type: "line",
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        groupId,
        groupName: `${inst.name} · ${loop.label}`,
        name: `${loop.label}.e${k + 1}`,
        layerId: L(loop.layer),
        semanticRole: loop.role,
        isReference: loop.layer === "centre" || loop.layer === "construction" ? true : undefined,
        ...meta,
      } as LineShape & ComponentShape;
      shapes.push(line);
    }
  }

  for (const c of evaluation.circles) {
    const p = T(c.center);
    shapes.push({
      id: `${inst.id}:${c.path}`,
      type: "circle",
      cx: p.x,
      cy: p.y,
      r: c.r,
      name: c.label,
      groupId: `${inst.id}:${c.path}`,
      groupName: `${inst.name} · ${c.label}`,
      layerId: L(c.layer),
      semanticRole: c.role,
      ...meta,
    } as CircleShape & ComponentShape);
  }

  for (const h of evaluation.hatches) {
    const ann: HatchAnnotation = {
      id: `${inst.id}:${h.path}`,
      type: "hatch",
      boundary: { kind: "polygon", outer: h.outer.map(T), holes: h.holes.map((r) => r.map(T)) },
      material: h.material,
      angle: h.angle !== undefined ? instanceAngle(inst, h.angle) : undefined,
      scale: h.scale,
      layerId: L("hatch"),
      ...meta,
    };
    annotations.push(ann);
  }

  const rotated = Math.abs(((inst.rotation ?? 0) % 180 + 180) % 180) > 1e-9;
  for (const d of evaluation.dimensions) {
    const p1 = T(d.from);
    const p2 = T(d.to);
    const line = T(d.line);
    let dim: DimensionAnnotation;
    if (d.kind === "radius" || d.kind === "diameter") {
      dim = { id: `${inst.id}:${d.path}`, type: "dimension", kind: d.kind, p1: { kind: "point", ...p1 }, p2: { kind: "point", ...p2 }, offset: 0, mode: d.drives ? "driving" : "reference", layerId: L("dimension"), ...meta };
    } else if (!rotated && (d.kind === "horizontal" || d.kind === "vertical")) {
      // In canvas space a component's horizontal stays horizontal unless rotated.
      const quarter = Math.abs((((inst.rotation ?? 0) % 360) + 360) % 360 - 90) < 1e-9 || Math.abs((((inst.rotation ?? 0) % 360) + 360) % 360 - 270) < 1e-9;
      const axis: "x" | "y" = (d.kind === "horizontal") !== quarter ? "x" : "y";
      let offset: number;
      if (axis === "x") {
        const lo = Math.min(p1.y, p2.y);
        const hi = Math.max(p1.y, p2.y);
        offset = line.y < lo ? line.y - lo : line.y - hi;
      } else {
        const lo = Math.min(p1.x, p2.x);
        const hi = Math.max(p1.x, p2.x);
        offset = line.x < lo ? line.x - lo : line.x - hi;
      }
      dim = { id: `${inst.id}:${d.path}`, type: "dimension", kind: "linear", axis, p1: { kind: "point", ...p1 }, p2: { kind: "point", ...p2 }, offset, mode: d.drives ? "driving" : "reference", drives: d.drives, layerId: L("dimension"), ...meta };
    } else {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const l = Math.hypot(dx, dy) || 1;
      const offset = (line.x - p1.x) * (-dy / l) + (line.y - p1.y) * (dx / l);
      dim = { id: `${inst.id}:${d.path}`, type: "dimension", kind: "aligned", p1: { kind: "point", ...p1 }, p2: { kind: "point", ...p2 }, offset, mode: d.drives ? "driving" : "reference", drives: d.drives, layerId: L("dimension"), ...meta };
    }
    if (d.scopePath) dim.tags = [`scope:${d.scopePath}`];
    dim.layerId = L(d.layer);
    if (d.prefix) dim.prefix = d.prefix;
    if (d.suffix) dim.suffix = d.suffix;
    if (d.hideValue) dim.hideValue = true;
    annotations.push(dim);
  }

  for (const l of evaluation.levels) {
    const at = T(l.at);
    const side = inst.mirror ? (l.side === "left" ? "right" : "left") : l.side;
    const lev: LevelAnnotation = { id: `${inst.id}:${l.path}`, type: "level", at: { kind: "point", ...at }, label: l.label, side, layerId: L(l.layer), ...meta };
    if (l.style) lev.style = l.style;
    if (l.format) lev.format = l.format;
    if (l.symbol) lev.symbol = l.symbol;
    annotations.push(lev);
  }

  for (const t of evaluation.texts) {
    const at = T(t.at);
    const txt: TextAnnotation = {
      id: `${inst.id}:${t.path}`,
      type: "text",
      at: { kind: "point", ...at },
      text: t.text,
      height: t.height ?? settings.textHeight,
      align: t.align,
      layerId: L(t.layer),
      ...meta,
    };
    const rot = t.rotation || inst.mirror || inst.rotation ? instanceAngle(inst, t.rotation) : 0;
    if (rot) txt.rotation = rot;
    if (t.valign) txt.valign = t.valign;
    if (t.bold) txt.bold = true;
    annotations.push(txt);
  }

  for (const l of evaluation.leaders) {
    const ld: LeaderAnnotation = {
      id: `${inst.id}:${l.path}`,
      type: "leader",
      points: l.points.map((p) => ({ kind: "point" as const, ...T(p) })),
      text: l.text,
      height: l.height ?? settings.textHeight,
      placement: l.placement,
      arrow: l.arrow,
      layerId: L(l.layer),
      ...meta,
    };
    annotations.push(ld);
  }

  // Element ids are unique within their kind in a definition; a dimension and
  // a note may share one ("cushion"). Keep annotation ids unique across kinds,
  // deterministically, by qualifying a repeat with its kind.
  const used = new Set<string>();
  for (const a of annotations) {
    if (used.has(a.id)) a.id = `${a.id}~${a.type}`;
    used.add(a.id);
  }

  const anchors: Record<string, Point> = {};
  for (const [k, v] of Object.entries(evaluation.anchors)) anchors[k] = T(v);

  return { evaluation, shapes, annotations, anchors, blocked: hasBlockingIssues(evaluation) };
}

/** A registry built from definitions. */
export function makeRegistry(defs: ComponentDefinition[]): Map<string, ComponentDefinition> {
  return new Map(defs.map((d) => [d.id, d]));
}
