import { describe, it, expect } from "vitest";
import { ParametricModel } from "../lib/parametric/model";
import { drawingReducer, initialDrawingState } from "../lib/state/drawingReducer";
import { Shape } from "../lib/geometry/types";
import { detectChamferSegments, getChamferReferenceSnap } from "../lib/geometry/chamferReference";
import { applySnapping } from "../lib/geometry/snapping";

describe("Default Variable Naming (L1, L2, R1, C1)", () => {
  it("generates L1, L2 for lines and R1 for rectangles", () => {
    const line1: Shape = { id: "1", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 };
    const line2: Shape = { id: "2", type: "line", x1: 100, y1: 0, x2: 100, y2: 50 };
    const rect: Shape = { id: "3", type: "rectangle", x: 0, y: 0, width: 200, height: 100 };
    const circ: Shape = { id: "4", type: "circle", cx: 50, cy: 50, r: 25 };

    expect(ParametricModel.getShapeName(line1, 0)).toBe("L1");
    expect(ParametricModel.getShapeName(line2, 1)).toBe("L2");
    expect(ParametricModel.getShapeName(rect, 2)).toBe("R3");
    expect(ParametricModel.getShapeName(circ, 3)).toBe("C4");
  });

  it("automatically registers default variable in state.variables when committing a line draft", () => {
    let state = initialDrawingState;

    // Start draft line
    state = drawingReducer(state, {
      type: "START_DRAFT",
      shape: {
        id: "test_line_1",
        type: "line",
        x1: 100,
        y1: 100,
        x2: 400,
        y2: 100,
      },
    });

    // Commit draft
    state = drawingReducer(state, { type: "COMMIT_DRAFT" });

    // Committed shape must have default name L1
    expect(state.shapes.length).toBe(1);
    expect(state.shapes[0].name).toBe("L1");

    // Drawing a line does NOT invent a parameter for it. It used to register
    // `L1 = 300` automatically, which is where the unexplained entries in the
    // parameter list came from. A parameter now exists only because someone
    // decided it should, in the authoring workflow.

    // Commit second draft line
    state = drawingReducer(state, {
      type: "START_DRAFT",
      shape: {
        id: "test_line_2",
        type: "line",
        x1: 400,
        y1: 100,
        x2: 400,
        y2: 250,
      },
    });
    state = drawingReducer(state, { type: "COMMIT_DRAFT" });

    expect(state.shapes.length).toBe(2);
    expect(state.shapes[1].name).toBe("L2");
  });
});

describe("Chamfer Extension & Reference Snapping", () => {
  const trChamfer: Shape = {
    id: "chamfer_1",
    name: "edge_tr",
    type: "line",
    x1: 300,
    y1: 100,
    x2: 327,
    y2: 127,
    strokeColor: "#ffffff",
  };

  it("detects diagonal 45° segments as chamfers", () => {
    const chamfers = detectChamferSegments([trChamfer]);
    expect(chamfers.length).toBe(1);
    expect(chamfers[0].shapeId).toBe("chamfer_1");
    expect(Math.round(chamfers[0].length)).toBe(38);
    expect(Math.round(chamfers[0].dx)).toBe(27);
    expect(Math.round(chamfers[0].dy)).toBe(27);
  });

  it("projects a reference point that touches previous chamfer when drafting another chamfer", () => {
    // Suppose we are at startPoint (327, 200) and drawing a bottom-right chamfer towards (300, 227)
    const snap = getChamferReferenceSnap({
      shapes: [trChamfer],
      startPoint: { x: 327, y: 200 },
      rawPoint: { x: 302, y: 225 }, // cursor near symmetric target (300, 227)
      worldThreshold: 15,
    });

    expect(snap).not.toBeNull();
    expect(snap?.snapped).toBe(true);
    expect(snap?.category).toBe("chamfer_ref");

    // Reference point target must be at x = 327 - 27 = 300, y = 200 + 27 = 227
    expect(Math.round(snap!.targetPoint!.x)).toBe(300);
    expect(Math.round(snap!.targetPoint!.y)).toBe(227);

    // Must have a touching guide line directly from the previous chamfer!
    expect(snap?.guideLines).toBeDefined();
    expect(snap!.guideLines!.length).toBeGreaterThan(0);
    expect(snap!.sourcePoint).toBeDefined();

    // Touch point must be one of the previous chamfer's endpoints (300, 100) or (327, 127)
    const touch = snap!.sourcePoint!;
    const touchesChamfer =
      (touch.x === 300 && touch.y === 100) || (touch.x === 327 && touch.y === 127);
    expect(touchesChamfer).toBe(true);

    // Label should indicate it can be extended till this point
    expect(snap!.snapLabel).toContain("CHAMFER REF: EXTEND TO THIS");
  });

  it("integrates seamlessly into applySnapping with magnetic snap", () => {
    const res = applySnapping(
      { x: 303, y: 226 }, // near (300, 227)
      {
        shapes: [trChamfer],
        startPoint: { x: 327, y: 200 },
        gridSnapEnabled: false,
        objectSnapEnabled: true,
        vertexThresholdPx: 20,
        zoomScale: 1,
      }
    );

    expect(res.snapped).toBe(true);
    expect(res.category).toBe("chamfer_ref");
    expect(Math.round(res.point.x)).toBe(300);
    expect(Math.round(res.point.y)).toBe(227);
  });
});
