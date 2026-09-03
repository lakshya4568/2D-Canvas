import { describe, it, expect } from "vitest";
import { isConstraintAdmissible } from "../../lib/inference/admissibilityFilter";

describe("Constraint Admissibility & Rank-Based Redundancy Filter", () => {
  it("should accept independent constraint gradients", () => {
    // 2 constraints on 4 variables:
    // row 0: [1, 0, 0, 0]
    // row 1: [0, 1, 0, 0]
    const J = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ];

    // Candidate gradient: [0, 0, 1, 0] (orthogonal to row 0 and row 1)
    const candidateGradient = [0, 0, 1, 0];

    expect(isConstraintAdmissible(J, candidateGradient)).toBe(true);
  });

  it("should reject linearly dependent / redundant constraint gradients", () => {
    // Current Jacobian with 2 rows:
    // row 0: [1, -1, 0, 0]
    // row 1: [0, 1, -1, 0]
    const J = [
      [1, -1, 0, 0],
      [0, 1, -1, 0],
    ];

    // Candidate gradient: [1, 0, -1, 0] which is row 0 + row 1!
    const redundantGradient = [1, 0, -1, 0];

    expect(isConstraintAdmissible(J, redundantGradient)).toBe(false);
  });
});
