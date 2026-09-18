import { describe, it, expect } from "bun:test";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { verifyProposedFormula } from "@/lib/upce/formulaCheck";
import { evaluateParameters, makeProvenance } from "@/lib/upce/parameters";
import type { AuthoringSketch, SketchParameter } from "@/lib/upce/types";

function createEmptySketch(name: string): AuthoringSketch {
  return {
    points: {},
    pointOrder: [],
    pointAliases: {},
    segments: {},
    circles: {},
    constraints: [],
    parameters: {},
    components: [],
    repeats: [],
    carrierShapeIds: [],
    units: "mm",
    meta: { name, freedomIsIntentional: false, version: 0 },
  };
}

describe("Formulas Tab & Cross-Persona Storage (Agent Mode & Author Mode)", () => {
  it("records formulas created by CAD Agent with origin 'completion-assistant'", () => {
    const ws = new DraftingWorkspace();
    // Draw outer box and inner opening
    ws.drawRectangle("Outer", 0, 0, 11400, 4100);
    ws.drawRectangle("Inner", 350, 350, 10700, 3400);

    // Add ClearSpan and WallThickness dimensions
    ws.dimension({
      name: "ClearSpan",
      what: "horizontal",
      a: "Inner.bottom_left",
      b: "Inner.bottom_right",
      value: 10700,
      resize: false,
      reference: true,
    });
    ws.dimension({
      name: "WallThickness",
      what: "horizontal",
      a: "Outer.bottom_left",
      b: "Inner.bottom_left",
      value: 350,
      resize: false,
      reference: true,
    });

    // CAD Agent defines formula for TopWidth
    const result = ws.formula("TopWidth", "ClearSpan + 2 * WallThickness", "Total top width");
    expect(result).toContain("TopWidth");

    const param = ws.sketch.parameters["TopWidth"];
    expect(param).toBeDefined();
    expect(param.role).toBe("DERIVED");
    expect(param.expr).toBe("ClearSpan + 2 * WallThickness");
    expect(param.value).toBe(11400);
    expect(param.dependencies).toContain("ClearSpan");
    expect(param.dependencies).toContain("WallThickness");
    expect(param.provenance.origin).toBe("completion-assistant");
  });

  it("records formulas created in Author mode with user provenance", () => {
    let sketch = createEmptySketch("Authoring Test");
    sketch.parameters["Span"] = {
      name: "Span",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: 4000,
      provenance: makeProvenance("user", "Span dimension"),
      boundConstraints: [],
      published: true,
    };
    sketch.parameters["Wall"] = {
      name: "Wall",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: 300,
      provenance: makeProvenance("user", "Wall dimension"),
      boundConstraints: [],
      published: true,
    };

    // Author creates derived formula for TotalWidth
    sketch.parameters["TotalWidth"] = {
      name: "TotalWidth",
      role: "DERIVED",
      type: "LENGTH",
      unit: "mm",
      value: 4600,
      expr: "Span + 2 * Wall",
      dependencies: ["Span", "Wall"],
      provenance: makeProvenance("user", "TotalWidth = Span + 2 * Wall"),
      boundConstraints: [],
      published: false,
    };

    const evalResult = evaluateParameters(sketch.parameters);
    expect(evalResult.errors).toHaveLength(0);
    expect(evalResult.values["TotalWidth"]).toBe(4600);

    const derived = sketch.parameters["TotalWidth"];
    expect(derived).toBeDefined();
    expect(derived.role).toBe("DERIVED");
    expect(derived.expr).toBe("Span + 2 * Wall");
    expect(derived.provenance.origin).toBe("user");
  });

  it("validates formula syntax and detects circular dependencies via verifyProposedFormula", () => {
    let sketch = createEmptySketch("Validation Test");
    sketch.parameters["A"] = {
      name: "A",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: 100,
      provenance: makeProvenance("user", "A"),
      boundConstraints: [],
      published: true,
    };
    sketch.parameters["B"] = {
      name: "B",
      role: "DERIVED",
      type: "LENGTH",
      unit: "mm",
      value: 200,
      expr: "A * 2",
      dependencies: ["A"],
      provenance: makeProvenance("user", "B"),
      boundConstraints: [],
      published: false,
    };
    sketch.parameters["C"] = {
      name: "C",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: 300,
      provenance: makeProvenance("user", "C"),
      boundConstraints: [],
      published: false,
    };

    // Valid formula
    const valid = verifyProposedFormula(sketch, "C", "A + B", { shapes: [], shapeNames: {} });
    expect(valid.ok).toBe(true);
    expect(valid.predicted).toBe(300);
    expect(valid.dependencies).toEqual(["A", "B"]);

    // Circular dependency: A depends on B which depends on A
    const circular = verifyProposedFormula(sketch, "A", "B + 50", { shapes: [], shapeNames: {} });
    expect(circular.ok).toBe(false);
    expect(circular.reason).toMatch(/depend on itself|cycle/i);
  });

  it("preserves formulas across workspace adoption from Agent to Authoring kernel", () => {
    const ws = new DraftingWorkspace();
    ws.drawRectangle("Box", 0, 0, 5000, 3000);
    ws.dimension({ name: "Width", what: "length", a: "Box.top", value: 5000, resize: false, reference: true });
    ws.dimension({ name: "Height", what: "length", a: "Box.left", value: 3000, resize: false, reference: true });
    ws.formula("HalfWidth", "Width / 2");

    // Check that ws.sketch contains the formula
    const formulas = Object.values(ws.sketch.parameters).filter((p) => p.role === "DERIVED");
    expect(formulas.length).toBeGreaterThanOrEqual(1);

    const half = ws.sketch.parameters["HalfWidth"];
    expect(half.value).toBe(2500);
    expect(half.expr).toBe("Width / 2");
    expect(half.provenance.origin).toBe("completion-assistant");
  });
});
