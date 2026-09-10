/**
 * Live Drag-Invariance Inference — the second candidate signal.
 * UPCE-MASTER-1.0 §50.
 *
 *   Static path : geometry-at-rest → wall/haunch/offset/symmetry detectors
 *   Live  path  : pointer drag Δ → watch OTHER residuals during the drag:
 *                 which stayed within tolerance while the dragged dimension changed?
 *                            ↓
 *                 ONE SHARED CANDIDATE QUEUE → admissibilityFilter (SVD gate)
 *
 * "This is exactly the pipeline `isConstraintAdmissible` should have been living
 * inside all along." Both sources land in the same queue and pass the same gate.
 */

import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import {
  ConstraintCandidate,
  CandidatePredicateType,
} from "./candidateClusterer";

/** One measured scalar sampled at one instant of a drag. */
export interface DragSample {
  /** Monotonic frame index within the drag session. */
  frame: number;
  /** Measured value of every tracked scalar at this frame. */
  measurements: Record<string, number>;
}

export interface DragInvarianceOptions {
  policy?: TolerancePolicy;
  /**
   * A scalar must move by at least this much across the drag to count as the
   * DRIVER. Default 4× ε_cluster, so ordinary solver jitter is never mistaken
   * for an intentional change.
   */
  driverMinTravel?: number;
  /**
   * A scalar whose total excursion stays within this is INVARIANT.
   * Default ε_cluster.
   */
  invariantMaxExcursion?: number;
  /** Minimum frames before the session yields candidates at all. */
  minFrames?: number;
}

export interface ScalarTrace {
  name: string;
  first: number;
  last: number;
  min: number;
  max: number;
  /** max − min across the whole drag. */
  excursion: number;
  /** |last − first|. */
  netChange: number;
  classification: "driver" | "invariant" | "coupled";
}

export interface DragInvarianceResult {
  frames: number;
  traces: ScalarTrace[];
  drivers: string[];
  invariants: string[];
  coupled: string[];
  /** Candidates for the shared queue — one per invariant scalar. */
  candidates: ConstraintCandidate[];
  /** Plain-language line for the AutoFormula panel (§50). */
  summary: string | null;
}

/**
 * Accumulates measurements across a live drag and, on release, reports which
 * scalars held still while the dragged one moved.
 */
export class DragInvarianceDetector {
  private samples: DragSample[] = [];
  private readonly options: Required<Omit<DragInvarianceOptions, "policy">> & {
    policy: TolerancePolicy;
  };

  constructor(options: DragInvarianceOptions = {}) {
    const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
    this.options = {
      policy,
      driverMinTravel: options.driverMinTravel ?? 4 * policy.cluster_mm,
      invariantMaxExcursion: options.invariantMaxExcursion ?? policy.cluster_mm,
      minFrames: options.minFrames ?? 3,
    };
  }

  /** Records one frame of the drag. Cheap: no analysis happens here. */
  public record(frame: number, measurements: Record<string, number>): void {
    this.samples.push({ frame, measurements: { ...measurements } });
  }

  public getFrameCount(): number {
    return this.samples.length;
  }

  public reset(): void {
    this.samples = [];
  }

  /**
   * Called on mouse-up. Classifies every tracked scalar and emits candidates for
   * the invariants — never commits anything (§46 rule 1).
   */
  public analyze(): DragInvarianceResult {
    const empty: DragInvarianceResult = {
      frames: this.samples.length,
      traces: [],
      drivers: [],
      invariants: [],
      coupled: [],
      candidates: [],
      summary: null,
    };

    if (this.samples.length < this.options.minFrames) return empty;

    const names = new Set<string>();
    for (const s of this.samples) for (const k of Object.keys(s.measurements)) names.add(k);

    const traces: ScalarTrace[] = [];
    for (const name of names) {
      const series = this.samples
        .map((s) => s.measurements[name])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      // A scalar that vanished mid-drag (topology change) is not classifiable.
      if (series.length !== this.samples.length) continue;

      const first = series[0];
      const last = series[series.length - 1];
      const min = Math.min(...series);
      const max = Math.max(...series);
      const excursion = max - min;
      const netChange = Math.abs(last - first);

      let classification: ScalarTrace["classification"];
      if (netChange >= this.options.driverMinTravel) classification = "driver";
      else if (excursion <= this.options.invariantMaxExcursion) classification = "invariant";
      else classification = "coupled";

      traces.push({ name, first, last, min, max, excursion, netChange, classification });
    }

    const drivers = traces.filter((t) => t.classification === "driver").map((t) => t.name);
    const invariants = traces.filter((t) => t.classification === "invariant").map((t) => t.name);
    const coupled = traces.filter((t) => t.classification === "coupled").map((t) => t.name);

    // No driver means nothing meaningful moved: emit nothing rather than
    // proposing that everything is invariant.
    if (drivers.length === 0) {
      return { ...empty, frames: this.samples.length, traces, drivers, invariants: [], coupled };
    }

    const candidates: ConstraintCandidate[] = traces
      .filter((t) => t.classification === "invariant")
      .map((t) => this.toCandidate(t, drivers));

    return {
      frames: this.samples.length,
      traces,
      drivers,
      invariants,
      coupled,
      candidates,
      summary: this.buildSummary(traces, drivers),
    };
  }

  private toCandidate(trace: ScalarTrace, drivers: string[]): ConstraintCandidate {
    const mean = (trace.min + trace.max) / 2;
    const driverDeltas = drivers
      .map((d) => {
        const a = this.samples[0].measurements[d];
        const b = this.samples[this.samples.length - 1].measurements[d];
        return `${d} ${(b - a >= 0 ? "+" : "")}${(b - a).toFixed(1)} mm`;
      })
      .join(", ");

    return {
      id: `drag_invariant_${trace.name}`,
      predicate: "P3" as CandidatePredicateType,
      entityIds: [trace.name],
      nominalValue: mean,
      measuredDeviation: trace.excursion,
      // A drag observation is evidence, never a Geometric Fact (§22 taxonomy).
      confidence: "Inference",
      status: "pending",
      provenance: "drag-invariance",
      parameterName: trace.name,
      displayName: trace.name,
      description:
        `held at ${mean.toFixed(3)} mm (±${(trace.excursion / 2).toFixed(3)} mm) across ` +
        `${this.samples.length} drag frames while ${driverDeltas}`,
    };
  }

  private buildSummary(traces: ScalarTrace[], drivers: string[]): string | null {
    const invariants = traces.filter((t) => t.classification === "invariant");
    if (invariants.length === 0) return null;

    const driverText = drivers
      .map((d) => {
        const t = traces.find((x) => x.name === d)!;
        return `${d} ${t.first.toFixed(0)} → ${t.last.toFixed(0)}`;
      })
      .join(", ");

    const invariantText = invariants
      .map((t) => `${t.name} = ${((t.min + t.max) / 2).toFixed(0)}`)
      .join(", ");

    return (
      `You changed ${driverText}; ${invariantText} stayed put — ` +
      `keep these as driving dimensions?`
    );
  }
}

/**
 * One-shot convenience over a recorded sample series, for replay and testing.
 */
export function detectDragInvariants(
  samples: DragSample[],
  options: DragInvarianceOptions = {}
): DragInvarianceResult {
  const detector = new DragInvarianceDetector(options);
  for (const s of samples) detector.record(s.frame, s.measurements);
  return detector.analyze();
}
