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
});
