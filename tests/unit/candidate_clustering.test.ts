import { describe, it, expect } from "vitest";
import {
  clusterCandidates,
  CandidateLifecycleManager,
  ConstraintCandidate,
} from "../../lib/inference/candidateClusterer";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

describe("Candidate Clustering & Lifecycle Engine (UPCE-MASTER-1.0 §42, §47)", () => {
  it("should cluster 4 parallel offsets binned to 100 mm into a single WallThickness card with 4 occurrences", () => {
    const candidates: ConstraintCandidate[] = [
      {
        id: "cand_top",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e_out_top", "e_in_top"],
        nominalValue: 100.02,
        measuredDeviation: 0.02,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
        parameterName: "WallThickness",
      },
      {
        id: "cand_bottom",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e_out_bottom", "e_in_bottom"],
        nominalValue: 99.98,
        measuredDeviation: 0.02,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
        parameterName: "WallThickness",
      },
      {
        id: "cand_left",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e_out_left", "e_in_left"],
        nominalValue: 100.0,
        measuredDeviation: 0.0,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
        parameterName: "WallThickness",
      },
      {
        id: "cand_right",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e_out_right", "e_in_right"],
        nominalValue: 100.01,
        measuredDeviation: 0.01,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
        parameterName: "WallThickness",
      },
    ];

    const cards = clusterCandidates(candidates, DEFAULT_TOLERANCE_POLICY);

    expect(cards).toHaveLength(1);
    const card = cards[0];

    expect(card.parameterName).toBe("WallThickness");
    expect(card.displayName).toBe("Wall Thickness");
    expect(card.occurrences).toBe(4);
    expect(card.nominalValue).toBeCloseTo(100.0025, 4);
    expect(card.entities).toHaveLength(8);
    expect(card.status).toBe("admissible");
    expect(card.confidence).toBe("GeometricFact");
    expect(card.description).toContain("Merged 4 wall thickness candidates to 100.00 mm");
  });

  it("should separate distinct parameter values into separate cards", () => {
    const candidates: ConstraintCandidate[] = [
      // 2 wall thickness candidates at 100 mm
      {
        id: "cand_wall_1",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["w1", "w2"],
        nominalValue: 100.0,
        measuredDeviation: 0.0,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
      },
      {
        id: "cand_wall_2",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["w3", "w4"],
        nominalValue: 100.2,
        measuredDeviation: 0.2,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
      },
      // 2 slab thickness candidates at 300 mm
      {
        id: "cand_slab_1",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["s1", "s2"],
        nominalValue: 300.0,
        measuredDeviation: 0.0,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
      },
      {
        id: "cand_slab_2",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["s3", "s4"],
        nominalValue: 299.8,
        measuredDeviation: 0.2,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "Level1Predicate",
      },
    ];

    const cards = clusterCandidates(candidates, DEFAULT_TOLERANCE_POLICY);

    expect(cards).toHaveLength(2);

    const card100 = cards.find((c) => Math.abs(c.nominalValue - 100) < 5);
    const card300 = cards.find((c) => Math.abs(c.nominalValue - 300) < 5);

    expect(card100).toBeDefined();
    expect(card100!.occurrences).toBe(2);
    expect(card100!.nominalValue).toBeCloseTo(100.1, 3);

    expect(card300).toBeDefined();
    expect(card300!.occurrences).toBe(2);
    expect(card300!.nominalValue).toBeCloseTo(299.9, 3);
  });

  it("should preserve rejection memory across suggestion cycles", () => {
    const mgr = new CandidateLifecycleManager();

    const cand: ConstraintCandidate = {
      id: "cand_1",
      predicate: "P3_PARALLEL_OFFSET",
      entityIds: ["l1", "l2"],
      nominalValue: 100.0,
      measuredDeviation: 0.0,
      confidence: "Inference",
      status: "pending",
      provenance: "Level1Predicate",
    };

    // Before rejection
    expect(mgr.filterRejectedCandidates([cand])).toHaveLength(1);

    // Reject
    mgr.rejectCandidate(cand);
    expect(cand.status).toBe("rejected");

    // After rejection, filtered out
    expect(mgr.filterRejectedCandidates([cand])).toHaveLength(0);
  });

  it("should mark card as conflicting if any candidate has conflicting status", () => {
    const candidates: ConstraintCandidate[] = [
      {
        id: "c1",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e1", "e2"],
        nominalValue: 200,
        measuredDeviation: 0,
        confidence: "Inference",
        status: "admissible",
        provenance: "test",
      },
      {
        id: "c2",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e3", "e4"],
        nominalValue: 200.2,
        measuredDeviation: 0.2,
        confidence: "Inference",
        status: "conflicting",
        provenance: "test",
        diagnosis: "Conflict with driving width",
      },
    ];

    const cards = clusterCandidates(candidates, DEFAULT_TOLERANCE_POLICY);
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe("conflicting");
    expect(cards[0].diagnosis).toContain("Conflict with driving width");
  });

  it("should preserve accepted and rejected card statuses when all candidates are accepted or rejected", () => {
    const acceptedCandidates: ConstraintCandidate[] = [
      {
        id: "a1",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e1", "e2"],
        nominalValue: 150,
        measuredDeviation: 0,
        confidence: "GeometricFact",
        status: "accepted",
        provenance: "test",
        parameterName: "WallThickness",
      },
      {
        id: "a2",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e3", "e4"],
        nominalValue: 150.1,
        measuredDeviation: 0.1,
        confidence: "GeometricFact",
        status: "accepted",
        provenance: "test",
        parameterName: "WallThickness",
      },
    ];

    const acceptedCards = clusterCandidates(acceptedCandidates, DEFAULT_TOLERANCE_POLICY);
    expect(acceptedCards).toHaveLength(1);
    expect(acceptedCards[0].status).toBe("accepted");

    const rejectedCandidates: ConstraintCandidate[] = [
      {
        id: "r1",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["e1", "e2"],
        nominalValue: 150,
        measuredDeviation: 0,
        confidence: "Inference",
        status: "rejected",
        provenance: "test",
        parameterName: "WallThickness",
      },
    ];

    const rejectedCards = clusterCandidates(rejectedCandidates, DEFAULT_TOLERANCE_POLICY);
    expect(rejectedCards).toHaveLength(1);
    expect(rejectedCards[0].status).toBe("rejected");
  });

  it("should not merge candidates with different parameter semantics even if values match", () => {
    const candidates: ConstraintCandidate[] = [
      {
        id: "wall",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["w1", "w2"],
        nominalValue: 100,
        measuredDeviation: 0,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "test",
        parameterName: "WallThickness",
      },
      {
        id: "span",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["s1", "s2"],
        nominalValue: 100,
        measuredDeviation: 0,
        confidence: "GeometricFact",
        status: "admissible",
        provenance: "test",
        parameterName: "ClearSpan",
      },
    ];

    const cards = clusterCandidates(candidates, DEFAULT_TOLERANCE_POLICY);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.parameterName).sort()).toEqual(["ClearSpan", "WallThickness"]);
  });

  it("should not suppress unrelated cards or candidates when rejecting a card with bare predicate", () => {
    const mgr = new CandidateLifecycleManager();

    const cand1: ConstraintCandidate = {
      id: "c_offset_100",
      predicate: "P3_PARALLEL_OFFSET",
      entityIds: ["l1", "l2"],
      nominalValue: 100,
      measuredDeviation: 0,
      confidence: "Inference",
      status: "pending",
      provenance: "test",
    };

    const cand2: ConstraintCandidate = {
      id: "c_offset_300",
      predicate: "P3_PARALLEL_OFFSET",
      entityIds: ["l3", "l4"],
      nominalValue: 300,
      measuredDeviation: 0,
      confidence: "Inference",
      status: "pending",
      provenance: "test",
    };

    const cards = clusterCandidates([cand1, cand2], DEFAULT_TOLERANCE_POLICY);
    expect(cards).toHaveLength(2);

    const card100 = cards.find((c) => Math.abs(c.nominalValue - 100) < 5)!;
    const card300 = cards.find((c) => Math.abs(c.nominalValue - 300) < 5)!;

    // Reject card100
    mgr.rejectCard(card100);
    expect(mgr.isCardRejected(card100)).toBe(true);

    // card300 MUST NOT be rejected!
    expect(mgr.isCardRejected(card300)).toBe(false);

    // A new candidate for the 300mm offset on l3-l4 must remain unsuppressed
    expect(mgr.isCandidateRejected(cand2)).toBe(false);

    // Only the rejected candidate cand1 on l1-l2 is suppressed
    expect(mgr.isCandidateRejected(cand1)).toBe(true);
  });

  it("should not supersede orthogonal dimensions that share a common corner vertex", () => {
    const mgr = new CandidateLifecycleManager();

    // Span between p1 and p2 (nominal 2000)
    const candSpan: ConstraintCandidate = {
      id: "cand_span",
      predicate: "DISTANCE",
      entityIds: ["p1", "p2"],
      nominalValue: 2000,
      measuredDeviation: 0,
      confidence: "Inference",
      status: "pending",
      provenance: "test",
      parameterName: "ClearSpan",
    };

    // Height between p2 and p3 (nominal 1500), sharing vertex p2
    const candHeight: ConstraintCandidate = {
      id: "cand_height",
      predicate: "DISTANCE",
      entityIds: ["p2", "p3"],
      nominalValue: 1500,
      measuredDeviation: 0,
      confidence: "Inference",
      status: "pending",
      provenance: "test",
      parameterName: "ClearHeight",
    };

    const cardsSpan = clusterCandidates([candSpan], DEFAULT_TOLERANCE_POLICY);
    const cardsHeight = clusterCandidates([candHeight], DEFAULT_TOLERANCE_POLICY);

    mgr.updateLifecycleCards(cardsSpan);
    expect(mgr.getActiveCards()).toHaveLength(1);

    // Introducing height card sharing vertex p2 must NOT supersede span!
    const res = mgr.updateLifecycleCards(cardsHeight);
    expect(res.activeCards).toHaveLength(2);
    expect(res.supersededCards).toHaveLength(0);
  });
});
