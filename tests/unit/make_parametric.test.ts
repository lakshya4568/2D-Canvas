/**
 * The manual route: a box culvert section drawn by hand — plain lines, a
 * rectangle, a polyline opening with haunches, tagged level lines, linear
 * dimensions, a level marker, an "EARTH CUSHION" note and a "HAUNCH 600 X
 * 600mm" callout — is made parametric, then its values are changed.
 */

import { describe, it, expect } from "vitest";
import type { LineShape, RectangleShape, Shape } from "@/lib/geometry/types";
import type { Annotation } from "@/lib/cad/types";
import { emptyCadDoc, evaluateInstance, type CadDocState } from "@/lib/cad/document";
import { applyCadAction, parametricSelection, planFor } from "@/lib/state/cadActions";
import { annotationPrims } from "@/lib/cad/annotationPrims";
import { indexShapes } from "@/lib/cad/geometry";
import { nameFromWords } from "@/lib/components/fromDrawing";

/** Canvas y of an elevation in mm (datum RL 0). */
const Y = (elev: number) => -elev;

function line(id: string, x1: number, e1: number, x2: number, e2: number, extra: Partial<LineShape> = {}): LineShape {
  return { id, type: "line", x1, y1: Y(e1), x2, y2: Y(e2), layerId: "BRG-OUTLINE", ...extra } as LineShape;
}

function drawing(): { shapes: Shape[]; cad: CadDocState } {
  const cad = emptyCadDoc();
  cad.settings = { ...cad.settings, annotationScale: 100 };
  const op: [number, number][] = [
    [-4750, 95950],
    [4750, 95950],
    [5350, 96550],
    [5350, 99600],
    [4750, 100200],
    [-4750, 100200],
    [-5350, 99600],
    [-5350, 96550],
  ];
  const opening = op.map((p, i) => line(`op${i}`, p[0], p[1], op[(i + 1) % 8][0], op[(i + 1) % 8][1], { groupId: "opening", semanticRole: "clear_opening" }));
  const box: RectangleShape = { id: "box", type: "rectangle", x: -5700, y: Y(101000), width: 11400, height: 5850, layerId: "BRG-OUTLINE", semanticRole: "concrete_section" } as RectangleShape;
  const shapes: Shape[] = [
    line("cl", 0, 106500, 0, 94000, { layerId: "BRG-CENTRE", semanticRole: "bridge_centreline", isReference: true }),
    box,
    ...opening,
    line("bed", -12000, 96100, -5700, 96100, { layerId: "BRG-LEVEL", semanticRole: "bed_level", isReference: true }),
    line("hfl", -12000, 96800, 5700, 96800, { layerId: "BRG-WATER", semanticRole: "HFL", isReference: true }),
    line("form", -12000, 105000, -5700, 105000, { layerId: "BRG-LEVEL", semanticRole: "formation_level", isReference: true }),
    line("c1", -5700, 101000, -5700, 105000, { groupId: "cushion", semanticRole: "earth_cushion", layerId: "BRG-HIDDEN" }),
    line("c2", -5700, 105000, 5700, 105000, { groupId: "cushion", semanticRole: "earth_cushion", layerId: "BRG-HIDDEN" }),
    line("c3", 5700, 105000, 5700, 101000, { groupId: "cushion", semanticRole: "earth_cushion", layerId: "BRG-HIDDEN" }),
  ];
  const P = (x: number, e: number) => ({ kind: "point" as const, x, y: Y(e) });
  const ann: Annotation[] = [
    { id: "d_span", type: "dimension", kind: "linear", axis: "x", p1: { kind: "shape", shapeId: "op6", handle: "mid" }, p2: { kind: "shape", shapeId: "op2", handle: "mid" }, offset: 0, mode: "reference", layerId: "BRG-DIM" },
    { id: "d_wl", type: "dimension", kind: "linear", axis: "x", p1: P(-5700, 98075), p2: P(-5350, 98075), offset: 0, mode: "reference", layerId: "BRG-DIM" },
    { id: "d_wr", type: "dimension", kind: "linear", axis: "x", p1: P(5350, 98075), p2: P(5700, 98075), offset: 0, mode: "reference", layerId: "BRG-DIM" },
    { id: "d_top", type: "dimension", kind: "linear", axis: "y", p1: P(-5000, 101000), p2: P(-5000, 100200), offset: 0, mode: "reference", layerId: "BRG-DIM" },
    { id: "d_clear", type: "dimension", kind: "linear", axis: "y", p1: P(3000, 96100), p2: P(3000, 100200), offset: 0, mode: "reference", layerId: "BRG-DIM" },
    { id: "d_cushion", type: "dimension", kind: "linear", axis: "y", p1: P(5700, 101000), p2: P(5700, 105000), offset: 800, mode: "reference", hideValue: true, layerId: "BRG-DIM" },
    { id: "t_cushion", type: "text", at: P(6700, 103500), text: "4000 mm\nEARTH\nCUSHION", height: 2.5, layerId: "BRG-TEXT" },
    { id: "l_haunch", type: "leader", points: [P(-5050, 99900), P(-7200, 102500), P(-11700, 102500)], text: "HAUNCH 600 X 600mm", height: 2.5, placement: "above", layerId: "BRG-LEADER" },
    { id: "lv_top", type: "level", at: P(-11700, 101000), label: "TOP OF SLAB", style: "gad", layerId: "BRG-LEVEL" },
    { id: "lv_bed", type: "level", at: P(-11700, 96100), label: "BED LEVEL", style: "gad", layerId: "BRG-LEVEL" },
    { id: "h_box", type: "hatch", material: "rcc", boundary: { kind: "shapes", shapeIds: ["box"] }, layerId: "BRG-HATCH" },
  ] as Annotation[];
  return { shapes, cad: { ...cad, annotations: ann } };
}

