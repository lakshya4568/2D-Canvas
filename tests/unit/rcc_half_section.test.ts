/**
 * The RCC box half section & half elevation: its level chain matches the
 * project formula documentation, the reference drawing's numbers come out at
 * the defaults, auto values follow until typed, relationships take over a
 * value, the foundation-layer table grows the drawing, and the boulder
 * backing changes shape when the slope cuts through it.
 */

import { describe, it, expect } from "vitest";
import { componentRegistry } from "@/lib/components/library";
import { evaluateComponent, hasBlockingIssues, type ComponentEvaluation, type EvaluateOptions } from "@/lib/components/evaluate";
import { emptyCadDoc, evaluateInstance } from "@/lib/cad/document";
import { applyCadAction } from "@/lib/state/cadActions";
import { annotationPrims } from "@/lib/cad/annotationPrims";
import { indexShapes } from "@/lib/cad/geometry";
import type { TableRow } from "@/lib/components/types";

const def = componentRegistry.get("ir.rcc_box.half_section")!;
const G = { DIM: 800, TXT: 250, SCALE: 100 };

function ev(values: Record<string, number> = {}, extra: Omit<EvaluateOptions, "globals"> = {}): ComponentEvaluation {
  return evaluateComponent(def, values, componentRegistry, undefined, { globals: G, ...extra });
}

describe("RCC box half section — level chain (RCR formulas)", () => {
  it("reproduces the reference drawing at the defaults", () => {
    const e = ev();
    expect(e.issues.filter((i) => i.severity === "error")).toEqual([]);
    const s = e.scope;
    expect(s.OuterWidth).toBe(11400); // RCR-GEO-001: 10700 + 2 × 350
    expect(s.TopOfSlabLevel).toBeCloseTo(101.0, 6); // TOP OF SLAB = 101.000M
    expect(s.SoffitLevel).toBeCloseTo(100.2, 6); // BOTTOM OF TOP SLAB = 100.200M
    expect(s.EarthCushion).toBeCloseTo(4000, 6); // 4000 mm EARTH CUSHION
    expect(s.VerticalClearance).toBeCloseTo(3400, 6); // V.C. 3400
    expect(s.FreeBoard).toBeCloseTo(8200, 6); // F.B. 8200
    expect(s.FoundationLevel).toBeCloseTo(94.15, 6); // R.L. = 94.150M
    expect(s.RailLevel).toBeCloseTo(105.762, 6); // PROP. RAIL LEVEL = 105.762M
    expect(s.ReturnWallLength).toBeCloseTo(6984, 6);
    expect(s.ClearAboveBed).toBe(4100);
  });

  it("follows the documented chain for any values", () => {
    const e = ev({ BedLevel: 90, WearingCourse: 100, BottomSlab: 500, ClearHeight: 3000, TopSlab: 450, FormationLevel: 95 });
    const s = e.scope;
    expect(s.BaseTopY).toBeCloseTo(89900); // RCR-GEO-004
    expect(s.BoxBottomY).toBeCloseTo(89400); // RCR-GEO-005
    expect(s.SoffitY).toBeCloseTo(92900); // RCR-GEO-007
    expect(s.TopY).toBeCloseTo(93350); // RCR-GEO-006
    expect(s.EarthCushion).toBeCloseTo(1650); // RCR-LVL-002
  });

  it("level callouts read the true RL in the GAD format", () => {
    const r = applyCadAction([], emptyCadDoc(), { type: "CAD_INSERT_COMPONENT", definitionId: def.id, at: { x: 0, y: 0 } })!;
    expect(r.cad.settings.annotationScale).toBe(100);
    const ctx = { shapes: indexShapes(r.shapes), settings: r.cad.settings };
    const texts = r.cad.annotations.filter((a) => a.type === "level").flatMap((a) => annotationPrims(a, ctx)).filter((p) => p.k === "text").map((p) => (p as { text: string }).text);
    expect(texts).toContain("PROP. RAIL LEVEL = 105.762M.");
    expect(texts).toContain("PROP. FORMATION LEVEL = 105.000M.");
    expect(texts).toContain("TOP OF SLAB = 101.000M.");
    expect(texts).toContain("BOTTOM OF TOP SLAB = 100.200M.");
    expect(texts).toContain("BED LEVEL = 96.100M.");
    expect(texts).toContain("HFL = 96.800M");
    expect(texts).toContain("R.L. = 94.150M.");
    const dims = r.cad.annotations.filter((a) => a.type === "dimension").flatMap((a) => annotationPrims(a, ctx)).filter((p) => p.k === "text").map((p) => (p as { text: string }).text);
    expect(dims).toEqual(expect.arrayContaining(["11400", "10700", "350", "800", "V.C. 3400", "F.B. 8200", "6984", "1550", "150", "1800", "1200", "225"]));
    const notes = r.cad.annotations.flatMap((a) => annotationPrims(a, ctx)).filter((p) => p.k === "text").map((p) => (p as { text: string }).text);
    expect(notes).toEqual(expect.arrayContaining(["4000 mm\nEARTH\nCUSHION", "HAUNCH 600 X 600mm", "600 THK. BOULDER", "150TH. WEARING COURSE", "150TH. PCC BASE COURSE", "850THK. GRANULAR FILLING", "16mm GAP", "HALF SECTION & HALF ELEVATION", "PROPOSED BRIDGE", "(SCALE: 1:100)"]));
  });

  it("an existing bridge says so in its labels", () => {
    const e = ev({ Status: 0 });
    expect(e.levels.find((l) => l.path === "rail")!.label).toBe("EX. RAIL LEVEL");
    expect(e.texts.some((t) => t.text === "EXISTING BRIDGE")).toBe(true);
    expect(e.texts.some((t) => t.text === "PROPOSED BRIDGE")).toBe(false);
  });
});

