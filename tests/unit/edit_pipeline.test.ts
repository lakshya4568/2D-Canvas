/**
 * The 13-step user-mode edit pipeline and its transaction boundary.
 * UPCE-MASTER-1.0 §66, §67 (rollback), §13 ("the transaction is rejected wholesale").
 */
import { describe, it, expect } from "vitest";
import {
  runEditPipeline,
  EditPipelineEngine,
  EngineSnapshot,
  PipelineParameter,
  SolveOutcome,
  EditPipelineStepName,
} from "../../lib/runtime/editPipeline";
import { InvariantReport } from "../../lib/validation/invariantChecker";
import { parseStandardsProfile } from "../../lib/validation/standardsProfile";

const EXPECTED_ORDER: EditPipelineStepName[] = [
  "validate-input",
  "update-driving",
  "evaluate-dag",
  "regenerate-instances",
  "partition-dirty-subgraph",
  "apply-transforms",
  "bind-targets",
  "solve",
  "resync-dcel",
  "check-invariants",
  "post-solve-metrics",
  "render",
];

function greenReport(): InvariantReport {
  return {
    verdict: "green",
    accepted: true,
    solver: { status: "converged", maxResidual: 0, iterations: 1, algorithm: "dogleg", elapsedMs: 1, severity: "ok" },
    structure: { underConstrainedBlocks: 0, wellConstrainedBlocks: 1, overConstrainedBlocks: 0, severity: "ok", detail: "" },
    geometricInvariants: [],
    topology: { loopClosure: "ok", selfIntersection: "ok", chiralityPreserved: "ok", faceIdentityRetained: "1 / 1", severity: "ok", details: [] },
    assembly: null,
    compliance: null,
    failures: [],
    warnings: [],
  };
}

class FakeEngine implements EditPipelineEngine {
  public params: Record<string, number> = { ClearSpan: 2000, WallThickness: 350, CellCount: 3 };
  public coordinates = [0, 0, 2000, 0];
  public restored = 0;
  public solveCalls = 0;
  public regenerated: { name: string; count: number }[] = [];
  public rendered = 0;

  constructor(
    private overrides: {
      solve?: (n: number) => SolveOutcome;
      report?: () => InvariantReport;
      throwAt?: EditPipelineStepName;
    } = {}
  ) {}

  private declarations: PipelineParameter[] = [
    { name: "ClearSpan", role: "DRIVING", type: "LENGTH", value: 2000, min: 1200, max: 6000 },
    { name: "WallThickness", role: "DRIVING", type: "LENGTH", value: 350, min: 250, max: 1000 },
    { name: "CellCount", role: "DRIVING", type: "COUNT", value: 3, min: 1, max: 6 },
    { name: "TotalSpan", role: "DERIVED", type: "LENGTH", value: 7400 },
  ];

  getParameters(): PipelineParameter[] {
    return this.declarations.map((p) => ({ ...p, value: this.params[p.name] ?? p.value }));
  }
  snapshot(): EngineSnapshot {
    return { parameters: { ...this.params }, coordinates: [...this.coordinates] };
  }
  restore(s: EngineSnapshot): void {
    this.params = { ...s.parameters };
    this.coordinates = [...s.coordinates];
    this.restored += 1;
  }
  setDrivingParameter(name: string, value: number): void {
    this.params[name] = value;
  }
  evaluateDag(): Record<string, number> {
    if (this.overrides.throwAt === "evaluate-dag") throw new Error("DAG blew up");
    const total =
      this.params.CellCount * this.params.ClearSpan +
      (this.params.CellCount + 1) * this.params.WallThickness;
    return { TotalSpan: total };
  }
  regenerateInstances(name: string, count: number): number {
    this.regenerated.push({ name, count });
    return count;
  }
  partitionDirtySubgraph(changed: string[]): string[] {
    return changed.length > 0 ? ["component_0"] : [];
  }
  applyTransforms(): void {}
  bindTargets(): void {}
  solve(): SolveOutcome {
    this.solveCalls += 1;
    if (this.overrides.solve) return this.overrides.solve(this.solveCalls);
    this.coordinates = [0, 0, this.params.ClearSpan, 0];
    return {
      converged: true,
      maxResidual: 1e-12,
      iterations: 4,
      algorithm: "dogleg",
      coordinates: this.coordinates,
    };
  }
  resyncTopology() {
    return { faceIdsBefore: ["f1"], faceIdsAfter: ["f1"] };
  }
  checkInvariants(): InvariantReport {
    return (this.overrides.report ?? greenReport)();
  }
  computeDerivedMetrics(): Record<string, number> {
    return { NetArea: 1.34 };
  }
  render(): void {
    this.rendered += 1;
  }
}

