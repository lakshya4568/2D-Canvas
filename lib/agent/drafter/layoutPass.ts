/**
 * The drawing cleanup pass: every label moved to somewhere it can be read.
 *
 * Geometry decides where an annotation BELONGS — a dimension spans the two
 * faces whose size it states, a leader points into the thing it names, a level
 * callout stands on its line. It does not decide where the words go, and on a
 * crowded sheet the obvious spot is often taken. A draftsman solves that by
 * moving the note, flipping the callout to the other side, or pushing the
 * dimension line out one row — never by shrinking the lettering, and never by
 * moving the wall.
 *
 * So this pass may change exactly three things, and only through the
 * presentation field the engine keeps for it (`AnnotationLayout`):
 *   - how far out a dimension line sits, in whole rows of the standard spacing;
 *   - which side of its point a level callout is written on;
 *   - where a note or a leader's shelf sits, within a few text heights of where
 *     it was authored.
 * The measured points, the leader's arrow tip, the level's point, the text
 * itself and every coordinate of the geometry are untouchable. An annotation
 * therefore cannot lose what it is attached to, whatever this pass decides.
 *
 * Which way the paper moves when one of those numbers changes is not assumed
 * anywhere here: the engine is asked, by probing the drawing once in each
 * direction and measuring what came back. A mirrored or rotated placement, or
 * a drawing set out at true levels (where the component's Y runs the other way
 * from the sheet's), therefore needs no special case.
 */

import type { ComponentDefinition, DimensionDef, LeaderDef, LevelDef, TextDef } from "../../components/types";
import type { Annotation, DimensionAnnotation, LevelAnnotation } from "../../cad/types";
import type { Point, Shape } from "../../geometry/types";
import { annotationPrims } from "../../cad/annotationPrims";
import { shapePrims } from "../../cad/annotationPrims";
import { indexShapes, resolveAnchor, type ShapeIndex } from "../../cad/geometry";
import { evaluateInstance } from "../../cad/document";
import { annotationGlobals } from "../../components/instantiate";
import { findClashes, inkOf, layoutAnnotations, translateInk, type Clash, type Obstacle, type Placeable, type Placement } from "../../cad/layout";
import { ToolError, fmt, type DraftingWorkspace } from "./workspace";

/**
 * The drawing's own definition. Read here rather than imported so that the
 * construction module can use this pass without the two depending on each
 * other.
 */
const currentDefinition = (ws: DraftingWorkspace): ComponentDefinition | null =>
  ws.construction.definitionId ? (ws.cad.definitions ?? []).find((d) => d.id === ws.construction.definitionId) ?? null : null;

/** What the pass decided for one annotation. */
export type LayoutChange =
  | { kind: "dimension"; id: string; offset: number }
  | { kind: "level"; id: string; side: "left" | "right" }
  | { kind: "text"; id: string; shift: [number, number] }
  | { kind: "leader"; id: string; shift: [number, number] };

type Payload = LayoutChange | null;

/**
 * The clear space every annotation keeps around it.
 *
 * Half a character height: tight enough that a drawing stays compact, wide
 * enough that two labels never read as one. It is taken from the drawing's own
 * text height, so it is the same distance everywhere on the sheet and it
 * follows the annotation scale instead of being a number in this file.
 */
const gapOf = (textHeightModel: number) => textHeightModel * 0.5;

/** The def element an annotation came from: "BOX-1:DimSpan[2]~dimension" → "DimSpan". */
function defElementId(annotationId: string, instanceId: string): string {
  let id = annotationId.startsWith(`${instanceId}:`) ? annotationId.slice(instanceId.length + 1) : annotationId;
  id = id.replace(/~[a-z]+$/, "");
  // Repeats share one definition element; the whole row moves together.
  id = id.replace(/\[\d+\]$/, "");
  return id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
}

