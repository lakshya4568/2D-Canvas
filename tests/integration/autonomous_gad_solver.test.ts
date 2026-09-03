import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Shape } from "../../lib/geometry/types";
import {
  detectGADAssemblies,
  isShapeInGADAssembly,
  solveGADAssemblyAdjustment,
} from "../../lib/geometry/gadAssemblyEngine";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";

describe("Autonomous GAD Relationship Discovery & Zero-Formula Solving", () => {
  it("should import complex GAD from JSON and autonomously deduce all relationships and clearances", () => {
    const jsonPath = resolve(__dirname, "../../public/samples/complex_gad_assembly.json");
    const jsonStr = readFileSync(jsonPath, "utf-8");
    const shapes: Shape[] = JSON.parse(jsonStr);

    expect(shapes).toHaveLength(10);

    const assemblies = detectGADAssemblies(shapes);
    expect(assemblies).toHaveLength(1);

    const asm = assemblies[0];
    expect(asm.outer.id).toBe("gad_outer_boundary");
    expect(asm.totalWidth).toBe(700);
    expect(asm.totalHeight).toBe(300);

    // 2 internal features (Bay 1 chamfered loop, Bay 2 rectangular cavity)
    expect(asm.features).toHaveLength(2);

    const bay1 = asm.features[0];
    expect(bay1.kind).toBe("loop");
    expect(bay1.span).toBe(280);
    expect(bay1.clearHeight).toBe(220);
    expect(bay1.haunches).toHaveLength(4);

    const bay2 = asm.features[1];
    expect(bay2.kind).toBe("rectangle");
    expect(bay2.id).toBe("bay2_cavity");
    expect(bay2.span).toBe(280);
    expect(bay2.clearHeight).toBe(220);

    // Precise Clearances autonomously extracted:
    expect(asm.clearances.left).toBe(40);
    expect(asm.clearances.right).toBe(40);
    expect(asm.clearances.top).toBe(40);
    expect(asm.clearances.bottom).toBe(40);
    expect(asm.clearances.mid).toBe(60);
  });

  it("should auto-scale GAD when Bay 1 span is changed without any formulas", () => {
    const jsonPath = resolve(__dirname, "../../public/samples/complex_gad_assembly.json");
    const shapes: Shape[] = JSON.parse(readFileSync(jsonPath, "utf-8"));

    // User scales Bay 1 span from 280 to 450 (+170px)
    const result = solveGADAssemblyAdjustment(shapes, {
      shapeId: "bay1_roof",
      deltaSpan: 170,
    });

    expect(result.solved).toBe(true);

    const uOuter = result.updatedShapes.find((s) => s.id === "gad_outer_boundary") as any;
    const uRoof = result.updatedShapes.find((s) => s.id === "bay1_roof") as any;
    const uTR = result.updatedShapes.find((s) => s.id === "bay1_tr") as any;
    const uRightWall = result.updatedShapes.find((s) => s.id === "bay1_wall_right") as any;
    const uBay2 = result.updatedShapes.find((s) => s.id === "bay2_cavity") as any;

    // Outer frame expanded by +170: 700 -> 870
    expect(uOuter.width).toBe(870);

    // Bay 1 Roof expanded
    expect(uRoof.x2 - uRoof.x1).toBe(210 + 170); // 380

    // Right wall shifted by +170
    expect(uRightWall.x1).toBe(370 + 170); // 540

    // Chamfer leg length strictly preserved at 35px
    expect(Math.abs(uTR.x2 - uTR.x1)).toBe(35);
    expect(Math.abs(uTR.y2 - uTR.y1)).toBe(35);

    // Bay 2 shifted rigidly by +170 from 430 to 600
    expect(uBay2.x).toBe(600);
    expect(uBay2.width).toBe(280); // Unchanged!

    // Intermediate partition clearance strictly preserved at 60px!
    expect(uBay2.x - uRightWall.x1).toBe(60);

    // Exterior right clearance strictly preserved at 40px!
    expect(uOuter.x + uOuter.width - (uBay2.x + uBay2.width)).toBe(40);
  });

  it("should auto-calculate nested rectangles via UPDATE_SHAPE in drawingReducer without formulas", () => {
    const outerRect: Shape = {
      id: "R1",
      name: "R1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };

    const innerRect: Shape = {
      id: "R2",
      name: "R2",
      type: "rectangle",
      x: 130,
      y: 130,
      width: 340,
      height: 240,
    };

    let state = {
      ...initialDrawingState,
      shapes: [outerRect, innerRect] as Shape[],
    };

    // User changes width of R2 to 500 via inspector input
    state = drawingReducer(state, {
      type: "UPDATE_SHAPE",
      id: "R2",
      updates: { width: 500 },
    });

    const uR1 = state.shapes.find((s) => s.id === "R1") as any;
    const uR2 = state.shapes.find((s) => s.id === "R2") as any;

    expect(uR2.width).toBe(500);
    // Outer rectangle automatically expanded from 400 to 560
    expect(uR1.width).toBe(560);

    // All 4 clearances (30px) strictly preserved
    expect(uR2.x - uR1.x).toBe(30);
    expect(uR1.x + uR1.width - (uR2.x + uR2.width)).toBe(30);
    expect(uR2.y - uR1.y).toBe(30);
    expect(uR1.y + uR1.height - (uR2.y + uR2.height)).toBe(30);
  });
});
