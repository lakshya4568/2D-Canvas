/**
 * A drawing's own parametric component is open, not a sealed block:
 * its entities are selected, deleted and moved one by one; its model (values,
 * formulas, what reads what, what moves what, constraints) is laid out; a
 * worked-out value can be unlinked or its formula rewritten — and all of it
 * stays parametric. Library parts keep block behaviour. Driven through the
 * editor's own reducer.
 */

import { describe, it, expect } from "vitest";
import { drawingReducer, initialDrawingState, type DrawingState } from "@/lib/state/drawingReducer";
import { applyCadAction } from "@/lib/state/cadActions";
import { evaluateInstance, definitionFor } from "@/lib/cad/document";
import { componentModel, entityOfGenerated } from "@/lib/components/model";
import type { ComponentDefinition } from "@/lib/components/types";
import { constructionFromDrawing } from "@/lib/agent/drafter/construction";

/** A plate with four holes: typed sizes, worked-out hole positions. */
const PLATE: ComponentDefinition = {
  id: "drawing.plate",
  name: "Plate",
  category: "assembly",
  semanticType: "drawing",
  view: "elevation",
  description: "test plate",
  version: "1",
  origin: { kind: "drawn" },
  parameters: [
    { name: "PlateWidth", kind: "length", unit: "mm", default: 400 },
    { name: "PlateHeight", kind: "length", unit: "mm", default: 250 },
    { name: "EdgeMargin", kind: "length", unit: "mm", default: 50 },
    { name: "HoleDiameter", kind: "length", unit: "mm", default: 22 },
  ],
  formulas: [
    { name: "HoleRadius", expr: "HoleDiameter / 2", report: true },
    { name: "RightHoleX", expr: "PlateWidth - EdgeMargin", report: true },
    { name: "TopHoleY", expr: "PlateHeight - EdgeMargin", report: true },
  ],
  primitives: [
    { id: "Plate", kind: "loop", role: "general", layer: "outline", points: [[0, 0], ["PlateWidth", 0], ["PlateWidth", "PlateHeight"], [0, "PlateHeight"]] },
    { id: "HoleBL", kind: "circle", role: "general", layer: "outline", center: ["EdgeMargin", "EdgeMargin"], r: "HoleRadius" },
    { id: "HoleBR", kind: "circle", role: "general", layer: "outline", center: ["RightHoleX", "EdgeMargin"], r: "HoleRadius" },
    { id: "HoleTL", kind: "circle", role: "general", layer: "outline", center: ["EdgeMargin", "TopHoleY"], r: "HoleRadius" },
    { id: "HoleTR", kind: "circle", role: "general", layer: "outline", center: ["RightHoleX", "TopHoleY"], r: "HoleRadius" },
  ],
  dimensions: [{ id: "DWidth", kind: "horizontal", from: [0, 0], to: ["PlateWidth", 0], offset: -60, drives: "PlateWidth" }],
  hatches: [{ id: "PlateHatch", boundary: "Plate", material: "steel" }],
  invariants: [{ id: "c1", expr: "PlateWidth", op: ">", than: "2 * EdgeMargin + HoleDiameter", message: "holes fit across the plate", severity: "error" }],
};

function withPlate(own = true): DrawingState {
  const def = own ? PLATE : { ...PLATE, origin: undefined };
  let state: DrawingState = { ...initialDrawingState, cad: { ...initialDrawingState.cad, definitions: [def] } };
  state = drawingReducer(state, { type: "CAD_INSERT_COMPONENT", definitionId: def.id, at: { x: 0, y: 0 }, absoluteElevation: false } as never);
  return state;
}
const inst = (s: DrawingState) => s.cad.components[0];
const shapesOf = (s: DrawingState, entity: string) => s.shapes.filter((x) => x.componentInstanceId === inst(s).id && entityOfGenerated(x.id, inst(s).id) === entity);
const ev = (s: DrawingState) => evaluateInstance(inst(s), s.cad)!.evaluation;

