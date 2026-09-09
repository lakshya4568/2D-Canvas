/**
 * Comprehensive Benchmark Suite & Performance Profiler (UPCE-MASTER-1.0 §86, §29.7, §29.8, Gate G6 §76).
 * Benchmarks PlaneGCS WASM, local DogLeg (Thin SVD), local LM (analytical Jacobians),
 * and analytical culvert model on published benchmark fixtures (3-cell culvert, railing run, 4-bar linkage).
 * Measures initialization latency, cold solve latency, warm solve latency (< 5 ms target < 1 ms),
 * convergence rates, iterations, and residual norms (||F|| <= 1e-8 mm).
 */

import { PlaneGcsClient, UnifiedSolverInput, UnifiedSolverResult } from "./planegcsClient";

export interface BenchmarkMetric {
  solver: "planegcs_wasm" | "dogleg_ts" | "lm_ts" | "analytical_culvert";
  fixtureId: string;
  initLatencyMs: number;
  coldSolveLatencyMs: number;
  warmSolveLatencyMs: number;
  iterations: number;
  residualNorm: number;
  maxResidual: number;
  converged: boolean;
}

export interface BenchmarkSuiteResult {
  timestamp: string;
  results: BenchmarkMetric[];
  summary: {
    wasmWarmSolveAvgMs: number;
    doglegWarmSolveAvgMs: number;
    lmWarmSolveAvgMs: number;
    analyticalWarmSolveAvgMs: number;
    allWarmSolvesUnder5ms: boolean;
    allResidualsUnder1e8: boolean;
    totalFixturesBenchmarked: number;
  };
}

/**
 * Creates canonical 3-Cell Box Culvert benchmark fixture (civil infrastructure).
 */
export function createThreeCellCulvertFixture(
  clearSpan: number = 2000,
  clearHeight: number = 1500,
  wallThickness: number = 250
): UnifiedSolverInput {
  const baySpan = clearSpan;
  const h = clearHeight;

  return {
    points: [
      { id: "b0", x: 0, y: 0, fixed: true },
      { id: "b1", x: baySpan, y: 0 },
      { id: "b2", x: 2 * baySpan, y: 0 },
      { id: "b3", x: 3 * baySpan, y: 0 },
      { id: "t0", x: 0, y: h },
      { id: "t1", x: baySpan, y: h },
      { id: "t2", x: 2 * baySpan, y: h },
      { id: "t3", x: 3 * baySpan, y: h },
    ],
    lines: [
      { id: "l_b01", p1Id: "b0", p2Id: "b1" },
      { id: "l_b12", p1Id: "b1", p2Id: "b2" },
      { id: "l_b23", p1Id: "b2", p2Id: "b3" },
      { id: "l_t01", p1Id: "t0", p2Id: "t1" },
      { id: "l_t12", p1Id: "t1", p2Id: "t2" },
      { id: "l_t23", p1Id: "t2", p2Id: "t3" },
      { id: "l_w0", p1Id: "b0", p2Id: "t0" },
      { id: "l_w1", p1Id: "b1", p2Id: "t1" },
      { id: "l_w2", p1Id: "b2", p2Id: "t2" },
      { id: "l_w3", p1Id: "b3", p2Id: "t3" },
    ],
    constraints: [
      // Vertical wall constraints
      { id: "c_v0", type: "vertical", entities: ["b0", "t0"], driving: true },
      { id: "c_v1", type: "vertical", entities: ["b1", "t1"], driving: true },
      { id: "c_v2", type: "vertical", entities: ["b2", "t2"], driving: true },
      { id: "c_v3", type: "vertical", entities: ["b3", "t3"], driving: true },
      // Horizontal slab constraints
      { id: "c_hb01", type: "horizontal", entities: ["b0", "b1"], driving: true },
      { id: "c_hb12", type: "horizontal", entities: ["b1", "b2"], driving: true },
      { id: "c_hb23", type: "horizontal", entities: ["b2", "b3"], driving: true },
      { id: "c_ht01", type: "horizontal", entities: ["t0", "t1"], driving: true },
      { id: "c_ht12", type: "horizontal", entities: ["t1", "t2"], driving: true },
      { id: "c_ht23", type: "horizontal", entities: ["t2", "t3"], driving: true },
      // Height dimension
      { id: "c_height", type: "distance", entities: ["b0", "t0"], targetValue: h, driving: true },
      // Span dimensions
      { id: "c_span1", type: "distance", entities: ["b0", "b1"], targetValue: baySpan, driving: true },
      { id: "c_span2", type: "distance", entities: ["b1", "b2"], targetValue: baySpan, driving: true },
      { id: "c_span3", type: "distance", entities: ["b2", "b3"], targetValue: baySpan, driving: true },
    ],
    options: {
      partitionComponents: false,
    },
  };
}

/**
 * Creates canonical Railing Run benchmark fixture (repeated mechanical assembly).
 */
