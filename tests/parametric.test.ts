import { describe, it, expect } from "vitest";
import { parseFormula, evaluateFormula, tokenize } from "../lib/parametric/expression";
import { DependencyGraph } from "../lib/parametric/dependencyGraph";
import { solveConstraints, GeometricConstraint } from "../lib/parametric/constraints";
import { ParametricModel } from "../lib/parametric/model";
import { BUILTIN_TEMPLATES } from "../lib/parametric/templates";
import { RectangleShape, LineShape, CircleShape } from "../lib/geometry/types";

describe("Parametric Expression Engine", () => {
  it("tokenizes basic arithmetic and identifiers", () => {
    const tokens = tokenize("W * 2 + sqrt(16) / (H - 5)");
    expect(tokens.map((t) => t.type)).toEqual([
      "IDENTIFIER",
      "STAR",
      "NUMBER",
      "PLUS",
      "IDENTIFIER",
      "LPAREN",
      "NUMBER",
      "RPAREN",
      "SLASH",
      "LPAREN",
      "IDENTIFIER",
      "MINUS",
      "NUMBER",
      "RPAREN",
      "EOF",
    ]);
  });

  it("evaluates arithmetic expressions with precedence", () => {
    const res = evaluateFormula("10 + 20 * 3", {});
    expect(res.value).toBe(70);
    expect(res.error).toBeUndefined();
  });

  it("evaluates formulas referencing variables", () => {
    const symbols = { W: 200, H: 100, x1: 20 };
    const res = evaluateFormula("W * 0.8 + H / 2 - x1", symbols);
    // 200 * 0.8 = 160; 100 / 2 = 50; 160 + 50 - 20 = 190
    expect(res.value).toBe(190);
  });

  it("evaluates mathematical functions (sqrt, sin, cos, hypot)", () => {
    const resSqrt = evaluateFormula("sqrt(144)", {});
    expect(resSqrt.value).toBe(12);

    const resHypot = evaluateFormula("hypot(3, 4)", {});
    expect(resHypot.value).toBe(5);

    const resSin = evaluateFormula("round(sin(90))", {});
    expect(resSin.value).toBe(1);

    const resCos = evaluateFormula("round(cos(0))", {});
    expect(resCos.value).toBe(1);
  });

  it("reports division by zero gracefully without throwing", () => {
    const res = evaluateFormula("100 / 0", {});
    expect(res.error).toBe("Division by zero");
  });

  it("reports undefined variables clearly", () => {
    const res = evaluateFormula("Width + UnknownVar", { Width: 50 });
    expect(res.error).toContain("Undefined variable 'UnknownVar'");
  });

  it("extracts variable dependencies correctly", () => {
    const parsed = parseFormula("InnerWidth = OuterWidth * 0.8 + Spacing");
    expect(parsed.dependencies).toContain("OuterWidth");
    expect(parsed.dependencies).toContain("Spacing");
  });
});

describe("Dependency Graph Engine", () => {
  it("sorts dependencies in correct topological order", () => {
    const graph = new DependencyGraph();
    // A has no deps
    graph.setDependencies("A", []);
    // B depends on A
    graph.setDependencies("B", ["A"]);
    // C depends on B
    graph.setDependencies("C", ["B"]);

    const res = graph.getEvaluationOrder();
    expect(res.error).toBeUndefined();
    expect(res.order).toEqual(["A", "B", "C"]);
  });

  it("detects circular dependencies and reports cycle path", () => {
    const graph = new DependencyGraph();
    graph.setDependencies("A", ["B"]);
    graph.setDependencies("B", ["A"]);

    const cycle = graph.detectCycles();
    expect(cycle.hasCycle).toBe(true);
    expect(cycle.message).toContain("Circular dependency detected");
  });

  it("computes downstream dirty propagation order", () => {
    const graph = new DependencyGraph();
    graph.setDependencies("W", []);
    graph.setDependencies("H", ["W"]);
    graph.setDependencies("InnerW", ["W"]);
    graph.setDependencies("InnerH", ["H"]);

    const downstream = graph.getDownstreamOrder(["W"]);
    expect(downstream.order).toContain("H");
    expect(downstream.order).toContain("InnerW");
    expect(downstream.order).toContain("InnerH");
    // H must come before InnerH
    expect(downstream.order.indexOf("H")).toBeLessThan(downstream.order.indexOf("InnerH"));
  });
});

