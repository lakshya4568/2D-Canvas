import { describe, it, expect } from "vitest";
import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { ParametricModel } from "../../lib/parametric/model";

describe("E2E Integration: Single-Cell Box Culvert Variational Sync", () => {
  it("should expand culvert from span 300 to 500, preserving wall thickness and haunches", () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "single_cell_box_culvert")!;
    expect(template).toBeDefined();

    const instance = template.generator({
      clear_span: 300,
      clear_height: 200,
      wall_thickness: 30,
      haunch_leg: 35,
    });

    const model = new ParametricModel();
    for (const [name, v] of Object.entries(instance.variables)) {
      model.setVariable(name, v.formula ?? v.value);
    }

    const syncInitial = model.syncModel(instance.shapes);
    const outerInitial = syncInitial.updatedShapes.find((s) => s.id === "culvert_outer") as any;
    expect(outerInitial.width).toBe(360); // 300 + 2*30

    // Mutate clear_span to 500
    model.setVariable("clear_span", 500);

    const syncSolved = model.syncModel(syncInitial.updatedShapes);
    const outerSolved = syncSolved.updatedShapes.find((s) => s.id === "culvert_outer") as any;
    expect(outerSolved.width).toBeCloseTo(560, 4); // 500 + 2*30

    // Verify haunch lines maintain dx = dy = 35 (45 degrees)
    const haunchTR = syncSolved.updatedShapes.find((s) => s.id === "culvert_haunch_tr") as any;
    expect(haunchTR).toBeDefined();
    expect(Math.abs(haunchTR.x2 - haunchTR.x1)).toBeCloseTo(35, 3);
    expect(Math.abs(haunchTR.y2 - haunchTR.y1)).toBeCloseTo(35, 3);

    const haunchBL = syncSolved.updatedShapes.find((s) => s.id === "culvert_haunch_bl") as any;
    expect(haunchBL).toBeDefined();
    expect(Math.abs(haunchBL.x2 - haunchBL.x1)).toBeCloseTo(35, 3);
    expect(Math.abs(haunchBL.y2 - haunchBL.y1)).toBeCloseTo(35, 3);

    // Verify roof line length = 500 - 2*35 = 430
    const roof = syncSolved.updatedShapes.find((s) => s.id === "culvert_inner_top") as any;
    expect(Math.abs(roof.x2 - roof.x1)).toBeCloseTo(430, 3);

    // Verify right wall thickness: outer.x + outer.width - right_wall.x = 30
    const rightWall = syncSolved.updatedShapes.find((s) => s.id === "culvert_inner_right") as any;
    const rightWallThickness = (outerSolved.x + outerSolved.width) - rightWall.x1;
    expect(rightWallThickness).toBeCloseTo(30, 3);
  });
});
