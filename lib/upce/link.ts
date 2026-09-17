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
import { findProfiles, profileLoopIds, Profile, closedLoops } from "./profile";
import { applyAction, IntentAction } from "./completion";
import { makeProvenance, uniqueParameterName, validateExpression } from "./parameters";
import { shapeFreedomOf, ShapeFreedom } from "./dof";
import { createComponent } from "./repeat";
import { setComponentRigid } from "./rigid";
import { Shape } from "../geometry/types";

/**
 * `reference` measures without holding: the row never reaches the solver, so it
 * can always be created and can never fight anything. `driving` holds the
 * geometry to the value and has to pass the admissibility gate like any other
 * rule.
 */
export type MeasureMode = "driving" | "reference";

export interface Measurable {
  id: string;
  /** "Outer_Frame width", "gap between Deck and Pier, across", "L1 length". */
  label: string;
  kind: "distance_x" | "distance_y" | "distance" | "position_x" | "position_y";
  /** Two points for a distance, one for a position. */
  points: string[];
  /** What it measures right now, in mm. */
  value: number;
  suggestedName: string;
}

/**
 * A profile that is one straight line and nothing else.
 *
 * It needs its own answer because the generic one is wrong for it, not merely
 * unhelpful. A profile's "width" is the shadow it casts on the x axis, which for
 * a closed shape is a reasonable thing to drive and for a single line is not: a
 * line has no width and no height, and driving its vertical shadow changes its
 * LENGTH and its ANGLE at the same time, which is exactly the surprise a
 * draftsman reports as "I drove the height and the line went somewhere else".
 *
 * What a line has is a length, a direction, and two ends.
 */
function loneSegmentOf(sketch: AuthoringSketch, profile: Profile): { p1: string; p2: string } | null {
  if (profile.segmentIds.length !== 1) return null;
  const seg = sketch.segments[profile.segmentIds[0]];
  if (!seg) return null;
  if (!sketch.points[seg.p1] || !sketch.points[seg.p2]) return null;
  return { p1: seg.p1, p2: seg.p2 };
}

/**
 * The vertex that stands for where a profile IS.
 *
 * Lowest, then leftmost, then by id — the same rule a component's local origin
 * uses, so "position" means the same corner every time it is asked for and does
 * not wander when the shape is edited.
 */
function anchorVertexOf(sketch: AuthoringSketch, profile: Profile): string | null {
  const pts = profile.pointIds.map((id) => sketch.points[id]).filter(Boolean);
  if (pts.length === 0) return null;
  return [...pts].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1))[0].id;
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
  // Solids that touch share corners and so form one branched profile. Measuring
  // that as a whole offered "overall height" of a box and the fill resting on
  // it, when the author had selected the box. Each face is measured instead.
  const loops = closedLoops(sketch, names);
  const profiles: Profile[] = [];
  for (const p of findProfiles(sketch, names)) {
    if (!p.shapeIds.some((id) => wanted.has(id))) continue;
    const faces = loops.filter((l) => l.profileId === p.id);
    if (faces.length > 1) profiles.push(...faces.filter((f) => f.shapeIds.some((id) => wanted.has(id))));
    else profiles.push(p);
  }
  const out: Measurable[] = [];

  for (const profile of profiles) {
    const lone = loneSegmentOf(sketch, profile);

    if (lone) {
      // A line: length, and where each end is. No width, no height.
      const a = sketch.points[lone.p1];
      const b = sketch.points[lone.p2];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 1e-6) {
        out.push({
          id: `len_${profile.id}`,
          label: `${profile.label} length`,
          kind: "distance",
          points: [lone.p1, lone.p2],
          value: length,
          suggestedName: `${cleanName(profile.label)}Length`,
        });
      }
      const ends: [string, string, { x: number; y: number }][] = [
        ["start", lone.p1, a],
        ["end", lone.p2, b],
      ];
      for (const [which, pid, pt] of ends) {
        for (const axis of ["x", "y"] as const) {
          out.push({
            id: `pos_${pid}_${axis}`,
            label: `${profile.label} ${which} ${axis.toUpperCase()}`,
            kind: axis === "x" ? "position_x" : "position_y",
            points: [pid],
            value: pt[axis],
            suggestedName: `${cleanName(profile.label)}${which === "start" ? "Start" : "End"}${axis.toUpperCase()}`,
          });
        }
      }
      continue;
    }

    // Where the profile sits. Offered for everything that is not a lone line,
    // which already got its two ends above — a closed shape has one position,
    // not one per corner.
    const anchor = anchorVertexOf(sketch, profile);
    if (anchor) {
      const p = sketch.points[anchor];
      for (const axis of ["x", "y"] as const) {
        out.push({
          id: `pos_${profile.id}_${axis}`,
          label: `${profile.label} position ${axis.toUpperCase()}`,
          kind: axis === "x" ? "position_x" : "position_y",
          points: [anchor],
          value: p[axis],
          suggestedName: `${cleanName(profile.label)}${axis.toUpperCase()}`,
        });
      }
    }

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

