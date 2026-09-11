/**
 * The Constraint Completion Assistant.
 *
 * §4 of the repair brief: a draftsman must not be shown `DOF: 7` and left alone.
 * This module answers "how do I make this behave the way I meant?" by proposing
 * concrete, admissible actions and — where several different design intents are
 * equally valid — asking which one the author means instead of picking for them.
 *
 * Two rules keep it honest:
 *
 *   1. Every DOF figure printed on a card is measured, not assumed. The action
 *      is applied to a scratch copy of the sketch and the Jacobian rank is
 *      recomputed; the difference is what the card reports.
 *
 *   2. Leaving geometry deliberately free is always an offered option. §26 of
 *      the brief is explicit that "every sketch must be rigid" is the dangerous
 *      reading, so intentional freedom is a first-class answer here.
 */

import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import {
  AuthoringSketch,
  SketchConstraint,
  SketchParameter,
  ParameterUnit,
  ParameterRole,
} from "./types";
import { analyseDof, countDof } from "./dof";
import { uniqueParameterName, makeProvenance, dependenciesOf } from "./parameters";
import { findProfiles, profileLoop, pointInLoop, longestSegment, Profile } from "./profile";
import { buildSystem, evaluateSystem, evaluateConstraint } from "./residuals";
import { isRowIndependent } from "./admissibility";

export interface ParameterDraft {
  name: string;
  value: number;
  role: ParameterRole;
  unit: ParameterUnit;
  uiGroup: string;
  description: string;
}

export interface IntentAction {
  id: string;
  title: string;
  /** Why this is being offered, in one sentence. */
  rationale: string;
  createsParameters: ParameterDraft[];
  createsConstraints: Omit<SketchConstraint, "id">[];
  /**
   * Turns an existing DRIVING value into a DERIVED one.
   *
   * This is how the container/contents answer is expressed: "the frame grows to
   * fit" does not add a constraint, it changes who decides the frame's width
   * from the user to the drawing. The degrees of freedom do not move, which is
   * why such an action is offered on its own merits rather than on a DOF count.
   */
  convertToDerived?: { name: string; expr: string };
  /**
   * Constraints to switch off because the action makes them redundant.
   *
   * Choosing "the frame grows to fit" means the far end of the frame is now a
   * CONSEQUENCE of the arithmetic. Leaving a geometric row that also demands it
   * is harmless while the count is 1 — the DOF report calls it redundant — and
   * becomes a flat contradiction the moment the count is 2. Switching it off is
   * part of the decision, not a separate chore for the author.
   */
  suppressConstraints?: string[];
  /** Measured on a scratch copy, never assumed. */
  dofRemoved: number;
  evidence: string[];
  /** The "do nothing, this freedom is intended" option. */
  isDeliberateFreedom?: boolean;
  /**
   * Offer this even though it removes no freedom. Reserved for actions that
   * change WHO decides a value rather than how much is decided.
   */
  alwaysOffer?: boolean;
}

export interface FreedomGroup {
  id: string;
  /** What is still free, in plain words. */
  motion: string;
  /** The design question the author has to answer. */
  question: string;
  options: IntentAction[];
  /**
   * Set when the question is real but cannot be answered yet, naming the
   * measurement that has to exist first.
   *
   * A question with no answerable options used to be dropped on the floor, and
   * the one that matters most — "when the count changes, what happens to the
   * frame?" — needs two named spans before its formula can even be written. An
   * author who had not named them saw nothing at all, changed the count, watched
   * the frame stay put, and had no way to find out why. §4 of the repair brief
   * is explicit that the system must say what is missing rather than leave the
   * draftsman alone with a number.
   */
  blockedBy?: string;
}

export interface CompletionReport {
  dof: number;
  anchored: boolean;
  /** Single-answer fixes: anchoring, orientation. Offered before the questions. */
  quickFixes: IntentAction[];
  /** Where more than one design intent is valid. */
  groups: FreedomGroup[];
}

// ---------------------------------------------------------------------------
// Nesting analysis — rotation invariant, no bounding boxes.
// ---------------------------------------------------------------------------

export interface OffsetFinding {
  /** Profiles, not drawn shapes: an eight-line cell is one inner profile. */
  outer: Profile;
  inner: Profile;
  /** Outer edge the inner points sit off. */
  outerEdgeId: string;
  /** Inner corner points measured against that edge. */
  innerPointIds: string[];
  /** Perpendicular distance in mm, always positive. */
  distance: number;
  /**
   * Handedness of that distance in the solver's signed convention. A thickness
   * parameter is a positive number; this records which way round the face is so
   * the same positive value can drive both sides of a wall.
   */
  sign: 1 | -1;
  /** Which side of the outer loop this is, for wording only. */
  sideLabel: string;
}

/**
 * Finds profiles nested inside other profiles and measures the clearance from
 * each face of the outer profile to the inner one.
 *
 * The clearance from one outer FACE is the smallest perpendicular distance from
 * that face to the inner profile, measured only where the foot of the
 * perpendicular actually lands on the face. Measuring per-face rather than
 * assigning each corner to its single nearest edge matters: a corner of a
 * concentric rectangle is exactly equidistant from two faces, and "nearest edge
 * wins" would silently give both side clearances away to the top and bottom and
 * then report no horizontal relationship at all.
 */
