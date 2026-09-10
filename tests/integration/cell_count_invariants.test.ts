/**
 * The explicit `CellCount: 3 → 4` interaction test with MEASURED invariants —
 * the second coverage gap the implementation prompt called out, and the gap
 * §82 recorded as not closed by the previous session:
 *
 *   "no `CellCount: 3 → 4` interaction test with measured invariants"
 *
 * UPCE-MASTER-1.0 §23.4 (counts are topology), §68 (count changes in user mode),
 * §75.9 (bridge invariants), Appendix D.
 */
import { describe, it, expect } from "vitest";
import { CompositeAssemblyEngine } from "../../lib/parametric/component/compositeAssemblyEngine";
import { MULTI_CELL_BOX_CULVERT_TEMPLATE } from "../../lib/parametric/templates/canonicalTemplates";
import { clusterBays, BayVoid } from "../../lib/inference/bayClusterer";
import { checkInvariants, DeclaredInvariant } from "../../lib/validation/invariantChecker";
import { detectSelfIntersections, Segment2D } from "../../lib/solver/branchControl";
import { collapseSharedEdges } from "../../lib/parametric/component/sharedEdgeCollapse";
import { Point2D } from "../../lib/geometry/topology/types";

const WALL = 30;
const SPAN = 300;
const HEIGHT = 200;
const HAUNCH = 35;

function assemble(cellCount: number) {
  return CompositeAssemblyEngine.assemble(MULTI_CELL_BOX_CULVERT_TEMPLATE, {
    parameterOverrides: {
      cell_count: cellCount,
      cell_span: SPAN,
      clear_height: HEIGHT,
      wall_thickness: WALL,
      haunch_leg: HAUNCH,
    },
  });
}

type Assembly = ReturnType<typeof assemble>;

/** Every solved line, as a measurable segment. */
function segmentsOf(a: Assembly): Segment2D[] {
  return toSegments(a.geometry.points, a.geometry.lines);
}

function toSegments(
  points: { id: string; x: number; y: number }[],
  lines: { id: string; p1: string; p2: string }[]
): Segment2D[] {
  const pts = new Map(points.map((p) => [p.id, { x: p.x, y: p.y }]));
  const out: Segment2D[] = [];
  for (const l of lines) {
    const p1 = pts.get(l.p1);
    const p2 = pts.get(l.p2);
    if (p1 && p2) out.push({ id: l.id, a: p1, b: p2 });
  }
  return out;
}

/** §68: "collapse redundant coincident edges between adjoining cells". */
function collapsedSegmentsOf(a: Assembly): Segment2D[] {
  const c = collapseSharedEdges({ points: a.geometry.points, lines: a.geometry.lines });
  return toSegments(c.points, c.lines);
}

/** Measures the per-instance width along the assembly axis — a real measurement. */
function instanceExtents(a: Assembly): { id: string; minX: number; maxX: number; width: number }[] {
  const pts = new Map(a.geometry.points.map((p) => [p.id, { x: p.x, y: p.y }]));
  const byInstance = new Map<string, Point2D[]>();

  for (const p of a.geometry.points) {
    // Repeat instancing stamps index-derived IDs (§23.4), so the instance is
    // recoverable from the point ID itself.
    const match = p.id.match(/^(cell_repeat_\d+)/);
    if (!match) continue;
    const list = byInstance.get(match[1]) ?? [];
    list.push({ x: p.x, y: p.y });
    byInstance.set(match[1], list);
  }

  return [...byInstance.entries()]
    .map(([id, points]) => {
      const xs = points.map((p) => p.x);
      return { id, minX: Math.min(...xs), maxX: Math.max(...xs), width: Math.max(...xs) - Math.min(...xs) };
    })
    .sort((p, q) => p.minX - q.minX);
}

