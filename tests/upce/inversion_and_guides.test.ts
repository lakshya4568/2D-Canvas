/**
 * Two capabilities a draftsman asked for by describing what was missing.
 *
 *   "it should show very first line to get equal length ... and snap to it"
 *   "a line like r1 width can have constant, derived or driving relationship ...
 *    it can switch the relationship dynamically if it needs, which suits best"
 *
 * The second is not auto-switching who drives whom — that is how a parameter
 * graph acquires a cycle. It is being able to drive a relationship BACKWARDS:
 * type the number you were given, and be told which input produces it.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { applySnapping } from "../../lib/geometry/snapping";
import { collectReferences, equalLengthSnap, parallelSnap, extensionSnap } from "../../lib/geometry/draftingGuides";
import { inversionOptions, applyInversion, solveForInput, explainChain } from "../../lib/upce/inverse";
import { evaluateParameters } from "../../lib/upce/parameters";
import type { AuthoringSketch, SketchParameter } from "../../lib/upce/types";

// ---------------------------------------------------------------------------
// Drafting guides
// ---------------------------------------------------------------------------

const existing: Shape[] = [
  { id: "L1", type: "line", x1: 0, y1: 0, x2: 400, y2: 0 } as Shape,
  { id: "L2", type: "line", x1: 0, y1: 200, x2: 0, y2: 550 } as Shape,
];

describe("Equal-length snapping", () => {
  it("snaps a dragged length onto an edge already drawn, keeping the direction", () => {
    const refs = collectReferences(existing);
    // Dragging out at 30 degrees, 393 long — 7 short of L1's 400.
    const start = { x: 1000, y: 1000 };
    const a = (30 * Math.PI) / 180;
    const raw = { x: start.x + Math.cos(a) * 393, y: start.y + Math.sin(a) * 393 };

    const hit = equalLengthSnap(start, raw, refs, 20);
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit!.point.x - start.x, hit!.point.y - start.y)).toBeCloseTo(400, 9);
    // The direction is untouched: the ruler set the distance, the hand the angle.
    const outAngle = Math.atan2(hit!.point.y - start.y, hit!.point.x - start.x);
    expect((outAngle * 180) / Math.PI).toBeCloseTo(30, 9);
    expect(hit!.label).toBe("= 400.0");
    expect(hit!.inference.kind).toBe("equal_length");
    expect(hit!.referenceEdges).toHaveLength(1);
  });

  it("prefers the shorter reference when two are equally close", () => {
    const shapes: Shape[] = [
      { id: "S", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 } as Shape,
      { id: "B", type: "line", x1: 0, y1: 50, x2: 120, y2: 50 } as Shape,
    ];
    const refs = collectReferences(shapes);
    const start = { x: 500, y: 500 };
    const hit = equalLengthSnap(start, { x: 610, y: 500 }, refs, 20);
    // 110 is ten from each; a draftsman matching a wall means the smaller one.
    expect(hit!.inference.value).toBe(100);
  });

  it("leaves a length alone when nothing is near it", () => {
    const refs = collectReferences(existing);
    const hit = equalLengthSnap({ x: 0, y: 0 }, { x: 731, y: 0 }, refs, 20);
    expect(hit).toBeNull();
  });

  it("never measures the shape being drawn against itself", () => {
    const refs = collectReferences(existing, "L1");
    expect(refs.edges.every((e) => e.shapeId !== "L1")).toBe(true);
  });
});

describe("Direction snapping", () => {
  it("snaps onto an existing edge's direction, keeping the length", () => {
    const shapes: Shape[] = [
      { id: "D", type: "line", x1: 0, y1: 0, x2: 100, y2: 100 } as Shape, // 45 degrees
    ];
    const refs = collectReferences(shapes);
    const start = { x: 0, y: 0 };
    // 46.5 degrees, 200 long.
    const a = (46.5 * Math.PI) / 180;
    const raw = { x: Math.cos(a) * 200, y: Math.sin(a) * 200 };

    const hit = parallelSnap(start, raw, refs, (2 * Math.PI) / 180);
    expect(hit).not.toBeNull();
    const outAngle = (Math.atan2(hit!.point.y, hit!.point.x) * 180) / Math.PI;
    expect(outAngle).toBeCloseTo(45, 6);
    expect(Math.hypot(hit!.point.x, hit!.point.y)).toBeCloseTo(200, 6);
  });

  it("calls a horizontal edge horizontal rather than parallel to something", () => {
    const refs = collectReferences(existing);
    const hit = parallelSnap({ x: 0, y: 0 }, { x: 300, y: 4 }, refs, (2 * Math.PI) / 180);
    expect(hit!.inference.kind).toBe("horizontal");
    expect(hit!.point.y).toBeCloseTo(0, 9);
  });

  it("treats an edge pointing the other way as parallel", () => {
    const shapes: Shape[] = [{ id: "R", type: "line", x1: 400, y1: 0, x2: 0, y2: 0 } as Shape];
    const refs = collectReferences(shapes);
    const hit = parallelSnap({ x: 0, y: 0 }, { x: 300, y: 3 }, refs, (2 * Math.PI) / 180);
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(0, 9);
  });
});

describe("Alignment with a corner elsewhere", () => {
  it("lines the cursor up with a vertex, on one axis only", () => {
    const refs = collectReferences(existing);
    // L1 ends at (400, 0); the cursor is 6 to its right and a long way below.
    const hit = extensionSnap({ x: 406, y: 900 }, refs, 20);
    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(400, 9);
    expect(hit!.point.y).toBe(900); // the other axis still follows the hand
    expect(hit!.guideLines).toHaveLength(1);
  });

  it("does not offer to align with the vertex the cursor is already on", () => {
    // Ordinary vertex snapping has a better answer for that one, and offering a
    // guide through it as well would fight it.
    const one: Shape[] = [{ id: "P", type: "line", x1: 400, y1: 0, x2: 400, y2: 0 } as Shape];
    expect(extensionSnap({ x: 400, y: 2 }, collectReferences(one), 20)).toBeNull();

    // A DIFFERENT corner two away in y is still a real alignment, and is offered.
    const other: Shape[] = [{ id: "Q", type: "line", x1: 0, y1: 0, x2: 50, y2: 0 } as Shape];
    const hit = extensionSnap({ x: 900, y: 2 }, collectReferences(other), 20);
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(0, 9);
  });
});

describe("The snapping pipeline", () => {
  it("offers an equal-length snap while drawing, and not otherwise", () => {
    const start = { x: 1000, y: 1000 };
    const raw = { x: 1000 + 394, y: 1000 };

    const withGuides = applySnapping(raw, {
      gridSnapEnabled: false,
      objectSnapEnabled: true,
      shapes: existing,
      startPoint: start,
      draftingGuides: true,
      vertexThresholdPx: 20,
    });
    expect(withGuides.category).toBe("equal_length");
    expect(withGuides.point.x).toBeCloseTo(1400, 6);
    expect(withGuides.inference?.kind).toBe("equal_length");

    const without = applySnapping(raw, {
      gridSnapEnabled: false,
      objectSnapEnabled: true,
      shapes: existing,
      startPoint: start,
      vertexThresholdPx: 20,
    });
    expect(without.category).not.toBe("equal_length");
  });

  it("lets a real vertex beat a length that merely matches", () => {
    // Dragging to within a whisker of L1's far end, which is also ~400 away.
    const res = applySnapping({ x: 398, y: 2 }, {
      gridSnapEnabled: false,
      objectSnapEnabled: true,
      shapes: existing,
      startPoint: { x: 0, y: 0 },
      draftingGuides: true,
      vertexThresholdPx: 20,
    });
    expect(res.snapType).toBe("vertex");
    expect(["endpoint", "corner"]).toContain(res.category);
  });
});

// ---------------------------------------------------------------------------
// Driving a relationship backwards
// ---------------------------------------------------------------------------

function param(p: Partial<SketchParameter> & { name: string; value: number }): SketchParameter {
  return {
    role: "DRIVING",
    type: "LENGTH",
    unit: "mm",
    boundConstraints: [],
    published: true,
    provenance: { origin: "user", detail: "test", createdAt: 0 },
    ...p,
  } as SketchParameter;
}

function culvertish(): AuthoringSketch {
  return {
    points: {},
    pointOrder: [],
    pointAliases: {},
    segments: {},
    circles: {},
    constraints: [],
    parameters: {
      OverallWidth: param({ name: "OverallWidth", value: 2100 }),
      WallThickness: param({ name: "WallThickness", value: 350 }),
      ClearSpan: param({
        name: "ClearSpan",
        value: 1400,
        role: "DERIVED",
        expr: "OverallWidth - 2 * WallThickness",
      }),
    },
    components: [],
    repeats: [],
    carrierShapeIds: [],
    units: "mm",
    meta: { name: "t", freedomIsIntentional: false, version: 0 },
  };
}

describe("Driving a derived value backwards", () => {
  it("offers every input that can produce the number, largest effect first", () => {
    const sketch = culvertish();
    const r = inversionOptions(sketch, "ClearSpan", 1600);

    expect(r.refused).toBeUndefined();
    expect(r.options.map((o) => o.parameter)).toEqual(["WallThickness", "OverallWidth"]);

    // 1600 = 2100 - 2w  ->  w = 250.   1600 = W - 700  ->  W = 2300.
    const wall = r.options.find((o) => o.parameter === "WallThickness")!;
    const width = r.options.find((o) => o.parameter === "OverallWidth")!;
    expect(wall.to).toBeCloseTo(250, 6);
    expect(width.to).toBeCloseTo(2300, 6);

    // The wall moves the span twice as hard, and is offered first for it.
    expect(wall.sensitivity).toBeCloseTo(-2, 6);
    expect(width.sensitivity).toBeCloseTo(1, 6);
  });

  it("actually produces the number when applied", () => {
    const sketch = culvertish();
    const r = inversionOptions(sketch, "ClearSpan", 1600);
    for (const option of r.options) {
      const next = applyInversion(sketch, option);
      expect(evaluateParameters(next.parameters).values.ClearSpan).toBeCloseTo(1600, 6);
    }
  });

  it("leaves the graph exactly as it was — nothing is re-pointed", () => {
    const sketch = culvertish();
    const r = inversionOptions(sketch, "ClearSpan", 1600);
    const next = applyInversion(sketch, r.options[0]);

    expect(next.parameters.ClearSpan.role).toBe("DERIVED");
    expect(next.parameters.ClearSpan.expr).toBe("OverallWidth - 2 * WallThickness");
    expect(next.parameters.OverallWidth.role).toBe("DRIVING");
    expect(evaluateParameters(next.parameters).cycles).toHaveLength(0);
  });

  it("inverts a non-linear relationship too", () => {
    const sketch = culvertish();
    sketch.parameters.Area = param({
      name: "Area",
      value: 0,
      role: "DERIVED",
      expr: "ClearSpan * ClearSpan",
    });
    const solved = solveForInput(sketch, "Area", 4_000_000, "OverallWidth");
    expect(solved).not.toBeNull();
    // span 2000 needs width 2000 + 700.
    expect(solved!).toBeCloseTo(2700, 4);
  });

  it("refuses honestly when a limit puts the answer out of reach", () => {
    const sketch = culvertish();
    sketch.parameters.WallThickness = param({
      name: "WallThickness",
      value: 350,
      min: 300,
      max: 400,
    });
    sketch.parameters.OverallWidth = param({ name: "OverallWidth", value: 2100, max: 2200 });

    const r = inversionOptions(sketch, "ClearSpan", 1900);
    // wall would need 100 (below min); width would need 2600 (above max).
    expect(r.options).toHaveLength(0);
    expect(r.refused).toMatch(/outside the limits/);
  });

  it("will not nudge a count to a fraction", () => {
    const sketch = culvertish();
    sketch.parameters.CellCount = param({
      name: "CellCount",
      value: 3,
      type: "COUNT",
      unit: "count",
    });
    sketch.parameters.TotalRun = param({
      name: "TotalRun",
      value: 0,
      role: "DERIVED",
      expr: "CellCount * OverallWidth",
    });

    const whole = inversionOptions(sketch, "TotalRun", 4 * 2100);
    expect(whole.options.find((o) => o.parameter === "CellCount")?.to).toBeCloseTo(4, 9);

    const fractional = inversionOptions(sketch, "TotalRun", 7000);
    expect(fractional.options.some((o) => o.parameter === "CellCount")).toBe(false);
  });

  it("says so when the value is not derived at all", () => {
    const sketch = culvertish();
    const r = inversionOptions(sketch, "OverallWidth", 2500);
    expect(r.refused).toMatch(/not worked out from anything/);
  });

  it("explains the chain a number came down", () => {
    const sketch = culvertish();
    const lines = explainChain(sketch, "ClearSpan");
    expect(lines[0]).toBe("ClearSpan = OverallWidth - 2 * WallThickness");
    expect(lines.join("\n")).toMatch(/OverallWidth is 2100.0, set by hand/);
    expect(lines.join("\n")).toMatch(/WallThickness is 350.0, set by hand/);
  });
});