describe("the model laid open", () => {
  it("lists values, formulas with their expressions, what reads what and what moves what", () => {
    const s = withPlate();
    const m = componentModel(definitionFor(s.cad, PLATE.id)!, inst(s), ev(s));
    const v = (n: string) => m.values.find((x) => x.name === n)!;
    expect(v("RightHoleX")).toMatchObject({ kind: "formula", expr: "PlateWidth - EdgeMargin", dependsOn: ["PlateWidth", "EdgeMargin"], roots: ["PlateWidth", "EdgeMargin"], value: 350 });
    expect(v("PlateWidth").usedBy).toEqual(["RightHoleX"]);
    // PlateWidth moves the plate, the two right holes, the width dimension and the hatch.
    expect(v("PlateWidth").drives.sort()).toEqual(["DWidth", "HoleBR", "HoleTR", "Plate", "PlateHatch"]);
    expect(v("HoleDiameter").drives.sort()).toEqual(["HoleBL", "HoleBR", "HoleTL", "HoleTR"]);
    const hole = m.entities.find((e) => e.id === "HoleTR")!;
    expect(hole).toMatchObject({ kind: "circle", points: [{ x: "RightHoleX", y: "TopHoleY" }], r: "HoleRadius" });
    expect(hole.roots.sort()).toEqual(["EdgeMargin", "HoleDiameter", "PlateHeight", "PlateWidth"]);
    expect(m.entities.find((e) => e.id === "DWidth")!.drives).toBe("PlateWidth");
    expect(m.constraints).toEqual([expect.objectContaining({ expr: "PlateWidth", op: ">", ok: true })]);
  });
});

describe("selection is open for a drawing's own component", () => {
  it("clicking one hole selects that hole, not the whole plate", () => {
    let s = withPlate();
    const hole = shapesOf(s, "HoleTR")[0];
    s = drawingReducer(s, { type: "SELECT", id: hole.id } as never);
    expect(s.selectedIds).toEqual([hole.id]);
    // One edge of the outline selects the outline (as a polyline does), nothing else.
    const edge = shapesOf(s, "Plate")[0];
    s = drawingReducer(s, { type: "SELECT", id: edge.id } as never);
    expect(new Set(s.selectedIds)).toEqual(new Set(shapesOf(s, "Plate").map((x) => x.id)));
    // A window around one hole picks that hole.
    s = drawingReducer(s, { type: "SELECT_MULTIPLE", ids: [shapesOf(s, "HoleBL")[0].id] } as never);
    expect(s.selectedIds).toEqual([shapesOf(s, "HoleBL")[0].id]);
  });

  it("a library part is still selected whole", () => {
    let s = withPlate(false);
    s = drawingReducer(s, { type: "SELECT", id: shapesOf(s, "HoleTR")[0].id } as never);
    expect(s.selectedIds.length).toBe(s.shapes.filter((x) => x.componentInstanceId).length);
  });
});