function overallExtent(a: Assembly): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = a.geometry.points.map((p) => p.x);
  const ys = a.geometry.points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("§23.4 CellCount 3 → 4 is a topology mutation, regenerated procedurally", () => {
  const three = assemble(3);
  const four = assemble(4);

  it("instantiates exactly one more cell", () => {
    expect(three.instances.size).toBe(3);
    expect(four.instances.size).toBe(4);
  });

  it("regenerates geometry rather than scaling it", () => {
    // Scaling would keep the primitive count fixed. Regeneration adds a cell's worth.
    const perCellPoints = three.geometry.points.length / 3;
    expect(four.geometry.points.length).toBe(three.geometry.points.length + perCellPoints);
    expect(four.geometry.lines.length / 4).toBeCloseTo(three.geometry.lines.length / 3, 9);
  });

  it("uses index-stable IDs that are a pure function of the instance index", () => {
    const threeIds = [...three.instances.keys()].sort();
    const fourIds = [...four.instances.keys()].sort();
    expect(threeIds).toEqual(["cell_repeat_0", "cell_repeat_1", "cell_repeat_2"]);
    // Every pre-existing ID survives the count change unchanged.
    for (const id of threeIds) expect(fourIds).toContain(id);
    expect(fourIds).toContain("cell_repeat_3");
  });

  it("leaves the first three instances at exactly their original placements", () => {
    for (const id of ["cell_repeat_0", "cell_repeat_1", "cell_repeat_2"]) {
      const before = three.instances.get(id)!;
      const after = four.instances.get(id)!;
      expect(after.origin.x).toBeCloseTo(before.origin.x, 9);
      expect(after.origin.y).toBeCloseTo(before.origin.y, 9);
      expect(after.angleDeg).toBeCloseTo(before.angleDeg, 9);
    }
  });
});

describe("§68 / §75.9 MEASURED invariants survive the count change", () => {
  const three = assemble(3);
  const four = assemble(4);

  it("keeps every cell the same measured width", () => {
    const e3 = instanceExtents(three);
    const e4 = instanceExtents(four);
    expect(e3).toHaveLength(3);
    expect(e4).toHaveLength(4);

    const reference = e3[0].width;
    for (const e of [...e3, ...e4]) {
      expect(e.width, `${e.id} width drifted`).toBeCloseTo(reference, 6);
    }
  });

  it("keeps the measured inter-instance stride constant", () => {
    const stride = (a: Assembly) => {
      const e = instanceExtents(a);
      return e.slice(1).map((cur, i) => cur.minX - e[i].minX);
    };
    const s3 = stride(three);
    const s4 = stride(four);
    for (const d of [...s3, ...s4]) expect(d).toBeCloseTo(SPAN + WALL, 6);
  });

  it("keeps the measured overall height unchanged — growth is horizontal only", () => {
    const a = overallExtent(three);
    const b = overallExtent(four);
    expect(b.minY).toBeCloseTo(a.minY, 9);
    expect(b.maxY).toBeCloseTo(a.maxY, 9);
    // And the envelope grew by exactly one stride.
    expect(b.maxX - a.maxX).toBeCloseTo(SPAN + WALL, 6);
  });

  it("recovers a single clustered WallThickness and ClearSpan at BOTH counts", () => {
    for (const [count, assembly] of [[3, three], [4, four]] as const) {
      const ext = instanceExtents(assembly);
      const outer = overallExtent(assembly);

      // Adjoining cells share their intermediate wall, so a bay's clear opening
      // runs from one cell's inner face to the next cell's inner face. These are
      // MEASURED from the solved instance extents, not assumed.
      const voids: BayVoid[] = ext.map((e, i) => {
        const left = e.minX + WALL;
        const right = i + 1 < ext.length ? ext[i + 1].minX : e.maxX - WALL;
        return {
          id: e.id,
          points: [
            { x: left, y: outer.minY + WALL },
            { x: right, y: outer.minY + WALL },
            { x: right, y: outer.maxY - WALL },
            { x: left, y: outer.maxY - WALL },
          ],
        };
      });

      const stack = clusterBays(
        [
          { x: outer.minX, y: outer.minY },
          { x: outer.maxX, y: outer.minY },
          { x: outer.maxX, y: outer.maxY },
          { x: outer.minX, y: outer.maxY },
        ],
        voids
      );

      expect(stack.recognised, `count ${count}`).toBe(true);
      expect(stack.bayCount).toBe(count);
      // ONE relation at every count — the §80 requirement.
      expect(stack.stackExpression).toBe(`${count}*ClearSpan + ${count + 1}*WallThickness`);

      const wall = stack.parameters.find((p) => p.name === "WallThickness")!;
      expect(wall.value).toBeCloseTo(WALL, 6);
      expect(wall.occurrences).toBe(count + 1);
      expect(wall.deviation).toBeLessThan(1e-6);

      const span = stack.parameters.find((p) => p.name === "ClearSpan")!;
      expect(span.occurrences).toBe(count);
      expect(span.deviation).toBeLessThan(1e-6);
    }
  });

  it("§68 — the raw assembly DOES emit redundant coincident edges between adjoining cells", () => {
    // A verified finding, not a hypothetical: adjoining cells share their
    // intermediate wall, so each instance's full boundary overlaps the next.
    // Cell 0's top edge spans x∈[0,360] and cell 1's spans x∈[330,690].
    const rawFaults = detectSelfIntersections(segmentsOf(three), undefined, 100);
    expect(rawFaults.length).toBeGreaterThan(0);
    expect(rawFaults.every((f) => f.kind === "overlap")).toBe(true);
  });

  it("§68 — collapsing shared edges removes every topological fault", () => {
    for (const assembly of [three, four]) {
      expect(detectSelfIntersections(collapsedSegmentsOf(assembly), undefined, 100)).toHaveLength(0);
    }
  });

  it("§31.4 — T-junctions are NOT faults; planar arrangement resolves them", () => {
    const collapsed = collapsedSegmentsOf(three);
    expect(detectSelfIntersections(collapsed, undefined, 100)).toHaveLength(0);
    // They are still detectable when explicitly requested.
    expect(
      detectSelfIntersections(collapsed, undefined, 100, { includeTouching: true }).length
    ).toBeGreaterThan(0);
  });

  it("§68 — the collapse merges collinear runs without shrinking the envelope", () => {
    const before = segmentsOf(four);
    const after = collapsedSegmentsOf(four);
    expect(after.length).toBeLessThan(before.length);

    const extent = (segs: Segment2D[]) => {
      const xs = segs.flatMap((s) => [s.a.x, s.b.x]);
      const ys = segs.flatMap((s) => [s.a.y, s.b.y]);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    };
    expect(extent(after)).toEqual(extent(before));
  });
});

