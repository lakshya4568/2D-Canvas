/**
 * Derived-scalar inference — the narrow, gated replacement for the old
 * "suggest a formula for every pair of coordinates" behaviour.
 *
 * §49.3, the anti-curve-fitting rule, is what this file is built around. A
 * relationship is proposed only when ALL of the following hold:
 *
 *   1. the target is a real measurable quantity in the drawing, not an
 *      arbitrary coordinate difference;
 *   2. the expression is a small integer/half-integer combination of parameters
 *      that already exist, with NO free constant term — a fitted intercept is
 *      how coincidences masquerade as design intent;
 *   3. it survives a perturbation sweep in which the driving parameters are
 *      moved, the GEOMETRY IS ACTUALLY RE-SOLVED, and the quantity is
 *      re-measured. The solver is the oracle (§51), not the algebra.
 *
 * A candidate that fails the sweep is discarded silently. That is the whole
 * difference between "InnerWidth = OuterWidth - 2 x WallThickness", which holds
 * under every perturbation because the constraints make it hold, and
 * "R2_Width = R1_Width - LeftOffset - RightClearance", which was true once, for
 * one drawing, by arithmetic accident.
 */

import { Shape } from "../geometry/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { AuthoringSketch, DerivedCandidate, SketchParameter } from "./types";
import { regenerate } from "./document";
import { evaluateFormula } from "../parametric/expression";

/** A number in the drawing that can be measured and might deserve a name. */
export interface Measurable {
  id: string;
  /** Suggested parameter name; the author can rename it. */
  name: string;
  /** Human description of what is being measured. */
  description: string;
  value: number;
  /** Re-measures the quantity on a solved sketch. */
  measure: (sketch: AuthoringSketch) => number | null;
  shapeIds: string[];
}

function edgeLength(sketch: AuthoringSketch, segId: string): number | null {
  const seg = sketch.segments[segId];
  if (!seg) return null;
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function cleanName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, "") || "Value";
}

/**
 * Quantities worth offering a name to: the lengths of edges that no parameter
 * already drives. An edge that is already `= OuterWidth` needs no formula.
 */
export function measurables(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string> = {}
): Measurable[] {
  const drivenSegments = new Set<string>();
  for (const c of sketch.constraints) {
    if (c.kind !== "distance" || !c.paramRef) continue;
    for (const seg of Object.values(sketch.segments)) {
      if (
        (seg.p1 === c.points[0] && seg.p2 === c.points[1]) ||
        (seg.p2 === c.points[0] && seg.p1 === c.points[1])
      ) {
        drivenSegments.add(seg.id);
      }
    }
  }

  const out: Measurable[] = [];
  const seenValues = new Map<string, number>();

  for (const seg of Object.values(sketch.segments)) {
    if (drivenSegments.has(seg.id)) continue;
    if (sketch.circles[`${seg.shapeId}:c`]) continue;
    if (seg.shapeId.includes("#")) continue; // repeat copies mirror the original
    const len = edgeLength(sketch, seg.id);
    if (len === null || len < 1) continue;

    const shape = shapeNames[seg.shapeId] ?? seg.shapeId;
    const side = ["top", "right", "bottom", "left"][seg.edgeIndex] ?? `edge ${seg.edgeIndex + 1}`;
    const axisWord = seg.edgeIndex % 2 === 0 ? "Width" : "Height";

    // Opposite edges of a rectangle measure the same thing; offer it once.
    const key = `${seg.shapeId}:${axisWord}`;
    if (seenValues.has(key)) continue;
    seenValues.set(key, len);

    out.push({
      id: seg.id,
      name: `${cleanName(shape)}${axisWord}`,
      description: `${shape}'s ${side} edge`,
      value: len,
      measure: (s) => edgeLength(s, seg.id),
      shapeIds: [seg.shapeId],
    });
  }

  return out;
}

const COEFFS = [-2, -1, -0.5, 0, 0.5, 1, 2];

