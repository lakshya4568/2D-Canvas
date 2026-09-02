import { describe, it, expect } from "vitest";
import { Transform2D, LocalCoordinateSystem } from "../lib/parametric/transform2d";
import { GeometryObject, GeometryObjectState } from "../lib/parametric/geometryObject";
import { LCSSolver } from "../lib/parametric/solver";
import { Shape } from "../lib/geometry/types";
import { ParametricModel } from "../lib/parametric/model";
import { BUILTIN_TEMPLATES } from "../lib/parametric/templates";

describe("2D Affine Transform & Matrix Mathematics", () => {
  it("computes identity and basic translation", () => {
    const ident = Transform2D.identity();
    const pt = { x: 50, y: 80 };
    expect(Transform2D.applyToPoint(ident, pt)).toEqual({ x: 50, y: 80 });

    const trans = Transform2D.translation(30, -20);
    expect(Transform2D.applyToPoint(trans, pt)).toEqual({ x: 80, y: 60 });
  });

  it("rotates points accurately around origin and custom pivot", () => {
    // 90 deg counter-clockwise around origin
    const rot90 = Transform2D.rotation(Math.PI / 2);
    const p1 = { x: 10, y: 0 };
    const p1Rot = Transform2D.applyToPoint(rot90, p1);
    expect(p1Rot.x).toBeCloseTo(0, 5);
    expect(p1Rot.y).toBeCloseTo(10, 5);

    // 180 deg around pivot (50, 50)
    const rot180 = Transform2D.rotation(Math.PI, { x: 50, y: 50 });
    const p2 = { x: 60, y: 50 };
    const p2Rot = Transform2D.applyToPoint(rot180, p2);
    expect(p2Rot.x).toBeCloseTo(40, 5);
    expect(p2Rot.y).toBeCloseTo(50, 5);
  });

  it("satisfies invertibility: M * M^(-1) = I", () => {
    const m = Transform2D.multiply(
      Transform2D.translation(120, 350),
      Transform2D.multiply(Transform2D.rotation(0.785), Transform2D.scale(2.5, 1.8))
    );

    const pt = { x: 42, y: 99 };
    const worldPt = Transform2D.applyToPoint(m, pt);
    const roundtrip = Transform2D.applyInverseToPoint(m, worldPt);

    expect(roundtrip.x).toBeCloseTo(pt.x, 6);
    expect(roundtrip.y).toBeCloseTo(pt.y, 6);
  });

  it("transforms direction vectors without translation", () => {
    const m = Transform2D.translation(500, 1000);
    const vec = { x: 1, y: 0 };
    const transformedVec = Transform2D.applyToVector(m, vec);
    expect(transformedVec).toEqual({ x: 1, y: 0 });
  });
});

describe("Gram-Schmidt Orthonormal Basis Construction", () => {
  it("produces an orthonormal basis from an arbitrary direction vector", () => {
    const v1 = { x: 3, y: 4 }; // Length 5
    const { u_x, u_y } = Transform2D.gramSchmidt2D(v1);

    // Unit lengths
    expect(Math.hypot(u_x.x, u_x.y)).toBeCloseTo(1, 6);
    expect(Math.hypot(u_y.x, u_y.y)).toBeCloseTo(1, 6);

    // Orthogonality: u_x . u_y = 0
    const dot = u_x.x * u_y.x + u_x.y * u_y.y;
    expect(dot).toBeCloseTo(0, 6);

    // Direction matches v1
    expect(u_x.x).toBeCloseTo(3 / 5, 6);
    expect(u_x.y).toBeCloseTo(4 / 5, 6);

    // Right-handed system: det([u_x, u_y]) = 1
    const det = u_x.x * u_y.y - u_x.y * u_y.x;
    expect(det).toBeCloseTo(1, 6);
  });

  it("handles non-orthogonal secondary guide vector using Gram-Schmidt projection", () => {
    const v1 = { x: 1, y: 0 };
    const v2 = { x: 1, y: 1 }; // 45 deg to v1
    const { u_x, u_y } = Transform2D.gramSchmidt2D(v1, v2);

    expect(u_x).toEqual({ x: 1, y: 0 });
    expect(u_y.x).toBeCloseTo(0, 6);
    expect(u_y.y).toBeCloseTo(1, 6);
  });
});