export function createRailingRunFixture(
  runLength: number = 2400,
  postCount: number = 4,
  postHeight: number = 900
): UnifiedSolverInput {
  const spacing = runLength / Math.max(1, postCount - 1);
  const points: UnifiedSolverInput["points"] = [];
  const lines: UnifiedSolverInput["lines"] = [];
  const constraints: UnifiedSolverInput["constraints"] = [];

  for (let i = 0; i < postCount; i++) {
    const x = i * spacing;
    points.push({ id: `pb_${i}`, x, y: 0, fixed: i === 0 });
    points.push({ id: `pt_${i}`, x, y: postHeight });

    lines.push({ id: `l_post_${i}`, p1Id: `pb_${i}`, p2Id: `pt_${i}` });
    constraints.push({ id: `c_vpost_${i}`, type: "vertical", entities: [`pb_${i}`, `pt_${i}`], driving: true });
    constraints.push({ id: `c_hpost_${i}`, type: "distance", entities: [`pb_${i}`, `pt_${i}`], targetValue: postHeight, driving: true });

    if (i > 0) {
      lines.push({ id: `l_rail_top_${i}`, p1Id: `pt_${i - 1}`, p2Id: `pt_${i}` });
      lines.push({ id: `l_rail_base_${i}`, p1Id: `pb_${i - 1}`, p2Id: `pb_${i}` });

      constraints.push({ id: `c_h_top_${i}`, type: "horizontal", entities: [`pt_${i - 1}`, `pt_${i}`], driving: true });
      constraints.push({ id: `c_h_base_${i}`, type: "horizontal", entities: [`pb_${i - 1}`, `pb_${i}`], driving: true });
      constraints.push({ id: `c_spacing_${i}`, type: "distance", entities: [`pb_${i - 1}`, `pb_${i}`], targetValue: spacing, driving: true });
    }
  }

  return { points, lines, constraints, options: { partitionComponents: false } };
}

/**
 * Creates canonical 4-Bar Linkage benchmark fixture (planar kinematics).
 */
export function createFourBarLinkageFixture(
  l1: number = 100, // Crank
  l2: number = 150, // Coupler
  l3: number = 120, // Rocker
  dGround: number = 180, // Ground distance
  crankX?: number // Optional driving crank X coordinate to uniquely constrain kinematic pose (0 DOF)
): UnifiedSolverInput {
  const initialCrankX = crankX !== undefined ? crankX : 0;
  const initialCrankY = Math.sqrt(Math.max(1, l1 * l1 - initialCrankX * initialCrankX));

  const constraints: UnifiedSolverInput["constraints"] = [
    { id: "c_len_crank", type: "distance", entities: ["p_ground_a", "p_crank_pin"], targetValue: l1, driving: true },
    { id: "c_len_coupler", type: "distance", entities: ["p_crank_pin", "p_rocker_pin"], targetValue: l2, driving: true },
    { id: "c_len_rocker", type: "distance", entities: ["p_ground_b", "p_rocker_pin"], targetValue: l3, driving: true },
  ];

  if (crankX !== undefined) {
    constraints.push({
      id: "c_crank_drive_x",
      type: "coordinate_x",
      entities: ["p_crank_pin"],
      targetValue: crankX,
      driving: true,
    });
  }

  return {
    points: [
      { id: "p_ground_a", x: 0, y: 0, fixed: true },
      { id: "p_ground_b", x: dGround, y: 0, fixed: true },
      { id: "p_crank_pin", x: initialCrankX, y: initialCrankY, fixed: false },
      { id: "p_rocker_pin", x: dGround, y: l3, fixed: false },
    ],
    lines: [
      { id: "l_crank", p1Id: "p_ground_a", p2Id: "p_crank_pin" },
      { id: "l_coupler", p1Id: "p_crank_pin", p2Id: "p_rocker_pin" },
      { id: "l_rocker", p1Id: "p_ground_b", p2Id: "p_rocker_pin" },
    ],
    constraints,
    options: {
      partitionComponents: false,
    },
  };
}

export class SolverBenchmarkRunner {
  private client: PlaneGcsClient;

  public constructor(client?: PlaneGcsClient) {
    this.client = client ?? new PlaneGcsClient();
  }

