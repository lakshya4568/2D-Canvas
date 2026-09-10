import { describe, it, expect } from "vitest";
import {
  parseDxf,
  importDxfToShapes,
  importDxfToSketch,
  aciToHex,
} from "../../lib/io/dxfImporter";
import { exportDxf } from "../../lib/io/dxfExporter";
import { ParametricSketch } from "../../lib/parametric/schemaTypes";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

function sampleSketch(): ParametricSketch {
  return {
    sketchId: "dxf_test",
    schemaVersion: "1.0",
    name: "DXF Test Culvert",
    units: { length: "mm", angle: "rad" },
    tolerances: { ...DEFAULT_TOLERANCE_POLICY },
    parameters: {},
    formulas: [],
    primitives: {
      points: {
        p0: { id: "p0", x: 0, y: 0 },
        p1: { id: "p1", x: 2000, y: 0 },
        p2: { id: "p2", x: 2000, y: 1500 },
        p3: { id: "p3", x: 0, y: 1500 },
        c0: { id: "c0", x: 1000, y: 750 },
      },
      lines: {
        l0: { id: "l0", startPointId: "p0", endPointId: "p1", semanticRole: "BOTTOM_SLAB" },
        l1: { id: "l1", startPointId: "p1", endPointId: "p2", semanticRole: "OUTER_WALL" },
      },
      circles: {
        ci0: { id: "ci0", centerPointId: "c0", radius: 150 },
      },
      arcs: {
        a0: { id: "a0", centerPointId: "c0", radius: 250, startAngle: 0, endAngle: Math.PI / 2 },
      },
      polylines: {
        pl0: { id: "pl0", vertices: ["p0", "p1", "p2", "p3"], closed: true },
      },
    },
    topology: { halfEdges: {}, faces: {} },
    constraints: {},
  };
}

