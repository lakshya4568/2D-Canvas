import { describe, it, expect } from "vitest";
import { drawingReducer, initialDrawingState, mergeInferredFormulas } from "../../lib/state/drawingReducer";
import { synthesizeFormulasFromGeometry } from "../../lib/inference/formulaSynthesizer";
import { RectangleShape, Shape } from "../../lib/geometry/types";

describe("Formula Selection, Binding & Author Mode Sync Engine", () => {
  const outerRect: RectangleShape = {
    id: "rect_outer_1",
    name: "R1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 600,
    height: 300,
  };

  const innerRect: RectangleShape = {
    id: "rect_inner_2",
    name: "R2",
    type: "rectangle",
    x: 150,
    y: 140,
    width: 400,
    height: 220,
  };

  it("should initialize synthesized formulas with 'pending' status so they can be bound", () => {
    const formulas = synthesizeFormulasFromGeometry([outerRect, innerRect]);
    expect(formulas.length).toBeGreaterThanOrEqual(1);

    for (const f of formulas) {
      expect(f.status).toBe("pending");
    }
  });

  it("should bind an inferred formula to the model on ACCEPT_INFERRED_FORMULA and update shape geometry", () => {
    let state = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: [outerRect, innerRect],
    });

    expect(state.inferredFormulas.length).toBeGreaterThanOrEqual(2);
    const heightFormula = state.inferredFormulas.find((f) => f.displayTarget.includes("Height"));
    expect(heightFormula).toBeDefined();
    expect(heightFormula?.status).toBe("pending");

    // Accept and bind formula
    state = drawingReducer(state, {
      type: "ACCEPT_INFERRED_FORMULA",
      id: heightFormula!.id,
    });

    // Formula status updated to accepted
    const updatedHeightF = state.inferredFormulas.find((f) => f.id === heightFormula!.id);
    expect(updatedHeightF?.status).toBe("accepted");

    // Variable registered in state
    expect(state.variables[heightFormula!.targetProperty]).toBeDefined();
    expect(state.variables[heightFormula!.targetProperty]?.formula).toBe(heightFormula!.expression);
  });

  it("should dynamically alter shape dimensions when driving variables change in Author Mode", () => {
    let state = drawingReducer(initialDrawingState, {
      type: "SET_USER_MODE",
      mode: "author",
    });

    state = drawingReducer(state, {
      type: "LOAD_SHAPES",
      shapes: [outerRect, innerRect],
    });

    const heightFormula = state.inferredFormulas.find((f) => f.displayTarget.includes("Height"));
    expect(heightFormula).toBeDefined();

    // Bind height formula (e.g. R2_Height = R1_Height - 2 * SlabThickness or WallThickness)
    state = drawingReducer(state, {
      type: "ACCEPT_INFERRED_FORMULA",
      id: heightFormula!.id,
    });

    // Find the thickness variable name used in formula
    const thicknessVarName = heightFormula?.variables.find(
      (v) => v.name.includes("Thickness") || v.name === "T"
    )?.name;
    expect(thicknessVarName).toBeDefined();

    // Author changes thickness to 60 in Author Mode
    state = drawingReducer(state, {
      type: "SET_VARIABLE",
      name: thicknessVarName!,
      valueOrFormula: 60,
    });

    // Verify the inner rectangle height updated to 300 - 2 * 60 = 180
    const innerShape = state.shapes.find((s) => s.id === innerRect.id) as RectangleShape;
    expect(innerShape).toBeDefined();
    expect(innerShape.height).toBe(180);
  });

  it("should unbind an accepted formula on UNBIND_INFERRED_FORMULA and reset status to pending", () => {
    let state = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: [outerRect, innerRect],
    });

    const formula = state.inferredFormulas[0];

    // Accept formula
    state = drawingReducer(state, {
      type: "ACCEPT_INFERRED_FORMULA",
      id: formula.id,
    });
    expect(state.variables[formula.targetProperty]).toBeDefined();
    expect(state.inferredFormulas.find((f) => f.id === formula.id)?.status).toBe("accepted");

    // Unbind formula
    state = drawingReducer(state, {
      type: "UNBIND_INFERRED_FORMULA",
      id: formula.id,
    });

    expect(state.variables[formula.targetProperty]).toBeUndefined();
    expect(state.inferredFormulas.find((f) => f.id === formula.id)?.status).toBe("pending");
  });

  it("should allow editing a formula expression on UPDATE_INFERRED_FORMULA in Author Mode", () => {
    let state = drawingReducer(initialDrawingState, {
      type: "SET_USER_MODE",
      mode: "author",
    });

    state = drawingReducer(state, {
      type: "LOAD_SHAPES",
      shapes: [outerRect, innerRect],
    });

    const heightFormula = state.inferredFormulas.find((f) => f.displayTarget.includes("Height"))!;

    // Accept formula
    state = drawingReducer(state, {
      type: "ACCEPT_INFERRED_FORMULA",
      id: heightFormula.id,
    });

    // Author edits formula expression
    state = drawingReducer(state, {
      type: "UPDATE_INFERRED_FORMULA",
      id: heightFormula.id,
      expression: "R1_Height - 50",
    });

    const updatedFormula = state.inferredFormulas.find((f) => f.id === heightFormula.id);
    expect(updatedFormula?.expression).toBe("R1_Height - 50");

    // Inner rectangle height updates to 300 - 50 = 250
    const innerShape = state.shapes.find((s) => s.id === innerRect.id) as RectangleShape;
    expect(innerShape.height).toBe(250);
  });

  it("should preserve accepted formula status across incremental drawing updates via mergeInferredFormulas", () => {
    const formulas = synthesizeFormulasFromGeometry([outerRect, innerRect]);
    const acceptedFormula = { ...formulas[0], status: "accepted" as const };

    const newFormulas = synthesizeFormulasFromGeometry([outerRect, innerRect]);
    const merged = mergeInferredFormulas([acceptedFormula], newFormulas, {
      [acceptedFormula.targetProperty]: {
        name: acceptedFormula.targetProperty,
        value: acceptedFormula.evaluatedValue,
        formula: acceptedFormula.expression,
      },
    });

    const found = merged.find((f) => f.id === acceptedFormula.id);
    expect(found?.status).toBe("accepted");
  });
});