  /**
   * Measures cold and warm solve latency, convergence rate, and residual accuracy for a given solver and fixture.
   */
  public async profileSolver(
    solver: "planegcs_wasm" | "dogleg_ts" | "lm_ts" | "analytical_culvert",
    fixtureId: string,
    input: UnifiedSolverInput,
    warmIterations: number = 10
  ): Promise<BenchmarkMetric> {
    const configuredInput: UnifiedSolverInput = {
      ...input,
      options: {
        ...input.options,
        algorithm: solver === "lm_ts" ? "LevenbergMarquardt" : "DogLeg",
        useAnalyticalDomainLayer: solver === "analytical_culvert",
        domainContext:
          solver === "analytical_culvert"
            ? {
                type: "single_cell_culvert",
                config: { clearSpan: 300, clearHeight: 250, wallThickness: 30, haunchLeg: 35 },
                targetSpan: 500,
              }
            : undefined,
      },
    };

    // 1. Initialization / Warmup
    const tInit0 = performance.now();
    await this.client.init();
    const tInit1 = performance.now();
    const initLatencyMs = tInit1 - tInit0;

    // 2. Cold Solve
    const tCold0 = performance.now();
    let coldRes: UnifiedSolverResult;
    if (solver === "dogleg_ts" || solver === "lm_ts") {
      // Force TS fallback path
      coldRes = await (this.client as any).solveWithTsFallback(configuredInput);
    } else {
      coldRes = await this.client.solve(configuredInput);
    }
    const tCold1 = performance.now();
    const coldSolveLatencyMs = tCold1 - tCold0;

    // 3. Warm Solves (averaged across warmIterations)
    const tWarm0 = performance.now();
    let lastWarmRes = coldRes;
    for (let k = 0; k < warmIterations; k++) {
      if (solver === "dogleg_ts" || solver === "lm_ts") {
        lastWarmRes = await (this.client as any).solveWithTsFallback(configuredInput);
      } else {
        lastWarmRes = await this.client.solve(configuredInput);
      }
    }
    const tWarm1 = performance.now();
    const warmSolveLatencyMs = (tWarm1 - tWarm0) / Math.max(1, warmIterations);

    return {
      solver,
      fixtureId,
      initLatencyMs,
      coldSolveLatencyMs,
      warmSolveLatencyMs,
      iterations: lastWarmRes.iterations,
      residualNorm: lastWarmRes.residualNorm,
      maxResidual: lastWarmRes.maxResidual,
      converged: lastWarmRes.converged,
    };
  }

  /**
   * Runs the complete benchmark suite across all 4 solver configurations and 3 canonical fixtures.
   */
  public async runFullSuite(warmIterations: number = 10): Promise<BenchmarkSuiteResult> {
    await this.client.init();

    const fixtures: { id: string; input: UnifiedSolverInput }[] = [
      { id: "3_cell_culvert", input: createThreeCellCulvertFixture() },
      { id: "railing_run", input: createRailingRunFixture() },
      { id: "4_bar_linkage", input: createFourBarLinkageFixture() },
    ];

    const results: BenchmarkMetric[] = [];

    for (const f of fixtures) {
      // 1. PlaneGCS WASM
      const wasmMetric = await this.profileSolver("planegcs_wasm", f.id, f.input, warmIterations);
      results.push(wasmMetric);

      // 2. Pure TS DogLeg (Thin SVD)
      const doglegMetric = await this.profileSolver("dogleg_ts", f.id, f.input, warmIterations);
      results.push(doglegMetric);

      // 3. Pure TS Levenberg-Marquardt (Analytical Jacobians)
      const lmMetric = await this.profileSolver("lm_ts", f.id, f.input, warmIterations);
      results.push(lmMetric);

      // 4. Analytical Culvert domain layer (on culvert fixture)
      if (f.id === "3_cell_culvert") {
        const culvertMetric = await this.profileSolver("analytical_culvert", f.id, f.input, warmIterations);
        results.push(culvertMetric);
      }
    }

    const wasmSolves = results.filter((r) => r.solver === "planegcs_wasm");
    const doglegSolves = results.filter((r) => r.solver === "dogleg_ts");
    const lmSolves = results.filter((r) => r.solver === "lm_ts");
    const analyticalSolves = results.filter((r) => r.solver === "analytical_culvert");

    const avg = (arr: BenchmarkMetric[]) =>
      arr.length > 0 ? arr.reduce((acc, m) => acc + m.warmSolveLatencyMs, 0) / arr.length : 0;

    const wasmWarmSolveAvgMs = avg(wasmSolves);
    const doglegWarmSolveAvgMs = avg(doglegSolves);
    const lmWarmSolveAvgMs = avg(lmSolves);
    const analyticalWarmSolveAvgMs = avg(analyticalSolves);

    const allWarmSolvesUnder5ms = results.every((r) => r.warmSolveLatencyMs < 5.0);
    const allResidualsUnder1e8 = results.every((r) => r.converged && r.residualNorm <= 1e-8);

    return {
      timestamp: new Date().toISOString(),
      results,
      summary: {
        wasmWarmSolveAvgMs,
        doglegWarmSolveAvgMs,
        lmWarmSolveAvgMs,
        analyticalWarmSolveAvgMs,
        allWarmSolvesUnder5ms,
        allResidualsUnder1e8,
        totalFixturesBenchmarked: fixtures.length,
      },
    };
  }
}

/**
 * Top-level benchmark function.
 */
export async function runSolverBenchmark(warmIterations: number = 10): Promise<BenchmarkSuiteResult> {
  const runner = new SolverBenchmarkRunner();
  return runner.runFullSuite(warmIterations);
}