export function findOffsets(
  sketch: AuthoringSketch,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY,
  names: Record<string, string> = {}
): OffsetFinding[] {
  const profiles = findProfiles(sketch, names);
  const loops = new Map<string, { x: number; y: number }[]>();
  for (const prof of profiles) {
    const l = profileLoop(sketch, prof);
    if (l) loops.set(prof.id, l);
  }

  const out: OffsetFinding[] = [];

  for (const outer of profiles) {
    const outerLoop = loops.get(outer.id);
    if (!outerLoop) continue;

    for (const inner of profiles) {
      if (inner.id === outer.id) continue;
      const innerPts = inner.pointIds;
      if (innerPts.length < 2) continue;
      const allInside = innerPts.every((pid) => {
        const p = sketch.points[pid];
        return p && pointInLoop(outerLoop, p);
      });
      if (!allInside) continue;

      for (const segId of outer.segmentIds) {
        const seg = sketch.segments[segId];
        const a = sketch.points[seg.p1];
        const b = sketch.points[seg.p2];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;

        let best = Infinity;
        let bestSigned = 0;
        const onFace: { id: string; d: number; signed: number }[] = [];
        for (const pid of innerPts) {
          const p = sketch.points[pid];
          const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
          if (t < -1e-9 || t > 1 + 1e-9) continue;
          // Signed exactly as `point_line_distance` measures it, so the sign can
          // be handed straight to the constraint.
          const signed = ((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
          const d = Math.abs(signed);
          onFace.push({ id: pid, d, signed });
          if (d < best) {
            best = d;
            bestSigned = signed;
          }
        }
        if (!isFinite(best) || onFace.length === 0) continue;

        const touching = onFace.filter((e) => e.d - best <= policy.cluster_mm);
        out.push({
          outer,
          inner,
          outerEdgeId: segId,
          innerPointIds: touching.map((e) => e.id).sort(),
          distance: best,
          sign: bestSigned < 0 ? -1 : 1,
          sideLabel: faceLabel(sketch, segId),
        });
      }
    }
  }

  return out;
}

/**
 * Names a face by the direction it points, not by its index.
 *
 * Edge index only means "top/right/bottom/left" for a rectangle drawn with the
 * rectangle tool. A profile assembled from separate lines has no such ordering,
 * so the face is named from its outward normal, which is true for any profile
 * drawn any way round.
 */
function faceLabel(sketch: AuthoringSketch, segId: string): string {
  const seg = sketch.segments[segId];
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return "side";
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return "top and bottom face";
  }
  return "left and right face";
}

/** Which axis a face constrains: a horizontal face pins vertical position. */
function faceAxis(sketch: AuthoringSketch, segId: string): "vertical" | "horizontal" {
  const seg = sketch.segments[segId];
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return "horizontal";
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "vertical" : "horizontal";
}

// ---------------------------------------------------------------------------
// Measuring an action's real effect.
// ---------------------------------------------------------------------------

/** Applies an action to a scratch copy and returns the actual DOF it removes. */
export function measureAction(sketch: AuthoringSketch, action: IntentAction): number {
  if (action.isDeliberateFreedom) return 0;
  const before = countDof(sketch);
  const after = countDof(applyAction(sketch, action));
  return Math.max(0, before - after);
}

/** Commits an action: creates its parameters, then its constraints. */
export function applyAction(sketch: AuthoringSketch, action: IntentAction): AuthoringSketch {
  if (action.isDeliberateFreedom) {
    if (action.id.startsWith("array_free_")) {
      const ruleId = action.id.replace("array_free_", "");
      return {
        ...sketch,
        repeats: sketch.repeats.map((r) =>
          r.id === ruleId ? { ...r, enclosureCoupling: "independent" as const } : r
        ),
      };
    }
    return sketch;
  }

  const parameters = { ...sketch.parameters };

  // Converting a driving value to a derived one: the constraint that reads it
  // stays exactly as it was, so the geometry keeps obeying the same rule. What
  // changes is where the number comes from.
  if (action.convertToDerived) {
    const target = parameters[action.convertToDerived.name];
    if (target) {
      parameters[action.convertToDerived.name] = {
        ...target,
        role: "DERIVED",
        expr: action.convertToDerived.expr,
        published: false,
        provenance: makeProvenance(
          "completion-assistant",
          `The author decided this follows the drawing rather than being typed: ${action.convertToDerived.name} = ${action.convertToDerived.expr}.`
        ),
      };
    }
  }
  const rename = new Map<string, string>();

  for (const draft of action.createsParameters) {
    const name = uniqueParameterName(draft.name, parameters);
    rename.set(draft.name, name);
    const param: SketchParameter = {
      name,
      role: draft.role,
      type: draft.unit === "count" ? "COUNT" : draft.unit === "deg" ? "ANGLE" : "LENGTH",
      unit: draft.unit,
      value: draft.value,
      provenance: makeProvenance("completion-assistant", draft.description),
      boundConstraints: [],
      published: draft.role === "DRIVING",
      uiGroup: draft.uiGroup,
      description: draft.description,
    };
    parameters[name] = param;
  }

  const suppress = new Set(action.suppressConstraints ?? []);
  const constraints = sketch.constraints.map((c) =>
    suppress.has(c.id)
      ? {
          ...c,
          state: "suppressed" as const,
          diagnostic:
            "Switched off because the value it enforced is now worked out by the drawing. Turning it back on would contradict that.",
        }
      : c
  );
  // Every constraint an action creates goes through the same SVD admissibility
  // gate that a detected candidate does (§32).
  //
  // Without it the assistant can hand the model a second, independent way of
  // saying something it already says — two parameters for one length, say. That
  // is invisible while the two agree: the DOF report calls the extra row
  // redundant and everything solves. It becomes a contradiction the instant one
  // of them is asked to change, which is how a frame told to grow with a repeat
  // count ended up refusing to solve at count 2 while looking perfectly healthy
  // at count 1.
  const sys = buildSystem({ ...sketch, parameters, constraints });
  const running = evaluateSystem({ ...sketch, parameters, constraints }, sys, sys.X).jacobian.map((r) =>
    Array.from(r)
  );

  let admitted = 0;
  action.createsConstraints.forEach((draft, i) => {
    const id = `c_${action.id}_${i}_${Date.now().toString(36)}`;
    const paramRef = draft.paramRef ? rename.get(draft.paramRef) ?? draft.paramRef : undefined;
    const candidate = { ...draft, id, paramRef };

    const probeSketch = { ...sketch, parameters, constraints };
    let adds = 0;
    try {
      const evaluation = evaluateConstraint(probeSketch, candidate, sys.X, sys.index);
      for (const row of evaluation.jacobian) {
        const verdict = isRowIndependent(running, row);
        if (verdict.isAdmissible) {
          running.push(Array.from(row));
          adds++;
        }
      }
    } catch {
      // A constraint the system cannot even evaluate is not one to add.
      return;
    }
    if (adds === 0) return;

    admitted++;
    constraints.push(candidate);
    if (paramRef && parameters[paramRef]) {
      parameters[paramRef] = {
        ...parameters[paramRef],
        boundConstraints: [...parameters[paramRef].boundConstraints, id],
      };
    }
  });

  // Nothing survived the gate, so the action changes nothing. Do not leave the
  // parameters it would have created behind as orphans.
  if (admitted === 0 && action.createsConstraints.length > 0 && !action.convertToDerived) {
    return sketch;
  }
  for (const draft of action.createsParameters) {
    const name = rename.get(draft.name);
    if (name && parameters[name] && parameters[name].boundConstraints.length === 0) {
      delete parameters[name];
    }
  }

  let repeats = sketch.repeats;
  if (action.id.startsWith("array_grow_")) {
    const ruleId = action.id.replace("array_grow_", "");
    repeats = repeats.map((r) =>
      r.id === ruleId ? { ...r, enclosureCoupling: "grow" as const } : r
    );
  } else if (action.id.startsWith("array_fit_")) {
    const ruleId = action.id.replace("array_fit_", "");
    repeats = repeats.map((r) =>
      r.id === ruleId ? { ...r, enclosureCoupling: "fit" as const } : r
    );
  }

  return { ...sketch, parameters, constraints, repeats };
}

// ---------------------------------------------------------------------------
// The proposals.
// ---------------------------------------------------------------------------


export function suggestCompletion(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string> = {},
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): CompletionReport {
  const report = analyseDof(sketch, shapeNames, policy);
  const profiles = findProfiles(sketch, shapeNames);
  const quickFixes: IntentAction[] = [];
  const groups: FreedomGroup[] = [];

  // The container/contents question is asked FIRST and asked always.
  //
  // It is not a degrees-of-freedom question: "when the count changes, should the
  // frame grow?" is about who decides a value, not about how much movement is
  // left. A fully constrained drawing with a repeat in it still has to answer
  // it, and returning early on DOF = 0 is exactly why a draftsman could array a
  // cell, see "Fully defined", and still watch the second copy land outside the
  // frame with nothing on screen offering to fix it.
  const offsetsForArray = findOffsets(sketch, policy, shapeNames);
  const arrayGroups = arrayContainerQuestions(sketch, profiles, offsetsForArray, policy);

  if (report.dof === 0) {
    return {
      dof: 0,
      anchored: report.anchored,
      quickFixes,
      groups: measureGroups(sketch, arrayGroups),
    };
  }

  const host = biggestProfile(sketch, profiles);

  // ---- 1. Anchoring. Always first: it removes the two motions that make every
  //         other diagnosis misleading (§18 anchor rule).
  if (!report.anchored && host) {
    const corner = [...host.pointIds].sort()[0];
    const p = sketch.points[corner];
    if (p) {
      quickFixes.push(
        withMeasured(sketch, {
          id: "anchor",
          title: `Pin ${host.label} to the sheet`,
          rationale:
            "Nothing currently holds the drawing in place, so the whole sketch can slide. Pinning one corner is what every CAD sketch starts with.",
          createsParameters: [],
          createsConstraints: [
            {
              kind: "fix",
              points: [corner],
              segments: [],
              value: p.x,
              valueY: p.y,
              strength: "hard",
              driving: true,
              state: "active",
              label: `${host.label} is pinned to the sheet`,
              provenance: makeProvenance(
                "completion-assistant",
                "Anchors the sketch so the remaining freedom describes the design, not the paper position."
              ),
            },
          ],
          evidence: [`Corner at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) mm`],
          dofRemoved: 0,
        })
      );
    }
  }

  // ---- 2. Whole-sketch orientation, if it can still spin as one piece.
  if (report.motions.some((m) => m.kind === "rotation") && host) {
    const axisAction = axisOption(sketch, host, "orient");
    if (axisAction) quickFixes.push(withMeasured(sketch, axisAction));
  }

  groups.push(...orientationQuestions(sketch, profiles));
  groups.push(...sizeQuestions(sketch, profiles));
  groups.push(...edgeQuestions(sketch, profiles, shapeNames, policy));

  // The design question this system exists to ask: what holds the inner profile
  // in place inside the outer one? Equal pairs become one named thickness (§7.2).
  groups.push(...clearanceQuestions(sketch, offsetsForArray, policy));
  groups.push(...positionQuestions(sketch, profiles, offsetsForArray, host));

  groups.push(...arrayGroups);

  return {
    dof: report.dof,
    anchored: report.anchored,
    quickFixes: quickFixes.filter((q) => q.dofRemoved > 0),
    groups: measureGroups(sketch, groups),
  };
}

/**
 * Measure every option for real, then drop the ones that would change nothing.
 *
 * An option that removes no freedom is already implied by something the author
 * accepted earlier, and offering it invites them to click a button that does
 * nothing. The exception is an option marked `alwaysOffer`, which changes who
 * decides a value rather than how much freedom is left.
 */
function measureGroups(sketch: AuthoringSketch, groups: FreedomGroup[]): FreedomGroup[] {
  const before = countDof(sketch);
  const measure = (o: IntentAction): IntentAction =>
    o.isDeliberateFreedom
      ? o
      : { ...o, dofRemoved: Math.max(0, before - countDof(applyAction(sketch, o))) };
  return groups
    .map((g) => ({
      ...g,
      options: g.options
        .map(measure)
        .filter((o) => o.dofRemoved > 0 || o.isDeliberateFreedom || o.alwaysOffer),
    }))
    .filter((g) => g.blockedBy || g.options.some((o) => o.dofRemoved > 0 || o.alwaysOffer));
}

function withMeasured(sketch: AuthoringSketch, action: IntentAction): IntentAction {
  return { ...action, dofRemoved: measureAction(sketch, action) };
}

function biggestProfile(sketch: AuthoringSketch, profiles: Profile[]): Profile | null {
  let best: Profile | null = null;
  let bestSpan = -1;
  for (const prof of profiles) {
    const pts = prof.pointIds.map((id) => sketch.points[id]).filter(Boolean);
    if (pts.length === 0) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const span = Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys));
    if (span > bestSpan) {
      bestSpan = span;
      best = prof;
    }
  }
  return best;
}