interface Combination {
  terms: { name: string; coeff: number }[];
  expr: string;
}

function renderExpression(terms: { name: string; coeff: number }[]): string {
  const parts: string[] = [];
  terms.forEach((t, i) => {
    const abs = Math.abs(t.coeff);
    const body = abs === 1 ? t.name : `${abs} * ${t.name}`;
    if (i === 0) parts.push(t.coeff < 0 ? `-${body}` : body);
    else parts.push(`${t.coeff < 0 ? "-" : "+"} ${body}`);
  });
  return parts.join(" ");
}

/**
 * Small integer/half-integer combinations only, no constant term, at most three
 * sources, and the simplest match wins. Widening any of those three limits is
 * how a suggestion list turns back into noise.
 */
function findCombinations(
  target: number,
  sources: SketchParameter[],
  tolerance: number
): Combination[] {
  const found: Combination[] = [];
  const names = sources.map((s) => s.name);
  const values = sources.map((s) => s.value);
  const n = sources.length;
  if (n === 0) return found;

  const search = (i: number, coeffs: number[], used: number) => {
    if (found.length > 24) return;
    if (i === n) {
      // A single-term match is never a derived relationship worth naming. With
      // a coefficient of 1 it is an identity — the right answer there is an
      // equal-length constraint, not a formula that hides the fact that two
      // edges are the same edge. With any other coefficient it is a bare ratio
      // fitted to one measurement, which is the curve-fitting §49.3 forbids.
      if (used < 2) return;
      let sum = 0;
      for (let k = 0; k < n; k++) sum += coeffs[k] * values[k];
      if (Math.abs(sum - target) > tolerance) return;
      const terms = coeffs
        .map((c, k) => ({ name: names[k], coeff: c }))
        .filter((t) => t.coeff !== 0);
      found.push({ terms, expr: renderExpression(terms) });
      return;
    }
    for (const c of COEFFS) {
      if (c !== 0 && used >= 3) continue;
      coeffs[i] = c;
      search(i + 1, coeffs, used + (c === 0 ? 0 : 1));
    }
    coeffs[i] = 0;
  };

  search(0, new Array(n).fill(0), 0);

  // Fewest terms first, then simplest coefficients.
  found.sort(
    (a, b) =>
      a.terms.length - b.terms.length ||
      a.terms.reduce((m, t) => m + Math.abs(t.coeff), 0) -
        b.terms.reduce((m, t) => m + Math.abs(t.coeff), 0)
  );
  return found;
}

export interface DeriveOptions {
  policy?: TolerancePolicy;
  shapeNames?: Record<string, string>;
  /** Perturbation samples per source parameter. */
  samples?: number;
  limit?: number;
}

/**
 * The perturbation gate.
 *
 * Moves each source parameter, RE-SOLVES the drawing, and re-measures the
 * target. A relationship that is a consequence of the constraints holds every
 * time; one that was a numerical coincidence does not survive the first push.
 */
function perturbationTest(
  sketch: AuthoringSketch,
  authoredShapes: Shape[],
  target: Measurable,
  combo: Combination,
  options: DeriveOptions
): { cases: number; passed: number; maxError: number } {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const deltas = [-0.2, -0.1, 0.1, 0.25];
  let cases = 0;
  let passed = 0;
  let maxError = 0;

  for (const term of combo.terms) {
    const source = sketch.parameters[term.name];
    if (!source) continue;
    for (const d of deltas.slice(0, options.samples ?? deltas.length)) {
      const trial = source.value * (1 + d);
      if (trial <= 0) continue;
      if (source.min !== undefined && trial < source.min) continue;
      if (source.max !== undefined && trial > source.max) continue;

      const probe: AuthoringSketch = {
        ...sketch,
        parameters: { ...sketch.parameters, [term.name]: { ...source, value: trial } },
      };
      const result = regenerate(authoredShapes, probe, {
        policy,
        shapeNames: options.shapeNames,
        preview: true,
      });
      if (result.rejection || !result.converged) continue;

      const measured = target.measure(result.sketch);
      if (measured === null) continue;

      const symbols: Record<string, number> = {};
      for (const [k, v] of Object.entries(result.sketch.parameters)) symbols[k] = v.value;
      const predicted = evaluateFormula(combo.expr, symbols);
      if (predicted.error) continue;

      cases++;
      const err = Math.abs(predicted.value - measured);
      maxError = Math.max(maxError, err);
      if (err <= Math.max(policy.cluster_mm, 1e-6)) passed++;
    }
  }

  return { cases, passed, maxError };
}

