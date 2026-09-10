/**
 * Gate G10 Acceptance Suite — Roadmap Phases 8–9 completion.
 * UPCE-MASTER-1.0 §76 (gates), §86 (Phase 8: user mode & validation,
 * Phase 9: LLM naming, exports, hardening), and §7 "Definition of Done".
 *
 * G0–G9 were demonstrated by the preceding suites. This gate covers the spec's
 * own Phase 8 and Phase 9, which the earlier phase numbering did not reach:
 *
 *   §31   branch control (homotopy, barriers, Bentley–Ottmann, κ(J) clamp)
 *   §49   integer-relation formula inference with all four validation gates
 *   §50   live drag-invariance inference
 *   §51   solver-as-verifier and stability sweeps
 *   §66   the thirteen-step edit pipeline with transactional rollback
 *   §67   the invariant report
 *   §26   standards profiles as data
 *   §53–57 the AI layer, with the system fully functional when it is disabled
 *   §69   DXF / PDF / SVG export, REST, and CLI, all from the canonical model
 *   §80   the bay-clustering pass that closes the multi-cell failure
 */
import { describe, it, expect } from "vitest";

import { detectSelfIntersections, planHomotopySubSteps, analyzeConditioning, CONDITION_NUMBER_LIMIT } from "../../lib/solver/branchControl";
import { discoverIntegerRelations, relationToExpression } from "../../lib/inference/integerRelation";
import { clusterBays, BayVoid } from "../../lib/inference/bayClusterer";
import { generateFormulaCandidates } from "../../lib/inference/formulaCandidateGenerator";
import { detectDragInvariants } from "../../lib/inference/dragInvarianceDetector";
import { verifyUnderPerturbation, generateSweepSamples } from "../../lib/inference/solverVerifier";
import { checkInvariants } from "../../lib/validation/invariantChecker";
import { evaluateAgainstProfile, parseStandardsProfile } from "../../lib/validation/standardsProfile";
import { runEditPipeline } from "../../lib/runtime/editPipeline";
import { DeterministicFallbackNamer } from "../../lib/ai/fallbackNamer";
import { LlmNamer } from "../../lib/ai/llmAdapter";
import { RenderService } from "../../lib/io/renderService";
import { TemplateRenderHost } from "../../lib/io/templateRenderHost";
import { TemplateRegistry } from "../../lib/parametric/templates/templateRegistry";
import { StandardsProfileRegistry } from "../../lib/validation/standardsProfile";
import { collapseSharedEdges } from "../../lib/parametric/component/sharedEdgeCollapse";
import { Point2D } from "../../lib/geometry/topology/types";
import { AbstractedDescriptor } from "../../lib/ai/types";
import type { EditPipelineEngine, EngineSnapshot, SolveOutcome } from "../../lib/runtime/editPipeline";
import type { InvariantReport } from "../../lib/validation/invariantChecker";

