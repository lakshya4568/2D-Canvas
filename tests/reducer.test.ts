import { describe, it, expect } from "vitest";
import {
  drawingReducer,
  initialDrawingState,
  DrawingState,
} from "@/lib/state/drawingReducer";
import { Shape, LineShape } from "@/lib/geometry/types";

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
    expect(state.history.past).toHaveLength(1); // One undo step recorded

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

  it("moves selected shape and commits move to history", () => {
    const initialShapes: Shape[] = [
      { id: "rect_1", type: "rectangle", x: 10, y: 10, width: 50, height: 50 },
    ];
    let state: DrawingState = {
      ...initialDrawingState,
      shapes: initialShapes,
      selectedId: "rect_1",
    };

    // Record snapshot before drag
    state = drawingReducer(state, {
      type: "RECORD_PRE_MOVE_SNAPSHOT",
      shapes: initialShapes,
    });

    // Move
    state = drawingReducer(state, {
      type: "MOVE_SELECTED",
      dx: 25,
      dy: 15,
    });

    expect(state.shapes[0].type === "rectangle" && (state.shapes[0] as any).x).toBe(35);
    expect(state.shapes[0].type === "rectangle" && (state.shapes[0] as any).y).toBe(25);

    // Undo should restore pre-move position
    state = drawingReducer(state, { type: "UNDO" });
    expect(state.shapes[0].type === "rectangle" && (state.shapes[0] as any).x).toBe(10);
    expect(state.shapes[0].type === "rectangle" && (state.shapes[0] as any).y).toBe(10);
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
  });
});
