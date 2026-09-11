/**
 * Driving one value from another, across unrelated geometry.
 *
 * The completion assistant only ever asks about things it can SEE a relationship
 * between: two edges that are already parallel, a profile that sits inside
 * another. That is deliberate — it must not invent intent (§7, §22). But a
 * draftsman routinely wants a relationship the drawing gives no evidence for at
 * all: this abutment's height follows that pier's, this bay repeats the module
 * width from a different view. Nothing in the geometry says so; only the engineer
 * does.
 *
 * This file is that door, and it is the same door for every case:
 *
 *     measure something  ->  give it a name  ->  make one name follow an
 *                                                expression over the others
 *
 * Step one is the part that was missing. You cannot write `B = A * 2` until both
 * A and B exist, and the assistant only offers to name a span when naming it
 * removes freedom. A measurement you want purely so you can REFER to it removes
 * nothing, so it was unreachable — which made the formula box useless for
 * exactly the case it was there to serve.
 *
 * Nothing here knows what a pier or a bay is. It works on whatever the selection
 * lowers to: rectangles, circles, and profiles built from loose lines alike,
 * because by this point they are all just points and segments.
 */

import { AuthoringSketch, SketchConstraint, SketchParameter } from "./types";
import { findProfiles, Profile } from "./profile";
import { applyAction, IntentAction } from "./completion";
import { makeProvenance, uniqueParameterName, validateExpression } from "./parameters";

/**
 * `reference` measures without holding: the row never reaches the solver, so it
 * can always be created and can never fight anything. `driving` holds the
 * geometry to the value and has to pass the admissibility gate like any other
 * rule.
 */
export type MeasureMode = "driving" | "reference";

export interface Measurable {
  id: string;
  /** "Outer_Frame width", "gap between Deck and Pier, across". */
  label: string;
  kind: "distance_x" | "distance_y" | "distance";
  points: [string, string];
  /** What it measures right now, in mm. */
  value: number;
  suggestedName: string;
}

function cleanName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "");
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `V${cleaned}`;
}

function extremes(sketch: AuthoringSketch, profile: Profile, axis: "x" | "y") {
  const pts = profile.pointIds.map((id) => ({ id, p: sketch.points[id] })).filter((e) => e.p);
  if (pts.length < 2) return null;
  const sorted = [...pts].sort((m, n) => m.p[axis] - n.p[axis] || (m.id < n.id ? -1 : 1));
  return { lo: sorted[0], hi: sorted[sorted.length - 1] };
}

/**
 * Everything the current selection can be measured as.
 *
 * A selection of one profile offers its own width and height. A selection of two
 * offers the distance between them as well — which is the whole point, because
 * two profiles with no constraint between them are precisely the case the
 * assistant has nothing to say about.
 */
