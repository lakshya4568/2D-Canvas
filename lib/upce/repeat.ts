/**
 * Components and repeats — the generalisation mechanism (§23).
 *
 * §23.4 settles the hardest problem in the system and this file implements that
 * settlement literally: an integer count is a TOPOLOGY MUTATION, not a solver
 * variable. Changing it changes how many primitives and constraints exist, so it
 * is handled procedurally ABOVE the solver: regenerate the flat geometry from
 * the rule, then hand the result to the solver as if the author had drawn it.
 *
 * There is no `CulvertCell`, no `if (isBridge)`, and nothing here knows what the
 * repeated unit represents. The same code path arrays a box-culvert cell, a
 * railing post, and a shape a user drew this morning, because all it does is:
 *
 *     copy the unit's shapes  ->  give the copies index-derived ids
 *     copy the unit's constraints, remapped to those ids
 *     tie copy i to copy 0 with a spacing constraint scaled by i
 *
 * Because ids are a pure function of the instance index, a constraint or a
 * semantic tag attached to instance 2 is still attached to instance 2 after the
 * count changes from 3 to 6.
 */

import { Shape } from "../geometry/types";
import {
  AuthoringSketch,
  ComponentDefinition,
  RepeatRule,
  SketchConstraint,
  Provenance,
} from "./types";
import { findProfiles, profileLoop, profileLoopIds, pointInLoop } from "./profile";

export const REPEAT_ID_SEPARATOR = "#";

/** True for a shape that repeat expansion generated rather than the author drawing it. */
export function isGeneratedShape(shapeId: string): boolean {
  return shapeId.includes(REPEAT_ID_SEPARATOR);
}

/** Deterministic id for the copy of `shapeId` at instance `index`. */
export function instanceShapeId(ruleId: string, index: number, shapeId: string): string {
  return `${ruleId}${REPEAT_ID_SEPARATOR}${index}:${shapeId}`;
}

function prov(detail: string): Provenance {
  return { origin: "component", detail, createdAt: Date.now() };
}

function translateShape(shape: Shape, dx: number, dy: number, id: string, name?: string): Shape {
  const base = { ...shape, id, name: name ?? shape.name };
  switch (shape.type) {
    case "line":
    case "arrow":
      return { ...base, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } as Shape;
    case "rectangle":
      return { ...base, x: shape.x + dx, y: shape.y + dy } as Shape;
    case "circle":
    case "ellipse":
    case "polygon":
    case "star":
      return { ...base, cx: (shape as { cx: number }).cx + dx, cy: (shape as { cy: number }).cy + dy } as Shape;
    default:
      return base as Shape;
  }
}

/**
 * What the unit measures, along the direction the array runs (§3.1).
 *
 * Notebook pages 1 and 2 are about a number that should never have been a
 * number. A pitch typed as 2300 is right until the span changes, and then every
 * copy is in the wrong place and the drawing "loses its shape". The pitch is not
 * a value the author holds, it is a CONSEQUENCE of the unit and of the material
 * they want between copies:
 *
 *     Pitch = (the unit's own opening) + Gap
 *
 * so this is measured off the geometry on every rebuild rather than stored.
 *
 * `opening` is the largest void the unit encloses. Nothing here knows that a
 * void in a culvert is a waterway or that the material either side of it is a
 * wall; it is the largest hole in the largest closed thing the component owns,
 * which is as true of a hollow pier or a ring beam as it is of a box cell. A
 * unit with no hole reports `opening = 0` and the gap is then measured between
 * the copies' outsides, which is the only thing it could sensibly mean.
 */
export interface UnitMeasurement {
  /** Overall size along the array direction, in mm. */
  extent: number;
  /** Largest enclosed opening, measured the same way. Zero when solid. */
  opening: number;
  /** Material either side of the opening: (extent - opening) / 2. */
  wall: number;
  /** Vertex at the trailing end of the opening (or of the outline). */
  trailPointId?: string;
  /** Vertex at the leading end, on the same side across the array. */
  leadPointId?: string;
  /** Origin-to-origin spacing that leaves `gap` of material between copies. */
  pitchFor(gap: number): number;
}

