import { describe, it, expect } from "vitest";
import { TransactionalHistory } from "../../lib/state/transactionalHistory";
import { PersistentState } from "../../lib/state/persistentStore";

describe("100-step Transactional Undo/Redo Engine", () => {
  it("should push, undo, and redo persistent state transactions faithfully", () => {
    const s0: PersistentState = {
      segments: [],
      parameters: [{ id: "p1", name: "Span", type: "DRIVING", value: 300 }],
      constraints: [],
      constructionLines: [],
    };

    const history = new TransactionalHistory(s0, 100);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // Step 1: Change Span to 500
    const s1: PersistentState = {
      ...s0,
      parameters: [{ id: "p1", name: "Span", type: "DRIVING", value: 500 }],
    };
    history.push(s1);

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Undo Step 1 -> returns to s0
    const undone = history.undo();
    expect(undone).not.toBeNull();
    expect(undone?.parameters[0].value).toBe(300);
    expect(history.canRedo()).toBe(true);

    // Redo Step 1 -> returns to s1
    const redone = history.redo();
    expect(redone).not.toBeNull();
    expect(redone?.parameters[0].value).toBe(500);
  });
});
