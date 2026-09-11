/**
 * Relationship detection — GEOM-RP/1 predicates over the sketch's own segments.
 *
 * This replaces `lib/inference/formulaSynthesizer.ts`, which is the module that
 * produced the reported "strange formulas". Its method was to take axis-aligned
 * bounding boxes of every ordered pair of shapes, subtract the four gaps, and
 * emit expressions such as `R2_Width = R1_Width - LeftOffset - RightClearance`
 * naming symbols that were never created as parameters. That method fails four
 * of this system's own rules at once: it is not rotation invariant (§4.5), it
 * reads pixels rather than model millimetres (§17), it curve-fits coordinate
 * arithmetic (§49.3), and it produces a formula where the relationship is
 * actually a geometric constraint (§7).
 *
 * What replaces it:
 *
 *   - predicates measure DIRECTIONS AND DISTANCES between real segments, so the
 *     same physical configuration is detected at 0°, 15° or 45°;
 *   - a detection produces a CONSTRAINT candidate, not an expression;
 *   - every candidate is put through the SVD admissibility gate before it is
 *     shown, so nothing that is already implied by existing geometry appears;
 *   - each candidate carries the numbers it was measured from.
 */

import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { isRowIndependent } from "./admissibility";
import { AuthoringSketch, ConstraintCandidate, SketchConstraint, Provenance } from "./types";
import { buildSystem, evaluateSystem, evaluateConstraint, rowScale } from "./residuals";

export interface DetectOptions {
  policy?: TolerancePolicy;
  /** Restrict detection to these shapes. Empty means the whole sketch. */
  shapeIds?: string[];
  shapeNames?: Record<string, string>;
  /** Hard cap so the review list never becomes a wall of cards. */
  limit?: number;
}

interface SegView {
  id: string;
  shapeId: string;
  p1: string;
  p2: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dx: number;
  dy: number;
  len: number;
}

function views(sketch: AuthoringSketch, shapeIds?: string[]): SegView[] {
  const want = shapeIds && shapeIds.length > 0 ? new Set(shapeIds) : null;
  const out: SegView[] = [];
  for (const seg of Object.values(sketch.segments)) {
    if (want && !want.has(seg.shapeId)) continue;
    if (sketch.circles[`${seg.shapeId}:c`]) continue; // circle radius handle, not an edge
    // Construction geometry (§36) is drawn and can be constrained TO, but it is
    // never a source of proposals: a bridge centreline is annotation, and
    // offering "this wall is parallel to that centreline" as a discovery buries
    // the relationships that describe the structure.
    if (seg.construction) continue;
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    out.push({ id: seg.id, shapeId: seg.shapeId, p1: seg.p1, p2: seg.p2, ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, len });
  }
  return out.sort((s1, s2) => (s1.id < s2.id ? -1 : 1));
}

function label(sketch: AuthoringSketch, names: Record<string, string>, segId: string): string {
  const seg = sketch.segments[segId];
  if (!seg) return segId;
  const shape = names[seg.shapeId] ?? seg.shapeId;
  const side = ["top", "right", "bottom", "left"][seg.edgeIndex] ?? `edge ${seg.edgeIndex + 1}`;
  return Object.values(sketch.segments).filter((s) => s.shapeId === seg.shapeId).length === 1
    ? shape
    : `${shape} ${side}`;
}

function prov(detail: string, predicate: string, evidence: string[], confidence: number): Provenance {
  return { origin: "inference-accepted", detail, predicate, evidence, confidence, createdAt: Date.now() };
}

/** Perpendicular distance from a point to a segment's carrier line, signed. */
function normalOffset(s: SegView, px: number, py: number): number {
  return ((px - s.ax) * s.dy - (py - s.ay) * s.dx) / s.len;
}

/**
 * Runs every detector, gates the results, and returns them ranked.
 *
 * A candidate that the gate calls redundant is dropped rather than shown: it
 * would add a card the author cannot act on. A candidate the gate calls
 * conflicting is kept but marked, because that is information the author needs.
 */
