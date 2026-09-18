/**
 * The CAD document inside the drafting reducer: components insert, edit,
 * refuse, undo, move and delete as whole objects; layers, annotations and the
 * project record ride the same history.
 */

import { describe, it, expect } from "vitest";
import { drawingReducer, initialDrawingState, type DrawingAction, type DrawingState } from "@/lib/state/drawingReducer";
import { levelAt } from "@/lib/cad/types";
import { resolveAnchor, indexShapes } from "@/lib/cad/geometry";
import { measureDimension } from "@/lib/cad/annotationPrims";
import type { LevelAnnotation, DimensionAnnotation } from "@/lib/cad/types";

function run(actions: DrawingAction[], from: DrawingState = initialDrawingState): DrawingState {
  return actions.reduce((s, a) => drawingReducer(s, a), from);
}

const insertBox: DrawingAction = { type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.section", at: { x: 0, y: 0 }, values: { CellCount: 2 } };

describe("components in the drawing", () => {
  it("inserts, regenerates on a value change, and keeps entity ids stable", () => {
    const s1 = run([insertBox]);
    expect(s1.cad.components).toHaveLength(1);
    const id = s1.cad.components[0].id;
    const shapes1 = s1.shapes.filter((s) => s.componentInstanceId === id);
    expect(shapes1.length).toBeGreaterThan(10);
    expect(s1.cad.annotations.some((a) => a.componentInstanceId === id && a.type === "hatch")).toBe(true);
    expect(s1.history.past.length).toBe(1);

    const s2 = run([{ type: "CAD_SET_COMPONENT_VALUES", instanceId: id, values: { ClearSpan: 3500 } }], s1);
    const shapes2 = s2.shapes.filter((s) => s.componentInstanceId === id);
    // Same topology → the same ids, one for one.
    expect(shapes2.map((s) => s.id).sort()).toEqual(shapes1.map((s) => s.id).sort());
    expect(s2.cad.componentNotice?.ok).toBe(true);
  });

  it("refuses an impossible value and changes nothing", () => {
    const s1 = run([insertBox]);
    const id = s1.cad.components[0].id;
    const s2 = run([{ type: "CAD_SET_COMPONENT_VALUES", instanceId: id, values: { HaunchSize: 2000 } }], s1);
    expect(s2.shapes).toBe(s1.shapes);
    expect(s2.cad.components[0].values.HaunchSize).toBeUndefined();
    expect(s2.cad.componentNotice?.ok).toBe(false);
    expect(s2.cad.componentNotice?.message).toMatch(/Nothing was changed/);
    expect(s2.history.past.length).toBe(s1.history.past.length);
  });

  it("refuses a value the component does not have", () => {
    const s1 = run([insertBox]);
    const s2 = run([{ type: "CAD_SET_COMPONENT_VALUES", instanceId: s1.cad.components[0].id, values: { Nonsense: 1 } }], s1);
    expect(s2.cad.componentNotice?.ok).toBe(false);
    expect(s2.shapes).toBe(s1.shapes);
  });

  it("undo restores geometry, annotations and values together", () => {
    const s1 = run([insertBox]);
    const id = s1.cad.components[0].id;
    const s2 = run([{ type: "CAD_SET_COMPONENT_VALUES", instanceId: id, values: { CellCount: 4 } }], s1);
    expect(s2.shapes.length).toBeGreaterThan(s1.shapes.length);
    const s3 = run([{ type: "UNDO" }], s2);
    expect(s3.shapes).toEqual(s1.shapes);
    expect(s3.cad.components[0].values).toEqual(s1.cad.components[0].values);
    expect(s3.cad.annotations.length).toBe(s1.cad.annotations.length);
    const s4 = run([{ type: "REDO" }], s3);
    expect(s4.cad.components[0].values.CellCount).toBe(4);
  });

  it("selecting any line of a component selects the whole component; moving it moves its annotations too", () => {
    const s1 = run([insertBox]);
    const id = s1.cad.components[0].id;
    const one = s1.shapes.find((s) => s.componentInstanceId === id)!;
    const s2 = run([{ type: "SELECT", id: one.id }], s1);
    expect(s2.selectedIds.length).toBe(s1.shapes.filter((s) => s.componentInstanceId === id).length);
    const s3 = run([{ type: "MOVE_SELECTED", dx: 1000, dy: 500 }], s2);
    expect(s3.cad.components[0].x).toBe(s1.cad.components[0].x + 1000);
    expect(s3.cad.components[0].y).toBe(s1.cad.components[0].y + 500);
    // A regeneration at the new origin gives the same geometry as the translation.
    const regen = run([{ type: "CAD_UPDATE_COMPONENT", instanceId: id, patch: {} }], s3);
    const byId = new Map(regen.shapes.map((s) => [s.id, s]));
    for (const s of s3.shapes.filter((x) => x.componentInstanceId === id)) {
      const r = byId.get(s.id)!;
      if (s.type === "line" && r.type === "line") {
        expect(r.x1).toBeCloseTo(s.x1, 6);
        expect(r.y1).toBeCloseTo(s.y1, 6);
      }
    }
  });

  it("an instance at true levels only moves sideways", () => {
    const s1 = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.gad", at: { x: 0, y: 0 } }]);
    expect(s1.cad.components[0].absoluteElevation).toBe(true);
    const ids = s1.shapes.filter((s) => s.componentInstanceId).map((s) => s.id);
    const s2 = run([{ type: "SELECT_MULTIPLE", ids }, { type: "MOVE_SELECTED", dx: 500, dy: 800 }], s1);
    expect(s2.cad.components[0].y).toBe(s1.cad.components[0].y);
    const a = s1.shapes.find((s) => s.id === ids[0])!;
    const b = s2.shapes.find((s) => s.id === ids[0])!;
    if (a.type === "line" && b.type === "line") expect(b.y1).toBe(a.y1);
  });

  it("grips and UPDATE_SHAPE cannot edit component geometry", () => {
    const s1 = run([insertBox]);
    const line = s1.shapes.find((s) => s.componentInstanceId && s.type === "line")!;
    const s2 = run([{ type: "UPDATE_SHAPE", id: line.id, updates: { x1: 99999 } }], s1);
    expect(s2).toBe(s1);
    const s3 = run([{ type: "RESIZE_SHAPES", updatedShapes: [{ ...line, x1: 12345 } as typeof line] }], s1);
    expect(s3.shapes.find((s) => s.id === line.id)).toEqual(line);
  });

  it("delete removes the whole component with its annotations", () => {
    const s1 = run([insertBox]);
    const one = s1.shapes.find((s) => s.componentInstanceId)!;
    const s2 = run([{ type: "SELECT", id: one.id }, { type: "DELETE_SELECTED" }], s1);
    expect(s2.cad.components).toHaveLength(0);
    expect(s2.shapes.some((s) => s.componentInstanceId)).toBe(false);
    expect(s2.cad.annotations.some((a) => a.componentInstanceId)).toBe(false);
  });

  it("the authoring solver's write-back keeps component geometry", () => {
    const s1 = run([insertBox]);
    const s2 = run([{ type: "APPLY_SOLVED_SHAPES", shapes: [] }], s1);
    expect(s2.shapes.filter((s) => s.componentInstanceId).length).toBe(s1.shapes.filter((s) => s.componentInstanceId).length);
  });

  it("the first assembly sets an annotation scale that suits an A1 sheet", () => {
    const s1 = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } }]);
    expect(s1.cad.settings.annotationScale).toBeGreaterThanOrEqual(100);
    expect(s1.cad.componentNotice?.message).toMatch(/Annotation scale set to 1:/);
  });
});