describe("Local Coordinate System (LCS)", () => {
  it("constructs an LCS from a line endpoints", () => {
    const p1 = { x: 100, y: 100 };
    const p2 = { x: 400, y: 100 }; // Horizontal line length 300
    const lcs = LocalCoordinateSystem.fromLine(p1, p2);

    expect(lcs.origin).toEqual({ x: 100, y: 100 });
    expect(lcs.axisX.x).toBeCloseTo(1, 6);
    expect(lcs.axisX.y).toBeCloseTo(0, 6);

    // In local space, start is (0, 0) and end is (300, 0)
    const localStart = lcs.worldToLocal(p1);
    const localEnd = lcs.worldToLocal(p2);
    expect(localStart.x).toBeCloseTo(0, 6);
    expect(localStart.y).toBeCloseTo(0, 6);
    expect(localEnd.x).toBeCloseTo(300, 6);
    expect(localEnd.y).toBeCloseTo(0, 6);
  });

  it("supports hierarchical parent-child transformation", () => {
    // Parent at (100, 100) rotated 90 deg
    const parentLcs = new LocalCoordinateSystem({ x: 100, y: 100 }, Math.PI / 2);
    parentLcs.updateHierarchicalWorldTransform();

    // Child placed at (50, 0) in parent's local space
    const childLcs = new LocalCoordinateSystem({ x: 50, y: 0 }, 0);
    childLcs.updateHierarchicalWorldTransform(parentLcs.worldMatrix);

    // In parent space, (50, 0) rotated by 90 deg around (100, 100) is (100, 150) in world
    expect(childLcs.origin.x).toBeCloseTo(100, 5);
    expect(childLcs.origin.y).toBeCloseTo(150, 5);
  });
});

describe("Object Awareness of Its Own Geometry & Sub-Entity References", () => {
  it("exposes endpoints, edges, and dimensions of a line", () => {
    const lineShape: Shape = {
      id: "l1",
      name: "Line_A",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
      strokeColor: "#000",
      strokeWidth: 2,
    };

    const obj = GeometryObject.fromShape(lineShape);
    const sub = GeometryObject.getExposedSubEntities(obj);

    expect(sub.scalars.length).toBe(200);
    expect(sub.scalars.angle).toBe(0);
    expect(sub.points.startPoint).toEqual({ x: 100, y: 100 });
    expect(sub.points.endPoint).toEqual({ x: 300, y: 100 });
    expect(sub.points.midpoint).toEqual({ x: 200, y: 100 });
  });

  it("exposes corners, edges, area, and perimeter of a rectangle", () => {
    const rectShape: Shape = {
      id: "r1",
      name: "Rectangle_1",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 200,
      height: 100,
      strokeColor: "#000",
      strokeWidth: 2,
    };

    const obj = GeometryObject.fromShape(rectShape);
    const sub = GeometryObject.getExposedSubEntities(obj);

    expect(sub.scalars.width).toBe(200);
    expect(sub.scalars.height).toBe(100);
    expect(sub.scalars.area).toBe(20000);
    expect(sub.scalars.perimeter).toBe(600);
    expect(sub.points.topLeft).toEqual({ x: 50, y: 50 });
    expect(sub.points.topRight).toEqual({ x: 250, y: 50 });
    expect(sub.points.bottomRight).toEqual({ x: 250, y: 150 });
    expect(sub.points.bottomLeft).toEqual({ x: 50, y: 150 });
  });

  it("resolves dot-notation paths dynamically", () => {
    const lineObj = GeometryObject.fromShape({
      id: "l1",
      name: "Line_A",
      type: "line",
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 20,
      strokeColor: "#000",
      strokeWidth: 2,
    });

    const rectObj = GeometryObject.fromShape({
      id: "r1",
      name: "Rectangle_1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      strokeColor: "#000",
      strokeWidth: 2,
    });

    const map = new Map<string, GeometryObjectState>([
      ["l1", lineObj],
      ["r1", rectObj],
    ]);

    expect(GeometryObject.resolveEntityPath("Line_A.length", map)).toBe(100);
    expect(GeometryObject.resolveEntityPath("Line_A.end.x", map)).toBe(110);
    expect(GeometryObject.resolveEntityPath("Rectangle_1.topEdge.length", map)).toBe(400);
    expect(GeometryObject.resolveEntityPath("Rectangle_1.area", map)).toBe(120000);
  });
});

