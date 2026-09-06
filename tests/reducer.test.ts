import { describe, it, expect } from "vitest";
import {
  drawingReducer,
  initialDrawingState,
  DrawingState,
} from "@/lib/state/drawingReducer";
import { Shape, LineShape, RectangleShape } from "@/lib/geometry/types";

describe("Drawing Reducer & History Stack", () => {
  it("handles tool switching", () => {
    let state = drawingReducer(initialDrawingState, { type: "SET_TOOL", tool: "rectangle" });
    expect(state.tool).toBe("rectangle");

    state = drawingReducer(state, { type: "SET_TOOL", tool: "circle" });
    expect(state.tool).toBe("circle");
  });

  it("handles drafting, committing, and undo/redo", () => {
    // 1. Start draft
    const lineDraft: Shape = {
      id: "line_1",
      type: "line",
      x1: 10,
      y1: 10,
      x2: 10,
      y2: 10,
    };
    let state = drawingReducer(initialDrawingState, { type: "START_DRAFT", shape: lineDraft });
    expect(state.draft).toEqual(lineDraft);
    expect(state.shapes).toHaveLength(0);

    // 2. Update draft
    const updatedDraft: Shape = {
      ...lineDraft,
      x2: 100,
      y2: 80,
    };
    state = drawingReducer(state, { type: "UPDATE_DRAFT", shape: updatedDraft });
    expect((state.draft as LineShape)?.x2).toBe(100);

    // 3. Commit draft
    state = drawingReducer(state, { type: "COMMIT_DRAFT" });
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].id).toBe("line_1");
    expect(state.selectedId).toBe("line_1");
    expect(state.draft).toBeNull();
    expect(state.history.past).toHaveLength(1);

    // 4. Draw second shape (Rectangle)
    const rectDraft: Shape = {
      id: "rect_1",
      type: "rectangle",
      x: 20,
      y: 20,
      width: 80,
      height: 50,
    };
    state = drawingReducer(state, { type: "START_DRAFT", shape: rectDraft });
    state = drawingReducer(state, { type: "COMMIT_DRAFT" });
    expect(state.shapes).toHaveLength(2);
    expect(state.history.past).toHaveLength(2);

    // 5. Undo once
    state = drawingReducer(state, { type: "UNDO" });
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].id).toBe("line_1");
    expect(state.history.future).toHaveLength(1);

    // 6. Undo again
    state = drawingReducer(state, { type: "UNDO" });
    expect(state.shapes).toHaveLength(0);
    expect(state.history.future).toHaveLength(2);

    // 7. Redo once
    state = drawingReducer(state, { type: "REDO" });
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].id).toBe("line_1");

    // 8. Redo again
    state = drawingReducer(state, { type: "REDO" });
    expect(state.shapes).toHaveLength(2);
    expect(state.shapes[1].id).toBe("rect_1");
  });

  it("handles grouping multiple shapes and moving them as a unified entity", () => {
    const s1: Shape = { id: "s1", type: "rectangle", x: 10, y: 10, width: 20, height: 20 };
    const s2: Shape = { id: "s2", type: "line", x1: 50, y1: 50, x2: 100, y2: 100 };

    let state: DrawingState = {
      ...initialDrawingState,
      shapes: [s1, s2],
      selectedId: "s2",
      selectedIds: ["s1", "s2"],
    };

    // 1. Group selected shapes
    state = drawingReducer(state, { type: "GROUP_SELECTED" });
    expect(state.shapes[0].groupId).toBeDefined();
    expect(state.shapes[1].groupId).toBeDefined();
    expect(state.shapes[0].groupId).toBe(state.shapes[1].groupId);

    // 2. Select one shape in the group -> should auto-select all shapes in group
    state = drawingReducer(state, { type: "SELECT", id: "s1" });
    expect(state.selectedIds).toContain("s1");
    expect(state.selectedIds).toContain("s2");

    // 3. Move the group
    state = drawingReducer(state, { type: "MOVE_SELECTED", dx: 30, dy: 15 });
    const movedRect = state.shapes[0] as RectangleShape;
    const movedLine = state.shapes[1] as LineShape;

    expect(movedRect.x).toBe(40); // 10 + 30
    expect(movedRect.y).toBe(25); // 10 + 15
    expect(movedLine.x1).toBe(80); // 50 + 30
    expect(movedLine.y1).toBe(65); // 50 + 15

    // 4. Ungroup
    state = drawingReducer(state, { type: "UNGROUP_SELECTED" });
    expect(state.shapes[0].groupId).toBeUndefined();
    expect(state.shapes[1].groupId).toBeUndefined();
  });

  it("deletes selected shape and handles layer ordering", () => {
    const shapes: Shape[] = [
      { id: "s1", type: "line", x1: 0, y1: 0, x2: 10, y2: 10 },
      { id: "s2", type: "circle", cx: 50, cy: 50, r: 20 },
      { id: "s3", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
    ];

    let state: DrawingState = {
      ...initialDrawingState,
      shapes,
      selectedId: "s2",
      selectedIds: ["s2"],
    };

    // Bring s1 to front
    state = drawingReducer(state, { type: "BRING_TO_FRONT", id: "s1" });
    expect(state.shapes[state.shapes.length - 1].id).toBe("s1");

    // Send s1 to back
    state = drawingReducer(state, { type: "SEND_TO_BACK", id: "s1" });
    expect(state.shapes[0].id).toBe("s1");

    // Delete selected shape (s2)
    state = drawingReducer(state, { type: "DELETE_SELECTED" });
    expect(state.shapes.find((s) => s.id === "s2")).toBeUndefined();
    expect(state.selectedId).toBeNull();
    expect(state.selectedIds).toHaveLength(0);
  });

  it("handles rotating selected shapes live and by delta angles", () => {
    const s1: Shape = { id: "s1", type: "rectangle", x: 10, y: 10, width: 50, height: 30, rotation: 0 };
    let state: DrawingState = {
      ...initialDrawingState,
      shapes: [s1],
      selectedId: "s1",
      selectedIds: ["s1"],
    };

    // Rotate 90° CW
    state = drawingReducer(state, { type: "ROTATE_SELECTED_BY_ANGLE", deltaDeg: 90 });
    expect(state.shapes[0].rotation).toBe(90);

    // Rotate another 90° CW -> 180°
    state = drawingReducer(state, { type: "ROTATE_SELECTED_BY_ANGLE", deltaDeg: 90 });
    expect(state.shapes[0].rotation).toBe(180);

    // Rotate -45° CCW -> 135°
    state = drawingReducer(state, { type: "ROTATE_SELECTED_BY_ANGLE", deltaDeg: -45 });
    expect(state.shapes[0].rotation).toBe(135);
  });

  it("rotates connected groups rigidly around collective centroid without breaking", () => {
    const l1: Shape = { id: "l1", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 };
    const l2: Shape = { id: "l2", type: "line", x1: 100, y1: 0, x2: 50, y2: 80 };

    let state: DrawingState = {
      ...initialDrawingState,
      shapes: [l1, l2],
      selectedId: "l1",
      selectedIds: ["l1", "l2"],
    };

    // Rotate group 90° CW
    state = drawingReducer(state, { type: "ROTATE_SELECTED_BY_ANGLE", deltaDeg: 90 });

    const rotL1 = state.shapes[0] as LineShape;
    const rotL2 = state.shapes[1] as LineShape;

    // Verify shared vertex (100, 0) remains identical between both lines!
    expect(rotL1.x2).toBeCloseTo(rotL2.x1);
    expect(rotL1.y2).toBeCloseTo(rotL2.y1);
  });

  it("preserves manual line drag coordinates and clears stale variables on delete/clear", () => {
    // 1. Suppose a stale variable L1 was previously 308
    let state: DrawingState = {
      ...initialDrawingState,
      variables: {
        L1: { name: "L1", value: 308, unit: "mm" },
      },
    };

    // 2. User draws a brand new line by dragging to 150px
    const lineDraft: Shape = {
      id: "new_line",
      type: "line",
      x1: 50,
      y1: 50,
      x2: 200, // length = 150
      y2: 50,
    };

    state = drawingReducer(state, { type: "START_DRAFT", shape: lineDraft });
    state = drawingReducer(state, { type: "COMMIT_DRAFT" });

    // Verify it stays 150px and DOES NOT adjust to 308!
    const committed = state.shapes[0] as LineShape;
    const len = Math.hypot(committed.x2 - committed.x1, committed.y2 - committed.y1);
    expect(len).toBe(150);
    expect(state.variables["L1"].value).toBe(150);

    // 3. User deletes the shape
    state = drawingReducer(state, { type: "DELETE_SELECTED" });
    expect(state.shapes).toHaveLength(0);
    // Variable L1 must be deleted!
    expect(state.variables["L1"]).toBeUndefined();

    // 4. CLEAR_ALL clears variables too
    state = {
      ...state,
      variables: { L2: { name: "L2", value: 308, unit: "mm" } },
      shapes: [{ id: "temp", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 }],
    };
    state = drawingReducer(state, { type: "CLEAR_ALL" });
    expect(state.shapes).toHaveLength(0);
    expect(Object.keys(state.variables)).toHaveLength(0);
  });

  it("handles AutoCAD Move tool selection and displacement offset", () => {
    let state = drawingReducer(initialDrawingState, { type: "SET_TOOL", tool: "move" });
    expect(state.tool).toBe("move");

    const rect: RectangleShape = {
      id: "rect_move_1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 50,
      height: 30,
    };
    state = {
      ...state,
      shapes: [rect],
      selectedId: "rect_move_1",
      selectedIds: ["rect_move_1"],
    };

    // Displace by offset (dx: 45, dy: -25)
    state = drawingReducer(state, { type: "MOVE_SELECTED", dx: 45, dy: -25 });
    const moved = state.shapes[0] as RectangleShape;
    expect(moved.x).toBe(145);
    expect(moved.y).toBe(75);
    expect(moved.width).toBe(50);
    expect(moved.height).toBe(30);

    // Switch back to select tool
    state = drawingReducer(state, { type: "SET_TOOL", tool: "select" });
    expect(state.tool).toBe("select");
  });
});