// ---------------------------------------------------------------------------
// Relationships between whole shapes (notebook pages 4-6 and 9)
// ---------------------------------------------------------------------------

/**
 * The ways two lines can be held relative to one another.
 *
 * The notebook asks for this directly: "if I move line l-1 to move left along
 * -x axis and create a relation ... distance b/w lines is maintained". A plain
 * distance cannot say it, because distance is unsigned — it pins how far apart
 * two lines are and says nothing about which side, so the solver is free to
 * flip one through the other and still report zero.
 */
export type LineRelationKind = "relative_x" | "relative_y" | "normal_offset";

export interface LineRelationOption {
  kind: LineRelationKind;
  label: string;
  /** What it measures right now, in mm. */
  measured: number;
  rationale: string;
}

function midpoint(sketch: AuthoringSketch, segId: string): { x: number; y: number } | null {
  const seg = sketch.segments[segId];
  if (!seg) return null;
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Every way the author could tie `segB` to `segA`, measured as drawn. */
export function lineRelationOptions(
  sketch: AuthoringSketch,
  segA: string,
  segB: string
): LineRelationOption[] {
  const ma = midpoint(sketch, segA);
  const mb = midpoint(sketch, segB);
  if (!ma || !mb) return [];

  const a1 = sketch.points[sketch.segments[segA].p1];
  const a2 = sketch.points[sketch.segments[segA].p2];
  const b1 = sketch.points[sketch.segments[segB].p1];
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const L = Math.hypot(dx, dy);
  const normal = L < 1e-9 ? 0 : (-dy * (b1.x - a1.x) + dx * (b1.y - a1.y)) / L;

  return [
    {
      kind: "relative_x",
      label: "Hold them a set distance apart across the sheet",
      measured: mb.x - ma.x,
      rationale:
        "The horizontal gap becomes a number you can type, and it stays that number when either line moves. Independent of the vertical gap, so the two can be driven separately.",
    },
    {
      kind: "relative_y",
      label: "Hold them a set distance apart up the sheet",
      measured: mb.y - ma.y,
      rationale: "The same, measured up and down instead of across.",
    },
    {
      kind: "normal_offset",
      label: "Hold a true thickness between them",
      measured: normal,
      rationale:
        "Measured square to the first line rather than along an axis, so it keeps its meaning if the pair is rotated. It is signed, so the second line cannot pass through the first and come out the other side.",
    },
  ];
}

/**
 * Creates one of those relationships.
 *
 * The measured value becomes the target, so nothing moves when the relationship
 * is made — it records what the author already drew and then holds it. A rule
 * that jumped the geometry the moment you agreed to it would be a rule nobody
 * could trust.
 */
export function relateLines(
  sketch: AuthoringSketch,
  segA: string,
  segB: string,
  kind: LineRelationKind,
  labelA: string,
  labelB: string,
  names: Record<string, string> = {}
): { sketch: AuthoringSketch; refused?: string; warning?: string; atRisk?: string[] } {
  if (segA === segB) return { sketch, refused: "Those are the same edge." };
  const option = lineRelationOptions(sketch, segA, segB).find((o) => o.kind === kind);
  if (!option) return { sketch, refused: "Those two edges cannot be related." };

  const word =
    kind === "relative_x" ? "across" : kind === "relative_y" ? "up the sheet" : "square to it";

  const constraint: Omit<SketchConstraint, "id"> = {
    kind,
    points: [],
    segments: [segA, segB],
    value: option.measured,
    strength: "hard",
    driving: true,
    state: "active",
    label: `${labelB} stays ${Math.abs(option.measured).toFixed(1)} from ${labelA}, ${word}`,
    provenance: makeProvenance(
      "user",
      `The author tied ${labelB} to ${labelA}. Nothing in the drawing implied it; it is a design decision.`
    ),
  };

  const next = applyAction(sketch, {
    id: `relate_${kind}_${segA}_${segB}`,
    title: constraint.label,
    rationale: option.rationale,
    createsParameters: [],
    createsConstraints: [constraint],
    evidence: [],
    dofRemoved: 0,
  });

  if (next === sketch) {
    return {
      sketch,
      refused: `${labelB}'s position relative to ${labelA} is already decided by the rules in force, so this would be a second answer to the same question.`,
    };
  }

  // Holding one edge against another moves that edge. Whether the rest of the
  // shape comes with it is a question about the SHAPE, not about the rule, and
  // it is worth answering before the author discovers it from a skewed outline.
  const involved = [sketch.segments[segA]?.shapeId, sketch.segments[segB]?.shapeId].filter(
    (v): v is string => Boolean(v)
  );
  const risks = shapesAtRisk(next, involved, names);
  return {
    sketch: next,
    warning: shapeRiskWarning(risks) ?? undefined,
    atRisk: risks.length > 0 ? involved : undefined,
  };
}

/**
 * Profiles in a relationship that can still change shape.
 *
 * Returned rather than refused. A relationship between two floppy shapes is
 * perfectly legal and sometimes exactly what is wanted — a rubber band between
 * two things that are both still being designed. What is NOT wanted is finding
 * out afterwards, from a trapezoid, so the caller is told and can offer to hold
 * the shapes first.
 */
export function shapesAtRisk(
  sketch: AuthoringSketch,
  shapeIds: string[],
  names: Record<string, string> = {}
): ShapeFreedom[] {
  const wanted = new Set(shapeIds);
  return findProfiles(sketch, names)
    .filter((p) => p.shapeIds.some((id) => wanted.has(id)))
    .map((p) => shapeFreedomOf(sketch, p))
    .filter((f) => f.internal > 0);
}

/** One sentence naming what will deform, or null when nothing will. */
export function shapeRiskWarning(risks: ShapeFreedom[]): string | null {
  if (risks.length === 0) return null;
  const names = risks.map((r) => r.label);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} can still change shape, so this rule may squash ${
    names.length === 1 ? "it" : "them"
  } instead of moving ${names.length === 1 ? "it" : "them"}. Hold the shape first to be sure ${
    names.length === 1 ? "it moves" : "they move"
  } as drawn.`;
}

/**
 * Makes each named profile a unit that moves as one piece.
 *
 * The remedy that goes with the warning, in one call, so agreeing to it is a
 * click rather than a detour through Step 5 with the selection rebuilt by hand.
 * A profile already inside a rigid unit is left alone.
 */
export function holdShapes(
  sketch: AuthoringSketch,
  shapes: Shape[],
  shapeIds: string[],
  names: Record<string, string> = {}
): { sketch: AuthoringSketch; held: string[] } {
  const wanted = new Set(shapeIds);
  let next = sketch;
  const held: string[] = [];

  for (const profile of findProfiles(sketch, names)) {
    if (!profile.shapeIds.some((id) => wanted.has(id))) continue;
    const freedom = shapeFreedomOf(next, profile);
    if (freedom.rigid || freedom.internal === 0) continue;
    // A profile whose shapes are already claimed by another rigid unit cannot
    // have a second frame; skip it rather than throwing.
    const claimed = next.components.some(
      (c) => c.rigid && c.shapeIds.some((id) => profile.shapeIds.includes(id))
    );
    if (claimed) continue;

    const made = createComponent(next, shapes, profile.shapeIds, profile.label);
    next = setComponentRigid(made.sketch, made.component.id, true);
    held.push(profile.label);
  }

  return { sketch: next, held };
}

/**
 * Ties two shapes together by the distance between their centres.
 *
 * The notebook's third problem: "I want something that I can build a
 * relationship b/w centers/centroid of 2 shapes ... so when I try to close them
 * the rectangles also start coming closer too." Both shapes move, because the
 * minimum-norm step spreads the correction over whatever is free — nothing here
 * picks a winner.
 */
export function relateCentroids(
  sketch: AuthoringSketch,
  loopA: string[],
  loopB: string[],
  labelA: string,
  labelB: string,
  paramName?: string,
  names: Record<string, string> = {}
): { sketch: AuthoringSketch; refused?: string; warning?: string; atRisk?: string[] } {
  if (loopA.length < 3 || loopB.length < 3) {
    return { sketch, refused: "A centre needs a closed shape with at least three corners on each side." };
  }
  const centre = (loop: string[]) => {
    let x = 0;
    let y = 0;
    for (const id of loop) {
      const p = sketch.points[id];
      if (!p) return null;
      x += p.x;
      y += p.y;
    }
    return { x: x / loop.length, y: y / loop.length };
  };
  const ca = centre(loopA);
  const cb = centre(loopB);
  if (!ca || !cb) return { sketch, refused: "One of those shapes has a corner the sketch does not hold." };

  const measured = Math.hypot(cb.x - ca.x, cb.y - ca.y);
  if (measured < 1e-6) {
    return { sketch, refused: "Those two centres are already in the same place; there is no distance to drive." };
  }

  const name = paramName
    ? uniqueParameterName(cleanName(paramName), sketch.parameters)
    : uniqueParameterName(`${cleanName(labelA)}To${cleanName(labelB)}Centres`, sketch.parameters);

  const constraint: Omit<SketchConstraint, "id"> = {
    kind: "centroid_distance",
    points: [],
    segments: [],
    loopA: [...loopA],
    loopB: [...loopB],
    paramRef: name,
    strength: "hard",
    driving: true,
    state: "active",
    label: `${labelA} and ${labelB} stay ${name} apart, centre to centre`,
    provenance: makeProvenance(
      "user",
      `The author tied the centres of ${labelA} and ${labelB} together. Changing the value moves both shapes towards or away from each other.`
    ),
  };

  const next = applyAction(sketch, {
    id: `centres_${loopA[0]}_${loopB[0]}`,
    title: constraint.label,
    rationale:
      "The distance between the two centres becomes a value you can type. Lowering it brings both shapes in; raising it pushes both out.",
    createsParameters: [
      {
        name,
        value: Math.round(measured * 100) / 100,
        role: "DRIVING",
        unit: "mm",
        uiGroup: "Spacing",
        description: `Centre-to-centre distance between ${labelA} and ${labelB}.`,
      },
    ],
    createsConstraints: [constraint],
    evidence: [`Measured ${measured.toFixed(1)} mm between the two centres`],
    dofRemoved: 0,
  });

  if (next === sketch || !next.parameters[name]) {
    return {
      sketch,
      refused: `The distance between those two centres is already decided by the rules in force, so naming it would be a second answer to one question.`,
    };
  }

  // The centre of a shape that can change shape is a moving target. Driving the
  // gap between two of them has more than one answer, and the cheapest is
  // usually the one nobody wants: deform both until the centres are where they
  // were asked to be. Say so now, while it is one click to prevent.
  const involved = [...loopA, ...loopB].flatMap((id) => sketch.points[id]?.owners ?? []);
  const risks = shapesAtRisk(next, involved, names);
  return {
    sketch: next,
    warning: shapeRiskWarning(risks) ?? undefined,
    atRisk: risks.length > 0 ? [...new Set(involved)] : undefined,
  };
}

/** An edge the author can point at, with a name they will recognise. */
export interface SelectableEdge {
  segmentId: string;
  label: string;
  length: number;
  /** Which way it runs, for a sentence that reads like a drawing note. */
  orientation: "horizontal" | "vertical" | "sloping";
}

/** Every edge the given shapes contribute, labelled for a picker. */
export function edgesIn(
  sketch: AuthoringSketch,
  shapeIds: string[],
  names: Record<string, string> = {}
): SelectableEdge[] {
  const wanted = new Set(shapeIds);
  const out: SelectableEdge[] = [];

  for (const [id, seg] of Object.entries(sketch.segments)) {
    if (!wanted.has(seg.shapeId)) continue;
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const orientation =
      Math.abs(dy) < Math.abs(dx) * 0.05
        ? "horizontal"
        : Math.abs(dx) < Math.abs(dy) * 0.05
          ? "vertical"
          : "sloping";
    const shapeName = names[seg.shapeId] ?? seg.shapeId;
    // A four-sided shape's edges read better by side than by index.
    const side =
      orientation === "horizontal"
        ? a.y < b.y || Math.abs(a.y - b.y) < 1e-9
          ? `edge ${seg.edgeIndex + 1}`
          : `edge ${seg.edgeIndex + 1}`
        : `edge ${seg.edgeIndex + 1}`;
    out.push({
      segmentId: id,
      label: `${shapeName} ${side} (${orientation})`,
      length: Math.hypot(dx, dy),
      orientation,
    });
  }

  return out.sort((m, n) => m.label.localeCompare(n.label));
}

/** Closed profiles among the given shapes, as ordered boundary point lists. */
export function loopsIn(
  sketch: AuthoringSketch,
  shapeIds: string[],
  names: Record<string, string> = {}
): Array<{ id: string; label: string; loop: string[] }> {
  const wanted = new Set(shapeIds);
  const out: Array<{ id: string; label: string; loop: string[] }> = [];

  for (const profile of findProfiles(sketch, names)) {
    if (!profile.shapeIds.some((id) => wanted.has(id))) continue;
    // The centroid needs the boundary IN ORDER. An unordered vertex set has no
    // shoelace area, and a wrong order produces a self-crossing polygon whose
    // signed area — and therefore centroid — is meaningless.
    const loop = profileLoopIds(sketch, profile);
    if (!loop || loop.length < 3) continue;
    out.push({ id: profile.id, label: profile.label, loop });
  }

  return out;
}