/**
 * Proposes derived parameters for quantities the drawing already determines.
 *
 * Expensive by design — it re-solves the sketch several times per candidate —
 * so callers run it at an authoring checkpoint, never on pointer movement (§34).
 */
export function proposeDerived(
  sketch: AuthoringSketch,
  authoredShapes: Shape[],
  options: DeriveOptions = {}
): DerivedCandidate[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const sources = Object.values(sketch.parameters).filter(
    (p) => p.role === "DRIVING" && p.type === "LENGTH"
  );
  if (sources.length === 0) return [];

  const out: DerivedCandidate[] = [];

  for (const target of measurables(sketch, options.shapeNames)) {
    if (sketch.parameters[target.name]) continue;

    // Several expressions can hit the same number when two parameters happen to
    // share a value today — a 300 mm side thickness and a 300 mm end thickness
    // make `H - 2*Side` and `H - 2*End` equally good on paper. Trying a handful
    // and letting the perturbation sweep decide is what tells them apart: only
    // the one the constraints actually enforce survives being pushed.
    const combos = findCombinations(target.value, sources, policy.cluster_mm);
    for (const combo of combos.slice(0, 6)) {
      const validation = perturbationTest(sketch, authoredShapes, target, combo, options);

      // A relationship nobody could test is not a relationship anybody should
      // trust, so an untested candidate is dropped rather than shown as "maybe".
      if (validation.cases === 0) continue;
      if (validation.passed < validation.cases) continue;

      out.push({
        id: `der_${target.id}_${combo.expr.replace(/[^A-Za-z0-9]/g, "")}`,
        kind: "derived",
        name: target.name,
        expr: combo.expr,
        value: target.value,
        headline: `${target.description} is always ${combo.expr}`,
        evidence: [
          `Measured now: ${target.value.toFixed(2)} mm`,
          `Expression gives: ${combo.terms
            .map((t) => `${t.coeff} x ${t.name} (${sketch.parameters[t.name].value.toFixed(1)})`)
            .join(" ")}`,
          `Held in all ${validation.cases} perturbation cases, worst error ${validation.maxError.toExponential(1)} mm`,
        ],
        validation,
        confidence: Math.min(0.99, 0.75 + 0.05 * validation.cases),
        dependencies: combo.terms.map((t) => t.name),
      });
      break; // one proposal per quantity; the simplest that survived
    }
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, options.limit ?? 8);
}

/** Commits an accepted derived candidate as a DERIVED parameter. */
export function acceptDerived(
  sketch: AuthoringSketch,
  candidate: DerivedCandidate
): AuthoringSketch {
  return {
    ...sketch,
    parameters: {
      ...sketch.parameters,
      [candidate.name]: {
        name: candidate.name,
        role: "DERIVED",
        type: "LENGTH",
        unit: "mm",
        value: candidate.value,
        expr: candidate.expr,
        dependencies: candidate.dependencies,
        provenance: {
          origin: "inference-accepted",
          detail: `Proposed after the relationship held through ${candidate.validation.cases} perturbation cases, and accepted by the author.`,
          evidence: candidate.evidence,
          confidence: candidate.confidence,
          createdAt: Date.now(),
        },
        boundConstraints: [],
        published: false,
        uiGroup: "Derived",
        description: candidate.headline,
      },
    },
  };
}
