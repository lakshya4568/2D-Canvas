import { describe, it, expect } from "vitest";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";
import {
  fitViewportToBounds,
  worldToScreenPoint,
  zoomAtPoint,
  MIN_ZOOM_SCALE,
  MAX_ZOOM_SCALE,
} from "../../lib/geometry/transform";
import { importDxfToShapes } from "../../lib/io/dxfImporter";
import { exportDxf } from "../../lib/io/dxfExporter";
import { LineShape, Shape } from "../../lib/geometry/types";
import { ParametricSketch } from "../../lib/parametric/schemaTypes";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

/**
 * Regression cover for importing a real AutoCAD drawing.
 *
 * A civil GAD is drafted in model-space millimetres, sits wherever the surveyor's
 * coordinate system put it — often hundreds of metres from the origin — and spans
 * far more than a screen. Every assertion here is about a drawing that was
 * imported successfully but could not be *seen*.
 */

/** A 460 m tall drawing sitting ~370 m from the origin, as a real L-section does. */
function farFieldDrawing(): Shape[] {
  const mk = (id: string, x1: number, y1: number, x2: number, y2: number): LineShape => ({
    id,
    type: "line",
    x1,
    y1,
    x2,
    y2,
  });
  return [
    mk("a", -121881, -462556, 112403, -462556),
    mk("b", 112403, -462556, 112403, -212),
    mk("c", 112403, -212, -121881, -212),
    mk("d", -121881, -212, -121881, -462556),
  ];
}

