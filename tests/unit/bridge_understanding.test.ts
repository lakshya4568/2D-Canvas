/**
 * The editor understands a bridge drawn by hand: it recognises the parts,
 * tags them on request, reads levels and sizes from the geometry, and audits
 * the hand drawing with the same rules as a component.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "@/lib/geometry/types";
import { drawingReducer, initialDrawingState, type DrawingAction, type DrawingState } from "@/lib/state/drawingReducer";
import { recognizeBridge } from "@/lib/bridge/recognize";
import { drawnFacts } from "@/lib/bridge/drawnFacts";
import { runAudit } from "@/lib/bridge/audit";
import { termFromText, termFor, BRIDGE_TERMS } from "@/lib/bridge/glossary";
import { levelAt } from "@/lib/cad/types";

function run(actions: DrawingAction[], from: DrawingState = initialDrawingState): DrawingState {
  return actions.reduce((s, a) => drawingReducer(s, a), from);
}

// Canvas y is down: RL (m) = −y / 1000 with the default datum.
const Y = (rl: number) => -rl * 1000;
const line = (id: string, x1: number, rl1: number, x2: number, rl2: number, extra: Partial<Shape> = {}): Shape => ({ id, type: "line", x1, y1: Y(rl1), x2, y2: Y(rl2), ...extra } as Shape);
const poly = (id: string, pts: [number, number][]): Shape[] =>
  pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return { id: `${id}_${i + 1}`, type: "line", x1: p[0], y1: Y(p[1]), x2: q[0], y2: Y(q[1]), groupId: id } as Shape;
  });

/** A single-cell box culvert drawn with the pen: invert at RL 100.0. */
function handDrawnCulvert(): Shape[] {
  return [
    { id: "BOX", type: "rectangle", x: 0, y: Y(103.75), width: 3700, height: 3750 } as Shape, // outer, RL 100.0−0.4 … 103.75
    { id: "CELL", type: "rectangle", x: 350, y: Y(103.4), width: 3000, height: 3000 } as Shape, // opening RL 100.4 … 103.4
    ...poly("CUSHION", [
      [-2000, 103.75],
      [5700, 103.75],
      [4700, 105.5],
      [-1000, 105.5],
    ]),
    line("BED", -6000, 100.4, 10000, 100.4),
    line("HFLLINE", -6000, 102.3, 10000, 102.3, { strokeDasharray: "8 4" }),
    line("FORM", -6000, 105.5, 10000, 105.5),
  ];
}

describe("vocabulary", () => {
  it("reads the words drawings use", () => {
    expect(termFromText("H.F.L. +102.300")?.role).toBe("HFL");
    expect(termFromText("BED LEVEL 100.400")?.role).toBe("bed_level");
    expect(termFromText("Earth cushion 1750")?.role).toBe("earth_cushion");
    expect(termFromText("F.L.")?.role).toBe("formation_level");
    expect(termFromText("C/L OF TRACK")?.role).toBe("track_centreline");
    expect(termFromText("random words")).toBeUndefined();
  });
  it("every term has a definition, a layer and at least one alias", () => {
    for (const t of BRIDGE_TERMS) {
      expect(t.definition.length).toBeGreaterThan(20);
      expect(t.aliases.length).toBeGreaterThan(0);
    }
  });
});