describe("Geometric Constraint Solver", () => {
  it("solves horizontal line constraint", () => {
    const line: LineShape = {
      id: "line1",
      type: "line",
      x1: 50,
      y1: 100,
      x2: 250,
      y2: 180,
    };

    const constraint: GeometricConstraint = {
      id: "c_h1",
      type: "horizontal",
      shapeIds: ["line1"],
      enabled: true,
    };

    const res = solveConstraints([line], [constraint]);
    expect(res.converged).toBe(true);
    const updatedLine = res.updatedShapes[0] as LineShape;
    expect(updatedLine.y1).toBe(updatedLine.y2);
  });

  it("solves vertical line constraint", () => {
    const line: LineShape = {
      id: "line2",
      type: "line",
      x1: 100,
      y1: 50,
      x2: 180,
      y2: 250,
    };

    const constraint: GeometricConstraint = {
      id: "c_v1",
      type: "vertical",
      shapeIds: ["line2"],
      enabled: true,
    };

    const res = solveConstraints([line], [constraint]);
    expect(res.converged).toBe(true);
    const updatedLine = res.updatedShapes[0] as LineShape;
    expect(updatedLine.x1).toBe(updatedLine.x2);
  });

  it("solves parallel constraint between two lines", () => {
    const l1: LineShape = { id: "l1", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 };
    const l2: LineShape = { id: "l2", type: "line", x1: 0, y1: 50, x2: 50, y2: 100 };

    const constraint: GeometricConstraint = {
      id: "c_par",
      type: "parallel",
      shapeIds: ["l1", "l2"],
      enabled: true,
    };

    const res = solveConstraints([l1, l2], [constraint]);
    expect(res.converged).toBe(true);
    const updatedL2 = res.updatedShapes[1] as LineShape;
    // l1 is horizontal (dy = 0), so l2 must now also be horizontal (dy = 0)
    expect(Math.abs(updatedL2.y2 - updatedL2.y1)).toBeLessThan(1e-3);
  });

  it("solves concentric constraint between two circles", () => {
    const c1: CircleShape = { id: "c1", type: "circle", cx: 100, cy: 100, r: 50 };
    const c2: CircleShape = { id: "c2", type: "circle", cx: 150, cy: 120, r: 25 };

    const constraint: GeometricConstraint = {
      id: "c_con",
      type: "concentric",
      shapeIds: ["c1", "c2"],
      enabled: true,
    };

    const res = solveConstraints([c1, c2], [constraint]);
    expect(res.converged).toBe(true);
    const [uc1, uc2] = res.updatedShapes as CircleShape[];
    expect(uc1.cx).toBe(uc2.cx);
    expect(uc1.cy).toBe(uc2.cy);
  });

  it("detects conflicting constraints (horizontal and vertical on same line)", () => {
    const line: LineShape = { id: "l3", type: "line", x1: 0, y1: 0, x2: 100, y2: 100 };
    const c1: GeometricConstraint = { id: "c1", type: "horizontal", shapeIds: ["l3"], enabled: true };
    const c2: GeometricConstraint = { id: "c2", type: "vertical", shapeIds: ["l3"], enabled: true };

    const res = solveConstraints([line], [c1, c2]);
    expect(res.status).toBe("over_constrained");
    expect(res.diagnostics.some((d) => d.conflictsWith && d.conflictsWith.length > 0)).toBe(true);
  });
});

