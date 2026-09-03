import { describe, it, expect } from "vitest";
import { synthesizeFormulasFromGeometry } from "../../lib/inference/formulaSynthesizer";
import { Shape, RectangleShape, CircleShape } from "../../lib/geometry/types";

describe("Autonomous Formula & Variable Synthesizer", () => {
  it("should synthesize WallThickness and inset formulas with high confidence for uniform clearances", () => {
    const outerRect: RectangleShape = {
      id: "outer_box",
      name: "Outer Box",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 500,
      height: 300,
    };

    const innerRect: RectangleShape = {
      id: "inner_cavity",
      name: "Inner Cavity",
      type: "rectangle",
      x: 140,
      y: 140,
      width: 420,
      height: 220,
    };

    // Uniform 40px clearance on all 4 sides:
    // Left: 140 - 100 = 40
    // Right: (100 + 500) - (140 + 420) = 600 - 560 = 40
    // Top: 140 - 100 = 40
    // Bottom: (100 + 300) - (140 + 220) = 400 - 360 = 40

    const shapes: Shape[] = [outerRect, innerRect];
    const formulas = synthesizeFormulasFromGeometry(shapes);

    expect(formulas.length).toBeGreaterThanOrEqual(2);

    const widthFormula = formulas.find((f) => f.targetProperty === "inner_cavity.width");
    expect(widthFormula).toBeDefined();
    expect(widthFormula?.expression).toBe("outer_box.width - 2 * T");
    expect(widthFormula?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(widthFormula?.provenance).toBe("inferred");
    expect(widthFormula?.reason).toContain("Uniform 40px clearance");

    const tVar = widthFormula?.variables.find((v) => v.name === "T");
    expect(tVar?.value).toBe(40);
    expect(tVar?.role).toBe("Wall Thickness");

    const heightFormula = formulas.find((f) => f.targetProperty === "inner_cavity.height");
    expect(heightFormula).toBeDefined();
    expect(heightFormula?.expression).toBe("outer_box.height - 2 * T");
  });

  it("should synthesize centering formulas for circular duct inside cavity", () => {
    const cavity: RectangleShape = {
      id: "bay_cavity",
      name: "Bay Cavity",
      type: "rectangle",
      x: 200,
      y: 100,
      width: 400,
      height: 250,
    };

    const circularDuct: CircleShape = {
      id: "tendon_duct",
      name: "Tendon Duct",
      type: "circle",
      cx: 400, // 200 + 400 / 2 = centered
      cy: 225,
      r: 45,
    };

    const shapes: Shape[] = [cavity, circularDuct];
    const formulas = synthesizeFormulasFromGeometry(shapes);

    const ductCenter = formulas.find((f) => f.targetProperty === "tendon_duct.cx");
    expect(ductCenter).toBeDefined();
    expect(ductCenter?.expression).toBe("bay_cavity.x + bay_cavity.width / 2");
    expect(ductCenter?.confidence).toBeGreaterThanOrEqual(0.95);
  });
});