describe("auto values and relationships", () => {
  it("rail level follows formation until it is typed", () => {
    expect(ev({ FormationLevel: 110 }).scope.RailLevel).toBeCloseTo(110.762, 6);
    expect(ev({ FormationLevel: 110 }).sources.RailLevel).toBe("auto");
    const typed = ev({ FormationLevel: 110, RailLevel: 111 });
    expect(typed.scope.RailLevel).toBe(111);
    expect(typed.sources.RailLevel).toBe("typed");
  });

  it("a relationship takes a value over, even a typed one", () => {
    const e = ev({ RailLevel: 999 }, { relations: [{ name: "RailLevel", expr: "FormationLevel + 0.8" }] });
    expect(e.scope.RailLevel).toBeCloseTo(105.8, 6);
    expect(e.sources.RailLevel).toBe("related");
    expect(hasBlockingIssues(e)).toBe(false);
  });

  it("a relationship can drive geometry through a value the user added", () => {
    const base = ev();
    const e = ev({}, { customValues: [{ name: "SlabRatio", value: 0.1, unit: "-" }], relations: [{ name: "TopSlab", expr: "SlabRatio * ClearSpan" }] });
    expect(e.scope.TopSlab).toBeCloseTo(1070, 6);
    // Only what depends on the top slab moves: the soffit stays, the top of slab rises.
    expect(e.scope.SoffitY).toBe(base.scope.SoffitY);
    expect(e.scope.TopY - base.scope.TopY).toBeCloseTo(270, 6);
    expect(e.scope.OuterWidth).toBe(base.scope.OuterWidth);
  });

  it("a new relationship is reported beside the component's own results", () => {
    const e = ev({}, { relations: [{ name: "CushionOverSpan", expr: "EarthCushion / ClearSpan" }] });
    expect(e.scope.CushionOverSpan).toBeCloseTo(4000 / 10700, 9);
  });

  it("a relationship that goes round in a circle is refused", () => {
    const e = ev({}, { relations: [{ name: "TopSlab", expr: "BottomSlab + 0" }, { name: "BottomSlab", expr: "TopSlab + 0" }] });
    expect(hasBlockingIssues(e)).toBe(true);
    expect(e.issues.some((i) => i.code === "relation-cycle")).toBe(true);
  });

  it("a relationship naming something unknown is refused with the name", () => {
    const e = ev({}, { relations: [{ name: "TopSlab", expr: "Nonsense * 2" }] });
    expect(hasBlockingIssues(e)).toBe(true);
    expect(e.issues.find((i) => i.code === "relation-error")!.message).toMatch(/Nonsense/);
  });

  it("a relationship cannot overwrite a formula of the component", () => {
    const e = ev({}, { relations: [{ name: "OuterWidth", expr: "1000" }] });
    expect(e.issues.some((i) => i.code === "relation-formula")).toBe(true);
  });
});