export function measurablesIn(
  sketch: AuthoringSketch,
  shapeIds: string[],
  names: Record<string, string> = {}
): Measurable[] {
  const wanted = new Set(shapeIds);
  const profiles = findProfiles(sketch, names).filter((p) => p.shapeIds.some((id) => wanted.has(id)));
  const out: Measurable[] = [];

  for (const profile of profiles) {
    for (const axis of ["x", "y"] as const) {
      const e = extremes(sketch, profile, axis);
      if (!e) continue;
      const word = axis === "x" ? "width" : "height";

      // If one edge already runs the whole way, measure the EDGE, not the
      // shadow it casts on the axis.
      //
      // The two are the same number today and stop being the same the moment
      // the shape is free to turn: an axis projection shortens as the shape
      // rotates, so driving it makes an unlevelled rectangle spin instead of
      // resize. Selecting a rectangle and saying "this width" means the side,
      // and a true length keeps meaning that at any angle (§17 rotation
      // invariance).
      // Which is "an edge that runs the whole way"? The one whose reach along
      // this axis matches the profile's own. Comparing endpoint ids instead
      // only ever caught one of the two axes, because which corner a rectangle
      // calls v0 decides whether its x-extremes are a side or a diagonal.
      const extent = Math.abs(e.hi.p[axis] - e.lo.p[axis]);
      let edge: { a: string; b: string; reach: number } | null = null;
      for (const id of profile.segmentIds) {
        const seg = sketch.segments[id];
        if (!seg) continue;
        const a = sketch.points[seg.p1];
        const b = sketch.points[seg.p2];
        if (!a || !b) continue;
        const reach = Math.abs(b[axis] - a[axis]);
        if (!edge || reach > edge.reach) edge = { a: seg.p1, b: seg.p2, reach };
      }

      if (edge && extent - edge.reach < 1e-6) {
        const a = sketch.points[edge.a];
        const b = sketch.points[edge.b];
        const value = Math.hypot(b.x - a.x, b.y - a.y);
        if (value < 1e-6) continue;
        out.push({
          id: `edge_${profile.id}_${axis}`,
          label: `${profile.label} ${word}`,
          kind: "distance",
          points: [edge.a, edge.b],
          value,
          suggestedName: `${cleanName(profile.label)}${axis === "x" ? "Width" : "Height"}`,
        });
        continue;
      }

      const value = e.hi.p[axis] - e.lo.p[axis];
      if (Math.abs(value) < 1e-6) continue;
      out.push({
        id: `span_${profile.id}_${axis}`,
        // Named differently on purpose: this one is the overall extent of a
        // profile no single edge spans, and it only equals the width while the
        // profile stays put.
        label: `${profile.label} overall ${word}`,
        kind: axis === "x" ? "distance_x" : "distance_y",
        points: [e.lo.id, e.hi.id],
        value,
        suggestedName: `${cleanName(profile.label)}${axis === "x" ? "Width" : "Height"}`,
      });
    }
  }

  // Between two profiles: the separation along each axis, measured between the
  // facing extremes so the number is the gap a draftsman would dimension.
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      for (const axis of ["x", "y"] as const) {
        const ea = extremes(sketch, a, axis);
        const eb = extremes(sketch, b, axis);
        if (!ea || !eb) continue;
        // Which one comes first along this axis decides which faces look at
        // each other, so the measurement stays positive and reads the right way.
        const aFirst = ea.lo.p[axis] <= eb.lo.p[axis];
        const from = aFirst ? ea.hi : eb.hi;
        const to = aFirst ? eb.lo : ea.lo;
        const value = to.p[axis] - from.p[axis];
        // A negative figure here means the two profiles overlap along this axis
        // rather than sitting apart, so there is no gap to name. Nesting is a
        // different question with its own answer — the clearance from each face,
        // which the assistant already asks about — and offering "gap = -370"
        // would be a number with no meaning on the drawing.
        if (value < 1e-6) continue;
        out.push({
          id: `gap_${a.id}_${b.id}_${axis}`,
          label: `gap between ${a.label} and ${b.label}, ${axis === "x" ? "across" : "up"}`,
          kind: axis === "x" ? "distance_x" : "distance_y",
          points: [from.id, to.id],
          value,
          suggestedName: `${cleanName(a.label)}To${cleanName(b.label)}${axis === "x" ? "X" : "Y"}`,
        });
      }
    }
  }

  return out;
}

/**
 * Turns a measurement into a named value.
 *
 * Routed through `applyAction` rather than editing the sketch here, so a value
 * created this way passes exactly the same admissibility gate as one the
 * assistant proposed, and a rule that would say something the model already says
 * is refused instead of quietly becoming a second answer to one question (§32).
 */
export function nameMeasurement(
  sketch: AuthoringSketch,
  target: Measurable,
  requestedName: string,
  mode: MeasureMode = "driving"
): { sketch: AuthoringSketch; refused?: string } {
  const name = uniqueParameterName(cleanName(requestedName) || target.suggestedName, sketch.parameters);

  const constraint: Omit<SketchConstraint, "id"> = {
    kind: target.kind,
    points: [...target.points],
    segments: [],
    paramRef: name,
    strength: mode === "driving" ? "hard" : "reference",
    driving: mode === "driving",
    state: "active",
    label: `${target.label} = ${name}`,
    provenance: makeProvenance(
      "user",
      mode === "driving"
        ? `The author measured ${target.label} and chose to drive it by a named value.`
        : `The author measured ${target.label} so it can be referred to. It reports the value and does not hold the geometry.`
    ),
  };

  const action: IntentAction = {
    id: `measure_${target.id}`,
    title: `Name ${target.label}`,
    rationale: "",
    createsParameters: [
      {
        name,
        value: Math.round(target.value * 100) / 100,
        role: mode === "driving" ? "DRIVING" : "MEASURED",
        unit: "mm",
        uiGroup: mode === "driving" ? "Overall size" : "Measured",
        description: `${target.label}, measured when the value was created.`,
      },
    ],
    createsConstraints: [constraint],
    evidence: [],
    dofRemoved: 0,
  };

  // A reference row is invisible to the solver, so the admissibility gate has
  // nothing to judge it against and would throw it away. It is attached here
  // directly — it cannot conflict with anything, because it holds nothing.
  if (mode === "reference") {
    const parameter: SketchParameter = {
      name,
      role: "MEASURED",
      type: "LENGTH",
      unit: "mm",
      value: Math.round(target.value * 100) / 100,
      provenance: makeProvenance("user", `${target.label}, measured for reference.`),
      boundConstraints: [`c_ref_${target.id}`],
      published: false,
      uiGroup: "Measured",
      description: `${target.label}, measured when the value was created.`,
    };
    return {
      sketch: {
        ...sketch,
        parameters: { ...sketch.parameters, [name]: parameter },
        constraints: [...sketch.constraints, { ...constraint, id: `c_ref_${target.id}` }],
      },
    };
  }

  const next = applyAction(sketch, action);
  if (next === sketch || !next.parameters[name]) {
    return {
      sketch,
      refused:
        `${target.label} is already decided by the rules in force, so naming it as a driving value would be a second answer to the same question. ` +
        `Measure it for reference instead — that records the number without holding the geometry, and you can still use it in a relationship.`,
    };
  }
  return { sketch: next };
}