/** Extreme vertices of a loop along `u`, tie-broken across it so they correspond. */
function extremesAlong(
  points: { id: string; x: number; y: number }[],
  ux: number,
  uy: number
): { min?: string; max?: string; span: number } {
  if (points.length === 0) return { span: 0 };

  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    const t = p.x * ux + p.y * uy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }

  // A rectangle's leading edge has two vertices at the same position along the
  // array, so the tie has to break the SAME way at both ends or the relationship
  // gets written between a bottom corner and a top one. Two copies are related
  // by a translation and a relationship between corresponding corners survives
  // it; one between opposite corners quietly encodes the unit's height as well.
  const TIE = 1e-6;
  const pick = (target: number): string | undefined => {
    let best: string | undefined;
    let bestPerp = Infinity;
    for (const p of points) {
      if (Math.abs(p.x * ux + p.y * uy - target) > TIE) continue;
      const perp = -p.x * uy + p.y * ux;
      if (perp < bestPerp) {
        bestPerp = perp;
        best = p.id;
      }
    }
    return best;
  };

  return { min: pick(lo), max: pick(hi), span: hi - lo };
}

function shoelaceOf(loop: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

/**
 * Measures a component along the array direction.
 *
 * `measured` must be a sketch lowered from the CURRENT shapes — the measurement
 * is about where the unit is now, not where it was when the rule was written.
 */
export function measureUnit(
  measured: AuthoringSketch,
  component: ComponentDefinition,
  direction: { x: number; y: number }
): UnitMeasurement {
  const len = Math.hypot(direction.x, direction.y) || 1;
  const ux = direction.x / len;
  const uy = direction.y / len;
  const owned = new Set(component.shapeIds);

  const coords = (ids: string[]) =>
    ids
      .map((id) => measured.points[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ id: p.id, x: p.x, y: p.y }));

  // Loose fallback: every point the component's shapes read. Always available,
  // even for a few unconnected lines that close nothing.
  const all = Object.values(measured.points)
    .filter((p) => p.owners.some((o) => owned.has(o)))
    .map((p) => ({ id: p.id, x: p.x, y: p.y }));

  const loops = findProfiles(measured)
    .filter((pr) => pr.closed && pr.shapeIds.some((id) => owned.has(id)))
    .map((pr) => ({ ids: profileLoopIds(measured, pr), pts: profileLoop(measured, pr) }))
    .filter((l): l is { ids: string[]; pts: { x: number; y: number }[] } => Boolean(l.ids && l.pts))
    .map((l) => ({ ...l, area: shoelaceOf(l.pts) }))
    .sort((a, b) => b.area - a.area);

  let extent = extremesAlong(all, ux, uy).span;
  let opening = 0;
  let trailPointId: string | undefined;
  let leadPointId: string | undefined;

  const outer = loops[0];
  if (outer) {
    const ext = extremesAlong(coords(outer.ids), ux, uy);
    if (ext.span > 0) extent = ext.span;
    trailPointId = ext.max;
    leadPointId = ext.min;

    // Anything the outline encloses is an opening. Nesting by containment, not
    // by drawing order or by what the shape is called.
    for (const inner of loops.slice(1)) {
      if (!pointInLoop(outer.pts, inner.pts[0])) continue;
      const holeExt = extremesAlong(coords(inner.ids), ux, uy);
      if (holeExt.span > opening) {
        opening = holeExt.span;
        trailPointId = holeExt.max;
        leadPointId = holeExt.min;
      }
    }
  }

  const wall = opening > 0 ? Math.max(0, (extent - opening) / 2) : 0;

  return {
    extent,
    opening,
    wall,
    trailPointId,
    leadPointId,
    pitchFor: (gap: number) => (opening > 0 ? opening : extent) + gap,
  };
}