describe("foundation layers (table)", () => {
  it("each row is a layer with its own callout, hatch and thickness", () => {
    const rows: TableRow[] = [
      { name: "{thickness}THK. GRANULAR FILLING", thickness: 850, hatch: 2 },
      { name: "{thickness}THK. NEW LAYER", thickness: 200, hatch: 3 },
      { name: "{thickness}THK. NEW LAYER", thickness: 300, hatch: 0 },
    ];
    const e = ev({}, { tables: { Layers: rows } });
    expect(e.scope.Layers_count).toBe(3);
    expect(e.scope.FoundationLevel).toBeCloseTo(94.15 - 0.5, 6);
    expect(e.leaders.filter((l) => l.path.startsWith("layer[")).map((l) => l.text)).toEqual(["850THK. GRANULAR FILLING", "200THK. NEW LAYER", "300THK. NEW LAYER"]);
    const layerHatches = e.hatches.filter((h) => h.path.startsWith("layer_hatch"));
    // The third row asked for no hatch.
    expect(layerHatches.map((h) => h.material)).toEqual(["gravel", "earth"]);
    expect(e.tables.Layers).toHaveLength(3);
  });

  it("a row's label is its callout; a zero-thickness row is a callout only", () => {
    const rows: TableRow[] = [
      { name: "{thickness}THK. GRANULAR FILLING", thickness: 850, hatch: 2 },
      { name: "150 mm. SAND BLANKET (BY OTHERS)", thickness: 0, hatch: 0 },
    ];
    const e = ev({}, { tables: { Layers: rows } });
    expect(e.leaders.filter((l) => l.path.startsWith("layer[")).map((l) => l.text)).toEqual(["850THK. GRANULAR FILLING", "150 mm. SAND BLANKET (BY OTHERS)"]);
    // It adds no thickness and no hatch.
    expect(e.scope.FoundationLevel).toBeCloseTo(94.15, 6);
    expect(e.hatches.filter((h) => h.path.startsWith("layer_hatch"))).toHaveLength(1);
  });

  it("no rows: the foundation stops at the PCC", () => {
    const e = ev({}, { tables: { Layers: [] } });
    expect(e.scope.FoundationBottomY).toBe(e.scope.PccBottomY);
    expect(hasBlockingIssues(e)).toBe(false);
  });
});

describe("geometry", () => {
  it("the boulder backing turns from a rectangle into a clipped pentagon when the slope cuts it (RCR-CUT-007)", () => {
    // Slope 1:0.5 with a 900 mm backing: the slope reaches bed level inside the backing.
    const steep = ev({ EmbankmentSlope: 0.5, BoulderThickness: 900 });
    const gentle = ev();
    const pts = (e: ComponentEvaluation) => e.loops.find((l) => l.primitiveId === "boulder")!.points.length;
    expect(pts(gentle)).toBe(4);
    expect(pts(steep)).toBe(5);
    expect(hasBlockingIssues(steep)).toBe(false);
  });

  it("widening the span moves the walls and the return wall, not their thickness", () => {
    const a = ev();
    const b = ev({ ClearSpan: 12000 });
    const w = (e: ComponentEvaluation) => e.dimensions.find((d) => d.path === "wall_l")!;
    expect(Math.abs(w(b).to.x - w(b).from.x)).toBe(350);
    expect(b.scope.RwX0 - a.scope.RwX0).toBe(650);
    expect(b.scope.ReturnWallLength).toBe(a.scope.ReturnWallLength);
  });

  it("more cells repeat the opening with index-stable ids", () => {
    const e = ev({ CellCount: 3, ClearSpan: 4000 });
    expect(e.loops.filter((l) => l.primitiveId === "cell").map((l) => l.path)).toEqual(["cell[0]", "cell[1]", "cell[2]"]);
    expect(e.scope.OuterWidth).toBe(3 * 4000 + 2 * 350 + 2 * 350);
  });

  it("refuses haunches that would meet", () => {
    expect(hasBlockingIssues(ev({ Haunch: 3000 }))).toBe(true);
  });

  it("flags the project-reference minimums as warnings that need review", () => {
    const e = ev({ SideWall: 250, Haunch: 200 });
    const warn = e.issues.filter((i) => i.severity === "warning").map((i) => i.code);
    expect(warn).toContain("invariant:rcr_val_001");
    expect(warn).toContain("invariant:rcr_val_008");
    expect(e.issues.find((i) => i.code === "invariant:rcr_val_001")!.source).toBe("aagento-rcr");
    expect(hasBlockingIssues(e)).toBe(false);
  });

  it("placed on a drawing, the instance evaluates through the document", () => {
    const r = applyCadAction([], emptyCadDoc(), { type: "CAD_INSERT_COMPONENT", definitionId: def.id, at: { x: 0, y: 0 } })!;
    const out = evaluateInstance(r.cad.components[0], r.cad)!;
    expect(out.blocked).toBe(false);
    expect(new Set(r.shapes.map((s) => s.id)).size).toBe(r.shapes.length);
    expect(new Set(r.cad.annotations.map((a) => a.id)).size).toBe(r.cad.annotations.length);
  });
});