describe("§69 DXF import — the drawing must land in view", () => {
  it("frames far-from-origin geometry on load instead of leaving it off screen", () => {
    const sized = drawingReducer(initialDrawingState, {
      type: "SET_CANVAS_SIZE",
      width: 1000,
      height: 800,
    });
    const state = drawingReducer(sized, { type: "LOAD_SHAPES", shapes: farFieldDrawing() });

    // Every corner of the drawing must fall inside the canvas.
    const corners = [
      { x: -121881, y: -462556 },
      { x: 112403, y: -212 },
    ];
    for (const c of corners) {
      const p = worldToScreenPoint(c, state.viewport);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(800);
    }
  });

  it("ZOOM_EXTENTS reframes the drawing, rather than resetting to the origin at 1:1", () => {
    let state = drawingReducer(initialDrawingState, {
      type: "SET_CANVAS_SIZE",
      width: 1000,
      height: 800,
    });
    state = drawingReducer(state, { type: "LOAD_SHAPES", shapes: farFieldDrawing() });
    // Wander far away, as panning and zooming will.
    state = drawingReducer(state, {
      type: "SET_VIEWPORT",
      viewport: { x: 12345, y: -999, scale: 4 },
    });

    const framed = drawingReducer(state, { type: "ZOOM_EXTENTS" });
    expect(framed.viewport.scale).not.toBe(1);
    expect(framed.viewport.scale).toBeLessThan(0.05);

    const centre = worldToScreenPoint({ x: (-121881 + 112403) / 2, y: (-462556 - 212) / 2 }, framed.viewport);
    expect(centre.x).toBeCloseTo(500, 0);
    expect(centre.y).toBeCloseTo(400, 0);
  });

  it("ZOOM_EXTENTS on an empty drawing falls back to the origin view", () => {
    const state = drawingReducer(initialDrawingState, { type: "ZOOM_EXTENTS" });
    expect(state.viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("permits the sub-1% zoom a hundred-metre drawing needs", () => {
    // The previous floor of 0.05 made a 460 m drawing permanently unviewable.
    expect(MIN_ZOOM_SCALE).toBeLessThan(0.002);

    const zoomedOut = zoomAtPoint({ x: 0, y: 0, scale: 0.05 }, { x: 0, y: 0 }, 0.01);
    expect(zoomedOut.scale).toBeLessThan(0.05);

    const bounds = {
      minX: 0,
      minY: 0,
      maxX: 460000,
      maxY: 460000,
      width: 460000,
      height: 460000,
      centerX: 230000,
      centerY: 230000,
    };
    const vp = fitViewportToBounds(bounds, 800, 800);
    expect(vp.scale).toBeGreaterThan(0);
    expect(vp.scale).toBeLessThan(0.005);
  });

  it("fitViewportToBounds centres the extent and survives a degenerate axis", () => {
    const flat = {
      minX: 0,
      minY: 50,
      maxX: 1000,
      maxY: 50,
      width: 1000,
      height: 0,
      centerX: 500,
      centerY: 50,
    };
    const vp = fitViewportToBounds(flat, 600, 400);
    expect(Number.isFinite(vp.scale)).toBe(true);
    expect(vp.scale).toBeLessThanOrEqual(MAX_ZOOM_SCALE);
    const c = worldToScreenPoint({ x: 500, y: 50 }, vp);
    expect(c.x).toBeCloseTo(300, 5);
    expect(c.y).toBeCloseTo(200, 5);
  });
});

describe("§69 DXF import — block references and orientation", () => {
  /** Two nested blocks, placed with rotation, scale and a mirror. */
  const blockDxf = `0
SECTION
2
BLOCKS
0
BLOCK
2
INNER
10
0.0
20
0.0
0
LINE
8
0
10
0.0
20
0.0
11
100.0
21
0.0
0
ENDBLK
0
BLOCK
2
OUTER
10
0.0
20
0.0
0
INSERT
2
INNER
8
0
10
0.0
20
50.0
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
OUTER
8
0
10
1000.0
20
2000.0
0
ENDSEC
0
EOF
`;

  it("expands nested INSERT block references rather than dropping them", () => {
    const shapes = importDxfToShapes(blockDxf, { flipY: false });
    const lines = shapes.filter((s) => s.type === "line") as LineShape[];
    expect(lines.length).toBe(1);

    // INNER's line at (0,0)->(100,0), offset (0,50) by OUTER, placed at (1000,2000).
    const l = lines[0];
    expect(l.x1).toBeCloseTo(1000, 6);
    expect(l.y1).toBeCloseTo(2050, 6);
    expect(l.x2).toBeCloseTo(1100, 6);
    expect(l.y2).toBeCloseTo(2050, 6);
  });

  it("applies INSERT rotation and scale to block geometry", () => {
    // Same block rotated 90° and scaled 2x about the insertion point.
    const rotated = blockDxf.replace(
      `0
INSERT
2
OUTER
8
0
10
1000.0
20
2000.0`,
      `0
INSERT
2
OUTER
8
0
10
1000.0
20
2000.0
41
2.0
42
2.0
50
90.0`
    );
    const lines = importDxfToShapes(rotated, { flipY: false }).filter(
      (s) => s.type === "line"
    ) as LineShape[];
    expect(lines.length).toBe(1);

    // (0,50) scaled 2x -> (0,100), rotated 90° -> (-100, 0), + (1000,2000).
    expect(lines[0].x1).toBeCloseTo(900, 4);
    expect(lines[0].y1).toBeCloseTo(2000, 4);
    // (100,50) -> (200,100) -> rot90 -> (-100, 200) -> (900, 2200)
    expect(lines[0].x2).toBeCloseTo(900, 4);
    expect(lines[0].y2).toBeCloseTo(2200, 4);
  });

  it("negates Y by default, because DXF is Y-up and the canonical model is Y-down", () => {
    const shapes = importDxfToShapes(blockDxf);
    const l = shapes.find((s) => s.type === "line") as LineShape;
    expect(l.y1).toBeCloseTo(-2050, 6);
    expect(l.y2).toBeCloseTo(-2050, 6);
  });

  it("keeps export -> import an identity, so the flip cannot drift", () => {
    const sketch: ParametricSketch = {
      sketchId: "roundtrip",
      schemaVersion: "1.0",
      name: "Round trip",
      units: { length: "mm", angle: "rad" },
      tolerances: { ...DEFAULT_TOLERANCE_POLICY },
      parameters: {},
      formulas: [],
      primitives: {
        points: {
          a: { id: "a", x: 100, y: 250 },
          b: { id: "b", x: 900, y: 250 },
          c: { id: "c", x: 500, y: 700 },
        },
        lines: { l0: { id: "l0", startPointId: "a", endPointId: "b" } },
        circles: { ci0: { id: "ci0", centerPointId: "c", radius: 120 } },
        arcs: {},
        polylines: {},
      },
      topology: { halfEdges: {}, faces: {} },
      constraints: {},
    };

    const shapes = importDxfToShapes(exportDxf(sketch));
    const line = shapes.find((s) => s.type === "line") as LineShape;
    expect(line.y1).toBeCloseTo(250, 3);
    expect(line.y2).toBeCloseTo(250, 3);

    const circle = shapes.find((s) => s.type === "circle") as any;
    expect(circle.cx).toBeCloseTo(500, 3);
    expect(circle.cy).toBeCloseTo(700, 3);
  });
});