function make(options: Parameters<typeof planFor>[3] = {}) {
  const { shapes, cad } = drawing();
  const r = applyCadAction(shapes, cad, { type: "CAD_MAKE_PARAMETRIC", options: { name: "My box section", ...options } })!;
  return r;
}

const at = (r: { shapes: Shape[] }, pred: (l: LineShape) => boolean) => r.shapes.filter((s): s is LineShape => s.type === "line" && !!s.componentInstanceId && pred(s));

describe("names from notes", () => {
  it("reads a name from a callout's words", () => {
    expect(nameFromWords("850THK. GRANULAR FILLING")).toBe("GranularFilling");
    expect(nameFromWords("150TH. WEARING COURSE")).toBe("WearingCourse");
    expect(nameFromWords("HAUNCH 600 X 600mm")).toBe("Haunch");
    expect(nameFromWords("4000 mm\nEARTH\nCUSHION")).toBe("EarthCushion");
    expect(nameFromWords("TOP OF SLAB")).toBe("TopOfSlab");
  });
});

describe("make parametric — the plan", () => {
  it("finds the inputs, the driving sizes and the results", () => {
    const { shapes, cad } = drawing();
    const plan = planFor(shapes, cad, parametricSelection(shapes, cad), { name: "My box section" });
    expect(plan.mismatches).toEqual([]);
    const params = Object.fromEntries(plan.definition.parameters.map((p) => [p.name, p.default]));
    expect(params).toMatchObject({ BedLevel: 96.1, HFL: 96.8, FormationLevel: 105, ClearSpan: 10700, Haunch: 600 });
    const edge = (key: string) => plan.edges.find((e) => e.key === key)!;
    expect(edge("d_span").role).toBe("symmetric");
    expect(edge("d_wl").role).toBe("drives");
    // Mirror-image walls share one value.
    expect(edge("d_wr").name).toBe(edge("d_wl").name);
    expect(edge("d_top").role).toBe("drives");
    expect(edge("d_clear").role).toBe("drives");
    // Formation is a site level and the box is set from the bed: the cushion closes the loop, so it is a result.
    expect(edge("d_cushion").role).toBe("result");
    expect(edge("d_cushion").name).toBe("EarthCushion");
    expect(plan.levels.find((l) => l.name === "TopOfSlab")).toMatchObject({ input: false, value: 101 });
    expect(plan.linkedTexts.map((t) => t.after)).toEqual(expect.arrayContaining(["{EarthCushion} mm\nEARTH\nCUSHION", "HAUNCH {Haunch} X {Haunch}mm"]));
  });

  it("a person can rename a dimension and turn a size into a result", () => {
    const { shapes, cad } = drawing();
    const plan = planFor(shapes, cad, parametricSelection(shapes, cad), { rename: { d_top: "TopSlab" }, drive: { d_clear: false } });
    expect(plan.definition.parameters.some((p) => p.name === "TopSlab")).toBe(true);
    expect(plan.edges.find((e) => e.key === "d_clear")!.role).toBe("result");
    expect(plan.mismatches).toEqual([]);
  });
});

