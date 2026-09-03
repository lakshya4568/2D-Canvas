import { describe, it, expect } from "vitest";
import {
  detectWallAssemblies,
  isShapeInWallAssembly,
  solveWallAssemblyAdjustment,
} from "../../lib/inference/wallDiscovery";
import { Shape } from "../../lib/geometry/types";

describe("Autonomous Wall Discovery and Zero-Formula Solving", () => {
  it("should recognize walls in a rectangle inside a rectangle", () => {
    const outerRect: Shape = {
      id: "outer_rect",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      strokeColor: "#ffffff",
      strokeWidth: 2,
    };

    const innerRect: Shape = {
      id: "inner_rect",
      type: "rectangle",
      x: 130,
      y: 130,
      width: 340,
      height: 240,
      strokeColor: "#0066ff",
      strokeWidth: 2,
    };

    const shapes: Shape[] = [outerRect, innerRect];
    const assemblies = detectWallAssemblies(shapes);

    expect(assemblies).toHaveLength(1);
    const asm = assemblies[0];

    expect(asm.outer.id).toBe("outer_rect");
    expect(asm.voids!).toHaveLength(1);
    expect(asm.voids![0].id).toBe("inner_rect");
    expect(asm.voids![0].span).toBe(340);
    expect(asm.voids![0].clearHeight).toBe(240);

    // Wall thicknesses automatically discovered:
    // Left = 130 - 100 = 30
    // Right = (100 + 400) - (130 + 340) = 500 - 470 = 30
    // Top = 130 - 100 = 30
    // Bottom = (100 + 300) - (130 + 240) = 400 - 370 = 30
    expect(asm.walls!.left).toBe(30);
    expect(asm.walls!.right).toBe(30);
    expect(asm.walls!.top).toBe(30);
    expect(asm.walls!.bottom).toBe(30);

    const roleInfo = isShapeInWallAssembly(shapes, "inner_rect");
    expect(roleInfo.inAssembly).toBe(true);
    expect(roleInfo.role).toBe("inner");
  });

  it("should auto-calculate when inner rectangle width changes without any formula", () => {
    const outerRect: Shape = {
      id: "outer_rect",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      strokeColor: "#ffffff",
      strokeWidth: 2,
    };

    const innerRect: Shape = {
      id: "inner_rect",
      type: "rectangle",
      x: 130,
      y: 130,
      width: 340,
      height: 240,
      strokeColor: "#0066ff",
      strokeWidth: 2,
    };

    const shapes: Shape[] = [outerRect, innerRect];

    // User changes length of inner rectangle from 340 to 500
    const result = solveWallAssemblyAdjustment(shapes, {
      shapeId: "inner_rect",
      newSpan: 500,
    });

    expect(result.solved).toBe(true);
    const updatedOuter = result.updatedShapes.find((s) => s.id === "outer_rect") as any;
    const updatedInner = result.updatedShapes.find((s) => s.id === "inner_rect") as any;

    expect(updatedInner.width).toBe(500);
    // Outer width expanded by delta (500 - 340 = 160) -> 400 + 160 = 560
    expect(updatedOuter.width).toBe(560);

    // Wall thicknesses are strictly preserved:
    const newTLeft = updatedInner.x - updatedOuter.x;
    const newTRight = updatedOuter.x + updatedOuter.width - (updatedInner.x + updatedInner.width);
    const newTTop = updatedInner.y - updatedOuter.y;
    const newTBot = updatedOuter.y + updatedOuter.height - (updatedInner.y + updatedInner.height);

    expect(newTLeft).toBe(30);
    expect(newTRight).toBe(30);
    expect(newTTop).toBe(30);
    expect(newTBot).toBe(30);
  });

  it("should auto-calculate multi-cell drawings (two rooms/culverts) with dividing wall", () => {
    // Outer frame: 600 x 260
    const outerRect: Shape = {
      id: "outer_frame",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 600,
      height: 260,
    };

    // Bay 1: 250 x 200 at (30, 30)
    const bay1: Shape = {
      id: "bay_1",
      type: "rectangle",
      x: 30,
      y: 30,
      width: 250,
      height: 200,
    };

    // Bay 2: 250 x 200 at (320, 30) -> mid wall = 320 - (30 + 250) = 40
    const bay2: Shape = {
      id: "bay_2",
      type: "rectangle",
      x: 320,
      y: 30,
      width: 250,
      height: 200,
    };

    const shapes: Shape[] = [outerRect, bay1, bay2];
    const assemblies = detectWallAssemblies(shapes);

    expect(assemblies).toHaveLength(1);
    const asm = assemblies[0];
    expect(asm.voids!).toHaveLength(2);
    expect(asm.walls!.left).toBe(30);
    expect(asm.walls!.mid).toBe(40);
    expect(asm.walls!.right).toBe(30); // 600 - (320 + 250) = 30

    // User expands Bay 1 clear span from 250 to 400 (+150)
    const result = solveWallAssemblyAdjustment(shapes, {
      shapeId: "bay_1",
      newSpan: 400,
    });

    expect(result.solved).toBe(true);
    const uOuter = result.updatedShapes.find((s) => s.id === "outer_frame") as any;
    const uBay1 = result.updatedShapes.find((s) => s.id === "bay_1") as any;
    const uBay2 = result.updatedShapes.find((s) => s.id === "bay_2") as any;

    expect(uBay1.width).toBe(400);
    // Bay 2 shifted rigidly by +150
    expect(uBay2.x).toBe(320 + 150); // 470
    expect(uBay2.width).toBe(250); // Unchanged!

    // Mid wall thickness is strictly preserved!
    expect(uBay2.x - (uBay1.x + uBay1.width)).toBe(40);

    // Total width updated from 600 to 750
    expect(uOuter.width).toBe(750);
    // Right wall thickness is strictly preserved!
    expect(uOuter.x + uOuter.width - (uBay2.x + uBay2.width)).toBe(30);
  });

  it("should recognize haunched culvert loops and preserve 45-degree haunches", () => {
    const t = 30;
    const h = 35;
    const s = 300;
    const H = 200;

    const outerRect: Shape = {
      id: "culvert_outer",
      type: "rectangle",
      x: 0,
      y: 0,
      width: s + 2 * t,
      height: H + 2 * t,
    };

    // 8-edge octagon
    const innerLines: Shape[] = [
      { id: "roof", type: "line", x1: t + h, y1: t, x2: t + s - h, y2: t },
      { id: "tr", type: "line", x1: t + s - h, y1: t, x2: t + s, y2: t + h },
      { id: "right_wall", type: "line", x1: t + s, y1: t + h, x2: t + s, y2: t + H - h },
      { id: "br", type: "line", x1: t + s, y1: t + H - h, x2: t + s - h, y2: t + H },
      { id: "floor", type: "line", x1: t + s - h, y1: t + H, x2: t + h, y2: t + H },
      { id: "bl", type: "line", x1: t + h, y1: t + H, x2: t, y2: t + H - h },
      { id: "left_wall", type: "line", x1: t, y1: t + H - h, x2: t, y2: t + h },
      { id: "tl", type: "line", x1: t, y1: t + h, x2: t + h, y2: t },
    ];

    const shapes: Shape[] = [outerRect, ...innerLines];
    const assemblies = detectWallAssemblies(shapes);

    expect(assemblies).toHaveLength(1);
    const asm = assemblies[0];
    expect(asm.voids!).toHaveLength(1);
    expect(asm.voids![0].haunches).toHaveLength(4);

    // User changes top roof span from 300 to 500 (+200)
    const result = solveWallAssemblyAdjustment(shapes, {
      shapeId: "roof",
      deltaSpan: 200,
    });

    expect(result.solved).toBe(true);
    const uOuter = result.updatedShapes.find((s) => s.id === "culvert_outer") as any;
    const uRoof = result.updatedShapes.find((s) => s.id === "roof") as any;
    const uTR = result.updatedShapes.find((s) => s.id === "tr") as any;
    const uRight = result.updatedShapes.find((s) => s.id === "right_wall") as any;

    expect(uOuter.width).toBe(s + 2 * t + 200); // 560
    expect(uRoof.x2).toBe(t + s - h + 200);
    // Right wall shifted by +200
    expect(uRight.x1).toBe(t + s + 200);
    // Haunch leg length preserved
    const trDx = Math.abs(uTR.x2 - uTR.x1);
    const trDy = Math.abs(uTR.y2 - uTR.y1);
    expect(trDx).toBe(h);
    expect(trDy).toBe(h);
  });
});