/**
 * "Hold this to an axis", offered only when an axis is actually what the edge is
 * near. Offering "hold horizontal" for a 45-degree haunch is how the assistant
 * used to talk a draftsman into wrecking their own geometry.
 */
function axisOption(sketch: AuthoringSketch, profile: Profile, idPrefix: string): IntentAction | null {
  const segId = longestSegment(sketch, profile);
  if (!segId) return null;
  const seg = sketch.segments[segId];
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return null;

  const angle = (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) + 360) % 180;
  const fromHorizontal = Math.min(angle, 180 - angle);
  const fromVertical = Math.abs(90 - angle);
  const NEAR_AXIS_DEG = 5;

  let kind: "horizontal" | "vertical";
  if (fromHorizontal <= NEAR_AXIS_DEG) kind = "horizontal";
  else if (fromVertical <= NEAR_AXIS_DEG) kind = "vertical";
  else return null;

  return {
    id: `${idPrefix}_axis_${segId}`,
    title: `Hold ${profile.label} ${kind}`,
    rationale:
      "The drawing can still rotate. Holding its longest edge to an axis settles the orientation, and the longest edge is the one whose direction the rest of the profile follows.",
    createsParameters: [],
    createsConstraints: [
      {
        kind,
        points: [],
        segments: [segId],
        strength: "hard",
        driving: true,
        state: "active",
        label: `${profile.label} stays ${kind}`,
        provenance: makeProvenance(
          "completion-assistant",
          "Settles the orientation so later dimension changes cannot rotate the drawing."
        ),
      },
    ],
    evidence: [`Longest edge is currently ${fromHorizontal.toFixed(2)}° off horizontal`],
    dofRemoved: 0,
  };
}

/**
 * A profile that keeps its own internal shape can still turn as a unit. The two
 * ordinary intents are "line it up with something else in the drawing" and
 * "hold it to an axis"; both are offered, and so is leaving it free.
 */
function orientationQuestions(sketch: AuthoringSketch, profiles: Profile[]): FreedomGroup[] {
  const groups: FreedomGroup[] = [];

  for (const profile of profiles) {
    const segId = longestSegment(sketch, profile);
    if (!segId) continue;
    const seg = sketch.segments[segId];
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;

    const options: IntentAction[] = [];

    // Line it up with the most nearly parallel edge belonging to another profile.
    let partner: { id: string; label: string; err: number } | null = null;
    for (const other of profiles) {
      if (other.id === profile.id) continue;
      for (const otherSegId of other.segmentIds) {
        const os = sketch.segments[otherSegId];
        const c = sketch.points[os.p1];
        const d = sketch.points[os.p2];
        if (!c || !d) continue;
        const cross = Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x));
        const denom = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(d.x - c.x, d.y - c.y);
        if (denom < 1e-9) continue;
        const err = cross / denom;
        if (!partner || err < partner.err) partner = { id: otherSegId, label: other.label, err };
      }
    }

    if (partner && partner.err < 0.2) {
      options.push({
        id: `orient_par_${segId}`,
        title: `Keep ${profile.label} lined up with ${partner.label}`,
        rationale: `${profile.label} can still turn on its own. Tying its direction to ${partner.label} keeps the two aligned however either one is later resized.`,
        createsParameters: [],
        createsConstraints: [
          {
            kind: "parallel",
            points: [],
            segments: [segId, partner.id],
            strength: "hard",
            driving: true,
            state: "active",
            label: `${profile.label} stays lined up with ${partner.label}`,
            provenance: makeProvenance(
              "completion-assistant",
              `The author chose to tie ${profile.label}'s direction to ${partner.label} rather than to the sheet.`
            ),
          },
        ],
        evidence: [`Currently ${((Math.asin(Math.min(1, partner.err)) * 180) / Math.PI).toFixed(3)}° apart`],
        dofRemoved: 0,
      });
    }

    const axis = axisOption(sketch, profile, `orient_${profile.id}`);
    if (axis) options.push(axis);

    if (options.length === 0) continue;

    // Direction already settled? Nothing to ask.
    //
    // Only an axis lock settles it. `parallel` ties two profiles to EACH OTHER
    // and leaves the pair free to rotate together, so treating it as an answer
    // here hid the rotation question and let an unrelated edge-length constraint
    // end up as the only thing stopping the drawing from spinning.
    const directionHeld = sketch.constraints.some(
      (c) =>
        c.state !== "suppressed" &&
        (c.kind === "horizontal" || c.kind === "vertical") &&
        c.segments.some((sid) => profile.segmentIds.includes(sid))
    );
    if (directionHeld) continue;

    options.push(
      freedomOption(
        `orient_free_${profile.id}`,
        `Leave ${profile.label} free to turn`,
        `${profile.label} is meant to be rotated by hand.`
      )
    );

    groups.push({
      id: `orient_${profile.id}`,
      motion: `${profile.label} can still turn on its own.`,
      question: `What should hold ${profile.label}'s direction?`,
      options,
    });
  }

  return groups;
}