interface Probe {
  /** Where the paper goes when this annotation's local shift is (1, 0) and (0, 1). */
  ex: Map<string, Point>;
  ey: Map<string, Point>;
  /** Where a dimension line goes when its local offset gains 1. */
  offset: Map<string, Point>;
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** An annotation's anchor as a point; component annotations carry their own. */
const at = (ref: unknown, shapes: ShapeIndex): Point => resolveAnchor(ref as Parameters<typeof resolveAnchor>[0], shapes) ?? { x: 0, y: 0 };

/**
 * Asks the engine which way each annotation travels, by nudging every one of
 * them a unit in each direction and measuring the result. One evaluation per
 * direction, and no assumption about frames, mirroring or which way Y runs.
 */
function probeDirections(ws: DraftingWorkspace, def: ComponentDefinition, instanceId: string): Probe {
  const nudged = (shift: [number, number], offset: number): ComponentDefinition => ({
    ...def,
    dimensions: (def.dimensions ?? []).map((d) => ({ ...d, layout: { ...d.layout, offset: (d.layout?.offset ?? 0) + offset } })),
    texts: (def.texts ?? []).map((t) => ({ ...t, layout: { ...t.layout, shift: [(t.layout?.shift?.[0] ?? 0) + shift[0], (t.layout?.shift?.[1] ?? 0) + shift[1]] as [number, number] } })),
    leaders: (def.leaders ?? []).map((l) => ({ ...l, layout: { ...l.layout, shift: [(l.layout?.shift?.[0] ?? 0) + shift[0], (l.layout?.shift?.[1] ?? 0) + shift[1]] as [number, number] } })),
  });

  const inst = ws.cad.components.find((c) => c.id === instanceId)!;
  const index = indexShapes(ws.shapes as Shape[]);
  const evalWith = (d: ComponentDefinition) => {
    const doc = { ...ws.cad, definitions: [...(ws.cad.definitions ?? []).filter((x) => x.id !== d.id), d] };
    return evaluateInstance(inst, doc);
  };
  const base = evalWith(def);
  const dx = evalWith(nudged([1, 0], 0));
  const dy = evalWith(nudged([0, 1], 1));

  const ex = new Map<string, Point>();
  const ey = new Map<string, Point>();
  const offset = new Map<string, Point>();
  if (!base || !dx || !dy) return { ex, ey, offset };

  const pointsOf = (out: NonNullable<ReturnType<typeof evalWith>>) => {
    const m = new Map<string, Point>();
    for (const a of out.annotations) {
      if (a.type === "text") m.set(a.id, at(a.at, index));
      else if (a.type === "leader" && a.points.length > 1) m.set(a.id, at(a.points[1], index));
      else if (a.type === "dimension") {
        // The dimension's own offset already carries the movement, in the
        // document's own sense; a unit vector along its line direction turns it
        // back into a displacement.
        const d = a as DimensionAnnotation;
        const p1 = at(d.p1, index);
        const p2 = at(d.p2, index);
        const dxl = p2.x - p1.x;
        const dyl = p2.y - p1.y;
        const l = Math.hypot(dxl, dyl) || 1;
        const n = d.kind === "linear" ? (d.axis === "x" ? { x: 0, y: 1 } : { x: 1, y: 0 }) : { x: -dyl / l, y: dxl / l };
        m.set(a.id, { x: n.x * (d.offset ?? 0), y: n.y * (d.offset ?? 0) });
      }
    }
    return m;
  };
  const b = pointsOf(base);
  const px = pointsOf(dx);
  const py = pointsOf(dy);
  for (const [id, p] of b) {
    const isDim = base.annotations.find((a) => a.id === id)?.type === "dimension";
    if (isDim) offset.set(id, sub(py.get(id) ?? p, p));
    else {
      ex.set(id, sub(px.get(id) ?? p, p));
      ey.set(id, sub(py.get(id) ?? p, p));
    }
  }
  return { ex, ey, offset };
}

interface Built {
  items: Placeable<Payload>[];
  obstacles: Obstacle[];
  gap: number;
}

/**
 * Turns the drawing into placeables and obstacles.
 *
 * Every candidate is drawn exactly as it would plot: a level callout's other
 * side is really re-drawn, a dimension's corridor really runs from the faces it
 * measures to wherever its line would sit. Nothing is estimated from a rule of
 * thumb about how big a label "usually" is.
 */
function build(ws: DraftingWorkspace, def: ComponentDefinition, instanceId: string, only?: Set<string>): Built {
  const ctx = { shapes: indexShapes(ws.shapes as Shape[]), settings: ws.cad.settings };
  // The drawing's own spacing, not a number invented here: a dimension pushed
  // out lands on the same row pitch every other dimension uses.
  const globals = annotationGlobals(ws.cad.settings);
  const gap = gapOf(globals.TXT);
  const probe = probeDirections(ws, def, instanceId);

  const items: Placeable<Payload>[] = [];
  const obstacles: Obstacle[] = [];

  // Geometry is never moved, so it is only ever in the way. Its lines matter
  // because words must not be written across them; its lines crossing other
  // lines is ordinary drafting and is not counted.
  for (const s of ws.shapes as Shape[]) {
    const ink = inkOf(shapePrims(s, s.layerId ?? "0"));
    if (ink.segments.length || ink.texts.length) obstacles.push({ id: s.id, kind: "geometry", ink, weight: 1 });
  }

  const dimDefs = new Map((def.dimensions ?? []).map((d) => [d.id, d]));
  const levelDefs = new Map((def.levels ?? []).map((d) => [d.id, d]));
  const textDefs = new Map((def.texts ?? []).map((d) => [d.id, d]));
  const leaderDefs = new Map((def.leaders ?? []).map((d) => [d.id, d]));

  /**
   * Copies of a repeat share one definition element, so they share one
   * placement: a row of eight cell dimensions moves as a row or not at all.
   * They are gathered here and offered to the engine as a single placeable
   * whose ink is all of them together.
   */
  const groups = new Map<string, { kind: Annotation["type"]; elementId: string; members: Annotation[] }>();
  for (const a of ws.cad.annotations) {
    const prims = annotationPrims(a, ctx);
    const ink = inkOf(prims);
    if (!ink.texts.length && !ink.segments.length) continue;
    const mine = a.componentInstanceId === instanceId;
    const elementId = defElementId(a.id, instanceId);
    const known =
      (a.type === "dimension" && dimDefs.has(elementId)) ||
      (a.type === "level" && levelDefs.has(elementId)) ||
      (a.type === "text" && textDefs.has(elementId)) ||
      (a.type === "leader" && leaderDefs.has(elementId));

    // Hatching is background: a note may sit over it, and often must. Anything
    // this pass cannot move is simply something to keep clear of.
    if (!mine || a.type === "hatch" || !known || (only && !only.has(elementId) && !only.has(a.id))) {
      obstacles.push({ id: a.id, kind: a.type, ink, weight: a.type === "hatch" ? 0.15 : 1, crossable: a.type === "leader" });
      continue;
    }
    const g = groups.get(elementId) ?? { kind: a.type, elementId, members: [] };
    g.members.push(a);
    groups.set(elementId, g);
  }

  /** Several copies of one annotation, judged as the single thing they are. */
  const merge = (inks: ReturnType<typeof inkOf>[]): ReturnType<typeof inkOf> => ({
    texts: inks.flatMap((i) => i.texts),
    segments: inks.flatMap((i) => i.segments),
    bounds: {
      minX: Math.min(...inks.map((i) => i.bounds.minX)),
      minY: Math.min(...inks.map((i) => i.bounds.minY)),
      maxX: Math.max(...inks.map((i) => i.bounds.maxX)),
      maxY: Math.max(...inks.map((i) => i.bounds.maxY)),
    },
  });

  for (const { kind, elementId, members } of groups.values()) {
    const inks = members.map((a) => inkOf(annotationPrims(a, ctx)));
    const current: Placement<Payload> = { ink: merge(inks), distance: 0, payload: null };
    const options: Placement<Payload>[] = [current];
    const first = members[0];

    if (kind === "dimension") {
      const dir = probe.offset.get(first.id);
      if (dir && Math.hypot(dir.x, dir.y) > 1e-9) {
        const authored = dimDefs.get(elementId)!.layout?.offset ?? 0;
        // Whole rows of the drawing's own spacing, so a dimension pushed out
        // still lines up with the others instead of landing on its own pitch.
        for (const rows of [-1, 1, -2, 2, -3, 3]) {
          const delta = rows * globals.DIM;
          options.push({
            ink: merge(inks.map((i) => translateInk(i, dir.x * delta, dir.y * delta))),
            distance: Math.abs(delta),
            payload: { kind: "dimension", id: elementId, offset: authored + delta },
          });
        }
      }
    } else if (kind === "level") {
      const side = (first as LevelAnnotation).side === "left" ? "right" : "left";
      const flipped = members.map((a) => inkOf(annotationPrims({ ...(a as LevelAnnotation), side } as Annotation, ctx)));
      options.push({ ink: merge(flipped), distance: globals.TXT, payload: { kind: "level", id: elementId, side } });
    } else {
      const ex = probe.ex.get(first.id);
      const ey = probe.ey.get(first.id);
      const isText = kind === "text";
      const authored = (isText ? textDefs.get(elementId)!.layout?.shift : leaderDefs.get(elementId)!.layout?.shift) ?? [0, 0];
      if (ex && ey) {
        const step = globals.TXT * 1.4;
        const steps = isText ? [1, 2, 3, 4] : [1, 2, 3];
        for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          for (const k of steps) {
            const lx = ux * k * step;
            const ly = uy * k * step;
            const move = { x: ex.x * lx + ey.x * ly, y: ex.y * lx + ey.y * ly };
            options.push({
              ink: merge(inks.map((i) => translateInk(i, move.x, move.y))),
              distance: Math.hypot(lx, ly),
              payload: { kind: isText ? "text" : "leader", id: elementId, shift: [authored[0] + lx, authored[1] + ly] },
            });
          }
        }
      }
    }

    if (options.length === 1) {
      obstacles.push({ id: elementId, kind, ink: current.ink, weight: 1, crossable: kind === "leader" });
      continue;
    }
    // Leaders are the one kind whose lines must not cross each other.
    items.push({ id: elementId, kind, weight: 1, crossable: kind === "leader", options });
  }