describe("level consistency — guide acceptance test 3", () => {
  it("changing rail level moves every rail-level marker; HFL markers stay", () => {
    const s1 = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } }]);
    const id = s1.cad.components[0].id;
    const read = (s: DrawingState, label: RegExp) =>
      s.cad.annotations
        .filter((a): a is LevelAnnotation => a.type === "level" && label.test(a.label))
        .map((a) => levelAt(resolveAnchor(a.at, indexShapes(s.shapes))!.y, s.cad.settings));
    expect(read(s1, /RAIL/).every((v) => Math.abs(v - 106.5) < 1e-6)).toBe(true);
    const s2 = run([{ type: "CAD_SET_COMPONENT_VALUES", instanceId: id, values: { RailLevel: 107.25 } }], s1);
    const rail = read(s2, /RAIL/);
    expect(rail.length).toBeGreaterThanOrEqual(2);
    expect(rail.every((v) => Math.abs(v - 107.25) < 1e-6)).toBe(true);
    expect(read(s2, /H\.F\.L/).every((v) => Math.abs(v - 102.6) < 1e-6)).toBe(true);
  });
});

describe("annotations and layers", () => {
  it("an associative dimension follows the line it measures", () => {
    const line = { id: "L1", type: "line" as const, x1: 0, y1: 0, x2: 1000, y2: 0 };
    const s1 = run([
      { type: "ADD_SHAPE", shape: line },
      { type: "CAD_ADD_ANNOTATION", annotation: { id: "D1", type: "dimension", kind: "linear", axis: "x", p1: { kind: "shape", shapeId: "L1", handle: "start" }, p2: { kind: "shape", shapeId: "L1", handle: "end" }, offset: -300, mode: "reference" } },
    ]);
    const d = s1.cad.annotations[0] as DimensionAnnotation;
    expect(measureDimension(d, { shapes: indexShapes(s1.shapes), settings: s1.cad.settings })!.value).toBe(1000);
    const s2 = run([{ type: "EDIT_SHAPES", update: [{ ...line, x2: 2500 }], description: "stretch" }], s1);
    expect(measureDimension(d, { shapes: indexShapes(s2.shapes), settings: s2.cad.settings })!.value).toBe(2500);
  });

  it("new geometry goes on the current layer; LAYMCH moves free entities but not component ones", () => {
    const s1 = run([{ type: "CAD_SET_CURRENT_LAYER", id: "BRG-HIDDEN" }, { type: "ADD_SHAPE", shape: { id: "L2", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 } }, insertBox]);
    expect(s1.shapes.find((s) => s.id === "L2")!.layerId).toBe("BRG-HIDDEN");
    const comp = s1.shapes.find((s) => s.componentInstanceId)!;
    const s2 = run([{ type: "CAD_SET_ENTITY_LAYER", ids: ["L2", comp.id], layerId: "BRG-CENTRE" }], s1);
    expect(s2.shapes.find((s) => s.id === "L2")!.layerId).toBe("BRG-CENTRE");
    expect(s2.shapes.find((s) => s.id === comp.id)!.layerId).toBe(comp.layerId);
  });

  it("deleting a layer moves its entities to layer 0", () => {
    const s1 = run([{ type: "CAD_ADD_LAYER", layer: { name: "my work" }, makeCurrent: true }, { type: "ADD_SHAPE", shape: { id: "L3", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 } }]);
    expect(s1.cad.currentLayerId).toBe("MY-WORK");
    const s2 = run([{ type: "CAD_DELETE_LAYER", id: "MY-WORK" }], s1);
    expect(s2.shapes.find((s) => s.id === "L3")!.layerId).toBe("0");
    expect(s2.cad.layers.some((l) => l.id === "MY-WORK")).toBe(false);
  });
});
