import { describe, it, expect } from "vitest";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";
import { synthesizeFormulasFromGeometry } from "../../lib/inference/formulaSynthesizer";
import { RectangleShape, CircleShape } from "../../lib/geometry/types";

describe("Atomic AutoFormula Synthesis & Chain-Rule Engine", () => {
  it("should automatically generate atomic formulas when shapes are committed on canvas", () => {
    // 1. User draws outer rectangle
    let state = drawingReducer(initialDrawingState, {
      type: "COMMIT_DRAFT",
    });
    // simulate shape 1 in state
    const outerRect: RectangleShape = {
      id: "outer_1",
      name: "OuterBox",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 600,
      height: 400,
    };

    // 2. User draws inner rectangle with 40px uniform wall
    const innerRect: RectangleShape = {
      id: "inner_1",
      name: "InnerCavity",
      type: "rectangle",
      x: 140,
      y: 140,
      width: 520,
      height: 320,
    };

    state = drawingReducer(state, {
      type: "LOAD_SHAPES",
      shapes: [outerRect, innerRect],
    });

    // Verify inferred formulas are generated immediately
    expect(state.inferredFormulas.length).toBeGreaterThanOrEqual(2);

    const widthF = state.inferredFormulas.find((f) => f.displayTarget.includes("Width"));
    const heightF = state.inferredFormulas.find((f) => f.displayTarget.includes("Height"));

    expect(widthF).toBeDefined();
    expect(widthF?.expression).toBe("OuterBox_Width - 2 * WallThickness");
    expect(widthF?.targetProperty).toBe("InnerCavity_Width");
    expect(widthF?.evaluatedValue).toBe(520);

    expect(heightF).toBeDefined();
    expect(heightF?.expression).toBe("OuterBox_Height - 2 * WallThickness");
    expect(heightF?.targetProperty).toBe("InnerCavity_Height");
    expect(heightF?.evaluatedValue).toBe(320);

    // 3. Draftsman clicks [+ Store in Variable & Chain]
    state = drawingReducer(state, {
      type: "ACCEPT_INFERRED_FORMULA",
      id: widthF!.id,
    });

    // Check that atomic variables are registered cleanly
    expect(state.parametricErrors).toHaveLength(0);
    expect(state.variables["OuterBox_Width"]?.value).toBe(600);
    expect(state.variables["WallThickness"]?.value).toBe(40);
    expect(state.variables["InnerCavity_Width"]?.value).toBe(520);

    // 4. Test Chain Rule: Use the stored atomic variable in a composite formula!
    // e.g. User sets TotalSpan = InnerCavity_Width + 2 * WallThickness
    state = drawingReducer(state, {
      type: "SET_VARIABLE",
      name: "TotalSpan",
      valueOrFormula: "InnerCavity_Width + 2 * WallThickness",
      description: "Chained composite span formula",
    });

    expect(state.parametricErrors).toHaveLength(0);
    expect(state.variables["TotalSpan"]?.value).toBe(600);
  });

  it("should infer atomic formulas for concentric circles (pipes/shafts)", () => {
    const c1: CircleShape = {
      id: "c_outer",
      name: "OuterTunnel",
      type: "circle",
      cx: 300,
      cy: 300,
      r: 100,
    };

    const c2: CircleShape = {
      id: "c_inner",
      name: "InnerLining",
      type: "circle",
      cx: 300,
      cy: 300,
      r: 80,
    };

    const formulas = synthesizeFormulasFromGeometry([c1, c2]);
    const radialF = formulas.find((f) => f.displayTarget.includes("Radius"));

    expect(radialF).toBeDefined();
    expect(radialF?.expression).toBe("OuterTunnel_Radius - WallThickness");
    expect(radialF?.targetProperty).toBe("InnerLining_Radius");
    expect(radialF?.evaluatedValue).toBe(80);
    expect(radialF?.variables.find((v) => v.name === "WallThickness")?.value).toBe(20);
  });

  it("should infer atomic formulas and avoid false boundary overage for user drawing scenario (media_1788437965022.png)", () => {
    // R1: 600x250, R2: 230x170 at x=260, y=230 inside R1 at x=220, y=190
    // tL = 40, tT = 40, tB = 40, tR = 330
    const r1: RectangleShape = {
      id: "rect_1",
      name: "R1",
      type: "rectangle",
      x: 220,
      y: 190,
      width: 600,
      height: 250,
    };

    const r2: RectangleShape = {
      id: "rect_2",
      name: "R2",
      type: "rectangle",
      x: 260,
      y: 230,
      width: 230,
      height: 170,
    };

    const state = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: [r1, r2],
    });

    // 1. Must infer atomic formulas for R2
    expect(state.inferredFormulas.length).toBeGreaterThanOrEqual(3);

    const heightF = state.inferredFormulas.find((f) => f.displayTarget.includes("Height"));
    expect(heightF).toBeDefined();
    expect(heightF?.expression).toBe("R1_Height - 2 * SlabThickness");
    expect(heightF?.evaluatedValue).toBe(170);

    const posYF = state.inferredFormulas.find((f) => f.displayTarget.includes("Y Position"));
    expect(posYF).toBeDefined();
    expect(posYF?.expression).toBe("R1_Y + SlabThickness");
    expect(posYF?.evaluatedValue).toBe(230);

    const posXF = state.inferredFormulas.find((f) => f.displayTarget.includes("X Position"));
    expect(posXF).toBeDefined();
    expect(posXF?.expression).toBe("R1_X + LeftOffset");
    expect(posXF?.evaluatedValue).toBe(260);

    // 2. Outer container R1 MUST NOT have false boundary overage against R2
    const r1Evaluation = state.boundaryEvaluations.find((b) => b.shapeId === "rect_1");
    expect(r1Evaluation).toBeUndefined(); // R1 is the outer boundary, not the inner shape!
  });
});
