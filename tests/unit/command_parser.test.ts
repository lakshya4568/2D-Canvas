import { describe, it, expect, vi } from "vitest";
import {
  parseCoordinateInput,
  resolveCoordinate,
  parseCommandLine,
} from "../../lib/commands/CommandParser";
import { CadCommandRegistry } from "../../lib/commands/CommandRegistry";

describe("AutoCAD Command Grammar & Tokenizer Pipeline (UPCE-MASTER-1.0)", () => {
  describe("Coordinate Parser", () => {
    it("parses absolute Cartesian coordinates X,Y", () => {
      const res1 = parseCoordinateInput("100,200");
      expect(res1).toEqual({ type: "absolute", x: 100, y: 200 });

      const res2 = parseCoordinateInput("-45.5, 120.75");
      expect(res2).toEqual({ type: "absolute", x: -45.5, y: 120.75 });
    });

    it("parses relative Cartesian coordinates @dX,dY", () => {
      const res1 = parseCoordinateInput("@50,-30");
      expect(res1).toEqual({ type: "relative", dx: 50, dy: -30 });

      const res2 = parseCoordinateInput("@ 100, 200");
      expect(res2).toEqual({ type: "relative", dx: 100, dy: 200 });
    });

    it("parses absolute Polar coordinates Dist<Angle", () => {
      const res1 = parseCoordinateInput("100<45");
      expect(res1).toEqual({ type: "polar", dist: 100, angleDeg: 45 });

      const res2 = parseCoordinateInput("50.5<-90");
      expect(res2).toEqual({ type: "polar", dist: 50.5, angleDeg: -90 });
    });

    it("parses relative Polar coordinates @Dist<Angle", () => {
      const res1 = parseCoordinateInput("@100<45");
      expect(res1).toEqual({ type: "relative_polar", dist: 100, angleDeg: 45 });

      const res2 = parseCoordinateInput("@ 250 < 180");
      expect(res2).toEqual({ type: "relative_polar", dist: 250, angleDeg: 180 });
    });

    it("parses direct distance entry (scalar number)", () => {
      const res1 = parseCoordinateInput("150");
      expect(res1).toEqual({ type: "distance", dist: 150 });

      const res2 = parseCoordinateInput("42.8");
      expect(res2).toEqual({ type: "distance", dist: 42.8 });
    });

    it("identifies invalid coordinate syntax", () => {
      const res = parseCoordinateInput("invalid_coord");
      expect(res.type).toBe("invalid");
    });
  });

  describe("Coordinate Resolution", () => {
    const base = { x: 100, y: 100 };

    it("resolves absolute coordinate ignoring base point", () => {
      const parsed = parseCoordinateInput("300,400");
      const pt = resolveCoordinate(parsed, base);
      expect(pt).toEqual({ x: 300, y: 400 });
    });

    it("resolves relative coordinate adding to base point", () => {
      const parsed = parseCoordinateInput("@50,-20");
      const pt = resolveCoordinate(parsed, base);
      expect(pt).toEqual({ x: 150, y: 80 });
    });

    it("resolves polar coordinate with CAD angle orientation", () => {
      const parsed = parseCoordinateInput("100<0"); // 0° is +X
      const pt = resolveCoordinate(parsed, base);
      expect(pt?.x).toBeCloseTo(200, 4);
      expect(pt?.y).toBeCloseTo(100, 4);
    });

    it("resolves direct distance along cursor vector", () => {
      const parsed = parseCoordinateInput("50");
      const cursor = { x: 100, y: 200 }; // directly downwards (+Y)
      const pt = resolveCoordinate(parsed, base, cursor);
      expect(pt?.x).toBeCloseTo(100, 4);
      expect(pt?.y).toBeCloseTo(150, 4);
    });
  });

  describe("Command Line Tokenizer", () => {
    it("splits command and argument token cleanly", () => {
      expect(parseCommandLine("L")).toEqual({ command: "L", args: "" });
      expect(parseCommandLine("line 100,200")).toEqual({ command: "LINE", args: "100,200" });
      expect(parseCommandLine("  rec   @50,30  ")).toEqual({ command: "REC", args: "@50,30" });
    });
  });

  describe("Command Registry & Auto-complete", () => {
    it("finds auto-complete suggestions", () => {
      const completions = CadCommandRegistry.getCompletions("L");
      expect(completions.some((c) => c.commandName === "LINE")).toBe(true);

      const circleComp = CadCommandRegistry.getCompletions("C");
      expect(circleComp.some((c) => c.commandName === "CIRCLE")).toBe(true);
    });

    it("executes standard drafting commands against context", () => {
      const setTool = vi.fn();
      const dispatch = vi.fn();
      const undo = vi.fn();
      const redo = vi.fn();
      const clearAll = vi.fn();

      const ctx: any = {
        shapes: [],
        selectedIds: [],
        lastPoint: null,
        cursorPos: null,
        dispatch,
        setTool,
        undo,
        redo,
        clearAll,
      };

      // LINE
      const lineRes = CadCommandRegistry.execute("L", ctx);
      expect(lineRes.success).toBe(true);
      expect(setTool).toHaveBeenCalledWith("line");

      // RECTANGLE
      const recRes = CadCommandRegistry.execute("REC", ctx);
      expect(recRes.success).toBe(true);
      expect(setTool).toHaveBeenCalledWith("rect");

      // UNDO
      const undoRes = CadCommandRegistry.execute("U", ctx);
      expect(undoRes.success).toBe(true);
      expect(undo).toHaveBeenCalled();

      // REDO
      const redoRes = CadCommandRegistry.execute("REDO", ctx);
      expect(redoRes.success).toBe(true);
      expect(redo).toHaveBeenCalled();

      // ERASE
      const eraseRes = CadCommandRegistry.execute("E", ctx);
      expect(eraseRes.success).toBe(true);
      expect(dispatch).toHaveBeenCalledWith({ type: "DELETE_SELECTED" });
    });
  });
});
