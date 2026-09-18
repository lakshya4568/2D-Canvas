/**
 * Modify operations (OFFSET, TRIM, EXTEND, BREAK, FILLET, MIRROR, ARRAY, JOIN,
 * EXPLODE, SCALE guard) and the exporters (DXF layers/text, SVG layer groups,
 * PDF sheets with title block; construction layers never plot).
 */

import { describe, it, expect } from "vitest";
import type { LineShape, Shape } from "@/lib/geometry/types";
import {
  ModifyError,
  arrayPolar,
  arrayRectangular,
  breakLine,
  chainGroup,
  explodeShape,
  extendLine,
  filletCorner,
  mirrorShapes,
  offsetShape,
  scaleShapes,
  trimLine,
} from "@/lib/cad/modify";
import { regionAt } from "@/features/canvas/tools/interactiveTools";
import { drawingReducer, initialDrawingState, type DrawingAction, type DrawingState } from "@/lib/state/drawingReducer";
import { exportDrawingDxf, exportDrawingSvg, exportSheetsPdf, defaultSheet, sheetPrims } from "@/lib/cad/export";
import { hatchPrims } from "@/lib/cad/hatch";
import { pointInRegion } from "@/lib/cad/geometry";

const L = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<LineShape> = {}): LineShape => ({ id, type: "line", x1, y1, x2, y2, ...extra });

describe("modify", () => {
  it("OFFSET a line to the picked side by exactly the distance", () => {
    const [o] = offsetShape([], L("a", 0, 0, 1000, 0), 250, { x: 500, y: 100 }) as LineShape[];
    expect(o.y1).toBeCloseTo(250, 9);
    expect(o.y2).toBeCloseTo(250, 9);
    expect(o.x2 - o.x1).toBeCloseTo(1000, 9);
  });

  it("OFFSET a closed polyline inwards keeps a uniform wall (box → opening)", () => {
    const g = "g1";
    const box = [L("1", 0, 0, 4000, 0, { groupId: g }), L("2", 4000, 0, 4000, 3000, { groupId: g }), L("3", 4000, 3000, 0, 3000, { groupId: g }), L("4", 0, 3000, 0, 0, { groupId: g })];
    const inner = offsetShape(box, box[0], 350, { x: 2000, y: 1500 }) as LineShape[];
    const chain = chainGroup(inner)!;
    expect(chain.closed).toBe(true);
    const xs = chain.points.map((p) => p.x);
    const ys = chain.points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(350, 6);
    expect(Math.max(...xs)).toBeCloseTo(3650, 6);
    expect(Math.min(...ys)).toBeCloseTo(350, 6);
    expect(Math.max(...ys)).toBeCloseTo(2650, 6);
  });

  it("TRIM removes the picked piece between crossings", () => {
    const a = L("a", 0, 0, 1000, 0);
    const cutters = [L("c1", 300, -100, 300, 100), L("c2", 700, -100, 700, 100)];
    const pieces = trimLine([a, ...cutters], a, { x: 500, y: 0 });
    expect(pieces).toHaveLength(2);
    expect(pieces.map((p) => [p.x1, p.x2].map((v) => Math.round(v)))).toEqual([
      [0, 300],
      [700, 1000],
    ]);
  });

  it("EXTEND reaches the first boundary in the picked direction", () => {
    const a = L("a", 0, 0, 500, 0);
    const b = L("b", 800, -100, 800, 100);
    const e = extendLine([a, b], a, { x: 480, y: 0 });
    expect(e.x2).toBeCloseTo(800, 9);
    expect(() => extendLine([a, b], a, { x: 10, y: 0 })).toThrow(ModifyError);
  });

  it("BREAK splits; FILLET joins two lines at their corner", () => {
    const [p, q] = breakLine(L("a", 0, 0, 1000, 0), { x: 400, y: 0 });
    expect(p.x2).toBe(400);
    expect(q.x1).toBe(400);
    const [f1, f2] = filletCorner(L("h", 0, 0, 900, 0), { x: 100, y: 0 }, L("v", 1000, 100, 1000, 800), { x: 1000, y: 700 });
    expect([f1.x2, f1.y2]).toEqual([1000, 0]);
    expect([f2.x1, f2.y1]).toEqual([1000, 0]);
  });

  it("MIRROR copies about a line; ARRAY places copies at the pitch", () => {
    const [m] = mirrorShapes([L("a", 100, 0, 200, 50)], { x: 0, y: -10 }, { x: 0, y: 10 }) as LineShape[];
    expect([m.x1, m.x2]).toEqual([-100, -200]);
    const arr = arrayRectangular([L("a", 0, 0, 10, 0)], 2, 3, 100, 50) as LineShape[];
    expect(arr).toHaveLength(5);
    expect(arr.map((s) => s.x1).sort((x, y) => x - y)).toEqual([0, 100, 100, 200, 200]);
    expect(arrayPolar([L("a", 100, 0, 110, 0)], { x: 0, y: 0 }, 4)).toHaveLength(3);
  });

  it("refuses to edit component geometry or silently scale structure", () => {
    expect(() => offsetShape([], L("c", 0, 0, 1, 0, { componentInstanceId: "BOX-1" }), 10, { x: 0, y: 1 })).toThrow(/component/);
    expect(() => scaleShapes([L("w", 0, 0, 1, 0, { semanticRole: "abutment" })], { x: 0, y: 0 }, 2)).toThrow(/redesign/);
    expect(scaleShapes([L("w", 0, 0, 1, 0, { semanticRole: "abutment" })], { x: 0, y: 0 }, 2, true)[0]).toMatchObject({ x2: 2 });
  });

  it("EXPLODE a rectangle into four lines", () => {
    const parts = explodeShape({ id: "r", type: "rectangle", x: 0, y: 0, width: 100, height: 50 } as Shape);
    expect(parts).toHaveLength(4);
  });

  it("HATCH picks the innermost closed region and leaves inner loops clear", () => {
    const outer: Shape = { id: "o", type: "rectangle", x: 0, y: 0, width: 1000, height: 1000 };
    const hole: Shape = { id: "h", type: "rectangle", x: 300, y: 300, width: 200, height: 200 };
    const r = regionAt([outer, hole], { x: 100, y: 100 })!;
    expect(r.shapeIds).toEqual(["o"]);
    expect(r.holes).toHaveLength(1);
    const prims = hatchPrims(r.outer, r.holes, "concrete", 50, { layerId: "BRG-HATCH" }, "t");
    const dots = prims.find((p) => p.k === "dots");
    expect(dots && dots.k === "dots" && dots.points.every((p) => pointInRegion(p, r.outer, r.holes))).toBe(true);
    expect(regionAt([outer, hole], { x: 400, y: 400 })!.shapeIds).toEqual(["h"]);
  });
});