describe("§66 The thirteen steps run in order", () => {
  it("executes every step exactly once, in the documented sequence", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }], {
      now: (() => {
        let t = 0;
        return () => (t += 1);
      })(),
    });
    expect(r.committed).toBe(true);
    expect(r.trace.map((s) => s.step)).toEqual(EXPECTED_ORDER);
    expect(r.trace.map((s) => s.index)).toEqual(EXPECTED_ORDER.map((_, i) => i + 1));
  });

  it("evaluates the DAG and returns the derived values", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.derived.TotalSpan).toBe(3 * 2200 + 4 * 350);
  });

  it("takes the value-only fast path for a non-structural change", () => {
    const r = runEditPipeline(new FakeEngine(), [{ name: "ClearSpan", value: 2200 }]);
    expect(r.fastPath).toBe(true);
    expect(r.structural).toBe(false);
  });

  it("runs post-solve metrics and renders", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.metrics.NetArea).toBe(1.34);
    expect(engine.rendered).toBe(1);
  });
});

describe("§23.4 A COUNT change is a topology mutation, not a value edit", () => {
  it("regenerates instances and abandons the fast path", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "CellCount", value: 4 }]);
    expect(r.committed).toBe(true);
    expect(r.structural).toBe(true);
    expect(r.fastPath).toBe(false);
    expect(engine.regenerated).toEqual([{ name: "CellCount", count: 4 }]);
  });

  it("rejects a fractional count", () => {
    const r = runEditPipeline(new FakeEngine(), [{ name: "CellCount", value: 3.5 }]);
    expect(r.committed).toBe(false);
    expect(r.reason).toBe("out-of-bounds");
    expect(r.message).toContain("whole number");
  });
});

describe("§66 step 2 — input validation", () => {
  it("rejects an unknown parameter", () => {
    const r = runEditPipeline(new FakeEngine(), [{ name: "Nope", value: 1 }]);
    expect(r.reason).toBe("unknown-parameter");
  });

  it("refuses to write a DERIVED parameter and explains the conversion (§20)", () => {
    const r = runEditPipeline(new FakeEngine(), [{ name: "TotalSpan", value: 9000 }]);
    expect(r.reason).toBe("not-driving");
    expect(r.message).toContain("driving dimension");
  });

  it("rejects a value outside the declared bounds", () => {
    const low = runEditPipeline(new FakeEngine(), [{ name: "ClearSpan", value: 100 }]);
    expect(low.reason).toBe("out-of-bounds");
    expect(low.message).toContain("at least 1200");
    const high = runEditPipeline(new FakeEngine(), [{ name: "ClearSpan", value: 99999 }]);
    expect(high.message).toContain("at most 6000");
  });

  it("rejects a non-finite value", () => {
    expect(runEditPipeline(new FakeEngine(), [{ name: "ClearSpan", value: NaN }]).reason).toBe(
      "non-finite"
    );
  });

  it("never touches the model when validation fails", () => {
    const engine = new FakeEngine();
    const before = { ...engine.params };
    runEditPipeline(engine, [{ name: "ClearSpan", value: 100 }]);
    expect(engine.params).toEqual(before);
    // Validation precedes the snapshot, so no restore was even needed.
    expect(engine.restored).toBe(0);
    expect(engine.solveCalls).toBe(0);
  });
});

