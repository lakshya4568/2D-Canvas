import { describe, it, expect } from "vitest";
import {
  isConstraintAdmissible,
  evaluateCandidateAdmissibility,
} from "../../lib/inference/admissibilityFilter";

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

    const evalRes = evaluateCandidateAdmissibility(J, candidateGradient, 0.0);
    expect(evalRes.status).toBe("independent");
    expect(evalRes.isAdmissible).toBe(true);
    expect(evalRes.perpNorm).toBeCloseTo(1.0, 6);
  });

  it("should reject linearly dependent / redundant constraint gradients with small residual", () => {
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

    // With residual = 0 (satisfied constraint)
    const evalRes = evaluateCandidateAdmissibility(J, redundantGradient, 0.0);
    expect(evalRes.status).toBe("redundant");
    expect(evalRes.isAdmissible).toBe(false);
    expect(evalRes.perpNorm).toBeLessThan(1e-6);
  });

  it("should detect conflicting constraints when linearly dependent but residual >= residualTol", () => {
    // Current Jacobian fixing x1 - x2 = 100, x2 - x3 = 200 => x1 - x3 = 300
    const J = [
      [1, -1, 0, 0],
      [0, 1, -1, 0],
    ];

    // Candidate tries to constrain x1 - x3, but with an inconsistent residual of 50 mm
    const candidateGradient = [1, 0, -1, 0];
    const evalRes = evaluateCandidateAdmissibility(J, candidateGradient, 50.0, {
      residualTol: 0.5,
    });

    expect(evalRes.status).toBe("conflicting");
    expect(evalRes.isAdmissible).toBe(false);
    expect(evalRes.perpNorm).toBeLessThan(1e-6);
    expect(evalRes.residual).toBe(50.0);
    expect(evalRes.diagnosis).toBeDefined();
    expect(evalRes.diagnosis).toContain("Conflicting constraint");
  });

  it("should handle empty Jacobian gracefully", () => {
    const J: number[][] = [];
    const candidateGradient = [1, 0, 0];
    const evalRes = evaluateCandidateAdmissibility(J, candidateGradient, 0.0);
    expect(evalRes.status).toBe("independent");
    expect(evalRes.isAdmissible).toBe(true);
    expect(evalRes.perpNorm).toBeCloseTo(1.0, 6);
  });
});