describe("recognising a hand-drawn culvert", () => {
  const shapes = handDrawnCulvert();
  const s = run([
    { type: "LOAD_SHAPES", shapes },
    { type: "CAD_ADD_ANNOTATION", annotation: { id: "t1", type: "text", at: { kind: "point", x: -5000, y: Y(102.3) - 200 }, text: "HFL", height: 2.5 } },
    { type: "CAD_ADD_ANNOTATION", annotation: { id: "t2", type: "text", at: { kind: "point", x: 1500, y: Y(104.8) }, text: "EARTH CUSHION", height: 2.5 } },
  ]);
  const cands = recognizeBridge(s.shapes, s.cad.annotations, s.cad.settings);
  const find = (role: string) => cands.find((c) => c.role === role);

  it("the labels on the drawing are read with high confidence", () => {
    expect(find("HFL")?.shapeIds).toEqual(["HFLLINE"]);
    expect(find("HFL")!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(find("earth_cushion")?.shapeIds.sort()).toEqual(["CUSHION_1", "CUSHION_2", "CUSHION_3", "CUSHION_4"]);
    expect(find("earth_cushion")!.evidence.join(" ")).toMatch(/EARTH CUSHION/);
  });

  it("topology and arrangement fill in the rest", () => {
    expect(find("clear_opening")?.shapeIds).toEqual(["CELL"]);
    expect(find("concrete_section")?.shapeIds).toEqual(["BOX"]);
    expect(find("bed_level")?.shapeIds).toEqual(["BED"]);
    expect(find("formation_level")?.shapeIds).toEqual(["FORM"]);
  });

  it("accepting tags the geometry, moves it to its layer, marks levels and hatches regions", () => {
    let t = s;
    for (const c of cands) t = run([{ type: "CAD_CLASSIFY", ids: c.shapeIds, role: c.role }], t);
    const hfl = t.shapes.find((x) => x.id === "HFLLINE")!;
    expect(hfl.semanticRole).toBe("HFL");
    expect(hfl.layerId).toBe("BRG-WATER");
    expect(hfl.isReference).toBe(true);
    const marker = t.cad.annotations.find((a) => a.type === "level" && a.at.kind === "shape" && a.at.shapeId === "HFLLINE");
    expect(marker && marker.type === "level" && marker.label).toBe("H.F.L.");
    const cushionHatch = t.cad.annotations.find((a) => a.type === "hatch" && a.semanticRole === "earth_cushion");
    expect(cushionHatch && cushionHatch.type === "hatch" && cushionHatch.material).toBe("earth");
    const boxHatch = t.cad.annotations.find((a) => a.type === "hatch" && a.semanticRole === "concrete_section");
    expect(boxHatch && boxHatch.type === "hatch" && boxHatch.boundary.kind === "shapes" && boxHatch.boundary.holeShapeIds).toEqual(["CELL"]);
    // Nothing left to propose for tagged geometry.
    expect(recognizeBridge(t.shapes, t.cad.annotations, t.cad.settings).length).toBe(0);
  });

  it("reads levels and sizes from the tagged geometry", () => {
    let t = s;
    for (const c of cands) t = run([{ type: "CAD_CLASSIFY", ids: c.shapeIds, role: c.role }], t);
    const facts = drawnFacts(t.shapes, t.cad.settings);
    const f = (k: string) => facts.find((x) => x.key === k)?.value;
    expect(f("hfl_m")).toBeCloseTo(102.3, 6);
    expect(f("bed_level_m")).toBeCloseTo(100.4, 6);
    expect(f("formation_level_m")).toBeCloseTo(105.5, 6);
    expect(f("clear_opening_mm")).toBeCloseTo(3000, 6);
    expect(f("clear_height_mm")).toBeCloseTo(3000, 6);
    expect(f("cushion_mm")).toBeCloseTo(1750, 6);
    expect(f("freeboard_mm")).toBeCloseTo(3200, 6);
    expect(levelAt(Y(102.3), t.cad.settings)).toBeCloseTo(102.3, 9);
  });

  it("the audit checks the hand drawing: DBR vs drawn HFL, levels marked, culvert exemption", () => {
    let t = s;
    for (const c of cands) t = run([{ type: "CAD_CLASSIFY", ids: c.shapeIds, role: c.role }], t);
    t = run([{ type: "CAD_SET_PROJECT", project: { ...t.cad.project, dbr: { ...t.cad.project.dbr, hfl: { value: 102.45, status: "CONFIRMED_APPROVED" } } } }], t);
    const r = runAudit(t.shapes, t.cad);
    const cons = r.results.find((x) => x.ruleId === "CONS-DRAWN-hfl");
    expect(cons?.severity).toBe("error");
    expect(cons?.message).toMatch(/102\.300.*102\.450/);
    expect(r.results.some((x) => x.ruleId === "GAD-LEVEL-HFL")).toBe(false);
    expect(r.results.some((x) => x.ruleId === "GAD-LEVEL-Bed level")).toBe(false);
    expect(r.results.find((x) => x.ruleId === "RLY-VERT-CLEAR")?.status).toBe("pass");
    expect(r.results.find((x) => x.ruleId === "RLY-FREEBOARD")?.message).toMatch(/3200 mm/);
  });

  it("clearing a role removes what the role added", () => {
    const t1 = run([{ type: "CAD_CLASSIFY", ids: ["HFLLINE"], role: "HFL" }], s);
    expect(t1.cad.annotations.some((a) => a.type === "level" && a.tags?.includes("semantic"))).toBe(true);
    const t2 = run([{ type: "CAD_CLASSIFY", ids: ["HFLLINE"], role: "" }], t1);
    expect(t2.shapes.find((x) => x.id === "HFLLINE")!.semanticRole).toBeUndefined();
    expect(t2.cad.annotations.some((a) => a.type === "level" && a.tags?.includes("semantic"))).toBe(false);
    expect(termFor("HFL")?.label).toBe("High flood level (HFL)");
  });
});

describe("recognising a hand-drawn pier", () => {
  it("a tall block on a wider block is a pier on its footing; a wider block on top is its cap", () => {
    const shapes: Shape[] = [
      { id: "FTG", type: "rectangle", x: -2250, y: Y(98.5), width: 4500, height: 1500 } as Shape,
      { id: "SHAFT", type: "rectangle", x: -750, y: Y(104.5), width: 1500, height: 6000 } as Shape,
      { id: "CAP", type: "rectangle", x: -1400, y: Y(105.4), width: 2800, height: 900 } as Shape,
    ];
    const s = run([{ type: "LOAD_SHAPES", shapes }]);
    const c = recognizeBridge(s.shapes, s.cad.annotations, s.cad.settings);
    expect(c.find((x) => x.role === "pier")?.shapeIds).toEqual(["SHAFT"]);
    expect(c.find((x) => x.role === "open_footing")?.shapeIds).toEqual(["FTG"]);
    expect(c.find((x) => x.role === "pier_cap")?.shapeIds).toEqual(["CAP"]);
  });
});