describe("§13 / §67 The transaction is all-or-nothing", () => {
  const failedSolve: SolveOutcome = {
    converged: false,
    maxResidual: 12,
    iterations: 40,
    algorithm: "dogleg",
    coordinates: [],
    diagnostic: "stagnated",
  };

  it("rolls back a failed solve and says the drawing is unchanged", () => {
    const engine = new FakeEngine({ solve: () => failedSolve });
    const before = { ...engine.params };
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);

    expect(r.committed).toBe(false);
    expect(r.reason).toBe("solver-failed");
    expect(r.message).toContain("unchanged");
    expect(engine.restored).toBe(1);
    expect(engine.params).toEqual(before);
  });

  it("rolls back a converged solve whose residual is still above ε_tol", () => {
    const engine = new FakeEngine({
      solve: () => ({
        converged: true,
        maxResidual: 1e-2,
        iterations: 9,
        algorithm: "lm",
        coordinates: [0, 0],
      }),
    });
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.committed).toBe(false);
    expect(engine.restored).toBe(1);
  });

  it("rolls back when an invariant fails even though the solve succeeded (§5)", () => {
    const red = (): InvariantReport => ({
      ...greenReport(),
      verdict: "red",
      accepted: false,
      failures: ["WallThickness drifted to 340.000 (target 350.000)."],
    });
    const engine = new FakeEngine({ report: red });
    const before = { ...engine.params };
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);

    expect(r.committed).toBe(false);
    expect(r.reason).toBe("invariants-failed");
    expect(r.message).toContain("WallThickness drifted");
    expect(engine.restored).toBe(1);
    expect(engine.params).toEqual(before);
  });

  it("rolls back on an unexpected exception rather than leaving torn state", () => {
    const engine = new FakeEngine({ throwAt: "evaluate-dag" });
    const before = { ...engine.params };
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.committed).toBe(false);
    expect(r.message).toContain("rolled back");
    expect(engine.restored).toBe(1);
    expect(engine.params).toEqual(before);
  });

  it("commits an amber (code-deviation) report — amber is not a rollback", () => {
    const amber = (): InvariantReport => ({
      ...greenReport(),
      verdict: "amber",
      accepted: true,
      warnings: ["WallThickness below the IRC minimum."],
    });
    const engine = new FakeEngine({ report: amber });
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.committed).toBe(true);
    expect(engine.restored).toBe(0);
    expect(r.invariantReport!.verdict).toBe("amber");
  });
});

describe("§31.5 Homotopy sub-stepping inside the pipeline", () => {
  it("uses one solve for a small change", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.substeps).toBe(1);
    expect(engine.solveCalls).toBe(1);
  });

  it("splits a 2000 → 6000 jump into ΔL ≤ 500 mm continuation steps", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 6000 }]);
    expect(r.substeps).toBe(8);
    expect(engine.solveCalls).toBe(8);
  });

  it("stops sub-stepping the moment one step fails", () => {
    const engine = new FakeEngine({
      solve: (n) =>
        n >= 3
          ? { converged: false, maxResidual: 5, iterations: 10, algorithm: "dogleg", coordinates: [] }
          : { converged: true, maxResidual: 0, iterations: 2, algorithm: "dogleg", coordinates: [0, 0] },
    });
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 6000 }]);
    expect(r.committed).toBe(false);
    expect(engine.solveCalls).toBe(3);
    expect(engine.restored).toBe(1);
  });
});

describe("§26 Standards profile in the pipeline", () => {
  const profile = parseStandardsProfile({
    id: "TEST",
    revision: "1",
    verified: false,
    parameterBounds: {
      WallThickness: { min: 250, note: "practice minimum", codeRef: "IRC:SP:13" },
    },
    requiredParameters: [],
    relationships: [],
  });

  it("commits with an amber compliance note for a code deviation", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "WallThickness", value: 260 }], { profile });
    expect(r.committed).toBe(true);
    expect(r.compliance).not.toBeNull();
    expect(r.compliance!.compliant).toBe(true);
  });

  it("blocks a physically impossible value before any solve runs", () => {
    const engine = new FakeEngine();
    const r = runEditPipeline(engine, [{ name: "ClearSpan", value: 1200 }], {
      profile,
      physicalFloors: { ClearSpan: 1500 },
    });
    expect(r.committed).toBe(false);
    expect(r.reason).toBe("standards-blocked");
    expect(engine.solveCalls).toBe(0);
    expect(engine.restored).toBe(0);
  });
});