/**
 * Sizing a profile.
 *
 * For a profile the two useful spans are its overall width and height, measured
 * between the extreme vertices along each axis. That works for an eight-line
 * haunched cell exactly as it does for a rectangle, where naming "the top edge"
 * only ever worked because a rectangle's top edge IS its width.
 */
function sizeQuestions(sketch: AuthoringSketch, profiles: Profile[]): FreedomGroup[] {
  const groups: FreedomGroup[] = [];

  for (const profile of profiles) {
    const pts = profile.pointIds.map((id) => ({ id, p: sketch.points[id] })).filter((e) => e.p);
    if (pts.length < 2) continue;

    const options: IntentAction[] = [];

    for (const axis of ["x", "y"] as const) {
      // Already named? Then there is nothing to decide here. Offering it again
      // would create a second parameter driving the same span, which is
      // redundant at best and a conflict as soon as the two disagree.
      if (spanParameterFor(sketch, profile, axis)) continue;
      const sorted = [...pts].sort((m, n) => m.p[axis] - n.p[axis] || (m.id < n.id ? -1 : 1));
      const lo = sorted[0];
      const hi = sorted[sorted.length - 1];
      const span = hi.p[axis] - lo.p[axis];
      if (span < 1) continue;

      const word = axis === "x" ? "width" : "height";
      const paramName = `${cleanIdentifier(profile.label)}${axis === "x" ? "Width" : "Height"}`;

      options.push({
        id: `size_${profile.id}_${axis}`,
        title: `Name ${profile.label}'s ${word} and drive it`,
        rationale: `${profile.label} can still change size. Giving its ${word} a named value turns it into something a project user can type.`,
        createsParameters: [
          {
            name: paramName,
            value: Math.round(span * 100) / 100,
            role: "DRIVING",
            unit: "mm",
            uiGroup: "Overall size",
            description: `${profile.label}'s overall ${word}, measured across the profile when the parameter was created.`,
          },
        ],
        createsConstraints: [
          {
            kind: axis === "x" ? "distance_x" : "distance_y",
            points: [lo.id, hi.id],
            segments: [],
            paramRef: paramName,
            strength: "hard",
            driving: true,
            state: "active",
            label: `${profile.label} ${word} = ${paramName}`,
            provenance: makeProvenance(
              "completion-assistant",
              `Created when the author chose to drive ${profile.label}'s ${word} by a named value.`
            ),
          },
        ],
        evidence: [`Measured ${span.toFixed(2)} mm across the profile`],
        dofRemoved: 0,
      });
    }

    if (options.length === 0) continue;

    options.push(
      freedomOption(
        `size_free_${profile.id}`,
        `Leave ${profile.label}'s size free`,
        `${profile.label} is meant to be resized by hand, not by a parameter.`
      )
    );

    groups.push({
      id: `size_${profile.id}`,
      motion: `${profile.label} can still change size.`,
      question: `What should control ${profile.label}'s size?`,
      options,
    });
  }

  return groups;
}

/**
 * Individual edge lengths — the last-resort question, and the one a draftsman
 * reaches for most often.
 *
 * A profile can be pinned, oriented, sized overall and positioned inside its
 * container and STILL have freedom left: an eight-edge cell whose overall width
 * and height are fixed can trade roof length against haunch projection. Without
 * this question the assistant runs out of things to say while degrees of freedom
 * remain, which is precisely the "DOF: 2, good luck" behaviour the brief forbids.
 *
 * Equal-length groups are offered first because they are almost always the real
 * intent: four haunches that measure the same were meant to be the same, and one
 * named value for all four beats four independent numbers. That is the same
 * collapse-four-into-one move the master plan describes for wall clearances,
 * applied to edges instead of gaps.
 */
function edgeQuestions(
  sketch: AuthoringSketch,
  profiles: Profile[],
  shapeNames: Record<string, string>,
  policy: TolerancePolicy
): FreedomGroup[] {
  const groups: FreedomGroup[] = [];

  for (const profile of profiles) {
    // A profile whose edges run along only two directions — any rectangle or
    // parallelogram — is completely described by its width and height. Asking
    // about its individual edges as well is the same question twice, and the
    // second answer is a duplicate constraint waiting to become a conflict.
    if (edgeDirectionCount(sketch, profile) <= 2) continue;

    const free = profile.segmentIds.filter((segId) => !edgeIsDimensioned(sketch, segId));
    if (free.length === 0) continue;

    const measured = free
      .map((segId) => {
        const seg = sketch.segments[segId];
        const a = sketch.points[seg.p1];
        const b = sketch.points[seg.p2];
        if (!a || !b) return null;
        return { segId, seg, length: Math.hypot(b.x - a.x, b.y - a.y) };
      })
      .filter((e): e is { segId: string; seg: (typeof sketch.segments)[string]; length: number } => e !== null)
      .sort((m, n) => n.length - m.length);

    if (measured.length === 0) continue;

    const options: IntentAction[] = [];

    // Equal-length clusters, largest first.
    const used = new Set<string>();
    for (const seed of measured) {
      if (used.has(seed.segId)) continue;
      const cluster = measured.filter(
        (e) => !used.has(e.segId) && Math.abs(e.length - seed.length) <= policy.cluster_mm
      );
      if (cluster.length < 2) continue;
      for (const e of cluster) used.add(e.segId);

      const paramName = `${clusterName(cluster.map((e) => shapeNames[e.seg.shapeId] ?? e.seg.shapeId), profile.label)}Length`;
      const constraints: Omit<SketchConstraint, "id">[] = [];
      for (let i = 1; i < cluster.length; i++) {
        constraints.push({
          kind: "equal_length",
          points: [],
          segments: [cluster[0].segId, cluster[i].segId],
          strength: "hard",
          driving: true,
          state: "active",
          label: `${profile.label}: these ${cluster.length} edges stay the same length`,
          provenance: makeProvenance(
            "completion-assistant",
            `The author decided the ${cluster.length} edges that measure ${seed.length.toFixed(1)} mm were meant to match.`
          ),
        });
      }
      constraints.push({
        kind: "distance",
        points: [cluster[0].seg.p1, cluster[0].seg.p2],
        segments: [],
        paramRef: paramName,
        strength: "hard",
        driving: true,
        state: "active",
        label: `${profile.label}: matched edges = ${paramName}`,
        provenance: makeProvenance(
          "completion-assistant",
          "One named value drives the whole matched set."
        ),
      });

      options.push({
        id: `edges_equal_${profile.id}_${cluster[0].segId}`,
        title: `Keep ${cluster.length} matching edges equal and name the length`,
        rationale: `${cluster.length} edges of ${profile.label} measure the same within ${policy.cluster_mm} mm. One value for all of them means changing it changes them together.`,
        createsParameters: [
          {
            name: paramName,
            value: Math.round(seed.length * 100) / 100,
            role: "DRIVING",
            unit: "mm",
            uiGroup: "Edge lengths",
            description: `Length shared by ${cluster.length} edges of ${profile.label}.`,
          },
        ],
        createsConstraints: constraints,
        evidence: cluster.map(
          (e) => `${shapeNames[e.seg.shapeId] ?? e.seg.shapeId}: ${e.length.toFixed(2)} mm`
        ),
        dofRemoved: 0,
      });
    }

    // Then individual edges, longest first, capped so the list stays readable.
    for (const e of measured.filter((m) => !used.has(m.segId)).slice(0, 4)) {
      const edgeName = shapeNames[e.seg.shapeId] ?? e.seg.shapeId;
      const paramName = `${cleanIdentifier(edgeName)}Length`;
      options.push({
        id: `edge_${e.segId}`,
        title: `Name ${edgeName}'s length`,
        rationale: `${edgeName} can still change length on its own. Naming it makes it a value rather than something the solver picks.`,
        createsParameters: [
          {
            name: paramName,
            value: Math.round(e.length * 100) / 100,
            role: "DRIVING",
            unit: "mm",
            uiGroup: "Edge lengths",
            description: `Length of ${edgeName}.`,
          },
        ],
        createsConstraints: [
          {
            kind: "distance",
            points: [e.seg.p1, e.seg.p2],
            segments: [],
            paramRef: paramName,
            strength: "hard",
            driving: true,
            state: "active",
            label: `${edgeName} = ${paramName}`,
            provenance: makeProvenance(
              "completion-assistant",
              `The author chose to drive ${edgeName}'s length by a named value.`
            ),
          },
        ],
        evidence: [`Measured ${e.length.toFixed(2)} mm`],
        dofRemoved: 0,
      });
    }

    if (options.length === 0) continue;

    options.push(
      freedomOption(
        `edges_free_${profile.id}`,
        `Leave these edge lengths free`,
        `${profile.label}'s individual edges are meant to be dragged, not typed.`
      )
    );

    groups.push({
      id: `edges_${profile.id}`,
      motion: `${profile.label} can still change shape internally — its overall size is fixed but its edges can trade length with each other.`,
      question: `What sets the length of ${profile.label}'s individual edges?`,
      options,
    });
  }

  return groups;
}

