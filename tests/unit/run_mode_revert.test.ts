import { describe, it, expect } from "vitest";
import { begin, acceptAllDetected, choose, nestedRectangles, Session } from "../upce/fixtures";
import { regenerate } from "@/lib/upce/document";
import type { RectangleShape } from "@/lib/geometry/types";
import type { AuthoringSketch } from "@/lib/upce/types";

function rect(session: Session, id: string): RectangleShape {
  const sh = session.shapes.find((x) => x.id === id);
  if (!sh || sh.type !== "rectangle") throw new Error(`expected rectangle ${id}`);
  return sh as RectangleShape;
}

describe("Run Mode parameter rejection and undo flow", () => {
  it("rejects an impossible dimension that violates geometric invariants and preserves state", () => {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Keep both left and right gaps equal");
    s = choose(s, "Keep both top and bottom gaps equal");

    const before = rect(s, "R2");
    expect(s.sketch.parameters.WallThickness).toBeDefined();
    const originalThickness = s.sketch.parameters.WallThickness.value;

    // A wall thicker than half the frame (2600 mm on 2400 mm height) turns the opening inside out
    const probe = {
      ...s.sketch,
      parameters: {
        ...s.sketch.parameters,
        WallThickness: { ...s.sketch.parameters.WallThickness, value: 2600 },
      },
    };

    const result = regenerate(s.shapes, probe, { shapeNames: s.names });

    // 1. Solver rejects with explanatory error
    expect(result.rejection).toBeDefined();
    expect(result.rejection).toMatch(/Nothing was changed/);

    // 2. Geometry remains intact from before the edit
    const after = result.shapes.find((sh) => sh.id === "R2") as RectangleShape;
    expect(after.width).toBeCloseTo(before.width, 1);

    // 3. The original sketch parameter was not mutated
    expect(s.sketch.parameters.WallThickness.value).toBe(originalThickness);

    // 4. Valid update succeeds
    const validProbe = {
      ...s.sketch,
      parameters: {
        ...s.sketch.parameters,
        WallThickness: { ...s.sketch.parameters.WallThickness, value: 200 },
      },
    };
    const validResult = regenerate(s.shapes, validProbe, { shapeNames: s.names });
    expect(validResult.rejection).toBeUndefined();
    expect(validResult.sketch.parameters.WallThickness.value).toBe(200);
  });

  it("simulates upceContext commit, error notification, and undoIntent rollback", () => {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Keep both left and right gaps equal");
    s = choose(s, "Keep both top and bottom gaps equal");

    interface MockState {
      sketch: AuthoringSketch;
      past: AuthoringSketch[];
      notice: { kind: string; text: string } | null;
    }

    let state: MockState = {
      sketch: s.sketch,
      past: [],
      notice: null,
    };

    const setParameterValue = (name: string, value: number): boolean => {
      const p = state.sketch.parameters[name];
      if (!p) return false;
      const before = state.sketch;
      const next: AuthoringSketch = {
        ...state.sketch,
        parameters: { ...state.sketch.parameters, [name]: { ...p, value } },
      };

      const result = regenerate(s.shapes, next, { shapeNames: s.names });
      if (result.rejection) {
        state = {
          ...state,
          notice: { kind: "error", text: result.rejection },
        };
        return false;
      }

      state = {
        ...state,
        sketch: result.sketch,
        past: [...state.past, before],
        notice: { kind: "ok", text: `${name} = ${value}` },
      };
      return true;
    };

    const undoIntent = () => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return;
      const result = regenerate(s.shapes, previous, { shapeNames: s.names });
      state = {
        ...state,
        sketch: result.rejection ? previous : result.sketch,
        past: state.past.slice(0, -1),
        notice: { kind: "info", text: "Stepped back one design decision." },
      };
    };

    const dismissNotice = () => {
      state = { ...state, notice: null };
    };

    // Step 1: Change WallThickness to valid 200 mm
    const ok1 = setParameterValue("WallThickness", 200);
    expect(ok1).toBe(true);
    expect(state.sketch.parameters.WallThickness.value).toBe(200);
    expect(state.past.length).toBe(1);
    expect(state.notice?.kind).toBe("ok");

    // Step 2: Try changing WallThickness to invalid 2600 mm
    const ok2 = setParameterValue("WallThickness", 2600);
    expect(ok2).toBe(false);
    // Notice receives error, sketch remains at 200, past is unchanged
    expect(state.notice?.kind).toBe("error");
    expect(state.notice?.text).toMatch(/Nothing was changed/);
    expect(state.sketch.parameters.WallThickness.value).toBe(200);
    expect(state.past.length).toBe(1);

    // Step 3: Dismiss notice removes the error banner
    dismissNotice();
    expect(state.notice).toBeNull();

    // Step 4: Undo reverts to the initial WallThickness before Step 1 (300 mm)
    undoIntent();
    expect(state.past.length).toBe(0);
    expect(state.sketch.parameters.WallThickness.value).toBe(300);
    expect(state.notice?.kind).toBe("info");
  });
});