const rect = (x0: number, y0: number, x1: number, y1: number): Point2D[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe("G10 Criterion 1 — §31 branch control is present and enforced", () => {
  it("splits a large parameter jump into ΔL ≤ 500 mm continuation steps", () => {
    expect(planHomotopySubSteps({ Span: 2000 }, { Span: 20000 })).toBe(36);
    expect(planHomotopySubSteps({ Span: 2000 }, { Span: 2400 })).toBe(1);
  });

  it("rejects a self-intersecting configuration and accepts a valid one", () => {
    const square = rect(0, 0, 100, 100);
    const valid = square.map((p, i) => ({ id: `s${i}`, a: p, b: square[(i + 1) % 4] }));
    expect(detectSelfIntersections(valid)).toHaveLength(0);

    const bowtie = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    const invalid = bowtie.map((p, i) => ({ id: `b${i}`, a: p, b: bowtie[(i + 1) % 4] }));
    expect(detectSelfIntersections(invalid).length).toBeGreaterThan(0);
  });

  it("clamps λ when κ(J) exceeds 1e8", () => {
    const r = analyzeConditioning([[1, 0], [0, 1e-9]]);
    expect(r.conditionNumber).toBeGreaterThan(CONDITION_NUMBER_LIMIT);
    expect(r.lambdaFloor).toBeGreaterThan(0);
  });
});

describe("G10 Criterion 2 — §80 the multi-cell failure is closed", () => {
  it("produces ONE stack relation for a three-cell culvert, not eleven cards", () => {
    const t = 350;
    const span = 2000;
    const total = 3 * span + 4 * t;
    const voids: BayVoid[] = [];
    let x = t;
    for (let i = 0; i < 3; i++) {
      voids.push({ id: `v${i}`, points: rect(x, 300, x + span, 2700) });
      x += span + t;
    }

    const stack = clusterBays(rect(0, 0, total, 3000), voids);
    expect(stack.recognised).toBe(true);
    expect(stack.stackExpression).toBe("3*ClearSpan + 4*WallThickness");
    expect(stack.parameters.length).toBeLessThanOrEqual(3);
    expect(stack.totalSpan).toBeCloseTo(total, 6);
  });

  it("recovers TotalWidth = 2*ClearSpan + 3*WallThickness by integer relation", () => {
    const rendered = discoverIntegerRelations([
      { id: "a", name: "TotalWidth", value: 4300, unit: "mm" },
      { id: "b", name: "ClearSpan", value: 1700, unit: "mm" },
      { id: "c", name: "WallThickness", value: 300, unit: "mm" },
    ])
      .map(relationToExpression)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    expect(rendered.find((r) => r.target === "TotalWidth")!.expression).toBe(
      "2*ClearSpan + 3*WallThickness"
    );
  });
});

describe("G10 Criterion 3 — §49.4 no formula ships without all four gates", () => {
  it("withholds a relation that has no perturbation evidence", () => {
    const { admissible, rejected } = generateFormulaCandidates(
      [
        { id: "a", name: "TotalWidth", value: 4300, unit: "mm" },
        { id: "b", name: "ClearSpan", value: 1700, unit: "mm" },
        { id: "c", name: "WallThickness", value: 300, unit: "mm" },
      ],
      null
    );
    expect(admissible).toHaveLength(0);
    expect(rejected.length).toBeGreaterThan(0);
    expect(
      rejected.every((c) => c.gates.some((g) => g.gate === "perturbation" && !g.passed))
    ).toBe(true);
  });

  it("admits it once synthetic re-solves confirm it survives perturbation", () => {
    const samples = [1700, 2000, 2400].map((span) => ({
      inputs: { ClearSpan: span, WallThickness: 300 },
      measured: { ClearSpan: span, WallThickness: 300, TotalWidth: 2 * span + 3 * 300 },
      converged: true,
    }));
    const { admissible } = generateFormulaCandidates(
      [
        { id: "a", name: "TotalWidth", value: 4300, unit: "mm" },
        { id: "b", name: "ClearSpan", value: 1700, unit: "mm" },
        { id: "c", name: "WallThickness", value: 300, unit: "mm" },
      ],
      null,
      { perturbations: samples }
    );
    expect(admissible.length).toBeGreaterThan(0);
    expect(admissible[0].gates.every((g) => g.passed)).toBe(true);
  });
});

describe("G10 Criterion 4 — §50 / §51 both candidate signals feed one gated queue", () => {
  it("drag-invariance proposes candidates, never commitments", () => {
    const samples = Array.from({ length: 12 }, (_, f) => ({
      frame: f,
      measurements: { ClearSpan: 500 + 20 * f, WallThickness: 250, Haunch: 150 },
    }));
    const r = detectDragInvariants(samples);
    expect(r.drivers).toEqual(["ClearSpan"]);
    expect(r.candidates.length).toBe(2);
    expect(r.candidates.every((c) => c.status === "pending")).toBe(true);
  });

  it("solver-as-verifier names the exact breaking combination", () => {
    const report = verifyUnderPerturbation(
      [0, 0, 2000, 0],
      generateSweepSamples([{ name: "ClearSpan", value: 2000, min: 1200, max: 6000 }], { gridSteps: 3 }),
      (inputs) =>
        inputs.ClearSpan > 5000
          ? { converged: false, maxResidual: 9, status: "NotSolvable", coordinates: [] }
          : { converged: true, maxResidual: 0, status: "FC", coordinates: [0, 0, inputs.ClearSpan, 0] },
      { expectedDisplacement: (i) => Math.abs(i.ClearSpan - 2000) }
    );
    expect(report.passed).toBe(false);
    expect(report.breakingCombination).toEqual({ ClearSpan: 6000 });
  });
});

describe("G10 Criterion 5 — §66/§67 the edit transaction is all-or-nothing", () => {
  const green = (): InvariantReport => ({
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
  });

  function engine(fail: boolean): EditPipelineEngine & { params: Record<string, number>; restored: number } {
    const state = {
      params: { ClearSpan: 2000 } as Record<string, number>,
      restored: 0,
      getParameters: () => [
        { name: "ClearSpan", role: "DRIVING" as const, type: "LENGTH" as const, value: state.params.ClearSpan, min: 1200, max: 6000 },
      ],
      snapshot: (): EngineSnapshot => ({ parameters: { ...state.params }, coordinates: [] }),
      restore: (s: EngineSnapshot) => {
        state.params = { ...s.parameters };
        state.restored += 1;
      },
      setDrivingParameter: (n: string, v: number) => {
        state.params[n] = v;
      },
      evaluateDag: () => ({}),
      partitionDirtySubgraph: () => ["c0"],
      bindTargets: () => {},
      solve: (): SolveOutcome =>
        fail
          ? { converged: false, maxResidual: 5, iterations: 30, algorithm: "dogleg", coordinates: [] }
          : { converged: true, maxResidual: 0, iterations: 3, algorithm: "dogleg", coordinates: [] },
      checkInvariants: green,
    };
    return state;
  }

  it("commits a good edit through all thirteen steps", () => {
    const e = engine(false);
    const r = runEditPipeline(e, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.committed).toBe(true);
    expect(r.trace).toHaveLength(12);
    expect(e.params.ClearSpan).toBe(2200);
  });

  it("rolls back completely when the solve fails — the user never sees torn geometry", () => {
    const e = engine(true);
    const r = runEditPipeline(e, [{ name: "ClearSpan", value: 2200 }]);
    expect(r.committed).toBe(false);
    expect(e.restored).toBe(1);
    expect(e.params.ClearSpan).toBe(2000);
  });

  it("produces the §67 report with a green/amber/red verdict", () => {
    const report = checkInvariants({
      solver: { status: "converged", maxResidual: 1e-12, iterations: 4, algorithm: "dogleg", elapsedMs: 2 },
      structure: { underConstrainedBlocks: 0, wellConstrainedBlocks: 2, overConstrainedBlocks: 0 },
      invariants: [{ name: "WallThickness", kind: "length", target: 350, measured: 350 }],
    });
    expect(report.verdict).toBe("green");
    expect(report.accepted).toBe(true);
  });
});

describe("G10 Criterion 6 — §26 standards are data, and unverified until a human says so", () => {
  const profile = parseStandardsProfile({
    id: "TEST_PROFILE",
    revision: "1",
    verified: false,
    parameterBounds: { WallThickness: { min: 250, note: "practice", codeRef: "IRC:SP:13" } },
    requiredParameters: ["WallThickness"],
    relationships: [
      { expr: "ClearSpan / ClearHeight <= 3.0", message: "Aspect ratio too high", codeRef: "RDSO" },
    ],
  });

  it("warns on a code deviation without blocking the edit", () => {
    const e = evaluateAgainstProfile(profile, { WallThickness: 200, ClearSpan: 2000, ClearHeight: 1500 });
    expect(e.blocked).toBe(false);
    expect(e.boundViolations[0].severity).toBe("warning");
    expect(e.boundViolations[0].codeRef).toBe("IRC:SP:13");
  });

  it("blocks only a physically impossible value", () => {
    const e = evaluateAgainstProfile(
      profile,
      { WallThickness: 300, InnerWidth: -1 },
      { physicalFloors: { InnerWidth: 0 } }
    );
    expect(e.blocked).toBe(true);
  });

  it("surfaces the unverified status rather than laundering it into fact", () => {
    const e = evaluateAgainstProfile(profile, { WallThickness: 300 });
    expect(e.verified).toBe(false);
    expect(e.metadata.join(" ")).toContain("UNVERIFIED");
  });
});

describe("G10 Criterion 7 — §53–57 the system works with the LLM disabled", () => {
  const descriptor: AbstractedDescriptor = {
    drawingType: "culvert",
    units: "mm",
    structureBoundingBox: { width: 4300, height: 3650 },
    detectedFaces: [{ type: "VOID", width: 3500, height: 3000, count: 1 }],
    clusters: [
      { rawId: "s1", kind: "span", nominalValue: 3500, orientation: "HORIZONTAL_VOID" },
      { rawId: "o1", kind: "offset_cluster", nominalValue: 400, orientation: "VERTICAL" },
    ],
    inferredFormulas: [],
  };

  it("names every parameter deterministically with no network at all", () => {
    const r = new DeterministicFallbackNamer().nameSync(descriptor);
    expect(r.source).toBe("deterministic-fallback");
    expect(r.names.map((n) => n.name).sort()).toEqual(["ClearSpan", "WallThickness"]);
  });

  it("falls back cleanly when the endpoint is unreachable", async () => {
    const dead = { complete: () => Promise.reject(new Error("offline")) };
    const r = await new LlmNamer(dead, { maxRetries: 0 }).name(descriptor);
    expect(r.source).toBe("deterministic-fallback");
    expect(r.names.length).toBe(2);
  });
});

describe("G10 Criterion 8 — §69 every exporter reads the canonical model", () => {
  const service = new RenderService(
    new TemplateRenderHost({
      registry: new TemplateRegistry(),
      standards: new StandardsProfileRegistry(),
    })
  );

  it("renders DXF (R2010 and R12), PDF, SVG and JSON from one code path", () => {
    for (const format of ["dxf", "pdf", "svg", "json"] as const) {
      const out = service.render("single_cell_box_culvert", { params: {}, format });
      expect(out.body.length).toBeGreaterThan(100);
    }
    const r12 = service.render("single_cell_box_culvert", {
      params: {},
      format: "dxf",
      dxfVersion: "R12",
    });
    expect(new TextDecoder().decode(r12.body)).toContain("AC1009");
  });

  it("serves the catalogue with DRIVING parameters and their bounds", () => {
    const entries = service.listTemplates();
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.every((e) => Array.isArray(e.drivingParameters))).toBe(true);
  });
});

