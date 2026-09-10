/**
 * Live drag-invariance inference — the second candidate signal.
 * UPCE-MASTER-1.0 §50, §46 (candidates only, never commitments).
 */
import { describe, it, expect } from "vitest";
import {
  DragInvarianceDetector,
  detectDragInvariants,
  DragSample,
} from "../../lib/inference/dragInvarianceDetector";

/** A drag that grows ClearSpan while thicknesses hold — the §50 worked example. */
function culvertDrag(): DragSample[] {
  const samples: DragSample[] = [];
  for (let f = 0; f <= 20; f++) {
    const span = 500 + (200 * f) / 20;
    samples.push({
      frame: f,
      measurements: {
        ClearSpan: span,
        WallThickness: 250 + (f % 3) * 0.05, // solver jitter, well inside ε
        Haunch: 150,
        TopSlab: 300,
      },
    });
  }
  return samples;
}

describe("§50 Drag-invariance classification", () => {
  it("identifies the dragged dimension as the driver", () => {
    const r = detectDragInvariants(culvertDrag());
    expect(r.drivers).toEqual(["ClearSpan"]);
  });

  it("identifies the dimensions that held still as invariants", () => {
    const r = detectDragInvariants(culvertDrag());
    expect(r.invariants.sort()).toEqual(["Haunch", "TopSlab", "WallThickness"]);
  });

  it("produces the §50 suggestion line", () => {
    const r = detectDragInvariants(culvertDrag());
    expect(r.summary).toContain("You changed ClearSpan 500 → 700");
    expect(r.summary).toContain("stayed put");
    expect(r.summary).toContain("keep these as driving dimensions?");
  });

  it("classifies a partly-following scalar as coupled, not invariant", () => {
    const samples: DragSample[] = [];
    for (let f = 0; f <= 10; f++) {
      samples.push({
        frame: f,
        measurements: {
          ClearSpan: 500 + 20 * f,
          // Moves more than ε_cluster (1 mm) but less than the 4 mm driver
          // threshold: genuinely coupled, and neither a driver nor an invariant.
          Follower: 100 + 0.25 * f,
          Fixed: 250,
        },
      });
    }
    const r = detectDragInvariants(samples);
    expect(r.drivers).toContain("ClearSpan");
    expect(r.coupled).toContain("Follower");
    expect(r.invariants).toContain("Fixed");
    expect(r.invariants).not.toContain("Follower");
  });
});

describe("§46 Candidates only — nothing is committed", () => {
  it("emits one candidate per invariant, all pending", () => {
    const r = detectDragInvariants(culvertDrag());
    expect(r.candidates).toHaveLength(3);
    for (const c of r.candidates) {
      expect(c.status).toBe("pending");
      // A drag observation is Inference, never a Geometric Fact (§22).
      expect(c.confidence).toBe("Inference");
      expect(c.provenance).toBe("drag-invariance");
    }
  });

  it("carries readable evidence naming the driver and the excursion", () => {
    const r = detectDragInvariants(culvertDrag());
    const wall = r.candidates.find((c) => c.parameterName === "WallThickness")!;
    expect(wall.description).toContain("drag frames");
    expect(wall.description).toContain("ClearSpan");
    expect(wall.nominalValue).toBeCloseTo(250.05, 4);
  });

  it("routes candidates into the same shared queue shape as static detection", () => {
    const r = detectDragInvariants(culvertDrag());
    for (const c of r.candidates) {
      // Must satisfy the ConstraintCandidate contract the SVD gate consumes.
      expect(typeof c.id).toBe("string");
      expect(Array.isArray(c.entityIds)).toBe(true);
      expect(typeof c.measuredDeviation).toBe("number");
      expect(typeof c.nominalValue).toBe("number");
    }
  });
});

describe("Refusal cases", () => {
  it("emits nothing when nothing moved (no driver)", () => {
    const still: DragSample[] = [0, 1, 2, 3, 4].map((f) => ({
      frame: f,
      measurements: { A: 100, B: 200 },
    }));
    const r = detectDragInvariants(still);
    expect(r.drivers).toHaveLength(0);
    expect(r.candidates).toHaveLength(0);
    expect(r.summary).toBeNull();
  });

  it("emits nothing below the minimum frame count", () => {
    const r = detectDragInvariants([
      { frame: 0, measurements: { A: 100 } },
      { frame: 1, measurements: { A: 900 } },
    ]);
    expect(r.candidates).toHaveLength(0);
  });

  it("skips a scalar that vanished mid-drag (topology change)", () => {
    const samples: DragSample[] = [
      { frame: 0, measurements: { Span: 100, Ghost: 5 } },
      { frame: 1, measurements: { Span: 500 } },
      { frame: 2, measurements: { Span: 900 } },
      { frame: 3, measurements: { Span: 1300 } },
    ];
    const r = detectDragInvariants(samples);
    expect(r.traces.map((t) => t.name)).not.toContain("Ghost");
  });
});

describe("Session lifecycle", () => {
  it("accumulates frames and resets cleanly", () => {
    const d = new DragInvarianceDetector();
    d.record(0, { A: 1 });
    d.record(1, { A: 2 });
    expect(d.getFrameCount()).toBe(2);
    d.reset();
    expect(d.getFrameCount()).toBe(0);
    expect(d.analyze().candidates).toHaveLength(0);
  });

  it("honours custom thresholds", () => {
    const samples: DragSample[] = [0, 1, 2, 3].map((f) => ({
      frame: f,
      // Wobbly's total excursion is 0.3 mm.
      measurements: { Driver: 100 + 50 * f, Wobbly: 200 + 0.1 * f },
    }));
    const permissive = detectDragInvariants(samples, { invariantMaxExcursion: 0.5 });
    expect(permissive.invariants).toContain("Wobbly");
    const strict = detectDragInvariants(samples, { invariantMaxExcursion: 0.05 });
    expect(strict.invariants).not.toContain("Wobbly");
    expect(strict.coupled).toContain("Wobbly");
  });
});
