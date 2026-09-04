import { describe, it, expect } from "vitest";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";
import { RectangleShape, CircleShape } from "../../lib/geometry/types";

describe("Hierarchical Grouping Engine & Structural Rigidity", () => {
  it("should create hierarchical nested groups and preserve structural rigidity when moved", () => {
    const col: RectangleShape = {
      id: "col_1",
      name: "Pier Column",
      type: "rectangle",
      x: 200,
      y: 200,
      width: 60,
      height: 180,
    };

    const cap: RectangleShape = {
      id: "cap_1",
      name: "Pier Cap",
      type: "rectangle",
      x: 180,
      y: 180,
      width: 100,
      height: 20,
    };

    const footing: RectangleShape = {
      id: "footing_1",
      name: "Footing",
      type: "rectangle",
      x: 160,
      y: 380,
      width: 140,
      height: 40,
    };

    // 1. Initial State
    let state = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: [col, cap, footing],
    });

    // 2. Group col + cap into "Pier Sub-Assembly"
    state = drawingReducer(state, {
      type: "SELECT_MULTIPLE",
      ids: ["col_1", "cap_1"],
    });
    state = drawingReducer(state, {
      type: "GROUP_SELECTED",
    });

    const subGroupId = state.shapes.find((s) => s.id === "col_1")?.groupId;
    expect(subGroupId).toBeDefined();

    // Rename sub-group
    state = drawingReducer(state, {
      type: "RENAME_GROUP",
      groupId: subGroupId!,
      newName: "Pier Sub-Assembly",
    });
    expect(state.shapes.find((s) => s.id === "col_1")?.groupName).toBe("Pier Sub-Assembly");

    // 3. Now nested-group: Select the Pier Sub-Assembly + Footing and Group them into "Entire Pier Pier"
    state = drawingReducer(state, {
      type: "SELECT_MULTIPLE",
      ids: ["col_1", "cap_1", "footing_1"],
    });
    state = drawingReducer(state, {
      type: "GROUP_SELECTED",
    });

    const rootGroupId = state.shapes.find((s) => s.id === "footing_1")?.groupId;
    expect(rootGroupId).toBeDefined();
    expect(rootGroupId).not.toBe(subGroupId);

    // Verify nested groupPath in col_1
    const colShape = state.shapes.find((s) => s.id === "col_1");
    expect(colShape?.groupPath).toBeDefined();
    expect(colShape?.groupPath).toHaveLength(2); // [rootGroupId, subGroupId]
    expect(colShape?.groupPath?.[0]).toBe(rootGroupId);
    expect(colShape?.groupPath?.[1]).toBe(subGroupId);

    // 4. Test Structural Rigidity:
    // Move selected group by dx: +50, dy: +100
    state = drawingReducer(state, {
      type: "MOVE_SELECTED",
      dx: 50,
      dy: 100,
    });

    const movedCol = state.shapes.find((s) => s.id === "col_1") as RectangleShape;
    const movedCap = state.shapes.find((s) => s.id === "cap_1") as RectangleShape;
    const movedFooting = state.shapes.find((s) => s.id === "footing_1") as RectangleShape;

    // Verify all moved as a rigid body
    expect(movedCol.x).toBe(250);
    expect(movedCol.y).toBe(300);
    expect(movedCap.x).toBe(230);
    expect(movedCap.y).toBe(280);
    expect(movedFooting.x).toBe(210);
    expect(movedFooting.y).toBe(480);

    // Relative distance invariant:
    expect(movedCol.x - movedCap.x).toBe(20);
    expect(movedCol.y - movedCap.y).toBe(20);
    expect(movedFooting.y - movedCol.y).toBe(180);

    // 5. Test Lock & Visibility
    state = drawingReducer(state, {
      type: "TOGGLE_GROUP_LOCK",
      groupId: rootGroupId!,
    });
    expect(state.shapes.every((s) => s.isLocked)).toBe(true);

    state = drawingReducer(state, {
      type: "TOGGLE_GROUP_VISIBILITY",
      groupId: rootGroupId!,
    });
    expect(state.shapes.every((s) => s.isVisible === false)).toBe(true);

    // 6. Test Ungrouping: ungroups top level, preserves subGroupId
    state = drawingReducer(state, {
      type: "UNGROUP_SELECTED",
    });
    const colAfterUngroup = state.shapes.find((s) => s.id === "col_1");
    expect(colAfterUngroup?.groupId).toBe(subGroupId);
    expect(colAfterUngroup?.groupPath).toHaveLength(1);
  });
});