describe("Relative Coordinate Systems & LCSSolver", () => {
  it("solves Relative Line System: Line_B attached to Line_A.end with relative angle 90° and length 0.5 * Line_A.length", () => {
    const solver = new LCSSolver();

    const lineA = GeometryObject.fromShape({
      id: "la",
      name: "Line_A",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
      strokeColor: "#0066ff",
      strokeWidth: 2,
    });
    lineA.parameters.length = 200;

    const lineB = GeometryObject.fromShape({
      id: "lb",
      name: "Line_B",
      type: "line",
      x1: 300,
      y1: 100,
      x2: 300,
      y2: 200,
      strokeColor: "#22c55e",
      strokeWidth: 2,
    });
    lineB.relativePlacement = {
      attachedTo: "Line_A.endPoint",
      relativeAngle: "Line_A.angle + 90",
    };
    lineB.variables.length = "L_B";

    const variables = new Map([
      ["L_A", { name: "L_A", value: 200 }],
      ["L_B", { name: "L_B", value: 100, formula: "Line_A.length * 0.5" }],
    ]);
    lineA.variables.length = "L_A";

    const objects = new Map([
      ["la", lineA],
      ["lb", lineB],
    ]);

    // First solve: L_A = 200 -> Line_B at (300, 100) with length 100 pointing downwards (90 deg)
    const report1 = solver.solve(variables, objects);
    expect(report1.success).toBe(true);

    const bShape1 = report1.shapes.find((s) => s.name === "Line_B") as any;
    expect(bShape1.x1).toBeCloseTo(300, 1);
    expect(bShape1.y1).toBeCloseTo(100, 1);
    expect(bShape1.x2).toBeCloseTo(300, 1);
    expect(bShape1.y2).toBeCloseTo(200, 1);

    // Update parameter: L_A = 300 -> Line_A expands to 300, Line_B moves to (400, 100) and length becomes 150!
    variables.set("L_A", { name: "L_A", value: 300 });
    const report2 = solver.solve(variables, objects);

    const bShape2 = report2.shapes.find((s) => s.name === "Line_B") as any;
    expect(bShape2.x1).toBeCloseTo(400, 1);
    expect(bShape2.y1).toBeCloseTo(100, 1);
    expect(bShape2.x2).toBeCloseTo(400, 1);
    expect(bShape2.y2).toBeCloseTo(250, 1); // 100 + 150
  });

  it("detects circular dependencies cleanly without crashing", () => {
    const solver = new LCSSolver();

    const variables = new Map([
      ["A", { name: "A", value: 10, formula: "B + 5" }],
      ["B", { name: "B", value: 10, formula: "A * 2" }],
    ]);

    const objects = new Map<string, GeometryObjectState>();
    const report = solver.solve(variables, objects);

    expect(report.cycles.hasCycle).toBe(true);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]).toContain("Circular dependency detected");
  });

  it("rotates Line_B to 135° when Line_A rotates to 45° (Section 12)", () => {
    const solver = new LCSSolver();

    const lineA = GeometryObject.fromShape({
      id: "la",
      name: "Line_A",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
      strokeColor: "#000",
      strokeWidth: 2,
    });
    lineA.parameters.length = 200;
    // Set Line_A angle to 45 deg
    lineA.lcs.setTransform({ x: 100, y: 100 }, (45 * Math.PI) / 180);

    const lineB = GeometryObject.fromShape({
      id: "lb",
      name: "Line_B",
      type: "line",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      strokeColor: "#000",
      strokeWidth: 2,
    });
    lineB.parameters.length = 100;
    lineB.relativePlacement = {
      attachedTo: "Line_A.endPoint",
      relativeAngle: "Line_A.angle + 90", // 45 + 90 = 135 deg
    };

    const variables = new Map<string, any>();
    const objects = new Map([
      ["la", lineA],
      ["lb", lineB],
    ]);

    const report = solver.solve(variables, objects);
    expect(report.success).toBe(true);

    const bShape = report.shapes.find((s) => s.name === "Line_B") as any;
    // Line_A end at 45 deg: x = 100 + 200 * cos(45) = 241.42, y = 100 + 200 * sin(45) = 241.42
    expect(bShape.x1).toBeCloseTo(100 + 200 * Math.SQRT1_2, 1);
    expect(bShape.y1).toBeCloseTo(100 + 200 * Math.SQRT1_2, 1);

    // Line_B angle should be 135 deg (cos 135 = -0.707, sin 135 = 0.707)
    const angleB = Math.atan2(bShape.y2 - bShape.y1, bShape.x2 - bShape.x1) * (180 / Math.PI);
    expect(angleB).toBeCloseTo(135, 1);
  });

  it("handles polygon/shape expansion with relative inner cutout (Section 13)", () => {
    const solver = new LCSSolver();

    const outerRect = GeometryObject.fromShape({
      id: "outer",
      name: "Outer_Square",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      strokeColor: "#000",
      strokeWidth: 2,
    });
    outerRect.variables.width = "W";
    outerRect.variables.height = "W";

    const innerRect = GeometryObject.fromShape({
      id: "inner",
      name: "Inner_Cutout",
      type: "rectangle",
      x: 70,
      y: 70,
      width: 160,
      height: 100,
      strokeColor: "#22c55e",
      strokeWidth: 1.5,
    });
    innerRect.variables.width = "InnerWidth";
    innerRect.variables.height = "InnerHeight";
    innerRect.relativePlacement = {
      attachedTo: "Outer_Square.topLeft",
      offset: { x: 20, y: 20 },
      referenceObjectId: "outer",
    };

    const variables = new Map([
      ["W", { name: "W", value: 200 }],
      ["InnerWidth", { name: "InnerWidth", value: 160, formula: "W * 0.8" }],
      ["InnerHeight", { name: "InnerHeight", value: 100, formula: "W * 0.5" }],
    ]);

    const objects = new Map([
      ["outer", outerRect],
      ["inner", innerRect],
    ]);

    // Initial solve at W = 200
    const rep1 = solver.solve(variables, objects);
    expect(rep1.success).toBe(true);
    const inShape1 = rep1.shapes.find((s) => s.name === "Inner_Cutout") as any;
    expect(inShape1.width).toBeCloseTo(160, 1);
    expect(inShape1.height).toBeCloseTo(100, 1);

    // Expand to W = 400
    variables.set("W", { name: "W", value: 400 });
    const rep2 = solver.solve(variables, objects);
    expect(rep2.success).toBe(true);
    const inShape2 = rep2.shapes.find((s) => s.name === "Inner_Cutout") as any;
    expect(inShape2.width).toBeCloseTo(320, 1); // 400 * 0.8
    expect(inShape2.height).toBeCloseTo(200, 1); // 400 * 0.5
  });

  it("dynamically solves 12-element parametric mitered slab with zero drift", () => {
    const model = new ParametricModel();
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "parametric_slab_miters")!;
    expect(template).toBeDefined();

    const instance = template.generator({
      top_outer_rect: 150,
      height_outer_rect: 180,
      wall_thickness: 25,
    });

    expect(instance.shapes.length).toBe(12);

    for (const [k, v] of Object.entries(instance.variables)) {
      model.variables.set(k, v);
    }

    // Solve model
    const sync1 = model.syncModel(instance.shapes);
    expect(sync1.errors.length).toBe(0);

    // Verify outer and inner dimensions
    const topOuter = sync1.updatedShapes.find((s) => s.name === "top_outer_rect") as any;
    const topInner = sync1.updatedShapes.find((s) => s.name === "top_inner_rect") as any;
    expect(topOuter.x2 - topOuter.x1).toBeCloseTo(150, 1);
    expect(topInner.x2 - topInner.x1).toBeCloseTo(100, 1); // 150 - 2 * 25

    // Verify 4 corner miters have length ~35 (sqrt(25^2 + 25^2) = 35.35)
    const miterTL = sync1.updatedShapes.find((s) => s.name === "miter_top_left") as any;
    const miterTR = sync1.updatedShapes.find((s) => s.name === "miter_top_right") as any;
    expect(Math.hypot(miterTL.x2 - miterTL.x1, miterTL.y2 - miterTL.y1)).toBeCloseTo(35.35, 1);
    expect(Math.hypot(miterTR.x2 - miterTR.x1, miterTR.y2 - miterTR.y1)).toBeCloseTo(35.35, 1);

    // Resize top_outer_rect to 200
    model.variables.set("top_outer_rect", { name: "top_outer_rect", value: 200, unit: "mm" });
    const sync2 = model.syncModel(sync1.updatedShapes);
    const topOuter2 = sync2.updatedShapes.find((s) => s.name === "top_outer_rect") as any;
    const topInner2 = sync2.updatedShapes.find((s) => s.name === "top_inner_rect") as any;
    expect(topOuter2.x2 - topOuter2.x1).toBeCloseTo(200, 1);
    expect(topInner2.x2 - topInner2.x1).toBeCloseTo(150, 1);

    // Miter lines stay anchored at new corners with unchanged wall thickness length 35.35
    const miterTR2 = sync2.updatedShapes.find((s) => s.name === "miter_top_right") as any;
    expect(miterTR2.x1).toBeCloseTo(topOuter2.x2, 1);
    expect(miterTR2.x2).toBeCloseTo(topInner2.x2, 1);
    expect(Math.hypot(miterTR2.x2 - miterTR2.x1, miterTR2.y2 - miterTR2.y1)).toBeCloseTo(35.35, 1);
  });
});
