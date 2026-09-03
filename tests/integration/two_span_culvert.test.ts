import { describe, it, expect } from "vitest";
import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { ParametricModel } from "../../lib/parametric/model";

describe("E2E Integration: Two-Span Box Culvert Anisotropic Expansion", () => {
  it("should expand Bay 1 by +150px, shifting Bay 2 rigidly and updating total width", () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "two_span_box_culvert")!;
    expect(template).toBeDefined();

    const instance = template.generator({
      bay1_span: 250,
      bay2_span: 250,
      clear_height: 200,
      ext_wall: 30,
      mid_wall: 40,
      haunch_leg: 35,
    });

    const model = new ParametricModel();
    for (const [name, v] of Object.entries(instance.variables)) {
      model.setVariable(name, v.formula ?? v.value);
    }

    const syncInitial = model.syncModel(instance.shapes);
    const outerInitial = syncInitial.updatedShapes.find((s) => s.id === "two_span_outer") as any;
    // Initial width: 30 + 250 + 40 + 250 + 30 = 600
    expect(outerInitial.width).toBe(600);

    // Expand Bay 1 to 400 (+150)
    model.setVariable("bay1_span", 400);

    const syncSolved = model.syncModel(syncInitial.updatedShapes);
    const outerSolved = syncSolved.updatedShapes.find((s) => s.id === "two_span_outer") as any;
    // Solved total width: 600 + 150 = 750
    expect(outerSolved.width).toBeCloseTo(750, 4);

    // Verify dividing wall thickness: b2_left.x - b1_right.x = 40
    const b1Right = syncSolved.updatedShapes.find((s) => s.id === "b1_right") as any;
    const b2Left = syncSolved.updatedShapes.find((s) => s.id === "b2_left") as any;
    expect(b2Left.x1 - b1Right.x1).toBeCloseTo(40, 3);

    // Verify Bay 2 internal span remains 250: b2_right.x - b2_left.x = 250
    const b2Right = syncSolved.updatedShapes.find((s) => s.id === "b2_right") as any;
    expect(b2Right.x1 - b2Left.x1).toBeCloseTo(250, 3);

    // Verify haunches of Bay 2 remained 35px at 45 degrees
    const b2HaunchTR = syncSolved.updatedShapes.find((s) => s.id === "b2_haunch_tr") as any;
    expect(Math.abs(b2HaunchTR.x2 - b2HaunchTR.x1)).toBeCloseTo(35, 3);
    expect(Math.abs(b2HaunchTR.y2 - b2HaunchTR.y1)).toBeCloseTo(35, 3);
  });
});