  return { items, obstacles, gap };
}

const describe = (c: Clash, name: (id: string) => string) =>
  c.kind === "overlap"
    ? `${name(c.a)} sits on ${name(c.b)} (${fmt(Math.sqrt(c.amount))} mm² of paper)`
    : c.kind === "crossing"
      ? `${name(c.a)} crosses ${name(c.b)}`
      : `${name(c.a)} is ${fmt(c.amount)} mm too close to ${name(c.b)}`;

const shortName = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id).replace(/~[a-z]+$/, "");

/** What is still in each other's way, for verify and for the report. */
export function annotationClashes(ws: DraftingWorkspace): { clashes: Clash[]; text: string } {
  const def = currentDefinition(ws);
  const instanceId = ws.construction.instanceId;
  if (!def || !instanceId) return { clashes: [], text: "" };
  const { items, obstacles, gap } = build(ws, def, instanceId);
  // Soft clashes (a note over hatching) are reported, never counted as faults.
  const clashes = findClashes(items, obstacles, gap).filter((c) => !c.soft);
  const overlaps = clashes.filter((c) => c.kind !== "close");
  return {
    clashes,
    text: clashes.length
      ? `${overlaps.length} overlapping or crossing, ${clashes.length - overlaps.length} too close: ${clashes.slice(0, 6).map((c) => describe(c, shortName)).join("; ")}${clashes.length > 6 ? `; and ${clashes.length - 6} more` : ""}`
      : "no annotation sits on another, on the geometry, or closer than the drawing's spacing",
  };
}