/**
 * Is this edge's length already decided?
 *
 * The axis-aligned forms count too. A frame whose width is driven by a
 * `distance_x` across the same two corners already has its top edge decided, and
 * offering to name that edge again creates a second parameter for one length.
 * They agree at first, so the DOF report only calls it redundant — and then the
 * first time the two are asked to differ it is a flat contradiction. That is
 * exactly how a frame that was told to grow with a repeat count ended up
 * refusing to solve.
 */
/** How many distinct directions the profile's edges run along. */
function edgeDirectionCount(sketch: AuthoringSketch, profile: Profile): number {
  const directions: { x: number; y: number }[] = [];
  for (const segId of profile.segmentIds) {
    const seg = sketch.segments[segId];
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // Direction, not orientation: an edge and its reverse are the same run.
    const known = directions.some((d) => Math.abs(d.x * dir.y - d.y * dir.x) < 0.02);
    if (!known) directions.push(dir);
  }
  return directions.length;
}

function edgeIsDimensioned(sketch: AuthoringSketch, segId: string): boolean {
  const seg = sketch.segments[segId];
  if (!seg) return true;
  const samePair = (c: SketchConstraint) =>
    (c.points[0] === seg.p1 && c.points[1] === seg.p2) ||
    (c.points[0] === seg.p2 && c.points[1] === seg.p1);
  return sketch.constraints.some(
    (c) =>
      c.state !== "suppressed" &&
      Boolean(c.paramRef) &&
      (c.kind === "distance" || c.kind === "distance_x" || c.kind === "distance_y") &&
      samePair(c)
  );
}

/**
 * A name for a matched set, taken from what the draftsman already called them.
 * Four edges named ch_tr, ch_br, ch_bl, ch_tl share the prefix "ch", which is a
 * better name than anything this code could invent.
 */
function clusterName(memberNames: string[], fallback: string): string {
  if (memberNames.length === 0) return cleanIdentifier(fallback);
  let prefix = memberNames[0];
  for (const n of memberNames.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i] === n[i]) i++;
    prefix = prefix.slice(0, i);
  }
  prefix = prefix.replace(/[^A-Za-z0-9]+$/, "");
  return prefix.length >= 2 ? cleanIdentifier(prefix) : cleanIdentifier(fallback);
}

function cleanIdentifier(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "");
  if (!cleaned) return "Profile";
  return /^[0-9]/.test(cleaned) ? `P${cleaned}` : cleaned;
}