describe("make parametric — applied", () => {
  it("replaces the free drawing with one component that looks the same", () => {
    const { shapes, cad } = drawing();
    const r = make();
    expect(r.cad.componentNotice?.ok).toBe(true);
    expect(r.cad.components).toHaveLength(1);
    expect(r.shapes.every((s) => s.componentInstanceId)).toBe(true);
    // Every drawn vertex is still there.
    const drawnLines = shapes.filter((s): s is LineShape => s.type === "line");
    for (const l of drawnLines) {
      const hit = r.shapes.some((s) => s.type === "line" && ((Math.hypot(s.x1 - l.x1, s.y1 - l.y1) < 0.5 && Math.hypot(s.x2 - l.x2, s.y2 - l.y2) < 0.5) || (Math.hypot(s.x1 - l.x2, s.y1 - l.y2) < 0.5 && Math.hypot(s.x2 - l.x1, s.y2 - l.y1) < 0.5)));
      expect(hit, l.id).toBe(true);
    }
    expect(r.cad.annotations.filter((a) => !a.componentInstanceId)).toHaveLength(0);
    expect(cad.annotations.length).toBeGreaterThan(0);
  });

  it("a wider span moves the walls, keeps their thickness and the haunch legs", () => {
    const r0 = make();
    const inst = r0.cad.components[0];
    const r = applyCadAction(r0.shapes, r0.cad, { type: "CAD_SET_COMPONENT_VALUES", instanceId: inst.id, values: { ClearSpan: 12000 } })!;
    expect(r.cad.componentNotice?.ok).toBe(true);
    const xs = new Set(r.shapes.filter((s): s is LineShape => s.type === "line").flatMap((l) => [Math.round(l.x1), Math.round(l.x2)]));
    for (const x of [-6350, -6000, -5400, 5400, 6000, 6350]) expect(xs.has(x), String(x)).toBe(true);
    expect(xs.has(5350)).toBe(false);
  });

  it("the haunch callout drives all four haunches, both legs", () => {
    const r0 = make();
    const r = applyCadAction(r0.shapes, r0.cad, { type: "CAD_SET_COMPONENT_VALUES", instanceId: r0.cad.components[0].id, values: { Haunch: 400 } })!;
    expect(r.cad.componentNotice?.ok).toBe(true);
    const diag = at(r, (l) => Math.abs(Math.abs(l.x2 - l.x1) - Math.abs(l.y2 - l.y1)) < 1e-6 && Math.abs(l.x2 - l.x1) > 1);
    expect(diag).toHaveLength(4);
    for (const l of diag) expect(Math.abs(l.x2 - l.x1)).toBeCloseTo(400, 6);
  });

  it("raising the bed level raises the box; the earth cushion result follows", () => {
    const r0 = make();
    const id = r0.cad.components[0].id;
    const r = applyCadAction(r0.shapes, r0.cad, { type: "CAD_SET_COMPONENT_VALUES", instanceId: id, values: { BedLevel: 97.1 } })!;
    const ev = evaluateInstance(r.cad.components[0], r.cad)!.evaluation;
    expect(ev.scope.TopOfSlab).toBeCloseTo(102, 6);
    expect(ev.scope.EarthCushion).toBeCloseTo(3000, 6);
    const ctx = { shapes: indexShapes(r.shapes), settings: r.cad.settings };
    const texts = r.cad.annotations.flatMap((a) => annotationPrims(a, ctx)).filter((p) => p.k === "text").map((p) => (p as { text: string }).text);
    expect(texts).toContain("3000 mm\nEARTH\nCUSHION");
    expect(texts).toContain("TOP OF SLAB = 102.000M.");
  });

  it("refuses a value that would break the drawing, and changes nothing", () => {
    const r0 = make();
    const r = applyCadAction(r0.shapes, r0.cad, { type: "CAD_SET_COMPONENT_VALUES", instanceId: r0.cad.components[0].id, values: { ClearSpan: -5 } })!;
    expect(r.cad.componentNotice?.ok).toBe(false);
    expect(r.shapes).toBe(r0.shapes);
  });

  it("your own relationship drives it", () => {
    const r0 = make({ rename: { d_top: "TopSlab" } });
    const id = r0.cad.components[0].id;
    const r = applyCadAction(r0.shapes, r0.cad, { type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: id, relations: [{ name: "TopSlab", expr: "ClearSpan / 10" }] })!;
    expect(r.cad.componentNotice?.ok).toBe(true);
    const ev = evaluateInstance(r.cad.components[0], r.cad)!.evaluation;
    expect(ev.scope.TopSlab).toBeCloseTo(1070, 6);
    expect(ev.scope.TopOfSlab).toBeCloseTo(100.2 + 1.07, 6);
  });

  it("edit as geometry, then make parametric again: names and relationships survive", () => {
    const r0 = make({ rename: { d_top: "TopSlab" } });
    const inst = r0.cad.components[0];
    const r1 = applyCadAction(r0.shapes, r0.cad, { type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: inst.id, relations: [{ name: "TopSlab", expr: "ClearSpan / 10" }] })!;
    const ex = applyCadAction(r1.shapes, r1.cad, { type: "CAD_EXPLODE_COMPONENT", instanceId: inst.id })!;
    expect(ex.cad.components).toHaveLength(0);
    expect(ex.shapes.every((s) => !s.componentInstanceId)).toBe(true);
    const again = applyCadAction(ex.shapes, ex.cad, { type: "CAD_MAKE_PARAMETRIC", options: { name: "My box section", definitionId: inst.definitionId } })!;
    expect(again.cad.componentNotice?.ok, again.cad.componentNotice?.message).toBe(true);
    const d = again.cad.definitions!.find((x) => x.id === inst.definitionId)!;
    expect(d.parameters.map((p) => p.name)).toEqual(expect.arrayContaining(["ClearSpan", "TopSlab", "Haunch", "BedLevel"]));
    expect(again.cad.components[0].relations).toEqual([{ name: "TopSlab", expr: "ClearSpan / 10" }]);
  });

  it("a library component turned into geometry and back keeps its relationship", () => {
    const r0 = applyCadAction([], emptyCadDoc(), { type: "CAD_INSERT_COMPONENT", definitionId: "ir.rcc_box.half_section", at: { x: 0, y: 0 } })!;
    const id = r0.cad.components[0].id;
    const r1 = applyCadAction(r0.shapes, r0.cad, { type: "CAD_EDIT_COMPONENT_INPUTS", instanceId: id, relations: [{ name: "RailLevel", expr: "FormationLevel + 0.8" }] })!;
    const ex = applyCadAction(r1.shapes, r1.cad, { type: "CAD_EXPLODE_COMPONENT", instanceId: id })!;
    const again = applyCadAction(ex.shapes, ex.cad, { type: "CAD_MAKE_PARAMETRIC", options: { name: "Hand edited" } })!;
    expect(again.cad.componentNotice?.ok, again.cad.componentNotice?.message).toBe(true);
    expect(again.cad.components[0].relations).toEqual([{ name: "RailLevel", expr: "FormationLevel + 0.8" }]);
    expect(again.cad.carried).toBeUndefined();
    const ev = evaluateInstance(again.cad.components[0], again.cad)!.evaluation;
    const moved = applyCadAction(again.shapes, again.cad, { type: "CAD_SET_COMPONENT_VALUES", instanceId: again.cad.components[0].id, values: { FormationLevel: 106 } })!;
    expect(evaluateInstance(moved.cad.components[0], moved.cad)!.evaluation.scope.RailLevel).toBeCloseTo(106.8, 6);
    expect(ev.scope.RailLevel).toBeCloseTo(105.8, 6);
  });

  it("the audit reads the parametric drawing's levels", async () => {
    const { runAudit } = await import("@/lib/bridge/audit");
    const r = make();
    const report = runAudit(r.shapes, r.cad);
    expect(report.facts.some((f) => f.key === "hfl_m" && Math.abs(f.value - 96.8) < 1e-9)).toBe(true);
    expect(report.facts.some((f) => f.key === "bed_level_m")).toBe(true);
  });
});