describe("Parametric Model Bidirectional Sync", () => {
  it("propagates parameter updates to rectangles: W = 400 -> H = W", () => {
    const rect: RectangleShape = {
      id: "rect1",
      name: "Rectangle_1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    };

    const model = new ParametricModel();
    model.setVariable("W", 400);
    model.setVariable("H", "W"); // Height = Width

    const { updatedShapes } = model.syncModel([rect]);
    const updatedRect = updatedShapes[0] as RectangleShape;

    expect(updatedRect.width).toBe(400);
    expect(updatedRect.height).toBe(400);
  });

  it("synchronizes outer and inner rectangles: InnerW = W * 0.8, InnerH = H * 0.5", () => {
    const outer: RectangleShape = { id: "outer", name: "Outer", type: "rectangle", x: 50, y: 50, width: 300, height: 200 };

    const model = new ParametricModel();
    model.setVariable("Width", 500);
    model.setVariable("Height", "Width * 0.6"); // 300
    model.setVariable("InnerWidth", "Width * 0.8"); // 400
    model.setVariable("InnerHeight", "Height * 0.5"); // 150

    const { errors } = model.evaluateAllVariables([outer]);
    expect(errors).toHaveLength(0);

    expect(model.variables.get("Height")?.value).toBe(300);
    expect(model.variables.get("InnerWidth")?.value).toBe(400);
    expect(model.variables.get("InnerHeight")?.value).toBe(150);
  });
});

describe("Parametric Template System", () => {
  it("instantiates the Parametric Frame Cutout template with parameter overrides", () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "parametric_frame_cutout")!;
    expect(template).toBeDefined();

    const instance = template.generator({ Width: 500, Height: 300, WallThickness: 40 });
    expect(instance.shapes).toHaveLength(2);

    const outer = instance.shapes[0] as RectangleShape;
    const inner = instance.shapes[1] as RectangleShape;

    expect(outer.width).toBe(500);
    expect(outer.height).toBe(300);
    // Inner cutout width: 500 - 40 * 2 = 420
    expect(inner.width).toBe(420);
    // Inner cutout height: 300 - 40 * 2 = 220
    expect(inner.height).toBe(220);

    // Verify that syncModel preserves the nested inner cutout dimensions and positions
    const model = new ParametricModel();
    for (const [k, v] of Object.entries(instance.variables)) {
      model.setVariable(k, v.formula ?? v.value);
    }
    const synced = model.syncModel(instance.shapes);
    const syncedOuter = synced.updatedShapes[0] as RectangleShape;
    const syncedInner = synced.updatedShapes[1] as RectangleShape;
    expect(syncedOuter.width).toBe(500);
    expect(syncedOuter.height).toBe(300);
    expect(syncedInner.width).toBe(420);
    expect(syncedInner.height).toBe(220);
    expect(syncedInner.x).toBe(140); // 100 + 40
    expect(syncedInner.y).toBe(140);
    // Strictly nested inside outer frame (100, 100, 500, 300)
    expect(syncedInner.x).toBeGreaterThan(syncedOuter.x);
    expect(syncedInner.y).toBeGreaterThan(syncedOuter.y);
    expect(syncedInner.x + syncedInner.width).toBeLessThan(syncedOuter.x + syncedOuter.width);
    expect(syncedInner.y + syncedInner.height).toBeLessThan(syncedOuter.y + syncedOuter.height);
  });

  it("instantiates the 8-line Parametric Slab template and evaluates formula dependencies", () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "parametric_slab_lines")!;
    expect(template).toBeDefined();

    const instance = template.generator({ top_outer_rect: 400, height_outer_rect: 200, wall_thickness: 30 });
    expect(instance.shapes).toHaveLength(8);

    // Verify top outer line length is 400
    const topOuter = instance.shapes.find((s) => s.name === "top_outer_rect") as LineShape;
    expect(topOuter).toBeDefined();
    expect(topOuter.x2 - topOuter.x1).toBe(400);

    // Verify top inner line length is 400 - (30 * 2) = 340
    const topInner = instance.shapes.find((s) => s.name === "top_inner_rect") as LineShape;
    expect(topInner).toBeDefined();
    expect(topInner.x2 - topInner.x1).toBe(340);
  });

  it("updates connected lines when a line's length parameter changes", () => {
    // Two connected lines: line1 (horizontal) and line2 (vertical starting where line1 ends)
    const line1: LineShape = {
      id: "l1",
      name: "top_outer_rect",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
    };
    const line2: LineShape = {
      id: "l2",
      name: "right_outer_rect",
      type: "line",
      x1: 300,
      y1: 100,
      x2: 300,
      y2: 250,
    };

    const model = new ParametricModel();
    // Expand top_outer_rect from 200 to 400
    model.setVariable("top_outer_rect", 400);

    const { updatedShapes } = model.syncModel([line1, line2]);
    const updatedLine1 = updatedShapes[0] as LineShape;
    const updatedLine2 = updatedShapes[1] as LineShape;

    // Line 1 length is now 400
    expect(updatedLine1.x2 - updatedLine1.x1).toBe(400);
    expect(updatedLine1.x2).toBe(500);

    // Line 2 start and end X should have shifted to follow Line 1
    expect(updatedLine2.x1).toBe(500);
    expect(updatedLine2.x2).toBe(500);
  });
});