function clearanceQuestions(
  sketch: AuthoringSketch,
  offsets: OffsetFinding[],
  policy: TolerancePolicy
): FreedomGroup[] {
  const groups: FreedomGroup[] = [];

  const byPair = new Map<string, OffsetFinding[]>();
  for (const f of offsets) {
    const k = `${f.outer.id}::${f.inner.id}`;
    const arr = byPair.get(k) ?? [];
    arr.push(f);
    byPair.set(k, arr);
  }

  for (const [key, findings] of byPair) {
    const outer = findings[0].outer;
    const inner = findings[0].inner;

    // Opposite faces pair up by the axis they control. Two faces that both pin
    // horizontal position are the pair whose gaps a wall thickness spans.
    for (const axis of ["horizontal", "vertical"] as const) {
      const onAxis = findings.filter((f) => faceAxis(sketch, f.outerEdgeId) === axis);
      if (onAxis.length < 2) continue;
      // If the author has already said what holds this axis, do not ask again.
      const alreadyHeld = onAxis.some((f) =>
        sketch.constraints.some(
          (c) =>
            c.kind === "point_line_distance" &&
            c.state !== "suppressed" &&
            c.segments.includes(f.outerEdgeId) &&
            c.points.some((pt) => inner.pointIds.includes(pt))
        )
      );
      if (alreadyHeld) continue;

      // Take the two extreme faces on this axis: the ones facing each other.
      const sorted = [...onAxis].sort((m, n) => n.distance - m.distance);
      const f1 = sorted[sorted.length - 1];
      const f2 = sorted.find((f) => f.outerEdgeId !== f1.outerEdgeId && f.sign !== f1.sign) ?? sorted[0];
      if (f1.outerEdgeId === f2.outerEdgeId) continue;

      const equal = Math.abs(f1.distance - f2.distance) <= policy.cluster_mm;
      const mean = (f1.distance + f2.distance) / 2;
      const axisWord = axis === "horizontal" ? "left and right" : "top and bottom";
      const suggestedName = axis === "horizontal" ? "WallThickness" : "SlabThickness";

      const containerSpan = spanParameterFor(sketch, outer, axis === "horizontal" ? "x" : "y");
      const innerSpan = spanParameterFor(sketch, inner, axis === "horizontal" ? "x" : "y");

      const options: IntentAction[] = [];

      if (containerSpan && innerSpan) {
        // Both spans are already driving parameters. Holding thickness on BOTH sides
        // is an arithmetic relationship: OuterSpan = InnerSpan + 2 * Thickness.
        // Therefore, one of the two MUST become derived, otherwise both spans stay
        // independent driving numbers and the second gap is silently dropped.
        options.push({
          id: `clear_grow_${outer.id}_${inner.id}_${axis}`,
          title: `${outer.label} grows to fit ${inner.label} with equal ${axisWord} thickness`,
          rationale: `${outer.label}'s size stops being typed and is calculated from ${inner.label} plus equal ${suggestedName} on both sides.`,
          createsParameters: [
            {
              name: suggestedName,
              value: Math.round(mean * 100) / 100,
              role: "DRIVING",
              unit: "mm",
              uiGroup: "Thicknesses",
              description: `Distance held between ${outer.label} and ${inner.label} on both ${axisWord} faces.`,
            },
          ],
          createsConstraints: [
            {
              kind: "point_line_distance" as const,
              points: [f1.innerPointIds[0]],
              segments: [f1.outerEdgeId],
              sign: f1.sign,
              paramRef: suggestedName,
              strength: "hard" as const,
              driving: true,
              state: "active" as const,
              label: `${inner.label} sits ${suggestedName} from ${outer.label}`,
              provenance: makeProvenance(
                "completion-assistant",
                `${outer.label} was derived to fit ${inner.label} plus equal ${suggestedName} on both sides.`,
                { evidence: [`${f1.distance.toFixed(2)} mm and ${f2.distance.toFixed(2)} mm measured`] }
              ),
            },
          ],
          convertToDerived: {
            name: containerSpan,
            expr: `${innerSpan} + 2 * ${suggestedName}`,
          },
          evidence: [
            `${containerSpan} becomes derived: ${innerSpan} + 2 * ${suggestedName}`,
            `Changing ${innerSpan} or ${suggestedName} will automatically adjust ${containerSpan}`,
          ],
          dofRemoved: 1,
        });

        options.push({
          id: `clear_fit_${outer.id}_${inner.id}_${axis}`,
          title: `${inner.label} sizes to fit inside ${outer.label} with equal ${axisWord} thickness`,
          rationale: `${inner.label}'s size stops being typed and is carved out of ${outer.label} minus equal ${suggestedName} on both sides.`,
          createsParameters: [
            {
              name: suggestedName,
              value: Math.round(mean * 100) / 100,
              role: "DRIVING",
              unit: "mm",
              uiGroup: "Thicknesses",
              description: `Distance held between ${outer.label} and ${inner.label} on both ${axisWord} faces.`,
            },
          ],
          createsConstraints: [
            {
              kind: "point_line_distance" as const,
              points: [f1.innerPointIds[0]],
              segments: [f1.outerEdgeId],
              sign: f1.sign,
              paramRef: suggestedName,
              strength: "hard" as const,
              driving: true,
              state: "active" as const,
              label: `${inner.label} sits ${suggestedName} from ${outer.label}`,
              provenance: makeProvenance(
                "completion-assistant",
                `${inner.label} was derived to fit inside ${outer.label} with equal ${suggestedName} on both sides.`,
                { evidence: [`${f1.distance.toFixed(2)} mm and ${f2.distance.toFixed(2)} mm measured`] }
              ),
            },
          ],
          convertToDerived: {
            name: innerSpan,
            expr: `${containerSpan} - 2 * ${suggestedName}`,
          },
          evidence: [
            `${innerSpan} becomes derived: ${containerSpan} - 2 * ${suggestedName}`,
            `Changing ${containerSpan} or ${suggestedName} will automatically adjust ${innerSpan}`,
          ],
          dofRemoved: 1,
        });
      } else {
        options.push({
          id: `clear_equal_${f1.outerEdgeId}_${f2.outerEdgeId}`,
          title: `Keep both ${axisWord} gaps equal and name them`,
          rationale: equal
            ? `The two gaps already measure the same within ${policy.cluster_mm} mm, which usually means one thickness was intended for both.`
            : `The two gaps differ. Choosing this makes them equal at their average and drives both from one value.`,
          createsParameters: [
            {
              name: suggestedName,
              value: Math.round(mean * 100) / 100,
              role: "DRIVING",
              unit: "mm",
              uiGroup: "Thicknesses",
              description: `Distance held between ${outer.label} and ${inner.label} on both ${axisWord} faces.`,
            },
          ],
          createsConstraints: [f1, f2].map((f) => ({
            kind: "point_line_distance" as const,
            points: [f.innerPointIds[0]],
            segments: [f.outerEdgeId],
            sign: f.sign,
            paramRef: suggestedName,
            strength: "hard" as const,
            driving: true,
            state: "active" as const,
            label: `${inner.label} sits ${suggestedName} from ${outer.label}`,
            provenance: makeProvenance(
              "completion-assistant",
              `Both ${axisWord} gaps were bound to one named value, so changing the outside cannot change the thickness.`,
              { evidence: [`${f1.distance.toFixed(2)} mm and ${f2.distance.toFixed(2)} mm measured`] }
            ),
          })),
          evidence: [
            `One face: ${f1.distance.toFixed(2)} mm`,
            `The opposite face: ${f2.distance.toFixed(2)} mm`,
            equal
              ? `Difference ${Math.abs(f1.distance - f2.distance).toFixed(2)} mm — within tolerance`
              : `Difference ${Math.abs(f1.distance - f2.distance).toFixed(2)} mm — they would be averaged`,
          ],
          dofRemoved: 0,
        });
      }

      let side = 0;
      for (const f of [f1, f2]) {
        side++;
        const paramName = `${axis === "horizontal" ? "Side" : "End"}Clearance${side}`;
        options.push({
          id: `clear_one_${f.outerEdgeId}`,
          title: `Fix only one of the ${axisWord} gaps`,
          rationale: `Use this when one clearance is the one that matters and the opposite side is free to take up the difference.`,
          createsParameters: [
            {
              name: paramName,
              value: Math.round(f.distance * 100) / 100,
              role: "DRIVING",
              unit: "mm",
              uiGroup: "Clearances",
              description: `Distance from ${outer.label} to ${inner.label} on one face.`,
            },
          ],
          createsConstraints: [
            {
              kind: "point_line_distance",
              points: [f.innerPointIds[0]],
              segments: [f.outerEdgeId],
              sign: f.sign,
              paramRef: paramName,
              strength: "hard",
              driving: true,
              state: "active",
              label: `${inner.label} is held off ${outer.label}`,
              provenance: makeProvenance(
                "completion-assistant",
                "The author chose to control this clearance directly and let the opposite side follow."
              ),
            },
          ],
          evidence: [`Measured ${f.distance.toFixed(2)} mm`],
          dofRemoved: 0,
        });
      }

      options.push(
        freedomOption(
          `clear_free_${f1.outerEdgeId}`,
          `Leave the ${axisWord} position free`,
          `${inner.label} is meant to be positioned by hand inside ${outer.label}.`
        )
      );

      groups.push({
        id: `clear_${key}_${axis}`,
        motion: `${inner.label} can still move ${axis === "horizontal" ? "left and right" : "up and down"} inside ${outer.label}.`,
        question: `What should hold ${inner.label} in place ${axis === "horizontal" ? "horizontally" : "vertically"}?`,
        options,
      });
    }
  }

  return groups;
}

/**
 * Where does a profile sit, when it is not inside anything?
 *
 * The clearance question only fires for a profile nested in another, which
 * covers an opening in a frame but not a post standing on a deck. Without this,
 * the assistant would run out of things to say while the post was still free to
 * slide along the deck, and a repeat of that post would then array a component
 * whose own position nothing had ever decided.
 *
 * The distance is measured from the anchored profile, because that is the thing
 * the rest of the drawing is already positioned against.
 */
