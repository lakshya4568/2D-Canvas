/**
 * Checking a formula somebody else wrote (§49.4, §56).
 *
 * Everywhere else the assistant is forbidden a number. A formula breaks that on
 * purpose and it is worth being exact about why, because it is the one place the
 * guardrail changes shape.
 *
 *     ClearSpan = OverallWidth - 2 * WallThickness
 *
 * That `2` came from the model. There is no way to express the relationship
 * without it, and refusing all literals would reduce the feature to renaming
 * things. So the guarantee cannot be "the model supplies no arithmetic" here. It
 * becomes something better:
 *
 *     THE MODEL'S ARITHMETIC IS CHECKED AGAINST THE DRAWING, NOT TRUSTED.
 *
 * A formula is a testable claim about geometry the author has already drawn.
 * Evaluate it on the values in front of us: if it reproduces the target to
 * within tolerance, it is consistent with this drawing and the `2` is the two
 * walls that are actually there. If it does not, it is wrong about THIS
 * structure whatever it may be true of in general, and it is refused with the
 * discrepancy stated in millimetres.
 *
 * That test is not a formality. A model asked for a box culvert's clear span
 * will happily produce `OverallWidth - WallThickness`, which is the right shape
 * and forgets that a box has two walls; it is out by 350 mm on a real section
 * and the check says so in the units the author thinks in.
 *
 * Three further gates around it, none of which the arithmetic check replaces:
 *
 *     the expression parses, and every name in it exists
 *     it introduces no cycle — the scalar DAG must stay a DAG (§9)
 *     applying it leaves a drawing that still solves
 */

import { Shape } from "../geometry/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { AuthoringSketch } from "./types";
import { validateExpression, evaluateParameters, dependenciesOf } from "./parameters";
import { regenerate } from "./document";

export interface FormulaCheck {
  ok: boolean;
  /** What the target reads now. */
  currentValue: number;
  /** What the formula says it should read, on the values in front of us. */
  predicted?: number;
  /** How far apart those are, in mm. */
  errorMm?: number;
  /** Names the expression reads. */
  dependencies: string[];
  /** Why it was refused, in the author's vocabulary. */
  reason?: string;
  /** One phrase for the card: how well it agrees with the drawing. */
  agreement?: string;
}

/**
 * Does this formula describe the drawing that is actually on the sheet?
 *
 * `shapes` is optional: without it the arithmetic is still checked, and only the
 * "does the drawing still solve" gate is skipped. That matters because the solve
 * is expensive and some callers — a card being rendered, a list being filtered —
 * only need to know whether the numbers agree.
 */
export function verifyProposedFormula(
  sketch: AuthoringSketch,
  target: string,
  expr: string,
  options: { shapes?: Shape[]; policy?: TolerancePolicy; shapeNames?: Record<string, string> } = {}
): FormulaCheck {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const existing = sketch.parameters[target];
  const currentValue = existing?.value ?? 0;
  const base: FormulaCheck = { ok: false, currentValue, dependencies: [] };

  if (!existing) {
    return { ...base, reason: `There is no value called ${target}.` };
  }

  // 1. Syntax, known names, and no cycle. `validateExpression` owns all three.
  const syntax = validateExpression(expr, target, sketch.parameters);
  if (!syntax.ok) {
    return { ...base, dependencies: syntax.dependencies, reason: syntax.message };
  }
  const dependencies = dependenciesOf(expr);
  if (dependencies.length === 0) {
    return {
      ...base,
      dependencies,
      reason: "That formula reads no other value, so it is a constant rather than a relationship.",
    };
  }
  const unknown = dependencies.filter((d) => !sketch.parameters[d]);
  if (unknown.length > 0) {
    return { ...base, dependencies, reason: `It reads ${unknown.join(", ")}, which do not exist.` };
  }
  if (dependencies.includes(target)) {
    return { ...base, dependencies, reason: `${target} cannot be worked out from itself.` };
  }

  // 2. The arithmetic check. Evaluate the whole DAG with the target derived and
  //    see whether it lands where the drawing already is.
  const probe: AuthoringSketch = {
    ...sketch,
    parameters: {
      ...sketch.parameters,
      [target]: { ...existing, role: "DERIVED", expr },
    },
  };
  const evaluated = evaluateParameters(probe.parameters);
  const failure = evaluated.errors.find((e) => e.parameter === target);
  if (failure) {
    return { ...base, dependencies, reason: failure.message };
  }

  const predicted = evaluated.values[target];
  if (!Number.isFinite(predicted)) {
    return { ...base, dependencies, reason: "That formula does not produce a number here." };
  }

  const errorMm = Math.abs(predicted - currentValue);
  // Scale-aware: a tenth of a millimetre out on a 40 m span is agreement; the
  // same absolute error on a 20 mm chamfer is not.
  const tolerance = Math.max(policy.geometry_mm, Math.abs(currentValue) * 1e-6);

  if (errorMm > tolerance) {
    return {
      ...base,
      dependencies,
      predicted,
      errorMm,
      reason: `It does not describe this drawing: it gives ${predicted.toFixed(
        1
      )} where ${target} measures ${currentValue.toFixed(1)} — out by ${errorMm.toFixed(1)} mm.`,
    };
  }

  // 3. The drawing still has to solve with the target following a formula
  //    instead of being typed. Only run when the caller handed us the shapes.
  if (options.shapes) {
    const result = regenerate(options.shapes, probe, {
      policy,
      shapeNames: options.shapeNames,
      preview: true,
    });
    if (result.rejection) {
      return { ...base, dependencies, predicted, errorMm, reason: result.rejection };
    }
  }

  return {
    ok: true,
    currentValue,
    predicted,
    errorMm,
    dependencies,
    agreement:
      errorMm < 1e-9
        ? "matches the drawing exactly"
        : `matches the drawing to ${errorMm.toFixed(3)} mm`,
  };
}
