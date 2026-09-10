import { describe, it, expect, vi } from "vitest";
import { CadCommandRegistry } from "../../lib/commands/CommandRegistry";
import { CadCommandContext } from "../../lib/commands/types";
import { initialDrawingState } from "../../lib/state/drawingReducer";
import { LineShape, RectangleShape, CircleShape } from "../../lib/geometry/types";

describe("AutoCAD Command Prompt Execution & Integration", () => {
  function createMockContext(overrides: Partial<CadCommandContext> = {}): {
    ctx: CadCommandContext;
    dispatchedActions: any[];
    currentTool: string;
  } {
    const dispatchedActions: any[] = [];
    let currentTool = "select";

    const ctx: CadCommandContext = {
      state: initialDrawingState,
      shapes: [],
      selectedIds: ["shape_1"],
      lastPoint: null,
      cursorPos: null,
      dispatch: (action: any) => dispatchedActions.push(action),
      setTool: (tool: any) => {
        currentTool = tool;
      },
      undo: vi.fn(),
      redo: vi.fn(),
      clearAll: vi.fn(),
      openHelp: vi.fn(),
      openTemplates: vi.fn(),
      notify: vi.fn(),
      ...overrides,
    };

    return { ctx, dispatchedActions, get currentTool() { return currentTool; } };
  }

  describe("Direct Shape Creation via Coordinate Arguments", () => {
    it("executes LINE with absolute coordinates and dispatches ADD_SHAPE", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("LINE 0,0 150,200", ctx);

      expect(res.success).toBe(true);
      expect(dispatchedActions).toHaveLength(1);
      expect(dispatchedActions[0].type).toBe("ADD_SHAPE");
      const shape = dispatchedActions[0].shape as LineShape;
      expect(shape.type).toBe("line");
      expect(shape.x1).toBe(0);
      expect(shape.y1).toBe(0);
      expect(shape.x2).toBe(150);
      expect(shape.y2).toBe(200);
    });

    it("executes RECTANGLE with opposite corners and dispatches ADD_SHAPE", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("REC 20,30 120,150", ctx);

      expect(res.success).toBe(true);
      expect(dispatchedActions).toHaveLength(1);
      expect(dispatchedActions[0].type).toBe("ADD_SHAPE");
      const shape = dispatchedActions[0].shape as RectangleShape;
      expect(shape.type).toBe("rectangle");
      expect(shape.x).toBe(20);
      expect(shape.y).toBe(30);
      expect(shape.width).toBe(100);
      expect(shape.height).toBe(120);
    });

    it("executes CIRCLE with center coordinate and radius and dispatches ADD_SHAPE", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("C 50,75 35", ctx);

      expect(res.success).toBe(true);
      expect(dispatchedActions).toHaveLength(1);
      expect(dispatchedActions[0].type).toBe("ADD_SHAPE");
      const shape = dispatchedActions[0].shape as CircleShape;
      expect(shape.type).toBe("circle");
      expect(shape.cx).toBe(50);
      expect(shape.cy).toBe(75);
      expect(shape.r).toBe(35);
    });

    it("activates interactive tool when no coordinates are given", () => {
      const mock = createMockContext();
      const res = CadCommandRegistry.execute("L", mock.ctx);

      expect(res.success).toBe(true);
      expect(mock.currentTool).toBe("line");
      expect(res.activeCommand).toBe("LINE");
      expect(res.awaitingInput).toBe("point");
    });
  });

  describe("AutoCAD Drafting Tray Modes Toggling via Command Line", () => {
    it("dispatches TOGGLE_ORTHO on ORTHO command", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("ORTHO", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "TOGGLE_ORTHO" });
    });

    it("dispatches TOGGLE_POLAR_TRACKING on POLAR command", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("POLAR", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "TOGGLE_POLAR_TRACKING" });
    });

    it("dispatches TOGGLE_OBJECT_SNAP on OSNAP command", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("OSNAP", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "TOGGLE_OBJECT_SNAP" });
    });

    it("dispatches TOGGLE_GRID on GRID command", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("GRID", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "TOGGLE_GRID" });
    });

    it("dispatches TOGGLE_DYNAMIC_INPUT on DYN command", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("DYN", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "TOGGLE_DYNAMIC_INPUT" });
    });
  });

  describe("AutoCAD Modification and Utility Commands", () => {
    it("executes ERASE and dispatches DELETE_SELECTED", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("E", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "DELETE_SELECTED" });
    });

    it("executes GROUP and dispatches GROUP_SELECTED", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("G", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "GROUP_SELECTED" });
    });

    it("executes UNGROUP and dispatches UNGROUP_SELECTED", () => {
      const { ctx, dispatchedActions } = createMockContext();
      const res = CadCommandRegistry.execute("UNG", ctx);
      expect(res.success).toBe(true);
      expect(dispatchedActions).toContainEqual({ type: "UNGROUP_SELECTED" });
    });

    it("executes UNDO and REDO handlers", () => {
      const { ctx } = createMockContext();
      CadCommandRegistry.execute("U", ctx);
      expect(ctx.undo).toHaveBeenCalled();

      CadCommandRegistry.execute("REDO", ctx);
      expect(ctx.redo).toHaveBeenCalled();
    });

    it("opens instruction manual on HELP or '?'", () => {
      const { ctx } = createMockContext();
      CadCommandRegistry.execute("HELP", ctx);
      expect(ctx.openHelp).toHaveBeenCalled();

      CadCommandRegistry.execute("?", ctx);
      expect(ctx.openHelp).toHaveBeenCalledTimes(2);
    });
  });

  describe("AutoCAD Command Autocomplete Engine", () => {
    it("returns relevant completions for partial query", () => {
      const lineComps = CadCommandRegistry.getCompletions("L");
      expect(lineComps.some((c) => c.commandName === "LINE")).toBe(true);

      const orthoComps = CadCommandRegistry.getCompletions("ORT");
      expect(orthoComps.some((c) => c.commandName === "ORTHO")).toBe(true);

      const dynComps = CadCommandRegistry.getCompletions("DY");
      expect(dynComps.some((c) => c.commandName === "DYNAMIC_INPUT")).toBe(true);
    });
  });
});