export function detectCandidates(
  sketch: AuthoringSketch,
  options: DetectOptions = {}
): ConstraintCandidate[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const names = options.shapeNames ?? {};
  const segs = views(sketch, options.shapeIds);
  const raw: ConstraintCandidate[] = [];

  const existing = new Set(
    sketch.constraints
      .filter((c) => c.state !== "suppressed")
      .map((c) => signature(c))
  );

  const angTol = policy.angle_rad;
  const geoTol = policy.geometry_mm;

  // ---- P1/P2: direction relationships between pairs of edges ---------------
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];

      const sinT = Math.abs(a.dx * b.dy - a.dy * b.dx) / (a.len * b.len);
      const cosT = Math.abs(a.dx * b.dx + a.dy * b.dy) / (a.len * b.len);
      const angleDeg = (Math.asin(Math.min(1, sinT)) * 180) / Math.PI;

      if (sinT < Math.sin(angTol)) {
        push(raw, existing, {
          kind: "parallel",
          points: [],
          segments: [a.id, b.id],
          strength: "soft",
          driving: true,
          state: "active",
          label: `${label(sketch, names, a.id)} stays parallel to ${label(sketch, names, b.id)}`,
          provenance: prov(
            "Detected: the two edges point the same way within half a degree.",
            "P1",
            [`angle between them: ${angleDeg.toFixed(3)}°`],
            0.95
          ),
        }, {
          headline: `${label(sketch, names, a.id)} and ${label(sketch, names, b.id)} are parallel`,
          evidence: [`Measured angle between them: ${angleDeg.toFixed(3)}° (tolerance ${((angTol * 180) / Math.PI).toFixed(2)}°)`],
          deviation: `${angleDeg.toFixed(3)}° off exact`,
          preserves: "They will stay parallel when anything else in the drawing changes.",
          confidence: 0.95,
          affectedShapeIds: [a.shapeId, b.shapeId],
        });
      } else if (cosT < Math.sin(angTol)) {
        push(raw, existing, {
          kind: "perpendicular",
          points: [],
          segments: [a.id, b.id],
          strength: "soft",
          driving: true,
          state: "active",
          label: `${label(sketch, names, a.id)} stays square to ${label(sketch, names, b.id)}`,
          provenance: prov(
            "Detected: the two edges meet at a right angle within half a degree.",
            "P2",
            [`angle between them: ${(90 - angleDeg).toFixed(3)}° from square`],
            0.95
          ),
        }, {
          headline: `${label(sketch, names, a.id)} and ${label(sketch, names, b.id)} are at right angles`,
          evidence: [`Measured: ${(90 - angleDeg).toFixed(3)}° away from square`],
          deviation: `${(90 - angleDeg).toFixed(3)}° off square`,
          preserves: "The right angle survives every later dimension change.",
          confidence: 0.95,
          affectedShapeIds: [a.shapeId, b.shapeId],
        });
      }

      // ---- P3: equal length ------------------------------------------------
      const dLen = Math.abs(a.len - b.len);
      if (dLen <= policy.cluster_mm && Math.max(a.len, b.len) > policy.cluster_mm * 4) {
        push(raw, existing, {
          kind: "equal_length",
          points: [],
          segments: [a.id, b.id],
          strength: "soft",
          driving: true,
          state: "active",
          label: `${label(sketch, names, a.id)} stays the same length as ${label(sketch, names, b.id)}`,
          provenance: prov(
            "Detected: two edges measure the same within the clustering tolerance.",
            "P3",
            [`${a.len.toFixed(2)} mm vs ${b.len.toFixed(2)} mm`],
            0.85
          ),
        }, {
          headline: `${label(sketch, names, a.id)} and ${label(sketch, names, b.id)} are the same length`,
          evidence: [`${a.len.toFixed(2)} mm and ${b.len.toFixed(2)} mm — a difference of ${dLen.toFixed(2)} mm`],
          deviation: `${dLen.toFixed(2)} mm apart`,
          preserves: "Changing one length carries the other with it.",
          confidence: 0.85,
          affectedShapeIds: [a.shapeId, b.shapeId],
        });
      }
    }
  }

  // ---- P4: axis alignment --------------------------------------------------
  for (const s of segs) {
    const ang = Math.atan2(Math.abs(s.dy), Math.abs(s.dx));
    if (ang < angTol) {
      push(raw, existing, {
        kind: "horizontal",
        points: [],
        segments: [s.id],
        strength: "soft",
        driving: true,
        state: "active",
        label: `${label(sketch, names, s.id)} stays horizontal`,
        provenance: prov("Detected: the edge lies along the horizontal.", "P4", [`${((ang * 180) / Math.PI).toFixed(3)}° from horizontal`], 0.9),
      }, {
        headline: `${label(sketch, names, s.id)} is horizontal`,
        evidence: [`${((ang * 180) / Math.PI).toFixed(3)}° away from the horizontal`],
        deviation: `${((ang * 180) / Math.PI).toFixed(3)}°`,
        preserves: "The edge cannot tilt when the drawing is re-solved.",
        confidence: 0.9,
        affectedShapeIds: [s.shapeId],
      });
    } else if (Math.PI / 2 - ang < angTol) {
      push(raw, existing, {
        kind: "vertical",
        points: [],
        segments: [s.id],
        strength: "soft",
        driving: true,
        state: "active",
        label: `${label(sketch, names, s.id)} stays vertical`,
        provenance: prov("Detected: the edge lies along the vertical.", "P4", [`${(90 - (ang * 180) / Math.PI).toFixed(3)}° from vertical`], 0.9),
      }, {
        headline: `${label(sketch, names, s.id)} is vertical`,
        evidence: [`${(90 - (ang * 180) / Math.PI).toFixed(3)}° away from the vertical`],
        deviation: `${(90 - (ang * 180) / Math.PI).toFixed(3)}°`,
        preserves: "The edge cannot tilt when the drawing is re-solved.",
        confidence: 0.9,
        affectedShapeIds: [s.shapeId],
      });
    }
  }

  // ---- P5: symmetry about another edge's carrier ---------------------------
  // Two points are proposed as symmetric only when a real edge in the drawing
  // can act as the mirror line, so the axis is never invented.
  for (const axis of segs) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.shapeId === axis.shapeId) continue;
      for (let j = i + 1; j < segs.length; j++) {
        const t = segs[j];
        if (t.shapeId !== s.shapeId) continue;
        const pairs: [string, string][] = [
          [s.p1, t.p2],
          [s.p2, t.p1],
        ];
        for (const [pa, pb] of pairs) {
          const A = sketch.points[pa];
          const B = sketch.points[pb];
          if (!A || !B) continue;
          const oa = normalOffset(axis, A.x, A.y);
          const ob = normalOffset(axis, B.x, B.y);
          if (Math.abs(oa) < geoTol || Math.abs(ob) < geoTol) continue;
          if (Math.abs(oa + ob) > geoTol) continue;
          // Mirror also requires the midpoint to sit on the axis along its own
          // direction, which the residual will confirm; the gate does that.
          push(raw, existing, {
            kind: "symmetric",
            points: [pa, pb],
            segments: [axis.id],
            strength: "soft",
            driving: true,
            state: "active",
            label: `${label(sketch, names, s.id)} mirrors ${label(sketch, names, t.id)} about ${label(sketch, names, axis.id)}`,
            provenance: prov(
              "Detected: two corners sit at equal and opposite distances from an existing edge.",
              "P5",
              [`${Math.abs(oa).toFixed(2)} mm each side`],
              0.8
            ),
          }, {
            headline: `Two corners are mirrored about ${label(sketch, names, axis.id)}`,
            evidence: [`${oa.toFixed(2)} mm on one side, ${ob.toFixed(2)} mm on the other`],
            deviation: `${Math.abs(oa + ob).toFixed(3)} mm out of balance`,
            preserves: "The mirror survives, so one side cannot drift without the other.",
            confidence: 0.8,
            affectedShapeIds: [s.shapeId, axis.shapeId],
          });
        }
      }
    }
  }

  // ---- P7: a corner sitting on another edge --------------------------------
  // One of the most common relationships in a real drawing and one of the
  // easiest to lose: a post standing ON a deck, a rib meeting a web, a corner
  // landing on a centreline. Without it the assistant runs out of questions
  // while the geometry can still slide along the edge it is visibly touching.
  for (const carrier of segs) {
    for (const s of segs) {
      if (s.shapeId === carrier.shapeId) continue;
      for (const pid of [s.p1, s.p2]) {
        const pt = sketch.points[pid];
        if (!pt) continue;
        // A point that is already an endpoint of the carrier is welded to it,
        // which is topology rather than a relationship to propose.
        if (pid === carrier.p1 || pid === carrier.p2) continue;

        const perp = Math.abs(normalOffset(carrier, pt.x, pt.y));
        if (perp > geoTol) continue;
        // The foot has to land on the edge itself, not on its extension.
        const t = ((pt.x - carrier.ax) * carrier.dx + (pt.y - carrier.ay) * carrier.dy) / (carrier.len * carrier.len);
        if (t < -1e-6 || t > 1 + 1e-6) continue;

        push(raw, existing, {
          kind: "point_on_line",
          points: [pid],
          segments: [carrier.id],
          strength: "soft",
          driving: true,
          state: "active",
          label: `${label(sketch, names, s.id)} stays on ${label(sketch, names, carrier.id)}`,
          provenance: prov(
            "Detected: a corner lies on another edge.",
            "P7",
            [`${perp.toFixed(3)} mm off the line`],
            0.9
          ),
        }, {
          headline: `A corner of ${names[s.shapeId] ?? s.shapeId} sits on ${label(sketch, names, carrier.id)}`,
          evidence: [`Measured ${perp.toFixed(3)} mm off the line, ${(t * 100).toFixed(0)}% along it`],
          deviation: `${perp.toFixed(3)} mm`,
          preserves: "The corner stays on that edge however either one is later resized.",
          confidence: 0.9,
          affectedShapeIds: [s.shapeId, carrier.shapeId],
        });
      }
    }
  }

  // ---- P6: concentric circles ---------------------------------------------
  const circles = Object.values(sketch.circles);
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const c1 = sketch.points[circles[i].center];
      const c2 = sketch.points[circles[j].center];
      if (!c1 || !c2) continue;
      const d = Math.hypot(c1.x - c2.x, c1.y - c2.y);
      if (d > geoTol * 4 || d < 1e-12) continue;
      push(raw, existing, {
        kind: "concentric",
        points: [circles[i].center, circles[j].center],
        segments: [],
        strength: "soft",
        driving: true,
        state: "active",
        label: `${names[circles[i].shapeId] ?? circles[i].shapeId} and ${names[circles[j].shapeId] ?? circles[j].shapeId} share a centre`,
        provenance: prov("Detected: two circle centres coincide.", "P6", [`${d.toFixed(3)} mm apart`], 0.95),
      }, {
        headline: "Two circles share a centre",
        evidence: [`Centres are ${d.toFixed(3)} mm apart`],
        deviation: `${d.toFixed(3)} mm`,
        preserves: "They stay concentric when either radius changes.",
        confidence: 0.95,
        affectedShapeIds: [circles[i].shapeId, circles[j].shapeId],
      });
    }
  }

  // ---- admissibility gate, then minimisation -------------------------------
  //
  // Two passes. The first drops anything the existing constraints already
  // guarantee. The second is the part that stops the review list turning into a
  // wall of near-identical cards: candidates are taken greedily against a
  // GROWING Jacobian, so once "outer top is parallel to the opening's top" has
  // been offered, the seven other pairs it would imply are folded into it and
  // reported as a count rather than as seven more cards.
  const sys = buildSystem(sketch);
  const { jacobian } = evaluateSystem(sketch, sys, sys.X);

  const survivors: { cand: ConstraintCandidate; rows: number[][]; independentRows: number }[] = [];
  const conflicts: ConstraintCandidate[] = [];

  for (const cand of raw) {
    const asConstraint: SketchConstraint = { ...cand.constraint, id: cand.id };
    let evaluation;
    try {
      evaluation = evaluateConstraint(sketch, asConstraint, sys.X, sys.index);
    } catch {
      continue;
    }
    // The residual has to be measured in the same units the tolerance is written
    // in. A perpendicular constraint's raw residual is a dot product — square
    // millimetres — so on a 230 x 130 corner three THOUSANDTHS of a degree comes
    // out as 1.6 and sails past a 0.5 mm threshold. That is how a card could read
    // "Measured: 0.003° away from square" and, one line below, "This contradicts
    // what is already constrained, by 1.638". Both numbers described the same
    // corner; only one of them was in units anybody could compare.
    //
    // `rowScale` is what `evaluateSystem` divides by, and it turns that dot
    // product back into the sine of the angle.
    const scale = rowScale(sketch, asConstraint, sys.X, sys.index);
    let worstResidual = 0;
    let independentRows = 0;
    for (let r = 0; r < evaluation.jacobian.length; r++) {
      const verdict = isRowIndependent(jacobian, evaluation.jacobian[r], evaluation.residuals[r] / scale);
      worstResidual = Math.max(worstResidual, verdict.residual);
      if (verdict.isAdmissible) independentRows++;
    }

    if (independentRows === 0) {
      // Already guaranteed by what is there. Showing it would be a card the
      // author cannot usefully act on — unless it disagrees, which matters.
      if (worstResidual > Math.max(geoTol, 1e-6)) {
        conflicts.push({
          ...cand,
          admissible: false,
          dofRemoved: 0,
          admissibilityNote: `This contradicts what is already constrained, by ${worstResidual.toFixed(3)}.`,
        });
      }
      continue;
    }

    survivors.push({ cand, rows: evaluation.jacobian, independentRows });
  }

  survivors.sort(
    (a, b) =>
      b.cand.confidence - a.cand.confidence ||
      b.independentRows - a.independentRows ||
      (a.cand.id < b.cand.id ? -1 : 1)
  );

  const running = jacobian.map((r) => Array.from(r));
  const kept: ConstraintCandidate[] = [];

  for (const s of survivors) {
    let adds = 0;
    for (const row of s.rows) {
      const verdict = isRowIndependent(running, row);
      if (verdict.isAdmissible) adds++;
    }
    if (adds === 0) {
      // Implied by a card already on the list.
      const host = kept.find((k) => k.constraint.kind === s.cand.constraint.kind);
      if (host) host.impliedCount = (host.impliedCount ?? 0) + 1;
      continue;
    }
    for (const row of s.rows) running.push(Array.from(row));
    kept.push({ ...s.cand, admissible: true, dofRemoved: adds });
  }

  return [...conflicts, ...kept].slice(0, options.limit ?? 24);
}

function signature(c: { kind: string; points: string[]; segments: string[] }): string {
  return `${c.kind}|${[...c.points].sort().join(",")}|${[...c.segments].sort().join(",")}`;
}

function push(
  into: ConstraintCandidate[],
  existing: Set<string>,
  constraint: Omit<SketchConstraint, "id">,
  meta: Omit<ConstraintCandidate, "id" | "kind" | "constraint" | "admissible" | "dofRemoved">
): void {
  const sig = signature(constraint);
  if (existing.has(sig)) return;
  existing.add(sig);
  into.push({
    id: `cand_${sig.replace(/[^a-zA-Z0-9]/g, "_")}`,
    kind: "constraint",
    constraint,
    admissible: true,
    dofRemoved: 0,
    ...meta,
  });
}