function positionQuestions(
  sketch: AuthoringSketch,
  profiles: Profile[],
  offsets: OffsetFinding[],
  host: Profile | null
): FreedomGroup[] {
  if (!host) return [];
  const nested = new Set(offsets.map((o) => o.inner.id));
  const groups: FreedomGroup[] = [];

  const anchorPointId = sketch.constraints.find(
    (c) => c.kind === "fix" && c.state !== "suppressed"
  )?.points[0];
  const origin = anchorPointId ? sketch.points[anchorPointId] : null;
  if (!origin || !anchorPointId) return [];

  for (const profile of profiles) {
    if (profile.id === host.id) continue;
    if (nested.has(profile.id)) continue; // the clearance question covers it

    const pts = profile.pointIds.map((id) => ({ id, p: sketch.points[id] })).filter((e) => e.p);
    if (pts.length === 0) continue;

    const options: IntentAction[] = [];

    for (const axis of ["x", "y"] as const) {
      if (positionParameterFor(sketch, profile, axis, anchorPointId)) continue;

      // Measure to the nearest corner along this axis: that is the edge a
      // draftsman would put a dimension on.
      const target = [...pts].sort(
        (m, n) => Math.abs(m.p[axis] - origin[axis]) - Math.abs(n.p[axis] - origin[axis])
      )[0];
      const delta = target.p[axis] - origin[axis];
      if (Math.abs(delta) < 1e-9) continue;

      const word = axis === "x" ? "along" : "up from";
      const paramName = `${cleanIdentifier(profile.label)}${axis === "x" ? "Offset" : "Rise"}`;

      options.push({
        id: `pos_${profile.id}_${axis}`,
        title: `Hold ${profile.label} a named distance ${word} ${host.label}`,
        rationale: `${profile.label} can still slide. Measuring it from ${host.label} makes its position a value rather than wherever it was dropped.`,
        createsParameters: [
          {
            name: paramName,
            value: Math.round(delta * 100) / 100,
            role: "DRIVING",
            unit: "mm",
            uiGroup: "Positions",
            description: `Distance from ${host.label}'s anchor to ${profile.label}, measured ${axis === "x" ? "horizontally" : "vertically"}.`,
          },
        ],
        createsConstraints: [
          {
            kind: axis === "x" ? "distance_x" : "distance_y",
            points: [anchorPointId, target.id],
            segments: [],
            paramRef: paramName,
            strength: "hard",
            driving: true,
            state: "active",
            label: `${profile.label} sits ${paramName} from ${host.label}`,
            provenance: makeProvenance(
              "completion-assistant",
              `The author chose to fix ${profile.label}'s position relative to ${host.label}.`
            ),
          },
        ],
        evidence: [`Measured ${delta.toFixed(2)} mm`],
        dofRemoved: 0,
      });
    }

    if (options.length === 0) continue;

    options.push(
      freedomOption(
        `pos_free_${profile.id}`,
        `Leave ${profile.label} free to move`,
        `${profile.label} is meant to be positioned by hand.`
      )
    );

    groups.push({
      id: `pos_${profile.id}`,
      motion: `${profile.label} can still slide relative to ${host.label}.`,
      question: `What holds ${profile.label} in place?`,
      options,
    });
  }

  return groups;
}

function positionParameterFor(
  sketch: AuthoringSketch,
  profile: Profile,
  axis: "x" | "y",
  anchorPointId: string
): boolean {
  const kind = axis === "x" ? "distance_x" : "distance_y";
  return sketch.constraints.some(
    (c) =>
      c.state !== "suppressed" &&
      c.kind === kind &&
      Boolean(c.paramRef) &&
      c.points.includes(anchorPointId) &&
      c.points.some((pt) => profile.pointIds.includes(pt))
  );
}

/**
 * The container/contents question — "why doesn't my frame grow when I add a cell?"
 *
 * A repeat count is topology: raising it stamps out more copies (§23.4). The
 * enclosing profile knows nothing about that, so unless the author says what
 * should happen, the second cell simply lands outside the frame. This is not a
 * bug in the array; it is a design decision nobody has made yet, and there are
 * three defensible answers:
 *
 *   1. the frame grows to fit — its span becomes derived from the count;
 *   2. the frame is fixed and the cells close up — the pitch becomes derived;
 *   3. they really are independent.
 *
 * Option 1 is the one that used to force a draftsman to hand-write something
 * like `Width = Count * Pitch + 120`, with a magic constant that silently became
 * wrong the moment a wall thickness changed. The expression built here has no
 * such constant: every term is a value that already exists and already has a
 * name, so editing the wall thickness still does the right thing.
 */