/** What the panel shows for one repeat rule, all of it measured. */
export interface RepeatMeasurement {
  ruleId: string;
  componentName: string;
  count: number;
  /** Material held between consecutive copies, in mm. */
  gap: number;
  /** The pitch that follows from it. */
  pitch: number;
  extent: number;
  opening: number;
  wall: number;
  mode: RepeatRule["spacingMode"];
}

export interface ExpansionResult {
  shapes: Shape[];
  /** Extra constraints that only exist because of a repeat rule. */
  constraints: SketchConstraint[];
  /** Human-readable notes for the authoring panel. */
  notes: string[];
  /** What each rule measured on this rebuild. */
  measurements: RepeatMeasurement[];
}

/**
 * Regenerates every repeat rule's instances from the author's original unit.
 *
 * Previously generated shapes are discarded first, so this is idempotent and a
 * count of 6 followed by a count of 2 leaves exactly two instances behind.
 */
export function expandRepeats(
  authoredShapes: Shape[],
  sketch: AuthoringSketch,
  /**
   * A sketch lowered from the shapes AS THEY NOW STAND, for measuring the unit.
   *
   * `sketch` carries the intent — the rules, the parameters, the components —
   * but its coordinates are one solve behind whenever the author has just
   * dragged something. Measuring the pitch off stale coordinates is exactly the
   * failure notebook page 1 describes, so the caller passes the current lowering
   * and the default keeps every existing caller working.
   */
  measured: AuthoringSketch = sketch
): ExpansionResult {
  const base = authoredShapes.filter((s) => !isGeneratedShape(s.id));
  const shapes: Shape[] = [...base];
  const constraints: SketchConstraint[] = [];
  const notes: string[] = [];
  const measurements: RepeatMeasurement[] = [];

  for (const rule of sketch.repeats) {
    const component = sketch.components.find((c) => c.id === rule.componentId);
    if (!component) continue;

    const countParam = sketch.parameters[rule.countParam];
    const spacingParam = sketch.parameters[rule.spacingParam];
    if (!countParam || !spacingParam) {
      notes.push(`Repeat "${component.name}" is missing its count or spacing parameter and was not expanded.`);
      continue;
    }

    const count = Math.max(1, Math.round(countParam.value));
    const len = Math.hypot(rule.direction.x, rule.direction.y) || 1;
    const ux = rule.direction.x / len;
    const uy = rule.direction.y / len;

    // In gap mode the pitch is not stored anywhere: it is what the unit and the
    // gap add up to, re-measured on every rebuild (§3.1).
    const unit = measureUnit(measured, component, rule.direction);
    const gap = rule.spacingMode === "gap" ? spacingParam.value : 0;
    const pitch = rule.spacingMode === "gap" ? unit.pitchFor(gap) : spacingParam.value;

    measurements.push({
      ruleId: rule.id,
      componentName: component.name,
      count,
      gap: rule.spacingMode === "gap" ? gap : pitch - (unit.opening || unit.extent),
      pitch,
      extent: unit.extent,
      opening: unit.opening,
      wall: unit.wall,
      mode: rule.spacingMode,
    });

    const unitShapes = base.filter((s) => component.shapeIds.includes(s.id));
    if (unitShapes.length === 0) {
      notes.push(`Repeat "${component.name}" has no geometry left to copy.`);
      continue;
    }

    const anchorShapeId = component.ports[0]
      ? sketch.points[component.ports[0].pointId]?.owners[0]
      : undefined;
    const anchorPointId = component.ports[0]?.pointId ?? defaultAnchorPoint(sketch, component);
    void anchorShapeId;

    for (let i = 1; i < count; i++) {
      const dx = ux * pitch * i;
      const dy = uy * pitch * i;

      for (const s of unitShapes) {
        shapes.push(
          translateShape(
            s,
            dx,
            dy,
            instanceShapeId(rule.id, i, s.id),
            s.name ? `${s.name} ${i + 1}` : undefined
          )
        );
      }

      // Copy the unit's own design intent onto the copy.
      //
      // Which rules travel is not arbitrary. A rule entirely inside the unit —
      // "this cell is 2000 wide" — is part of what the unit IS, so every copy
      // gets it. A rule that ties the unit to something outside splits in two:
      //
      //   direction and size relations ("stay parallel to the deck", "match
      //   that edge's length") describe how the unit sits in the world and are
      //   just as true of copy 4 as of the original, so they travel;
      //
      //   POSITION relations ("sit 300 mm off the left wall") do not, because
      //   the repeat rule is already what positions copy 4. Copying those would
      //   stack a second, contradictory answer to the same question and the DOF
      //   report would — correctly — call it a conflict.
      const DIRECTIONAL = new Set(["parallel", "perpendicular", "horizontal", "vertical", "angle", "equal_length"]);
      for (const c of sketch.constraints) {
        if (c.kind === "fix") continue; // only the original is pinned
        const refs = [...c.points, ...c.segments];
        if (refs.length === 0) continue;
        const owned = refs.filter((r) => component.shapeIds.includes(r.split(":")[0]));
        if (owned.length === 0) continue;
        const whollyOwned = owned.length === refs.length;
        if (!whollyOwned && !DIRECTIONAL.has(c.kind)) continue;

        const remap = (r: string) =>
          component.shapeIds.includes(r.split(":")[0]) ? remapRef(rule.id, i, r) : r;

        constraints.push({
          ...c,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:${c.id}`,
          points: c.points.map(remap),
          segments: c.segments.map(remap),
          label: `${c.label} (copy ${i + 1})`,
          provenance: prov(
            `Regenerated from "${component.name}" because the repeat count is ${count}. It is the same rule the author accepted on the original unit.`
          ),
        });
      }

      // Spacing.
      //
      // Two different relationships, because the author asked two different
      // questions.
      //
      // GAP mode chains consecutive copies through the vertices at either end of
      // the unit's opening: the trailing corner of copy i-1 sits `Gap` from the
      // leading corner of copy i. That is a statement the SOLVER holds, so it
      // survives the same edit that changes the unit — widen the span and the
      // copies move apart to keep the material between them exactly as it was,
      // which is what notebook pages 1 and 2 are asking for. A pitch written as
      // a number cannot do that: it is right until the span changes and then
      // every copy is in the wrong place.
      const chainable =
        rule.spacingMode === "gap" &&
        !!unit.trailPointId &&
        !!unit.leadPointId &&
        // Welding picks one host id per shared vertex, and the host may belong
        // to a shape outside the unit. Remapping such an id would name a copy
        // that was never made, so the rule falls back to the anchor chain.
        component.shapeIds.includes(splitRef(unit.trailPointId)[0]) &&
        component.shapeIds.includes(splitRef(unit.leadPointId)[0]);

      if (chainable && unit.trailPointId && unit.leadPointId) {
        const from =
          i === 1 ? unit.trailPointId : remapRef(rule.id, i - 1, unit.trailPointId);
        const to = remapRef(rule.id, i, unit.leadPointId);
        const common = {
          points: [from, to],
          segments: [] as string[],
          paramRef: rule.spacingParam,
          strength: "hard" as const,
          driving: true,
          state: "active" as const,
          provenance: prov(
            `Holds ${rule.spacingParam} of material between copy ${i} and copy ${i + 1}. Measured between the two ends of the unit's own opening, so it stays put when the unit changes size.`
          ),
        };
        constraints.push({
          ...common,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:gap-x`,
          kind: "distance_x",
          sign: ux < 0 ? -1 : 1,
          paramScale: Math.abs(ux),
          label: `${rule.spacingParam} of material between copy ${i} and copy ${i + 1}`,
        });
        constraints.push({
          ...common,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:gap-y`,
          kind: "distance_y",
          sign: uy < 0 ? -1 : 1,
          paramScale: Math.abs(uy),
          label: `Copy ${i + 1} stays on the array line`,
        });
      } else if (anchorPointId) {
        const targetPoint = remapRef(rule.id, i, anchorPointId);
        const common = {
          points: [anchorPointId, targetPoint],
          segments: [] as string[],
          paramRef: rule.spacingParam,
          paramScale: i,
          strength: "hard" as const,
          driving: true,
          state: "active" as const,
          provenance: prov(
            `Places copy ${i + 1} at ${i} x ${rule.spacingParam} from the original along the repeat direction.`
          ),
        };
        constraints.push({
          ...common,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:pitch-x`,
          kind: "distance_x",
          sign: ux < 0 ? -1 : 1,
          paramScale: i * Math.abs(ux),
          label: `Copy ${i + 1} sits ${i} x ${rule.spacingParam} along the array`,
        });
        constraints.push({
          ...common,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:pitch-y`,
          kind: "distance_y",
          sign: uy < 0 ? -1 : 1,
          paramScale: i * Math.abs(uy),
          label: `Copy ${i + 1} stays on the array line`,
        });
      }
    }

    const how =
      rule.spacingMode === "driven"
        ? "pitch fixed, extent grows"
        : rule.spacingMode === "derived"
        ? "extent fixed, pitch adjusts"
        : unit.opening > 0
        ? `${gap.toFixed(1)} mm of material held between openings, so the pitch follows the unit`
        : `${gap.toFixed(1)} mm clear between copies, so the pitch follows the unit`;
    notes.push(
      `"${component.name}" repeats ${count} time${count === 1 ? "" : "s"} at ${pitch.toFixed(1)} mm pitch (${how}).`
    );
  }

  return { shapes, constraints, notes, measurements };
}