describe("editing one entity keeps the model parametric", () => {
  it("Delete removes just the selected hole; the rest still follows its values", () => {
    let s = withPlate();
    s = drawingReducer(s, { type: "SELECT", id: shapesOf(s, "HoleTR")[0].id } as never);
    s = drawingReducer(s, { type: "DELETE_SELECTED" } as never);
    expect(s.cad.components).toHaveLength(1);
    expect(definitionFor(s.cad, PLATE.id)!.primitives!.map((p) => p.id)).toEqual(["Plate", "HoleBL", "HoleBR", "HoleTL"]);
    expect(shapesOf(s, "HoleTR")).toHaveLength(0);
    s = drawingReducer(s, { type: "CAD_SET_COMPONENT_VALUES", instanceId: inst(s).id, values: { PlateWidth: 600 } } as never);
    expect(ev(s).circles.find((c) => c.primitiveId === "HoleBR")!.center.x).toBeCloseTo(550, 6);
  });

  it("deleting an outline takes its hatch with it", () => {
    let s = withPlate();
    s = drawingReducer(s, { type: "SELECT", id: shapesOf(s, "Plate")[0].id } as never);
    s = drawingReducer(s, { type: "DELETE_SELECTED" } as never);
    const def = definitionFor(s.cad, PLATE.id)!;
    expect(def.primitives!.some((p) => p.id === "Plate")).toBe(false);
    expect(def.hatches).toEqual([]);
  });

  it("moving one hole gives it named shift values and it still follows the plate", () => {
    let s = withPlate();
    const r = applyCadAction(s.shapes, s.cad, { type: "CAD_EDIT_DEFINITION", instanceId: inst(s).id, edit: { op: "offset", ids: ["HoleTR"], dx: -30, dy: 10 } })!;
    s = { ...s, shapes: r.shapes, cad: r.cad };
    const def = definitionFor(s.cad, PLATE.id)!;
    expect(def.parameters.map((p) => p.name)).toContain("HoleTRShiftX");
    expect(ev(s).circles.find((c) => c.primitiveId === "HoleTR")!.center).toMatchObject({ x: 320, y: 210 });
    // Still parametric: a wider plate carries the moved hole along, shift kept.
    s = drawingReducer(s, { type: "CAD_SET_COMPONENT_VALUES", instanceId: inst(s).id, values: { PlateWidth: 500, HoleTRShiftX: 0 } } as never);
    expect(ev(s).circles.find((c) => c.primitiveId === "HoleTR")!.center.x).toBeCloseTo(450, 6);
    expect(ev(s).circles.find((c) => c.primitiveId === "HoleBL")!.center.x).toBeCloseTo(50, 6);
  });

  it("a moved selection through the Move command does the same", () => {
    let s = withPlate();
    s = drawingReducer(s, { type: "SELECT", id: shapesOf(s, "HoleBL")[0].id } as never);
    s = drawingReducer(s, { type: "MOVE_SELECTED", dx: 20, dy: -15 } as never);
    // Canvas y is down: -15 on the canvas is +15 up in the component.
    expect(ev(s).circles.find((c) => c.primitiveId === "HoleBL")!.center).toMatchObject({ x: 70, y: 65 });
    expect(inst(s).x).toBe(0);
  });

  it("unlinks a worked-out value into a typed one, and rewrites a formula", () => {
    let s = withPlate();
    const run = (edit: never) => {
      const r = applyCadAction(s.shapes, s.cad, { type: "CAD_EDIT_DEFINITION", instanceId: inst(s).id, edit })!;
      s = { ...s, shapes: r.shapes, cad: r.cad };
      return r.cad.componentNotice!;
    };
    expect(run({ op: "formula", name: "RightHoleX", expr: "PlateWidth - 2 * EdgeMargin" } as never).ok).toBe(true);
    expect(ev(s).scope.RightHoleX).toBe(300);
    expect(run({ op: "unlink", name: "TopHoleY", value: 200 } as never).ok).toBe(true);
    const def = definitionFor(s.cad, PLATE.id)!;
    expect(def.parameters.find((p) => p.name === "TopHoleY")?.default).toBe(200);
    expect(def.formulas!.some((f) => f.name === "TopHoleY")).toBe(false);
    // A rewrite that breaks the drawing is refused whole.
    const bad = run({ op: "formula", name: "RightHoleX", expr: "Nope + 1" } as never);
    expect(bad.ok).toBe(false);
    expect(ev(s).scope.RightHoleX).toBe(300);
    // So is one that breaks a constraint.
    s = drawingReducer(s, { type: "CAD_SET_COMPONENT_VALUES", instanceId: inst(s).id, values: { EdgeMargin: 190 } } as never);
    expect(s.cad.componentNotice?.ok).toBe(false);
    expect(s.cad.componentNotice?.message).toMatch(/holes fit across the plate/);
  });

  it("a library part's entities are not edited one by one", () => {
    const s = withPlate(false);
    const r = applyCadAction(s.shapes, s.cad, { type: "CAD_EDIT_DEFINITION", instanceId: inst(s).id, edit: { op: "remove", ids: ["HoleTR"] } })!;
    expect(r.cad.componentNotice?.ok).toBe(false);
    expect(r.cad.componentNotice?.message).toMatch(/library part/);
  });
});

describe("the agent takes up the edited drawing", () => {
  it("its plan follows what a person changed in the definition", () => {
    let s = withPlate();
    const plan = { route: "construction", analysis: "a plate", frame: "", values: PLATE.parameters.map((p) => ({ name: p.name, expr: String(p.default), unit: "mm" })).concat(PLATE.formulas!.map((f) => ({ name: f.name, expr: String(f.expr), unit: "mm" }))), checks: [], constraints: [], features: [{ name: "Plate", description: "" }], expect: { dimensions: [], levels: [], texts: [], disputed: [] } };
    s = { ...s, cad: { ...s.cad, definitions: s.cad.definitions!.map((d) => ({ ...d, origin: { kind: "drawn" as const, construction: { plan, tags: { Plate: "Plate", HoleTR: "Plate" } } } })) } };
    const r = applyCadAction(s.shapes, s.cad, { type: "CAD_EDIT_DEFINITION", instanceId: inst(s).id, edit: { op: "unlink", name: "TopHoleY", value: 200 } })!;
    s = { ...s, shapes: r.shapes, cad: r.cad };
    s = drawingReducer(s, { type: "CAD_SET_COMPONENT_VALUES", instanceId: inst(s).id, values: { PlateWidth: 450 } } as never);
    const c = constructionFromDrawing(s.cad)!;
    const v = (n: string) => c.plan!.values.find((x) => x.name === n);
    expect(v("TopHoleY")?.expr).toBe("200");
    expect(v("PlateWidth")?.expr).toBe("450");
    expect(v("RightHoleX")?.expr).toBe("PlateWidth - EdgeMargin");
  });
});
