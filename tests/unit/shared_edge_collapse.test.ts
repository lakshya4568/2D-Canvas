/**
 * Redundant shared-edge collapse between adjoining repeat instances.
 * UPCE-MASTER-1.0 §68, §23.4.
 */
import { describe, it, expect } from "vitest";
import { collapseSharedEdges } from "../../lib/parametric/component/sharedEdgeCollapse";

describe("§68 Collinear overlap between adjoining instances", () => {
  it("merges two overlapping collinear runs into their union", () => {
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
    expect(r.merged).toHaveLength(1);

    const survivor = r.lines[0];
    const pt = (id: string) => r.points.find((p) => p.id === id)!;
    const xs = [pt(survivor.p1).x, pt(survivor.p2).x].sort((p, q) => p - q);
    expect(xs).toEqual([0, 690]);
  });

  it("merges abutting runs that share exactly one endpoint", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 100, y: 0 },
        { id: "b0", x: 100, y: 0 },
        { id: "b1", x: 200, y: 0 },
      ],
      lines: [
        { id: "cell_repeat_0_e", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_e", p1: "b0", p2: "b1" },
      ],
    });
    expect(r.lines).toHaveLength(1);
  });

  it("leaves separated collinear runs alone", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 100, y: 0 },
        { id: "b0", x: 500, y: 0 },
        { id: "b1", x: 600, y: 0 },
      ],
      lines: [
        { id: "cell_repeat_0_e", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_e", p1: "b0", p2: "b1" },
      ],
    });
    expect(r.lines).toHaveLength(2);
    expect(r.removed).toHaveLength(0);
  });

  it("leaves parallel-but-offset runs alone (they are a wall, not a duplicate)", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 100, y: 0 },
        { id: "b0", x: 0, y: 30 },
        { id: "b1", x: 100, y: 30 },
      ],
      lines: [
        { id: "cell_repeat_0_e", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_e", p1: "b0", p2: "b1" },
      ],
    });
    expect(r.lines).toHaveLength(2);
  });

  it("leaves crossing runs alone — a crossing is not a duplicate", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 100, y: 0 },
        { id: "b0", x: 50, y: -50 },
        { id: "b1", x: 50, y: 50 },
      ],
      lines: [
        { id: "cell_repeat_0_e", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_e", p1: "b0", p2: "b1" },
      ],
    });
    expect(r.lines).toHaveLength(2);
  });
});

describe("Direction is canonicalised, so reversed runs still collapse", () => {
  it("collapses a run against its own reverse", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 360, y: 0 },
        { id: "b0", x: 690, y: 0 },
        { id: "b1", x: 330, y: 0 },
      ],
      lines: [
        { id: "cell_repeat_0_top", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_top", p1: "b0", p2: "b1" }, // drawn right-to-left
      ],
    });
    expect(r.lines).toHaveLength(1);
  });

  it("works identically on a rotated assembly (Clause 6)", () => {
    const rot = (x: number, y: number, deg: number) => {
      const t = (deg * Math.PI) / 180;
      return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
    };
    for (const deg of [0, 15, 37, 45, 90]) {
      const p = (x: number, y: number) => rot(x, y, deg);
      const r = collapseSharedEdges({
        points: [
          { id: "a0", ...p(0, 0) },
          { id: "a1", ...p(360, 0) },
          { id: "b0", ...p(330, 0) },
          { id: "b1", ...p(690, 0) },
        ],
        lines: [
          { id: "cell_repeat_0_top", p1: "a0", p2: "a1" },
          { id: "cell_repeat_1_top", p1: "b0", p2: "b1" },
        ],
      });
      expect(r.lines, `failed at ${deg}°`).toHaveLength(1);
    }
  });
});

describe("Instance scoping protects a template's own geometry", () => {
  it("does not merge collinear runs belonging to the SAME instance by default", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 360, y: 0 },
        { id: "b0", x: 330, y: 0 },
        { id: "b1", x: 690, y: 0 },
      ],
      lines: [
        { id: "cell_repeat_0_top", p1: "a0", p2: "a1" },
        { id: "cell_repeat_0_ledge", p1: "b0", p2: "b1" },
      ],
    });
    expect(r.lines).toHaveLength(2);
  });

  it("merges within one instance when explicitly asked", () => {
    const r = collapseSharedEdges(
      {
        points: [
          { id: "a0", x: 0, y: 0 },
          { id: "a1", x: 360, y: 0 },
          { id: "b0", x: 330, y: 0 },
          { id: "b1", x: 690, y: 0 },
        ],
        lines: [
          { id: "cell_repeat_0_top", p1: "a0", p2: "a1" },
          { id: "cell_repeat_0_ledge", p1: "b0", p2: "b1" },
        ],
      },
      { onlyAcrossInstances: false }
    );
    expect(r.lines).toHaveLength(1);
  });
});

describe("Degenerate and defensive cases", () => {
  it("passes through a line with a missing endpoint rather than dropping it", () => {
    const r = collapseSharedEdges({
      points: [{ id: "a0", x: 0, y: 0 }],
      lines: [{ id: "dangling", p1: "a0", p2: "missing" }],
    });
    expect(r.lines.map((l) => l.id)).toEqual(["dangling"]);
  });

  it("passes through a zero-length line", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 5, y: 5 },
        { id: "a1", x: 5, y: 5 },
      ],
      lines: [{ id: "degenerate", p1: "a0", p2: "a1" }],
    });
    expect(r.lines.map((l) => l.id)).toEqual(["degenerate"]);
  });

  it("keeps fixed anchor points even when unreferenced (§18 anchor rule)", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "anchor", x: 0, y: 0, fixed: true },
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
    expect(r.points.some((p) => p.id === "anchor")).toBe(true);
  });

  it("handles an empty input", () => {
    const r = collapseSharedEdges({ points: [], lines: [] });
    expect(r.lines).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
  });

  it("merges a chain of three overlapping runs into one", () => {
    const r = collapseSharedEdges({
      points: [
        { id: "a0", x: 0, y: 0 },
        { id: "a1", x: 360, y: 0 },
        { id: "b0", x: 330, y: 0 },
        { id: "b1", x: 690, y: 0 },
        { id: "c0", x: 660, y: 0 },
        { id: "c1", x: 1020, y: 0 },
      ],
      lines: [
        { id: "cell_repeat_0_top", p1: "a0", p2: "a1" },
        { id: "cell_repeat_1_top", p1: "b0", p2: "b1" },
        { id: "cell_repeat_2_top", p1: "c0", p2: "c1" },
      ],
    });
    expect(r.lines).toHaveLength(1);
    const pt = (id: string) => r.points.find((p) => p.id === id)!;
    const xs = [pt(r.lines[0].p1).x, pt(r.lines[0].p2).x].sort((p, q) => p - q);
    expect(xs).toEqual([0, 1020]);
  });
});