function remapRef(ruleId: string, index: number, ref: string): string {
  const [shapeId, tail] = splitRef(ref);
  return tail ? `${instanceShapeId(ruleId, index, shapeId)}:${tail}` : instanceShapeId(ruleId, index, shapeId);
}

function splitRef(ref: string): [string, string | null] {
  const i = ref.lastIndexOf(":");
  if (i < 0) return [ref, null];
  return [ref.slice(0, i), ref.slice(i + 1)];
}

function defaultAnchorPoint(sketch: AuthoringSketch, component: ComponentDefinition): string | undefined {
  const candidates = Object.values(sketch.points)
    .filter((p) => p.owners.some((o) => component.shapeIds.includes(o)))
    .map((p) => p.id)
    .sort();
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

/** Groups the author's selection into a reusable unit. */
export function createComponent(
  sketch: AuthoringSketch,
  shapes: Shape[],
  shapeIds: string[],
  name: string
): { sketch: AuthoringSketch; component: ComponentDefinition } {
  // A timestamp alone is not an identifier. Two units grouped in the same
  // millisecond — which is one double-click apart, or one test away — collided,
  // and everything keyed on the id then quietly addressed the wrong unit.
  const id = `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const member = shapes.filter((s) => shapeIds.includes(s.id));

  // The unit's local origin is its lowest-and-leftmost vertex, which is stable
  // under later edits and is what a linear array measures pitch from.
  const owned = Object.values(sketch.points).filter((p) => p.owners.some((o) => shapeIds.includes(o)));
  const origin = [...owned].sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1))[0];

  const component: ComponentDefinition = {
    id,
    name,
    shapeIds: [...shapeIds],
    ports: origin
      ? [{ id: `${id}_p0`, name: "origin", pointId: origin.id }]
      : [],
    createdAt: Date.now(),
    localShapes: member.map((s) => ({ ...s })),
  };

  return { sketch: { ...sketch, components: [...sketch.components, component] }, component };
}

export interface RepeatDraft {
  componentId: string;
  count: number;
  /** Distance between consecutive instances, in mm. Ignored in gap mode. */
  pitch: number;
  /**
   * Material held between consecutive copies, in mm — gap mode only.
   *
   * Left out, it defaults to the unit's own wall: whatever thickness already
   * sits between its opening and its outside, measured off the geometry. That
   * is the structural default invariant of §3.1 (t_mid = t_ext) arrived at by
   * measurement rather than by knowing what a culvert is, and it is what
   * notebook page 1 asks for when it says the wall thickness should be
   * maintained if the cell pitch is not defined.
   */
  gap?: number;
  spacingMode: RepeatRule["spacingMode"];
  direction: { x: number; y: number };
  countParamName?: string;
  spacingParamName?: string;
}

/**
 * Turns a component into a count-driven array.
 *
 * The two parameters this creates are deliberately different in kind and the UI
 * says so: `Count` is an integer that changes how many things exist, `Pitch` is
 * a length the solver can hold. §23.4 — the solver never sees the count.
 */
export function createRepeat(
  sketch: AuthoringSketch,
  draft: RepeatDraft
): { sketch: AuthoringSketch; rule: RepeatRule } {
  const component = sketch.components.find((c) => c.id === draft.componentId);
  const base = component?.name.replace(/[^A-Za-z0-9]/g, "") || "Unit";
  const countName = draft.countParamName ?? `${base}Count`;
  const spacingName =
    draft.spacingParamName ??
    (draft.spacingMode === "driven"
      ? `${base}Pitch`
      : draft.spacingMode === "gap"
      ? `${base}Gap`
      : `${base}Extent`);

  const measured = component ? measureUnit(sketch, component, draft.direction) : null;
  const gap = draft.gap ?? measured?.wall ?? 0;

  const parameters = { ...sketch.parameters };
  parameters[countName] = {
    name: countName,
    role: "DRIVING",
    type: "COUNT",
    unit: "count",
    value: Math.max(1, Math.round(draft.count)),
    min: 1,
    step: 1,
    provenance: {
      origin: "user",
      detail:
        "How many copies of the unit exist. This is a topology change: the drawing is rebuilt with a different number of pieces rather than being stretched.",
      createdAt: Date.now(),
    },
    boundConstraints: [],
    published: true,
    uiGroup: "Configuration",
  };

  if (draft.spacingMode === "gap") {
    parameters[spacingName] = {
      name: spacingName,
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: gap,
      min: 0,
      provenance: {
        origin: "user",
        detail:
          measured && measured.opening > 0
            ? `Material left between one copy's opening and the next. It starts at ${measured.wall.toFixed(
                1
              )} mm because that is what already sits between this unit's opening and its outside. The pitch is not stored: it is this plus the opening, re-measured whenever the unit changes.`
            : "Clear distance between one copy and the next. The pitch is not stored: it is this plus the unit's own size, re-measured whenever the unit changes.",
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: true,
      uiGroup: "Configuration",
    };
  } else if (draft.spacingMode === "driven") {
    parameters[spacingName] = {
      name: spacingName,
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: draft.pitch,
      provenance: {
        origin: "user",
        detail: "Distance from one copy to the next. Holding this fixed makes the array grow as the count rises.",
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: true,
      uiGroup: "Configuration",
    };
  } else {
    const extentName = `${base}Extent`;
    parameters[extentName] = {
      name: extentName,
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: draft.pitch * Math.max(1, draft.count - 1),
      provenance: {
        origin: "user",
        detail: "Overall length the array must fill. Holding this fixed makes the copies close up as the count rises.",
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: true,
      uiGroup: "Configuration",
    };
    parameters[spacingName] = {
      name: spacingName,
      role: "DERIVED",
      type: "LENGTH",
      unit: "mm",
      value: draft.pitch,
      expr: `${extentName} / max(1, ${countName} - 1)`,
      provenance: {
        origin: "user",
        detail: `Pitch is worked out from ${extentName} and ${countName}, because the author chose to hold the overall extent rather than the spacing.`,
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: false,
      uiGroup: "Configuration",
    };
  }

  const rule: RepeatRule = {
    id: `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    componentId: draft.componentId,
    countParam: countName,
    spacingParam: spacingName,
    spacingMode: draft.spacingMode,
    direction: draft.direction,
    weldAdjacent: false,
    provenance: {
      origin: "user",
      detail: `Array of "${component?.name ?? draft.componentId}" along (${draft.direction.x}, ${draft.direction.y}).`,
      createdAt: Date.now(),
    },
  };

  return { sketch: { ...sketch, parameters, repeats: [...sketch.repeats, rule] }, rule };
}