function run(actions: DrawingAction[], from: DrawingState = initialDrawingState): DrawingState {
  return actions.reduce((s, a) => drawingReducer(s, a), from);
}

describe("export", () => {
  const s = run([
    { type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.gad", at: { x: 0, y: 0 } },
    { type: "CAD_SET_CURRENT_LAYER", id: "BRG-NPLOT" },
    { type: "ADD_SHAPE", shape: { id: "guide", type: "line", x1: 0, y1: 0, x2: 1, y2: 0 } },
    { type: "CAD_ADD_ANNOTATION", annotation: { id: "n", type: "marker", kind: "north", at: { kind: "point", x: 0, y: -110000 } } },
  ]);

  it("DXF keeps layers, line types, text and polylines; construction does not plot", () => {
    const dxf = exportDrawingDxf(s.shapes, s.cad);
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("BRG-OUTLINE");
    expect(dxf).toContain("CENTER");
    expect(dxf).toMatch(/\r\nTEXT\r\n/);
    expect(dxf).toMatch(/\r\nPOLYLINE\r\n/);
    expect(dxf).toContain("CROSS SECTION OF BOX CULVERT");
    // The guide line on the no-plot layer is absent from ENTITIES.
    const entities = dxf.slice(dxf.indexOf("ENTITIES"));
    expect(entities).not.toMatch(/\r\n8\r\nBRG-NPLOT\r\n/);
    expect(dxf.trim().endsWith("EOF")).toBe(true);
  });

  it("SVG groups by layer", () => {
    const svg = exportDrawingSvg(s.shapes, s.cad);
    expect(svg).toContain('id="layer-BRG-OUTLINE"');
    expect(svg).toContain('id="layer-BRG-HATCH"');
  });

  it("guide acceptance test 10: the PDF sheet carries the title block and a locked standard scale", () => {
    const sheet = defaultSheet(s.shapes, s.cad, "A1");
    expect(sheet.viewports[0].locked).toBe(true);
    const text = sheetPrims(sheet, s.shapes, s.cad)
      .filter((p) => p.k === "text")
      .map((p) => (p.k === "text" ? p.text : ""))
      .join("|");
    expect(text).toContain("NAME OF WORK");
    expect(text).toContain("DRAWING No.");
    expect(text).toMatch(/1:\d+/);
    expect(text).toContain("DRAFT");
    const pdf = exportSheetsPdf(s.shapes, { ...s.cad, sheets: [sheet] });
    const head = new TextDecoder().decode(pdf.slice(0, 8));
    expect(head).toBe("%PDF-1.4");
    const body = new TextDecoder("latin1").decode(pdf);
    expect(body).toContain("/Count 1");
    expect(body).toContain("/MediaBox [0 0 2383.94 1683.78]");
  });
});