describe("DXF Parser & Importer (UPCE-MASTER-1.0 §69)", () => {
  it("converts AutoCAD Color Index (ACI) to hex colors correctly", () => {
    expect(aciToHex(1)).toBe("#ff0000"); // Red
    expect(aciToHex(2)).toBe("#ffff00"); // Yellow
    expect(aciToHex(3)).toBe("#00ff00"); // Green
    expect(aciToHex(4)).toBe("#00ffff"); // Cyan
    expect(aciToHex(5)).toBe("#0000ff"); // Blue
    expect(aciToHex(6)).toBe("#ff00ff"); // Magenta
    expect(aciToHex(7)).toBe("#ffffff"); // White
    expect(aciToHex(undefined, "#123456")).toBe("#123456"); // Fallback
  });

  it("parses valid DXF text into structured IDxf object", () => {
    const rawDxf = exportDxf(sampleSketch());
    const parsed = parseDxf(rawDxf);

    expect(parsed).toBeDefined();
    expect(parsed.entities).toBeDefined();
    expect(parsed.entities.length).toBeGreaterThan(0);
    expect(parsed.entities.some((e) => e.type === "LINE")).toBe(true);
    expect(parsed.entities.some((e) => e.type === "CIRCLE")).toBe(true);
    expect(parsed.entities.some((e) => e.type === "ARC")).toBe(true);
  });

  it("throws descriptive error on corrupt DXF", () => {
    expect(() => parseDxf("CORRUPT GARBAGE NOT A DXF")).toThrow(/DXF Syntax Error|Failed to parse DXF/);
  });

  it("imports DXF entities into Canvas Shape[] models with coordinates intact", () => {
    const rawDxf = exportDxf(sampleSketch());
    const shapes = importDxfToShapes(rawDxf);

    expect(shapes.length).toBeGreaterThan(0);

    // Find lines
    const lines = shapes.filter((s) => s.type === "line");
    expect(lines.length).toBeGreaterThan(0);

    // Check bottom slab line p0(0,0) -> p1(2000, 0)
    const bottomLine = lines.find(
      (l: any) =>
        (Math.abs(l.x1 - 0) < 1 && Math.abs(l.x2 - 2000) < 1) ||
        (Math.abs(l.x1 - 2000) < 1 && Math.abs(l.x2 - 0) < 1)
    );
    expect(bottomLine).toBeDefined();

    // Find circle
    const circles = shapes.filter((s) => s.type === "circle");
    expect(circles.length).toBe(1);
    const c = circles[0] as any;
    expect(c.cx).toBeCloseTo(1000, 1);
    expect(c.cy).toBeCloseTo(750, 1);
    expect(c.r).toBeCloseTo(150, 1);
  });

  it("recognizes orthogonal closed polylines as RectangleShapes", () => {
    const rawDxf = exportDxf(sampleSketch());
    const shapes = importDxfToShapes(rawDxf, { detectRectangles: true });

    // The sampleSketch polyline [p0(0,0), p1(2000,0), p2(2000,1500), p3(0,1500)] is a 2000x1500 rectangle
    const rects = shapes.filter((s) => s.type === "rectangle");
    expect(rects.length).toBe(1);
    const rect = rects[0] as any;
    expect(rect.width).toBeCloseTo(2000, 1);
    expect(rect.height).toBeCloseTo(1500, 1);
  });

  it("discretizes arc entities into compliant chord line segments", () => {
    const rawDxf = exportDxf(sampleSketch());
    const shapes = importDxfToShapes(rawDxf);

    // Arcs are discretized into chord line segments sharing a group
    const arcSegs = shapes.filter((s) => s.groupName?.includes("Arc"));
    expect(arcSegs.length).toBeGreaterThanOrEqual(8);
  });

  it("filters imported entities by targetLayer", () => {
    const rawDxf = exportDxf(sampleSketch());
    const wallShapes = importDxfToShapes(rawDxf, { targetLayer: "C-WALL-OUTL" });
    expect(wallShapes.length).toBeGreaterThan(0);

    const bogusShapes = importDxfToShapes(rawDxf, { targetLayer: "NON_EXISTENT_LAYER" });
    expect(bogusShapes.length).toBe(0);
  });

  it("converts imported DXF directly into a canonical ParametricSketch", () => {
    const rawDxf = exportDxf(sampleSketch());
    const sketch = importDxfToSketch(rawDxf);

    expect(sketch.sketchId).toBe("imported_dxf");
    expect(sketch.units.length).toBe("mm");
    expect(Object.keys(sketch.primitives.points).length).toBeGreaterThan(0);
    expect(Object.keys(sketch.primitives.lines).length).toBeGreaterThan(0);
    expect(Object.keys(sketch.primitives.circles).length).toBe(1);
    expect(Object.keys(sketch.primitives.arcs).length).toBe(1);

    // Circle properties
    const firstCircleKey = Object.keys(sketch.primitives.circles)[0];
    const circle = sketch.primitives.circles[firstCircleKey];
    expect(circle.radius).toBeCloseTo(150, 1);
    const centerPt = sketch.primitives.points[circle.centerPointId];
    expect(centerPt.x).toBeCloseTo(1000, 1);
    expect(centerPt.y).toBeCloseTo(750, 1);
  });

  it("performs end-to-end round-trip (Export -> Import) without geometric loss", () => {
    const original = sampleSketch();
    const exportedDxf = exportDxf(original);
    const reimported = importDxfToSketch(exportedDxf);

    // Verify all original lines exist within tolerance in reimported sketch
    for (const origLine of Object.values(original.primitives.lines)) {
      const p1 = original.primitives.points[origLine.startPointId];
      const p2 = original.primitives.points[origLine.endPointId];
      const origLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      // Find matching line in reimported
      const match = Object.values(reimported.primitives.lines).find((cand) => {
        const cp1 = reimported.primitives.points[cand.startPointId];
        const cp2 = reimported.primitives.points[cand.endPointId];
        const candLen = Math.hypot(cp2.x - cp1.x, cp2.y - cp1.y);
        return Math.abs(origLen - candLen) < DEFAULT_TOLERANCE_POLICY.geometry_mm;
      });

      expect(match).toBeDefined();
    }
  });
});
