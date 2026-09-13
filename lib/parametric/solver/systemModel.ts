/**
 * One dispatcher from a constraint descriptor to its residual and Jacobian rows
 * (UPCE-ADDENDUM-2.0 §7, Modules 1-3).
 *
 * The new capabilities each arrived as a standalone evaluator, which is the
 * right shape for testing them and the wrong shape for using them: a caller
 * assembling a system would have to know which module each constraint lives in
 * and call it by hand, and the moment two callers do that differently the two
 * have quietly become two engines. This is the single seam — a descriptor in,
 * stacked rows out, every row analytical.
 *
 * Nothing here decides what a constraint MEANS. That is the author's business
 * and it happens well above this line; by the time a descriptor arrives the
 * decision has already been made and all that is left is arithmetic.
 */

import { ConstraintDescriptor, ConstraintEvaluationResult } from "../../solver/jacobians/types";
import { evaluateCentroidDistanceConstraint } from "../constraints/centroidConstraint";
import {
  evaluateRelativeOffsetX,
  evaluateRelativeOffsetY,
  evaluateDirectedNormalOffset,
} from "../constraints/relativeLineConstraint";
import { evaluateChiralityBarrier, evaluateHaunchLegs, HaunchCorner } from "../component/haunchPreserver";

/** No rows at all, for a descriptor this dispatcher does not own or that is off. */
const EMPTY: ConstraintEvaluationResult = { residuals: [], jacobian: [] };

function cornerOf(d: ConstraintDescriptor): HaunchCorner {
  const [wall, corner, slab] = d.pointIndices;
  return {
    wall,
    corner,
    slab,
    legWall: d.targetValue ?? 0,
    legSlab: d.targetValueB ?? d.targetValue ?? 0,
    orientation: d.orientation ?? 1,
  };
}

/** True when this dispatcher owns the descriptor's type. */
export function ownsConstraint(type: ConstraintDescriptor["type"]): boolean {
  return (
    type === "CENTROID_DISTANCE" ||
    type === "RELATIVE_OFFSET_X" ||
    type === "RELATIVE_OFFSET_Y" ||
    type === "DIRECTED_NORMAL_OFFSET" ||
    type === "HAUNCH_LEG" ||
    type === "CHIRALITY_BARRIER"
  );
}

/**
 * Evaluates one addendum constraint.
 *
 * Returns no rows for a descriptor it does not own, so it can sit alongside the
 * existing evaluator without either one having to know about the other.
 */
export function evaluateAddendumConstraint(
  X: number[],
  d: ConstraintDescriptor
): ConstraintEvaluationResult {
  if (d.isActive === false) return EMPTY;

  switch (d.type) {
    case "CENTROID_DISTANCE": {
      if (!d.loopA || !d.loopB) return EMPTY;
      return evaluateCentroidDistanceConstraint(X, {
        loopA: d.loopA,
        loopB: d.loopB,
        targetDistance: d.targetValue ?? 0,
      });
    }
    case "RELATIVE_OFFSET_X":
    case "RELATIVE_OFFSET_Y":
    case "DIRECTED_NORMAL_OFFSET": {
      const [p1, p2, p3, p4] = d.pointIndices;
      const spec = { p1, p2, p3, p4: p4 ?? p3, target: d.targetValue ?? 0 };
      if (d.type === "RELATIVE_OFFSET_X") return evaluateRelativeOffsetX(X, spec);
      if (d.type === "RELATIVE_OFFSET_Y") return evaluateRelativeOffsetY(X, spec);
      return evaluateDirectedNormalOffset(X, spec);
    }
    case "HAUNCH_LEG":
      return evaluateHaunchLegs(X, cornerOf(d));
    case "CHIRALITY_BARRIER":
      return evaluateChiralityBarrier(X, cornerOf(d), d.mu ?? 1e-3);
    default:
      return EMPTY;
  }
}

/**
 * Stacks a list of descriptors into one system the solver can take.
 *
 * Rows arrive in descriptor order and stay there, so a diagnostic that names row
 * seven can be traced back to the constraint that produced it — which is most of
 * the value of keeping assembly in one place.
 */
export function buildAddendumSystemModel(descriptors: ConstraintDescriptor[]): {
  evaluateResiduals(X: number[]): number[];
  evaluateJacobian(X: number[]): number[][];
  rowOwners(X: number[]): string[];
} {
  const evaluateAll = (X: number[]) => descriptors.map((d) => evaluateAddendumConstraint(X, d));

  return {
    evaluateResiduals(X: number[]): number[] {
      return evaluateAll(X).flatMap((r) => r.residuals);
    },
    evaluateJacobian(X: number[]): number[][] {
      return evaluateAll(X).flatMap((r) => r.jacobian);
    },
    rowOwners(X: number[]): string[] {
      const owners: string[] = [];
      evaluateAll(X).forEach((r, i) => {
        for (let k = 0; k < r.residuals.length; k++) owners.push(descriptors[i].id);
      });
      return owners;
    },
  };
}