/**
 * Makes an existing value follow an expression, keeping whatever it drives.
 *
 * The constraint that reads the parameter is left exactly as it was, so the
 * geometry goes on obeying the same rule; all that changes is where the number
 * comes from. That is what makes this work between two shapes that share no
 * constraint at all — the link lives in the scalar graph (§9), and the geometric
 * graph never needs to know the two are related.
 */
export function linkParameter(
  sketch: AuthoringSketch,
  name: string,
  expr: string
): { sketch: AuthoringSketch; refused?: string } {
  const existing = sketch.parameters[name];
  if (!existing) return { sketch, refused: `There is no value called ${name}.` };
  if (existing.role === "MEASURED") {
    return {
      sketch,
      refused: `${name} only reports a measurement — it does not hold anything, so driving it would change nothing on the drawing. Name that measurement as a driving value first.`,
    };
  }

  const check = validateExpression(expr, name, sketch.parameters);
  if (!check.ok) return { sketch, refused: check.message ?? "That expression is not valid." };

  return {
    sketch: {
      ...sketch,
      parameters: {
        ...sketch.parameters,
        [name]: {
          ...existing,
          role: "DERIVED",
          expr,
          dependencies: check.dependencies,
          // A derived value is not something a project user types.
          published: false,
          provenance: makeProvenance("user", `The author tied this to other values: ${name} = ${expr}.`),
        },
      },
    },
  };
}

/** Undoes a link: the value goes back to being typed, holding its current number. */
export function unlinkParameter(
  sketch: AuthoringSketch,
  name: string
): { sketch: AuthoringSketch; refused?: string } {
  const existing = sketch.parameters[name];
  if (!existing) return { sketch, refused: `There is no value called ${name}.` };
  if (existing.role !== "DERIVED") return { sketch, refused: `${name} is not following anything.` };
  return {
    sketch: {
      ...sketch,
      parameters: {
        ...sketch.parameters,
        [name]: {
          ...existing,
          role: "DRIVING",
          expr: undefined,
          dependencies: undefined,
          published: true,
          provenance: makeProvenance("user", `The author took this back under manual control at ${existing.value}.`),
        },
      },
    },
  };
}

/**
 * Re-reads every measured value off the solved geometry.
 *
 * A MEASURED parameter is an input as far as the expression graph is concerned —
 * nothing computes it — so without this it would report whatever the drawing
 * happened to look like on the day it was created and then quietly drift. A
 * stale measurement that other values are written in terms of is worse than no
 * measurement at all, so this runs as part of the one regenerate pipeline rather
 * than being something a panel has to remember to call.
 */
export function refreshMeasured(sketch: AuthoringSketch): AuthoringSketch {
  let changed = false;
  const parameters = { ...sketch.parameters };

  for (const c of sketch.constraints) {
    if (c.strength !== "reference" || !c.paramRef) continue;
    const param = parameters[c.paramRef];
    if (!param || param.role !== "MEASURED") continue;
    const a = sketch.points[c.points[0]];
    const b = sketch.points[c.points[1]];
    if (!a || !b) continue;

    const measured =
      c.kind === "distance_x"
        ? b.x - a.x
        : c.kind === "distance_y"
          ? b.y - a.y
          : Math.hypot(b.x - a.x, b.y - a.y);

    if (Math.abs(measured - param.value) > 1e-9) {
      parameters[c.paramRef] = { ...param, value: measured };
      changed = true;
    }
  }

  return changed ? { ...sketch, parameters } : sketch;
}
