import { describe, it, expect } from "vitest";
import { synthesizeFormulasFromGeometry } from "../../lib/inference/formulaSynthesizer";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";
import { Shape, RectangleShape } from "../../lib/geometry/types";

describe("Meaningful Variable & Formula Naming System", () => {
  it("should synthesize clean, meaningful CAD variable names without raw shape IDs", () => {
    const outerRect: RectangleShape = {
      id: "shape_ih2zdvq_1788434637593",
      name: "Outer Box",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 500,
      height: 300,
    };

    const innerRect: RectangleShape = {
      id: "shape_llhv6ky_1788434640294",
      name: "Inner Cavity",
      type: "rectangle",
      x: 140,
      y: 140,
      width: 420,
      height: 220,
    };

    const shapes: Shape[] = [outerRect, innerRect];
    const formulas = synthesizeFormulasFromGeometry(shapes);

    expect(formulas.length).toBeGreaterThanOrEqual(2);

    const widthFormula = formulas.find((f) => f.displayTarget.includes("Width"));
    expect(widthFormula).toBeDefined();

    // Verify formula does NOT contain raw cryptic IDs
    expect(widthFormula?.expression).not.toContain("shape_ih2zdvq");
    expect(widthFormula?.expression).not.toContain("shape_llhv6ky");

    // Verify expression uses clean CAD variables
    expect(widthFormula?.expression).toBe("Outer_Box_Width - 2 * WallThickness");
    expect(widthFormula?.targetProperty).toBe("Inner_Cavity_Width");

    // Verify all variables are declared with numeric values
    const outerW = widthFormula?.variables.find((v) => v.name === "Outer_Box_Width");
    expect(outerW?.value).toBe(500);

    const wallT = widthFormula?.variables.find((v) => v.name === "WallThickness");
    expect(wallT?.value).toBe(40);
  });

  it("should accept inferred formula without any undefined variable diagnostics errors", () => {
    const outerRect: RectangleShape = {
      id: "shape_ih2zdvq_1788434637593",
      name: "Outer Box",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 500,
      height: 300,
    };

    const innerRect: RectangleShape = {
      id: "shape_llhv6ky_1788434640294",
      name: "Inner Cavity",
      type: "rectangle",
      x: 140,
      y: 140,
      width: 420,
      height: 220,
    };

    let state = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: [outerRect, innerRect],
    });

    expect(state.inferredFormulas.length).toBeGreaterThanOrEqual(1);
    const formulaId = state.inferredFormulas[0].id;

    // Accept formula
    state = drawingReducer(state, {
      type: "ACCEPT_INFERRED_FORMULA",
      id: formulaId,
    });

    // Verify ZERO parametric errors (no undefined variable error!)
    expect(state.parametricErrors).toHaveLength(0);

    // Verify variables registered cleanly
    expect(state.variables["Outer_Box_Width"]).toBeDefined();
    expect(state.variables["Outer_Box_Width"].value).toBe(500);
    expect(state.variables["WallThickness"]).toBeDefined();
    expect(state.variables["WallThickness"].value).toBe(40);
    expect(state.variables["Inner_Cavity_Width"]).toBeDefined();
    expect(state.variables["Inner_Cavity_Width"].value).toBe(420);
    expect(state.variables["Inner_Cavity_Width"].formula).toBe("Outer_Box_Width - 2 * WallThickness");
  });
});
