/**
 * The invariant report — the product's real quality gate.
 * UPCE-MASTER-1.0 §5 (acceptance condition) and §67.
 */
import { describe, it, expect } from "vitest";
import {
  checkInvariants,
  formatInvariantReport,
  InvariantCheckInput,
} from "../../lib/validation/invariantChecker";
import { Point2D } from "../../lib/geometry/topology/types";

const SQUARE: Point2D[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

function healthy(): InvariantCheckInput {
  return {
    solver: {
      status: "converged",
      maxResidual: 3.1e-10,
      iterations: 6,
      algorithm: "dogleg",
      elapsedMs: 4.2,
    },
    structure: {
      underConstrainedBlocks: 0,
      wellConstrainedBlocks: 3,
      overConstrainedBlocks: 0,
    },
    invariants: [
      { name: "WallThickness", kind: "length", target: 350, measured: 350 },
      { name: "SlabDepth", kind: "length", target: 300, measured: 300 },
      { name: "HaunchAngle", kind: "angle", target: Math.PI / 4, measured: Math.PI / 4 },
      { name: "InterCellGap", kind: "gap", target: 10, measured: 10 },
    ],
    topology: {
      loops: [{ id: "outer", points: SQUARE, initialSignedArea: 10000 }],
      segments: SQUARE.map((p, i) => ({
        id: `s${i}`,
        a: p,
        b: SQUARE[(i + 1) % SQUARE.length],
      })),
      faceIdsBefore: ["f1", "f2", "f3"],
      faceIdsAfter: ["f1", "f2", "f3"],
    },
    assembly: {
      portAlignmentErrors: [{ portId: "web_right", error: 0 }],
      repeatedInstanceCount: 3,
      expectedInstanceCount: 3,
    },
  };
}

describe("§67 The green path", () => {
  it("accepts a fully healthy edit", () => {
    const r = checkInvariants(healthy());
    expect(r.verdict).toBe("green");
    expect(r.accepted).toBe(true);
    expect(r.failures).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.topology.faceIdentityRetained).toBe("3 / 3");
  });

  it("renders the §67 report in the documented layout", () => {
    const text = formatInvariantReport(checkInvariants(healthy()));
    for (const section of ["SOLVER", "STRUCTURE", "GEOMETRIC INVARIANTS", "TOPOLOGY", "ASSEMBLY"]) {
      expect(text).toContain(section);
    }
    expect(text).toContain("loop closure");
    expect(text).toContain("chirality preserved");
    expect(text).toContain("face identity retained");
    expect(text).toContain("VERDICT: GREEN");
  });
});

describe("§5 Every clause of the acceptance condition can fail independently", () => {
  it("rejects a solver that did not converge", () => {
    const input = healthy();
    input.solver.status = "diverged";
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.failures.join(" ")).toContain("diverged");
  });

  it("rejects a residual above ε_tol", () => {
    const input = healthy();
    input.solver.maxResidual = 1e-3;
    expect(checkInvariants(input).accepted).toBe(false);
  });

  it("rejects a NEW over-constrained block relative to the pre-edit baseline", () => {
    const input = healthy();
    input.structure.overConstrainedBlocks = 1;
    input.structure.expected = { underConstrainedBlocks: 0, overConstrainedBlocks: 0 };
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.failures.join(" ")).toContain("new over-constrained block");
  });

  it("accepts a PRE-EXISTING over-constrained block that the edit did not create", () => {
    const input = healthy();
    input.structure.overConstrainedBlocks = 1;
    input.structure.expected = { underConstrainedBlocks: 0, overConstrainedBlocks: 1 };
    expect(checkInvariants(input).accepted).toBe(true);
  });

  it("rejects a drifted declared invariant and names it in plain words", () => {
    const input = healthy();
    input.invariants[0].measured = 348;
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.failures[0]).toContain("WallThickness drifted to 348.000");
    expect(r.failures[0]).toContain("target 350.000");
  });

  it("rejects a chirality inversion", () => {
    const input = healthy();
    input.topology!.loops[0].points = [...SQUARE].reverse();
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.topology.chiralityPreserved).toBe("error");
    expect(r.failures.join(" ")).toContain("inverted its handedness");
  });

  it("rejects a self-intersecting result", () => {
    const bowtie: Point2D[] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    const input = healthy();
    input.topology!.segments = bowtie.map((p, i) => ({
      id: `b${i}`,
      a: p,
      b: bowtie[(i + 1) % bowtie.length],
    }));
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.topology.selfIntersection).toBe("error");
  });

  it("rejects a misaligned port", () => {
    const input = healthy();
    input.assembly!.portAlignmentErrors = [{ portId: "web_right", error: 3.2 }];
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.failures.join(" ")).toContain("web_right misaligned by 3.2000 mm");
  });

  it("rejects a repeat that produced the wrong instance count", () => {
    const input = healthy();
    input.assembly!.repeatedInstanceCount = 2;
    const r = checkInvariants(input);
    expect(r.accepted).toBe(false);
    expect(r.failures.join(" ")).toContain("expected 3");
  });

  it("warns (not fails) when a face lost its identity across the rebuild", () => {
    const input = healthy();
    input.topology!.faceIdsAfter = ["f1", "f2", "f9"];
    const r = checkInvariants(input);
    expect(r.accepted).toBe(true);
    expect(r.verdict).toBe("green");
    expect(r.warnings.join(" ")).toContain("lost their ID");
    expect(r.topology.faceIdentityRetained).toBe("2 / 3");
  });
});

describe("§26 Compliance is metadata, not a hard block", () => {
  it("turns a code deviation amber, never red", () => {
    const input = healthy();
    input.compliance = {
      boundViolations: [
        {
          parameter: "WallThickness",
          message: "WallThickness = 240 mm is below the 250 mm minimum.",
          severity: "warning",
        },
      ],
      standardsViolations: [],
      profileId: "IRC_STRUCTURAL",
    };
    const r = checkInvariants(input);
    expect(r.verdict).toBe("amber");
    expect(r.accepted).toBe(true);
    expect(r.warnings.join(" ")).toContain("below the 250 mm minimum");
  });

  it("blocks a physically impossible value", () => {
    const input = healthy();
    input.compliance = {
      boundViolations: [
        {
          parameter: "InnerWidth",
          message: "InnerWidth = -50 is physically impossible.",
          severity: "error",
        },
      ],
      standardsViolations: [],
    };
    const r = checkInvariants(input);
    expect(r.verdict).toBe("red");
    expect(r.accepted).toBe(false);
  });

  it("cites the clause on a relationship violation", () => {
    const input = healthy();
    input.compliance = {
      boundViolations: [],
      standardsViolations: [
        {
          rule: "ClearSpan / ClearHeight <= 3.0",
          message: "Aspect ratio exceeds 3.0",
          codeRef: "RDSO Recommended Practice",
        },
      ],
    };
    const r = checkInvariants(input);
    expect(r.verdict).toBe("amber");
    expect(r.warnings.join(" ")).toContain("[RDSO Recommended Practice]");
  });
});