/**
 * Runs the pass and writes what it decided into the definition.
 *
 * The write goes through the same commit every other change uses, so a layout
 * that somehow broke the drawing would be refused whole, like any other edit —
 * annotation placement is not allowed to cost geometry.
 */
export function runLayoutPass(ws: DraftingWorkspace, args: { only?: string[]; passes?: number } = {}): string {
  const def = currentDefinition(ws);
  const instanceId = ws.construction.instanceId;
  if (!def || !instanceId) throw new ToolError("There is nothing drawn yet to lay out.");
  const annotated = (def.dimensions?.length ?? 0) + (def.levels?.length ?? 0) + (def.texts?.length ?? 0) + (def.leaders?.length ?? 0);
  if (!annotated) throw new ToolError("This drawing has no dimensions, levels, notes or leaders yet — annotate first, then lay them out.");

  const only = args.only?.length ? new Set(args.only) : undefined;
  const { items, obstacles, gap } = build(ws, def, instanceId, only);
  const before = findClashes(items, obstacles, gap);
  const result = layoutAnnotations(items, obstacles, { gap, passes: args.passes ?? 3 });

  const changes = [...result.chosen.values()].map((c) => c.payload).filter((p): p is LayoutChange => p !== null);
  if (!changes.length) {
    return before.length
      ? `Nothing could be improved by moving: ${before.length} clash(es) remain — ${before.slice(0, 4).map((c) => describe(c, shortName)).join("; ")}. Change what the annotation says or where the geometry puts it.`
      : `Checked ${items.length} annotation(s): ${annotationClashes(ws).text}.`;
  }

  const dims = new Map(changes.filter((c) => c.kind === "dimension").map((c) => [c.id, c]));
  const levels = new Map(changes.filter((c) => c.kind === "level").map((c) => [c.id, c]));
  const texts = new Map(changes.filter((c) => c.kind === "text").map((c) => [c.id, c]));
  const leaders = new Map(changes.filter((c) => c.kind === "leader").map((c) => [c.id, c]));
  const reason = "moved by the annotation layout pass";

  const next: ComponentDefinition = {
    ...def,
    dimensions: (def.dimensions ?? []).map((d): DimensionDef => {
      const c = dims.get(d.id);
      return c && c.kind === "dimension" ? { ...d, layout: { ...d.layout, offset: c.offset, reason } } : d;
    }),
    levels: (def.levels ?? []).map((l): LevelDef => {
      const c = levels.get(l.id);
      return c && c.kind === "level" ? { ...l, layout: { ...l.layout, side: c.side, reason } } : l;
    }),
    texts: (def.texts ?? []).map((t): TextDef => {
      const c = texts.get(t.id);
      return c && c.kind === "text" ? { ...t, layout: { ...t.layout, shift: c.shift, reason } } : t;
    }),
    leaders: (def.leaders ?? []).map((l): LeaderDef => {
      const c = leaders.get(l.id);
      return c && c.kind === "leader" ? { ...l, layout: { ...l.layout, shift: c.shift, reason } } : l;
    }),
  };

  ws.applyCad({ type: "CAD_PUT_DEFINITION", definition: next });
  const after = annotationClashes(ws);

  const moved = changes
    .map((c) =>
      c.kind === "dimension"
        ? `${c.id} out to ${fmt(c.offset)} mm`
        : c.kind === "level"
          ? `${c.id} to the ${c.side}`
          : `${c.id} by ${fmt(c.shift[0])}, ${fmt(c.shift[1])} mm`
    )
    .join("; ");

  return [
    `Laid out ${items.length} annotation(s): ${changes.length} moved — ${moved}.`,
    `Before: ${before.length} clash(es). After: ${after.text}.`,
    after.clashes.length ? "What remains needs a different annotation or a different place for it to describe — nothing was shrunk to make it fit." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