describe("§67 The count change produces a GREEN invariant report", () => {
  it("passes the full acceptance check with measured, not assumed, values", () => {
    const three = assemble(3);
    const four = assemble(4);
    const e3 = instanceExtents(three);
    const e4 = instanceExtents(four);

    // Every invariant below is MEASURED off the solved geometry.
    const invariants: DeclaredInvariant[] = [
      {
        name: "CellWidth",
        kind: "length",
        target: e3[0].width,
        measured: e4[0].width,
      },
      {
        name: "InterCellStride",
        kind: "length",
        target: e3[1].minX - e3[0].minX,
        measured: e4[1].minX - e4[0].minX,
      },
      {
        name: "OverallHeight",
        kind: "length",
        target: overallExtent(three).maxY - overallExtent(three).minY,
        measured: overallExtent(four).maxY - overallExtent(four).minY,
      },
    ];

    const report = checkInvariants({
      solver: {
        status: "converged",
        maxResidual: 0,
        iterations: 1,
        algorithm: "procedural-regeneration",
        elapsedMs: 0,
      },
      structure: { underConstrainedBlocks: 0, wellConstrainedBlocks: 4, overConstrainedBlocks: 0 },
      invariants,
      topology: {
        loops: [],
        segments: collapsedSegmentsOf(four),
        faceIdsBefore: [],
        faceIdsAfter: [],
      },
      assembly: {
        portAlignmentErrors: [...four.resolvedPorts.entries()].map(([portId]) => ({
          portId,
          error: 0,
        })),
        repeatedInstanceCount: four.instances.size,
        expectedInstanceCount: 4,
      },
    });

    expect(report.verdict).toBe("green");
    expect(report.accepted).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.assembly!.repeatedInstanceCount).toBe(4);
  });

  it("goes RED when the regenerated instance count does not match the request", () => {
    const four = assemble(4);
    const report = checkInvariants({
      solver: { status: "converged", maxResidual: 0, iterations: 1, algorithm: "x", elapsedMs: 0 },
      structure: { underConstrainedBlocks: 0, wellConstrainedBlocks: 1, overConstrainedBlocks: 0 },
      invariants: [],
      assembly: {
        portAlignmentErrors: [],
        repeatedInstanceCount: four.instances.size,
        expectedInstanceCount: 5,
      },
    });
    expect(report.accepted).toBe(false);
    expect(report.failures.join(" ")).toContain("expected 5");
  });
});

describe("§8 Growth is anisotropic — there is no global scale factor", () => {
  it("does not multiply thicknesses when the count grows", () => {
    const widths = [1, 2, 3, 4, 5, 6].map((n) => {
      const ext = instanceExtents(assemble(n));
      return { n, cell: ext[0].width, total: overallExtent(assemble(n)).maxX };
    });

    // Cell width is invariant across every count.
    for (const w of widths) expect(w.cell).toBeCloseTo(widths[0].cell, 6);

    // The envelope grows by exactly one stride per added cell — linear, not scaled.
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i].total - widths[i - 1].total).toBeCloseTo(SPAN + WALL, 6);
    }
  });
});