function arrayContainerQuestions(
  sketch: AuthoringSketch,
  profiles: Profile[],
  offsets: OffsetFinding[],
  policy: TolerancePolicy
): FreedomGroup[] {
  const groups: FreedomGroup[] = [];

  for (const rule of sketch.repeats) {
    const component = sketch.components.find((c) => c.id === rule.componentId);
    if (!component) continue;

    const unit = profiles.find((p) => p.shapeIds.some((id) => component.shapeIds.includes(id)));
    if (!unit) continue;

    // The container is whatever profile the unit sits inside.
    const containing = offsets.filter((o) => o.inner.id === unit.id);
    if (containing.length === 0) continue;
    const container = containing[0].outer;

    const countParam = sketch.parameters[rule.countParam];
    const spacingParam = sketch.parameters[rule.spacingParam];
    if (!countParam || !spacingParam) continue;

    // Along which axis does the array run?
    const axis = Math.abs(rule.direction.x) >= Math.abs(rule.direction.y) ? "x" : "y";
    const word = axis === "x" ? "width" : "height";

    // What already names the container's span, and the unit's own span?
    const containerSpanParam = spanParameterFor(sketch, container, axis);
    const unitSpanParam = spanParameterFor(sketch, unit, axis);

    const containerParam = containerSpanParam ? sketch.parameters[containerSpanParam] : undefined;
    const containerGrows =
      rule.enclosureCoupling === "grow" ||
      (containerParam?.role === "DERIVED" &&
        Boolean(containerParam.expr) &&
        dependenciesOf(containerParam.expr!).includes(rule.countParam));
    const spacingFits =
      rule.enclosureCoupling === "fit" ||
      (spacingParam.role === "DERIVED" &&
        Boolean(spacingParam.expr) &&
        dependenciesOf(spacingParam.expr!).includes(rule.countParam));
    const independent = rule.enclosureCoupling === "independent";

    if (containerGrows || spacingFits || independent) continue;

    // The clearances at each end of the array, from the faces that pin this axis.
    const endFaces = containing.filter(
      (o) => faceAxis(sketch, o.outerEdgeId) === (axis === "x" ? "horizontal" : "vertical")
    );
    const endClearanceParams = [
      ...new Set(
        endFaces
          .flatMap((o) =>
            sketch.constraints
              .filter((c) => c.segments.includes(o.outerEdgeId) && c.kind === "point_line_distance" && c.paramRef)
              .map((c) => c.paramRef!)
          )
      ),
    ];

    // The face at the far end of the array is the one the copies march towards.
    // Its clearance stops being an independent requirement once the span is
    // arithmetic, so the action switches it off and says so.
    const farFace = endFaces
      .map((o) => ({ o, reach: faceReach(sketch, o.outerEdgeId, rule.direction) }))
      .sort((m, n) => n.reach - m.reach)[0]?.o;
    const trailingConstraintIds = farFace
      ? sketch.constraints
          .filter(
            (c) =>
              c.state !== "suppressed" &&
              c.kind === "point_line_distance" &&
              c.segments.includes(farFace.outerEdgeId) &&
              c.points.some((pt) => unit.pointIds.includes(pt))
          )
          .map((c) => c.id)
      : [];

    const options: IntentAction[] = [];

    if (containerSpanParam && unitSpanParam) {
      // span = (count - 1) * pitch + unit span + the clearance at each end.
      const ends =
        endClearanceParams.length === 0
          ? ""
          : endClearanceParams.length === 1
            ? ` + 2 * ${endClearanceParams[0]}`
            : ` + ${endClearanceParams.join(" + ")}`;
      const expr = `(${rule.countParam} - 1) * ${rule.spacingParam} + ${unitSpanParam}${ends}`;

      options.push({
        id: `array_grow_${rule.id}`,
        title: `${container.label} grows to fit the copies`,
        rationale:
          "The overall size stops being something you type and becomes something the drawing works out: however many copies there are, the frame is exactly big enough to hold them plus the clearances you already named.",
        createsParameters: [],
        createsConstraints: [],
        convertToDerived: { name: containerSpanParam, expr },
        suppressConstraints: trailingConstraintIds,
        evidence: [
          `${containerSpanParam} would become ${expr}`,
          `Right now that is ${describeSpan(sketch, rule, unitSpanParam, endClearanceParams)}`,
          endClearanceParams.length === 0
            ? "No end clearance is named yet, so the copies will sit flush with the frame. Name one first if you want a wall there."
            : `End clearances taken from: ${endClearanceParams.join(", ")}`,
          trailingConstraintIds.length > 0
            ? "The far-end gap stops being enforced separately — the width formula already guarantees it. Holding both would contradict itself as soon as there are two copies."
            : "",
        ].filter(Boolean),
        dofRemoved: 0,
        alwaysOffer: true,
      });
    }

    if (containerSpanParam && unitSpanParam && spacingParam.role !== "DERIVED") {
      const ends =
        endClearanceParams.length === 0
          ? ""
          : endClearanceParams.length === 1
            ? ` - 2 * ${endClearanceParams[0]}`
            : ` - ${endClearanceParams.join(" - ")}`;
      const expr = `(${containerSpanParam} - ${unitSpanParam}${ends}) / max(1, ${rule.countParam} - 1)`;

      options.push({
        id: `array_fit_${rule.id}`,
        title: `${container.label} stays the size it is and the copies close up`,
        rationale:
          "The frame is fixed by the site, so adding a copy has to come out of the spacing. The pitch stops being something you type and becomes something the drawing works out.",
        createsParameters: [],
        createsConstraints: [],
        convertToDerived: { name: rule.spacingParam, expr },
        suppressConstraints: trailingConstraintIds,
        evidence: [
          `${rule.spacingParam} would become ${expr}`,
          `${containerSpanParam} stays at ${sketch.parameters[containerSpanParam]?.value.toFixed(1)} mm whatever the count`,
          trailingConstraintIds.length > 0
            ? "The far-end gap stops being enforced separately — the spacing formula already accounts for it."
            : "",
        ].filter(Boolean),
        dofRemoved: 0,
        alwaysOffer: true,
      });
    }

    if (options.length === 0) {
      // Nothing is named yet on one side or the other. Say which, and stop —
      // the coupling is arithmetic between named values, so it cannot be offered
      // until those values exist, but the author has to be told that is the
      // reason rather than being shown nothing.
      // Is the missing span still FREE to name, or has something already
      // decided it?
      //
      // This is the difference between a one-click fix and a dead end, and
      // telling the author the wrong one is worse than saying nothing. Naming a
      // thickness on both sides of a nested profile determines the outer span
      // arithmetically, so the size question that would have named it is gone —
      // and "name it first" then sends the author looking for a button that is
      // no longer there. Measuring the effect is the only reliable way to know,
      // because it depends on everything else they have accepted.
      const missing: string[] = [];
      const stuck: string[] = [];
      for (const [profile, present] of [
        [container, containerSpanParam] as const,
        [unit, unitSpanParam] as const,
      ]) {
        if (present) continue;
        (spanIsFree(sketch, profile, axis) ? missing : stuck).push(`${profile.label}'s ${word}`);
      }
      groups.push({
        id: `array_${rule.id}`,
        motion: `${countParam.name} changes how many copies exist, but nothing tells ${container.label} to change ${word}.`,
        question: `When ${countParam.name} changes, what should happen to ${container.label}?`,
        options: [],
        blockedBy:
          [
            `The rule that ties them together is ${container.label}'s ${word} = ` +
              `(${rule.countParam} - 1) x ${rule.spacingParam} + ${unit.label}'s ${word}` +
              `${endClearanceParams.length > 0 ? ` + ${endClearanceParams.join(" + ")}` : " + the end clearances"}` +
              `, and every term has to be a named value before the drawing can work it out.`,
            missing.length > 0
              ? `Name ${missing.join(" and ")} — the size question above still offers it.`
              : "",
            stuck.length > 0
              ? `${stuck.join(" and ")} cannot be named as it stands: ${endClearanceParams.length > 0 ? endClearanceParams.join(" and ") : "a rule you already accepted"} already decides it, so naming it would be a second answer to one question. Remove that rule from "Rules in force" and the size question comes back — or start the sizes before the thicknesses next time, which leaves both free to name.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
      });
      continue;
    }

    options.push(
      freedomOption(
        `array_free_${rule.id}`,
        `They are independent`,
        `${container.label} is sized by something else and is not meant to follow the copies.`
      )
    );

    groups.push({
      id: `array_${rule.id}`,
      motion: `${countParam.name} changes how many copies exist, but nothing tells ${container.label} to change ${word}.`,
      question: `When ${countParam.name} changes, what should happen to ${container.label}?`,
      options,
    });
  }

  return groups;
}

/** How far along the array direction a face sits. */
function faceReach(
  sketch: AuthoringSketch,
  segId: string,
  direction: { x: number; y: number }
): number {
  const seg = sketch.segments[segId];
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return 0;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(direction.x, direction.y) || 1;
  return (mx * direction.x + my * direction.y) / len;
}

function describeSpan(
  sketch: AuthoringSketch,
  rule: { countParam: string; spacingParam: string },
  unitSpanParam: string,
  ends: string[]
): string {
  const v = (n: string) => sketch.parameters[n]?.value ?? 0;
  const count = Math.max(1, Math.round(v(rule.countParam)));
  const endTotal = ends.length === 1 ? 2 * v(ends[0]) : ends.reduce((m, n) => m + v(n), 0);
  const total = (count - 1) * v(rule.spacingParam) + v(unitSpanParam) + endTotal;
  return `${total.toFixed(1)} mm`;
}

/**
 * The parameter, if any, that already drives a profile's span along one axis.
 * Found by looking for a dimensional constraint between the profile's own
 * extreme points, which is exactly what `sizeQuestions` creates.
 */
/**
 * Could a span still be given a name, or is it already decided?
 *
 * Answered by measuring, not by reasoning about what the author accepted: a
 * probe constraint across the profile's extremes either removes freedom or it
 * does not, and that is the same test `measureGroups` uses to decide whether to
 * offer the size question at all.
 */
function spanIsFree(sketch: AuthoringSketch, profile: Profile, axis: "x" | "y"): boolean {
  const pts = profile.pointIds.map((id) => ({ id, p: sketch.points[id] })).filter((e) => e.p);
  if (pts.length < 2) return false;
  const sorted = [...pts].sort((m, n) => m.p[axis] - n.p[axis] || (m.id < n.id ? -1 : 1));
  const probe: SketchConstraint = {
    id: "__span_probe__",
    kind: axis === "x" ? "distance_x" : "distance_y",
    points: [sorted[0].id, sorted[sorted.length - 1].id],
    segments: [],
    value: sorted[sorted.length - 1].p[axis] - sorted[0].p[axis],
    strength: "hard",
    driving: true,
    state: "active",
    label: "probe",
    provenance: makeProvenance("completion-assistant", "Probe"),
  };
  const before = countDof(sketch);
  const after = countDof({ ...sketch, constraints: [...sketch.constraints, probe] });
  return after < before;
}

function spanParameterFor(
  sketch: AuthoringSketch,
  profile: Profile,
  axis: "x" | "y"
): string | null {
  const kind = axis === "x" ? "distance_x" : "distance_y";
  for (const c of sketch.constraints) {
    if (c.kind !== kind || !c.paramRef || c.state === "suppressed") continue;
    if (c.points.every((p) => profile.pointIds.includes(p))) return c.paramRef;
  }
  // A rectangle drawn with the rectangle tool may be driven by a plain edge
  // length instead, which measures the same span when the edge lies on the axis.
  for (const c of sketch.constraints) {
    if (c.kind !== "distance" || !c.paramRef || c.state === "suppressed") continue;
    if (!c.points.every((p) => profile.pointIds.includes(p))) continue;
    const a = sketch.points[c.points[0]];
    const b = sketch.points[c.points[1]];
    if (!a || !b) continue;
    const alongX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    if ((axis === "x") === alongX) return c.paramRef;
  }
  return null;
}

function freedomOption(id: string, title: string, rationale: string): IntentAction {
  return {
    id,
    title,
    rationale,
    createsParameters: [],
    createsConstraints: [],
    dofRemoved: 0,
    evidence: [],
    isDeliberateFreedom: true,
  };
}