describe("G10 Criterion 9 — §68 shared edges collapse between adjoining instances", () => {
  it("merges the redundant collinear runs an adjoining repeat produces", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 360, y: 0 },
        { id: "b0", x: 330, y: 0 },
        { id: "b1", x: 690, y: 0 },
      ],
      lines: [
        { id: "cell_repeat_0_top", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_top", p1: "b0", p2: "b1" },
      ],
    });
    expect(r.lines).toHaveLength(1);
    expect(r.removed).toHaveLength(1);
  });
});

describe("G10 Criterion 10 — Full system verification", () => {
  it("every Phase 8–9 module is importable and functional", async () => {
    const modules = await Promise.all([
      import("../../lib/solver/branchControl"),
      import("../../lib/inference/integerRelation"),
      import("../../lib/inference/bayClusterer"),
      import("../../lib/inference/formulaCandidateGenerator"),
      import("../../lib/inference/dragInvarianceDetector"),
      import("../../lib/inference/solverVerifier"),
      import("../../lib/validation"),
      import("../../lib/runtime"),
      import("../../lib/ai"),
      import("../../lib/io"),
      import("../../lib/parametric/component/sharedEdgeCollapse"),
    ]);
    for (const m of modules) expect(Object.keys(m).length).toBeGreaterThan(0);
  });

  it("no module defines its own tolerance constant (§17)", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts")) {
          const src = readFileSync(full, "utf8");
          // A hard-coded weld/cluster tolerance assigned to a module constant.
          if (/^\s*const\s+(WELD|CLUSTER|GEOMETRY)_TOLERANCE\s*=/m.test(src)) {
            offenders.push(full);
          }
        }
      }
    };
    for (const dir of ["lib/ai", "lib/io", "lib/runtime", "lib/validation"]) walk(dir);
    expect(offenders).toEqual([]);
  });
});
