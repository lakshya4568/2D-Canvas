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
import { analyseDof } from "./dof";
import { uniqueParameterName, makeProvenance } from "./parameters";

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
  /** Measured on a scratch copy, never assumed. */
  dofRemoved: number;
  evidence: string[];
  /** The "do nothing, this freedom is intended" option. */
  isDeliberateFreedom?: boolean;
}

export interface FreedomGroup {
  id: string;
  /** What is still free, in plain words. */
  motion: string;
  /** The design question the author has to answer. */
  question: string;
  options: IntentAction[];
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
  outerShapeId: string;
  innerShapeId: string;
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

function loopOf(sketch: AuthoringSketch, shapeId: string): { x: number; y: number }[] | null {
  const segs = Object.values(sketch.segments)
    .filter((s) => s.shapeId === shapeId)
    .sort((a, b) => a.edgeIndex - b.edgeIndex);
  if (segs.length < 3) return null;
  const pts = segs.map((s) => sketch.points[s.p1]).filter(Boolean);
  return pts.length === segs.length ? pts.map((p) => ({ x: p.x, y: p.y })) : null;
}

function pointInLoop(loop: { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Finds inner loops nested in outer loops and measures each inner corner's
 * perpendicular distance to the outer edge it is nearest.
 *
 * This is the generic form of "four clearances round an opening". It works for
 * an octagonal opening in a rectangle, a rectangle in a rectangle, or any other
 * closed profile, because it only ever measures distances to real edges.
 */
export function findOffsets(
  sketch: AuthoringSketch,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): OffsetFinding[] {
  const shapeIds = [...new Set(Object.values(sketch.segments).map((s) => s.shapeId))];
  const loops = new Map<string, { x: number; y: number }[]>();
  for (const id of shapeIds) {
    const l = loopOf(sketch, id);
    if (l) loops.set(id, l);
  }

  const out: OffsetFinding[] = [];

  for (const [outerId, outerLoop] of loops) {
    const outerSegs = Object.values(sketch.segments)
      .filter((s) => s.shapeId === outerId)
      .sort((a, b) => a.edgeIndex - b.edgeIndex);

    for (const innerId of shapeIds) {
      if (innerId === outerId) continue;
      const innerPts = [
        ...new Set(
          Object.values(sketch.segments)
            .filter((s) => s.shapeId === innerId)
            .flatMap((s) => [s.p1, s.p2])
        ),
      ];
      if (innerPts.length < 2) continue;
      const allInside = innerPts.every((pid) => {
        const p = sketch.points[pid];
        return p && pointInLoop(outerLoop, p);
      });
      if (!allInside) continue;

      // The clearance from one outer FACE is the smallest perpendicular distance
      // from that face to the inner profile, measured only where the foot of the
      // perpendicular actually lands on the face. Measuring per-face rather than
      // assigning each corner to its single nearest edge matters: a corner of a
      // concentric rectangle is exactly equidistant from two faces, and
      // "nearest edge wins" would silently give both side clearances away to the
      // top and bottom and then report no horizontal relationship at all.
      for (const seg of outerSegs) {
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
          outerShapeId: outerId,
          innerShapeId: innerId,
          outerEdgeId: seg.id,
          innerPointIds: touching.map((e) => e.id).sort(),
          distance: best,
          sign: bestSigned < 0 ? -1 : 1,
          sideLabel: ["top", "right", "bottom", "left"][seg.edgeIndex] ?? `side ${seg.edgeIndex + 1}`,
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Measuring an action's real effect.
// ---------------------------------------------------------------------------

/** Applies an action to a scratch copy and returns the actual DOF it removes. */
export function measureAction(sketch: AuthoringSketch, action: IntentAction): number {
  if (action.isDeliberateFreedom) return 0;
  const before = analyseDof(sketch).dof;
  const after = analyseDof(applyAction(sketch, action)).dof;
  return Math.max(0, before - after);
}

/** Commits an action: creates its parameters, then its constraints. */
export function applyAction(sketch: AuthoringSketch, action: IntentAction): AuthoringSketch {
  if (action.isDeliberateFreedom) return sketch;

  const parameters = { ...sketch.parameters };
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

  const constraints = [...sketch.constraints];
  action.createsConstraints.forEach((draft, i) => {
    const id = `c_${action.id}_${i}_${Date.now().toString(36)}`;
    const paramRef = draft.paramRef ? rename.get(draft.paramRef) ?? draft.paramRef : undefined;
    constraints.push({ ...draft, id, paramRef });
    if (paramRef && parameters[paramRef]) {
      parameters[paramRef] = {
        ...parameters[paramRef],
        boundConstraints: [...parameters[paramRef].boundConstraints, id],
      };
    }
  });

  return { ...sketch, parameters, constraints };
}

// ---------------------------------------------------------------------------
// The proposals.
// ---------------------------------------------------------------------------

function biggestShape(sketch: AuthoringSketch): string | null {
  let best: string | null = null;
  let bestSpan = -1;
  const byShape = new Map<string, string[]>();
  for (const seg of Object.values(sketch.segments)) {
    const arr = byShape.get(seg.shapeId) ?? [];
    arr.push(seg.p1, seg.p2);
    byShape.set(seg.shapeId, arr);
  }
  for (const [id, ptIds] of byShape) {
    const pts = ptIds.map((p) => sketch.points[p]).filter(Boolean);
    if (pts.length === 0) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const span = Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys));
    if (span > bestSpan) {
      bestSpan = span;
      best = id;
    }
  }
  return best;
}

export function suggestCompletion(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string> = {},
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): CompletionReport {
  const report = analyseDof(sketch, shapeNames, policy);
  const name = (id: string) => shapeNames[id] ?? id;
  const quickFixes: IntentAction[] = [];
  const groups: FreedomGroup[] = [];

  if (report.dof === 0) {
    return { dof: 0, anchored: report.anchored, quickFixes, groups };
  }

  // ---- 1. Anchoring. Always first: it removes the two motions that make every
  //         other diagnosis misleading (§18 anchor rule).
  if (!report.anchored) {
    const host = biggestShape(sketch);
    if (host) {
      const corner = Object.values(sketch.segments)
        .filter((s) => s.shapeId === host)
        .sort((a, b) => a.edgeIndex - b.edgeIndex)[0]?.p1;
      const p = corner ? sketch.points[corner] : null;
      if (p) {
        quickFixes.push(
          withMeasured(sketch, {
            id: "anchor",
            title: `Pin ${name(host)} to the sheet`,
            rationale:
              "Nothing currently holds the drawing in place, so the whole sketch can slide. Pinning one corner is what every CAD sketch starts with.",
            createsParameters: [],
            createsConstraints: [
              {
                kind: "fix",
                points: [corner!],
                segments: [],
                value: p.x,
                valueY: p.y,
                strength: "hard",
                driving: true,
                state: "active",
                label: `${name(host)} is pinned to the sheet`,
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
  }

  // ---- 2. Orientation. A rectangle keeps its right angles but is free to spin.
  const rotationFree = report.motions.some((m) => m.kind === "rotation");
  if (rotationFree) {
    const host = biggestShape(sketch);
    const seg = Object.values(sketch.segments)
      .filter((s) => s.shapeId === host)
      .sort((a, b) => a.edgeIndex - b.edgeIndex)[0];
    if (seg) {
      const a = sketch.points[seg.p1];
      const b = sketch.points[seg.p2];
      const horizontal = Math.abs(b.y - a.y) <= Math.abs(b.x - a.x);
      quickFixes.push(
        withMeasured(sketch, {
          id: "orient",
          title: `Hold ${name(seg.shapeId)}'s first edge ${horizontal ? "horizontal" : "vertical"}`,
          rationale:
            "The drawing can currently rotate as a whole. Holding one edge to an axis settles the orientation.",
          createsParameters: [],
          createsConstraints: [
            {
              kind: horizontal ? "horizontal" : "vertical",
              points: [],
              segments: [seg.id],
              strength: "hard",
              driving: true,
              state: "active",
              label: `${name(seg.shapeId)} stays ${horizontal ? "horizontal" : "vertical"}`,
              provenance: makeProvenance(
                "completion-assistant",
                "Settles the sketch's orientation so later dimension changes cannot rotate the drawing."
              ),
            },
          ],
          evidence: [`Currently ${(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 180).toFixed(2)}° from horizontal`],
          dofRemoved: 0,
        })
      );
    }
  }

  // ---- 3. Orientation of shapes that can still turn on their own -----------
  groups.push(...orientationQuestions(sketch, shapeNames));

  // ---- 4. Sizes of shapes that are still free to change size ---------------
  groups.push(...sizeQuestions(sketch, shapeNames));

  // ---- 5. Nested-profile clearances: the design question this system exists
  //         to ask. Equal pairs are offered as one named thickness (§7.2).
  const offsets = findOffsets(sketch, policy);
  groups.push(...clearanceQuestions(sketch, shapeNames, offsets, policy));

  // Measure every option for real, then drop the ones that would change
  // nothing. An option that removes no freedom is already implied by something
  // the author accepted earlier, and offering it invites them to click a button
  // that does nothing.
  const withNumbers = groups.map((g) => ({
    ...g,
    options: g.options
      .map((o) => withMeasured(sketch, o))
      .filter((o) => o.dofRemoved > 0 || o.isDeliberateFreedom),
  }));

  return {
    dof: report.dof,
    anchored: report.anchored,
    quickFixes: quickFixes.filter((q) => q.dofRemoved > 0),
    groups: withNumbers.filter((g) => g.options.some((o) => o.dofRemoved > 0)),
  };
}

function withMeasured(sketch: AuthoringSketch, action: IntentAction): IntentAction {
  return { ...action, dofRemoved: measureAction(sketch, action) };
}

/**
 * A shape that keeps its own right angles can still turn as a unit. The two
 * ordinary intents are "line it up with something else in the drawing" and
 * "hold it to an axis"; both are offered, and so is leaving it free.
 */
function orientationQuestions(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string>
): FreedomGroup[] {
  const name = (id: string) => shapeNames[id] ?? id;
  const shapeIds = [...new Set(Object.values(sketch.segments).map((s) => s.shapeId))];
  const groups: FreedomGroup[] = [];

  for (const shapeId of shapeIds) {
    const own = Object.values(sketch.segments)
      .filter((s) => s.shapeId === shapeId)
      .sort((a, b) => a.edgeIndex - b.edgeIndex);
    const seg = own[0];
    if (!seg) continue;
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;

    const options: IntentAction[] = [];

    // Line it up with the most nearly parallel edge belonging to another shape.
    let partner: { id: string; shapeId: string; err: number } | null = null;
    for (const other of Object.values(sketch.segments)) {
      if (other.shapeId === shapeId) continue;
      const c = sketch.points[other.p1];
      const d = sketch.points[other.p2];
      if (!c || !d) continue;
      const cross = Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x));
      const denom = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(d.x - c.x, d.y - c.y);
      if (denom < 1e-9) continue;
      const err = cross / denom;
      if (!partner || err < partner.err) partner = { id: other.id, shapeId: other.shapeId, err };
    }

    if (partner && partner.err < 0.2) {
      options.push({
        id: `orient_par_${seg.id}`,
        title: `Keep ${name(shapeId)} lined up with ${name(partner.shapeId)}`,
        rationale: `${name(shapeId)} can still turn on its own. Tying its direction to ${name(partner.shapeId)} keeps the two aligned however either one is later resized.`,
        createsParameters: [],
        createsConstraints: [
          {
            kind: "parallel",
            points: [],
            segments: [seg.id, partner.id],
            strength: "hard",
            driving: true,
            state: "active",
            label: `${name(shapeId)} stays lined up with ${name(partner.shapeId)}`,
            provenance: makeProvenance(
              "completion-assistant",
              `The author chose to tie ${name(shapeId)}'s direction to ${name(partner.shapeId)} rather than to the sheet.`
            ),
          },
        ],
        evidence: [`Currently ${((Math.asin(Math.min(1, partner.err)) * 180) / Math.PI).toFixed(3)}° apart`],
        dofRemoved: 0,
      });
    }

    const horizontal = Math.abs(b.y - a.y) <= Math.abs(b.x - a.x);
    options.push({
      id: `orient_axis_${seg.id}`,
      title: `Hold ${name(shapeId)} ${horizontal ? "horizontal" : "vertical"}`,
      rationale: "Ties the shape to the sheet's axes instead of to another shape.",
      createsParameters: [],
      createsConstraints: [
        {
          kind: horizontal ? "horizontal" : "vertical",
          points: [],
          segments: [seg.id],
          strength: "hard",
          driving: true,
          state: "active",
          label: `${name(shapeId)} stays ${horizontal ? "horizontal" : "vertical"}`,
          provenance: makeProvenance("completion-assistant", "The author chose to hold this shape square to the sheet."),
        },
      ],
      evidence: [`Currently ${(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 180).toFixed(2)}° from horizontal`],
      dofRemoved: 0,
    });

    options.push(
      freedomOption(
        `orient_free_${shapeId}`,
        `Leave ${name(shapeId)} free to turn`,
        `${name(shapeId)} is meant to be rotated by hand.`
      )
    );

    groups.push({
      id: `orient_${shapeId}`,
      motion: `${name(shapeId)} can still turn on its own.`,
      question: `What should hold ${name(shapeId)}'s direction?`,
      options,
    });
  }

  return groups;
}

function sizeQuestions(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string>
): FreedomGroup[] {
  const name = (id: string) => shapeNames[id] ?? id;
  const groups: FreedomGroup[] = [];
  // Offer a size question for every shape and let the measured DOF impact
  // decide which ones survive. Reading it off the motion sentences instead
  // would tie the assistant to the exact wording those sentences happen to use.
  const shapesThatCanResize = new Set(Object.values(sketch.segments).map((s) => s.shapeId));

  for (const shapeId of shapesThatCanResize) {
    const segs = Object.values(sketch.segments)
      .filter((s) => s.shapeId === shapeId)
      .sort((a, b) => a.edgeIndex - b.edgeIndex);
    if (segs.length < 2) continue;

    const options: IntentAction[] = [];
    for (const seg of segs.slice(0, 2)) {
      const a = sketch.points[seg.p1];
      const b = sketch.points[seg.p2];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const side = ["top", "right", "bottom", "left"][seg.edgeIndex] ?? `edge ${seg.edgeIndex + 1}`;
      const paramName = seg.edgeIndex % 2 === 0 ? `${name(shapeId)}Width` : `${name(shapeId)}Height`;
      options.push({
        id: `size_${seg.id}`,
        title: `Name the ${side} edge and drive it`,
        rationale: `${name(shapeId)} can still change size. Giving that edge a named length turns it into a value a project user can type.`,
        createsParameters: [
          {
            name: paramName,
            value: Math.round(len * 100) / 100,
            role: "DRIVING",
            unit: "mm",
            uiGroup: "Overall size",
            description: `Length of ${name(shapeId)}'s ${side} edge, measured from the drawing when the parameter was created.`,
          },
        ],
        createsConstraints: [
          {
            kind: "distance",
            points: [seg.p1, seg.p2],
            segments: [],
            paramRef: paramName,
            strength: "hard",
            driving: true,
            state: "active",
            label: `${name(shapeId)} ${side} edge = ${paramName}`,
            provenance: makeProvenance(
              "completion-assistant",
              `Created when the author chose to drive ${name(shapeId)}'s ${side} edge by a named value.`
            ),
          },
        ],
        evidence: [`Measured length ${len.toFixed(2)} mm`],
        dofRemoved: 0,
      });
    }

    options.push(freedomOption(`size_free_${shapeId}`, `Leave ${name(shapeId)}'s size free`, `${name(shapeId)} is meant to be resized by hand, not by a parameter.`));

    groups.push({
      id: `size_${shapeId}`,
      motion: `${name(shapeId)} can still change size.`,
      question: `What should control ${name(shapeId)}'s size?`,
      options,
    });
  }

  return groups;
}

function clearanceQuestions(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string>,
  offsets: OffsetFinding[],
  policy: TolerancePolicy
): FreedomGroup[] {
  const name = (id: string) => shapeNames[id] ?? id;
  const groups: FreedomGroup[] = [];

  const byPair = new Map<string, OffsetFinding[]>();
  for (const f of offsets) {
    const k = `${f.outerShapeId}::${f.innerShapeId}`;
    const arr = byPair.get(k) ?? [];
    arr.push(f);
    byPair.set(k, arr);
  }

  for (const [key, findings] of byPair) {
    const [outerId, innerId] = key.split("::");
    if (findings.length < 2) continue;

    // Opposite edges of a four-sided outer loop pair up as 0/2 and 1/3.
    const byEdgeIndex = new Map<number, OffsetFinding>();
    for (const f of findings) {
      const seg = sketch.segments[f.outerEdgeId];
      if (seg) byEdgeIndex.set(seg.edgeIndex, f);
    }

    const pairs: [OffsetFinding, OffsetFinding, string][] = [];
    const a0 = byEdgeIndex.get(1);
    const a2 = byEdgeIndex.get(3);
    if (a0 && a2) pairs.push([a0, a2, "side"]);
    const b0 = byEdgeIndex.get(0);
    const b2 = byEdgeIndex.get(2);
    if (b0 && b2) pairs.push([b0, b2, "top and bottom"]);

    for (const [f1, f2, axisWord] of pairs) {
      const equal = Math.abs(f1.distance - f2.distance) <= policy.cluster_mm;
      const mean = (f1.distance + f2.distance) / 2;
      const suggestedName = axisWord === "side" ? "SideThickness" : "EndThickness";

      const options: IntentAction[] = [];

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
            description: `Distance held between ${name(outerId)} and ${name(innerId)} on both ${axisWord} faces.`,
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
          label: `${name(innerId)} sits ${suggestedName} from ${name(outerId)}'s ${f.sideLabel}`,
          provenance: makeProvenance(
            "completion-assistant",
            `Both ${axisWord} gaps were bound to one named value, so changing the outside cannot change the thickness.`,
            { evidence: [`${f1.distance.toFixed(2)} mm and ${f2.distance.toFixed(2)} mm measured`] }
          ),
        })),
        evidence: [
          `${f1.sideLabel}: ${f1.distance.toFixed(2)} mm`,
          `${f2.sideLabel}: ${f2.distance.toFixed(2)} mm`,
          equal ? `Difference ${Math.abs(f1.distance - f2.distance).toFixed(2)} mm — within tolerance` : `Difference ${Math.abs(f1.distance - f2.distance).toFixed(2)} mm — they would be averaged`,
        ],
        dofRemoved: 0,
      });

      for (const f of [f1, f2]) {
        options.push({
          id: `clear_one_${f.outerEdgeId}`,
          title: `Fix only the ${f.sideLabel} gap`,
          rationale: `Use this when the ${f.sideLabel} clearance is the one that matters and the opposite side is free to take up the difference.`,
          createsParameters: [
            {
              name: `${f.sideLabel.charAt(0).toUpperCase()}${f.sideLabel.slice(1)}Clearance`,
              value: Math.round(f.distance * 100) / 100,
              role: "DRIVING",
              unit: "mm",
              uiGroup: "Clearances",
              description: `Distance from ${name(outerId)}'s ${f.sideLabel} to ${name(innerId)}.`,
            },
          ],
          createsConstraints: [
            {
              kind: "point_line_distance",
              points: [f.innerPointIds[0]],
              segments: [f.outerEdgeId],
              sign: f.sign,
              paramRef: `${f.sideLabel.charAt(0).toUpperCase()}${f.sideLabel.slice(1)}Clearance`,
              strength: "hard",
              driving: true,
              state: "active",
              label: `${name(innerId)} is held off ${name(outerId)}'s ${f.sideLabel}`,
              provenance: makeProvenance(
                "completion-assistant",
                `The author chose to control the ${f.sideLabel} clearance directly.`
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
          `${name(innerId)} is meant to be positioned by hand inside ${name(outerId)}.`
        )
      );

      groups.push({
        id: `clear_${key}_${axisWord}`,
        motion: `${name(innerId)} can still move ${axisWord === "side" ? "left and right" : "up and down"} inside ${name(outerId)}.`,
        question: `What should hold ${name(innerId)} in place ${axisWord === "side" ? "horizontally" : "vertically"}?`,
        options,
      });
    }
  }

  return groups;
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
