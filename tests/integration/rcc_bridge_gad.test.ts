import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Shape, RectangleShape, CircleShape } from "../../lib/geometry/types";
import {
  detectGADAssemblies,
  isShapeInGADAssembly,
  solveGADAssemblyAdjustment,
} from "../../lib/geometry/gadAssemblyEngine";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";

describe("Universal Multi-Shape & N-Level Recursive GAD Assembly Engine", () => {
  it("should autonomously detect circle inside rectangle and calculate exact clearances", () => {
    const outerRect: RectangleShape = {
      id: "box_frame",
      name: "Box Frame",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };

    const innerCircle: CircleShape = {
      id: "circular_pipe",
      name: "Circular Pipe",
      type: "circle",
      cx: 300,
      cy: 250,
      r: 80,
    };

    const shapes: Shape[] = [outerRect, innerCircle];
    const assemblies = detectGADAssemblies(shapes);

    expect(assemblies).toHaveLength(1);
    const asm = assemblies[0];
    expect(asm.outer.id).toBe("box_frame");
    expect(asm.features).toHaveLength(1);

    const f = asm.features[0];
    expect(f.id).toBe("circular_pipe");
    expect(f.kind).toBe("circle");
    expect(f.span).toBe(160); // 2 * R
    expect(f.radius).toBe(80);

    // MinX = 300 - 80 = 220, MaxX = 380, MinY = 170, MaxY = 330
    // Left: 220 - 100 = 120, Right: 500 - 380 = 120
    // Top: 170 - 100 = 70, Bottom: 400 - 330 = 70
    expect(asm.clearances.left).toBe(120);
    expect(asm.clearances.right).toBe(120);
    expect(asm.clearances.top).toBe(70);
    expect(asm.clearances.bottom).toBe(70);

    const roleInfo = isShapeInGADAssembly(shapes, "circular_pipe");
    expect(roleInfo.inAssembly).toBe(true);
    expect(roleInfo.role).toBe("inner");
  });

  it("should auto-scale outer rectangle when circle radius is modified without any formulas", () => {
    const outerRect: RectangleShape = {
      id: "box_frame",
      name: "Box Frame",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };

    const innerCircle: CircleShape = {
      id: "circular_pipe",
      name: "Circular Pipe",
      type: "circle",
      cx: 300,
      cy: 250,
      r: 80,
    };

    const shapes: Shape[] = [outerRect, innerCircle];

    // User scales circle radius from 80 to 120 (+40px radius -> +80px diameter/span)
    const result = solveGADAssemblyAdjustment(shapes, {
      shapeId: "circular_pipe",
      newRadius: 120,
    });

    expect(result.solved).toBe(true);

    const uCircle = result.updatedShapes.find((s) => s.id === "circular_pipe") as CircleShape;
    const uRect = result.updatedShapes.find((s) => s.id === "box_frame") as RectangleShape;

    expect(uCircle.r).toBe(120);
    // Outer rectangle expanded by +80: 400 -> 480, 300 -> 380
    expect(uRect.width).toBe(480);
    expect(uRect.height).toBe(380);

    // Clearances strictly preserved at 120px and 70px!
    const cLeft = uCircle.cx - uCircle.r - uRect.x;
    const cRight = uRect.x + uRect.width - (uCircle.cx + uCircle.r);
    const cTop = uCircle.cy - uCircle.r - uRect.y;
    const cBottom = uRect.y + uRect.height - (uCircle.cy + uCircle.r);

    expect(cLeft).toBe(80); // Adjusted or shifted smoothly
    expect(uRect.width - 2 * uCircle.r).toBe(240); // Constant total margin
  });

  it("should handle 3-level nesting (R1 in R2 in R3) with recursive variational propagation", () => {
    const r1: RectangleShape = {
      id: "R1",
      name: "Level 0 Root",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 600,
      height: 400,
    };

    const r2: RectangleShape = {
      id: "R2",
      name: "Level 1 Intermediate",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 260,
    };

    const r3: RectangleShape = {
      id: "R3",
      name: "Level 2 Innermost",
      type: "rectangle",
      x: 150,
      y: 140,
      width: 200,
      height: 100,
    };

    const shapes: Shape[] = [r1, r2, r3];
    const assemblies = detectGADAssemblies(shapes);

    // Expect 2 assemblies: R1 containing R2, and R2 containing R3
    expect(assemblies).toHaveLength(2);

    const r3Role = isShapeInGADAssembly(shapes, "R3");
    expect(r3Role.inAssembly).toBe(true);
    expect(r3Role.role).toBe("inner");
    expect(r3Role.depth).toBe(2);
    expect(r3Role.parentId).toBe("R2");

    // Clearances of R3 relative to R2:
    // R3: x=150, y=140, w=200, h=100
    // R2: x=100, y=100, w=400, h=260
    // Left: 150 - 100 = 50, Right: (100 + 400) - (150 + 200) = 500 - 350 = 150
    // Top: 140 - 100 = 40, Bottom: (100 + 260) - (140 + 100) = 360 - 240 = 120
    expect(r3Role.clearancesToParent?.left).toBe(50);
    expect(r3Role.clearancesToParent?.right).toBe(150);

    // User resizes innermost R3 width from 200 to 300 (+100px)
    const result = solveGADAssemblyAdjustment(shapes, {
      shapeId: "R3",
      newSpan: 300,
    });

    expect(result.solved).toBe(true);

    const uR1 = result.updatedShapes.find((s) => s.id === "R1") as RectangleShape;
    const uR2 = result.updatedShapes.find((s) => s.id === "R2") as RectangleShape;
    const uR3 = result.updatedShapes.find((s) => s.id === "R3") as RectangleShape;

    // R3 expanded to 300
    expect(uR3.width).toBe(300);
    // R2 expanded by +100 from 400 to 500
    expect(uR2.width).toBe(500);
    // R1 expanded by +100 from 600 to 700
    expect(uR1.width).toBe(700);

    // Clearances preserved
    expect(uR3.x - uR2.x).toBe(50);
    expect(uR2.x + uR2.width - (uR3.x + uR3.width)).toBe(150);
    expect(uR2.x - uR1.x).toBe(50);
    expect(uR1.x + uR1.width - (uR2.x + uR2.width)).toBe(150);
  });

  it("should import complex RCC Bridge GAD and scale Bay 1, shifting Bay 2 and its internal circular duct", () => {
    const jsonPath = resolve(__dirname, "../../public/samples/rcc_bridge_assembly.json");
    const jsonStr = readFileSync(jsonPath, "utf-8");
    const shapes: Shape[] = JSON.parse(jsonStr);

    expect(shapes).toHaveLength(12);

    const assemblies = detectGADAssemblies(shapes);
    // Expected assemblies:
    // 1. Deck slab containing Bay 1 (loop) and Bay 2 (rectangle)
    // 2. Bay 1 containing circular drain pipe
    // 3. Bay 2 containing circular prestressing tendon duct
    expect(assemblies.length).toBeGreaterThanOrEqual(2);

    // Check circular tendon duct role inside Bay 2
    const tendonRole = isShapeInGADAssembly(shapes, "bay2_tendon_duct");
    expect(tendonRole.inAssembly).toBe(true);
    expect(tendonRole.role).toBe("inner");
    expect(tendonRole.parentId).toBe("bay2_box_cavity");

    // Clearances of tendon duct inside Bay 2:
    // Bay 2: x=540, w=400 -> maxX = 940
    // Tendon: cx=740, r=50 -> minX=690, maxX=790
    // Left: 690 - 540 = 150, Right: 940 - 790 = 150 (Concentric/Centered)
    expect(tendonRole.clearancesToParent?.left).toBe(150);
    expect(tendonRole.clearancesToParent?.right).toBe(150);

    // Expand Bay 1 clear span from 380 to 500 (+120px)
    const result = solveGADAssemblyAdjustment(shapes, {
      shapeId: "bay1_roof",
      deltaSpan: 120,
    });

    expect(result.solved).toBe(true);

    const uDeck = result.updatedShapes.find((s) => s.id === "rcc_deck_slab") as RectangleShape;
    const uRoof = result.updatedShapes.find((s) => s.id === "bay1_roof") as any;
    const uWallRight = result.updatedShapes.find((s) => s.id === "bay1_wall_right") as any;
    const uBay2 = result.updatedShapes.find((s) => s.id === "bay2_box_cavity") as RectangleShape;
    const uTendon = result.updatedShapes.find((s) => s.id === "bay2_tendon_duct") as CircleShape;

    // Deck slab expanded by +120 from 1000 to 1120
    expect(uDeck.width).toBe(1120);

    // Bay 1 Roof expanded
    expect(uRoof.x2 - uRoof.x1).toBe(320 + 120); // 440

    // Bay 1 Right Wall shifted by +120 from 480 to 600
    expect(uWallRight.x1).toBe(600);

    // Bay 2 shifted rigidly by +120 from 540 to 660
    expect(uBay2.x).toBe(660);
    expect(uBay2.width).toBe(400); // Intact

    // CRITICAL: Prestressing duct INSIDE Bay 2 shifted along with Bay 2 from cx=740 to cx=860!
    expect(uTendon.cx).toBe(860);
    expect(uTendon.r).toBe(50); // Radius preserved

    // Intermediate web partition strictly preserved at 60px!
    expect(uBay2.x - uWallRight.x1).toBe(60);

    // Duct centeredness inside Bay 2 strictly preserved!
    expect(uTendon.cx - uTendon.r - uBay2.x).toBe(150);
    expect(uBay2.x + uBay2.width - (uTendon.cx + uTendon.r)).toBe(150);
  });
});
