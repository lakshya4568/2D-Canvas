/**
 * Scale-invariant admissibility.
 *
 * `evaluateCandidateAdmissibility` compares the perpendicular component of a
 * candidate's gradient against an ABSOLUTE threshold (1e-6 by default). That is
 * only meaningful if gradients are O(1), and they are not: a parallel
 * constraint's gradient entries are edge lengths, so on a four-metre frame the
 * row has a norm around 1e6. A row that is dependent to nine significant figures
 * then leaves a perpendicular component of 1e-3, sails past the threshold, and
 * is admitted as "independent".
 *
 * The visible symptom was the review list refusing to shrink: "outer bottom is
 * parallel to the opening's top" would be offered as a fresh discovery
 * immediately after "outer top is parallel to the opening's top", even though
 * the first plus the rectangle's own right angles already imply it.
 *
 * Normalising every row to unit length before the test makes the comparison a
 * ratio, which is what the threshold was always meant to be.
 */

import {
  evaluateCandidateAdmissibility,
  AdmissibilityEvaluation,
} from "../inference/admissibilityFilter";

export function normaliseRow(row: ArrayLike<number>): number[] {
  let sumSq = 0;
  for (let i = 0; i < row.length; i++) sumSq += row[i] * row[i];
  const norm = Math.sqrt(sumSq);
  const out = new Array<number>(row.length);
  if (norm < 1e-300) {
    for (let i = 0; i < row.length; i++) out[i] = 0;
    return out;
  }
  for (let i = 0; i < row.length; i++) out[i] = row[i] / norm;
  return out;
}

/**
 * Does this candidate row say anything the existing rows do not?
 *
 * `residual` is passed through unscaled: it is a real measurement in model units
 * and is what separates a harmless duplicate from a contradiction (§7.3).
 */
export function isRowIndependent(
  currentJacobian: number[][],
  candidateRow: ArrayLike<number>,
  residual = 0
): AdmissibilityEvaluation {
  return evaluateCandidateAdmissibility(
    currentJacobian.map((r) => normaliseRow(r)),
    normaliseRow(candidateRow),
    residual
  );
}
