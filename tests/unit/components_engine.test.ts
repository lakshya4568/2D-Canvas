/**
 * The constructive component engine: every library definition evaluates
 * cleanly, counts are topology, sizes that are not driven do not move, and
 * impossible values are refused with a reason.
 */

import { describe, it, expect } from "vitest";
import { COMPONENT_LIBRARY, componentRegistry } from "@/lib/components/library";
import { evaluateComponent, hasBlockingIssues, type ComponentEvaluation } from "@/lib/components/evaluate";
import { orderByDependencies, evalExpr, interpolate } from "@/lib/components/expr";
import { signedArea } from "@/lib/cad/geometry";
import type { ComponentDefinition } from "@/lib/components/types";

const G = { globals: { DIM: 400, TXT: 125 } };
const box = componentRegistry.get("ir.box_culvert.section")!;

function evalBox(values: Record<string, number>): ComponentEvaluation {
  return evaluateComponent(box, values, componentRegistry, undefined, G);
}

function loops(ev: ComponentEvaluation, prim: string) {
  return ev.loops.filter((l) => l.primitiveId === prim);
}

function bbox(pts: { x: number; y: number }[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("library", () => {
  it.each(COMPONENT_LIBRARY.map((d) => [d.id, d] as [string, ComponentDefinition]))("%s evaluates at its defaults with no errors", (_id, def) => {
    const ev = evaluateComponent(def, {}, componentRegistry, undefined, G);
    expect(ev.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(ev.loops.length + ev.circles.length).toBeGreaterThan(0);
  });

  it("every child refers to a definition in the registry", () => {
    for (const d of COMPONENT_LIBRARY) for (const c of d.children ?? []) expect(componentRegistry.has(c.component), `${d.id} → ${c.component}`).toBe(true);
  });

  it("every driving parameter default lies within its declared range", () => {
    for (const d of COMPONENT_LIBRARY)
      for (const p of d.parameters) {
        if (p.min !== undefined) expect(p.default, `${d.id}.${p.name}`).toBeGreaterThanOrEqual(p.min);
        if (p.max !== undefined) expect(p.default, `${d.id}.${p.name}`).toBeLessThanOrEqual(p.max);
      }
  });
});

describe("expressions", () => {
  it("orders formulas by AST dependencies, not substrings", () => {
    const { order, cyclic } = orderByDependencies([
      { name: "W", expr: "WallThickness * 2" },
      { name: "WallThickness", expr: "300" },
    ]);
    expect(cyclic).toEqual([]);
    expect(order.indexOf("WallThickness")).toBeLessThan(order.indexOf("W"));
  });

  it("reports cycles instead of hanging", () => {
    const { cyclic } = orderByDependencies([
      { name: "A", expr: "B + 1" },
      { name: "B", expr: "A + 1" },
    ]);
    expect(cyclic.sort()).toEqual(["A", "B"]);
  });

  it("has comparison helpers that switch terms without a ternary", () => {
    expect(evalExpr("if(gt(3, 2), 10, 20)", {})).toBe(10);
    expect(evalExpr("if(Columns - 1, 5, 7)", { Columns: 1 })).toBe(7);
  });

  it("interpolates values into labels", () => {
    expect(interpolate("{N} CELL {S:m} m", { N: 2, S: 3000 })).toBe("2 CELL 3.000 m");
  });
});

describe("RCC box culvert — guide acceptance tests 1 and 2", () => {
  it("cell count is topology: 3 → 4 cells regenerates openings and outer width, walls unchanged", () => {
    const v = { CellCount: 3, ClearSpan: 2000, SideWallThickness: 350, InteriorWallThickness: 350, HaunchSize: 0 };
    const e3 = evalBox(v);
    const e4 = evalBox({ ...v, CellCount: 4 });
    expect(loops(e3, "cell")).toHaveLength(3);
    expect(loops(e4, "cell")).toHaveLength(4);
    // outerWidth = N·span + 2·t_ext + (N−1)·t_mid (UPCE-ADDENDUM-2.0 §3)
    expect(e3.scope.OuterWidth).toBe(3 * 2000 + 2 * 350 + 2 * 350);
    expect(e4.scope.OuterWidth).toBe(4 * 2000 + 2 * 350 + 3 * 350);
    // Measured from the geometry, not from the scope:
    const outer = bbox(loops(e4, "box")[0].points);
    expect(outer.maxX - outer.minX).toBeCloseTo(4 * 2000 + 5 * 350, 9);
    const c0 = bbox(loops(e4, "cell")[0].points);
    expect(c0.minX - outer.minX).toBeCloseTo(350, 9);
    // Hatch: one concrete body with four holes.
    const concrete = e4.hatches.find((h) => h.material === "rcc")!;
    expect(concrete.holes).toHaveLength(4);
    // Index-stable ids.
    expect(loops(e4, "cell").map((l) => l.path)).toEqual(["cell[0]", "cell[1]", "cell[2]", "cell[3]"]);
  });

  it("clear span changes do not scale thicknesses (no conformal scaling)", () => {
    const a = evalBox({ ClearSpan: 3000 });
    const b = evalBox({ ClearSpan: 4500 });
    const wall = (e: ComponentEvaluation) => bbox(loops(e, "cell")[0].points).minX - bbox(loops(e, "box")[0].points).minX;
    const top = (e: ComponentEvaluation) => bbox(loops(e, "box")[0].points).maxY - bbox(loops(e, "cell")[0].points).maxY;
    const base = (e: ComponentEvaluation) => bbox(loops(e, "cell")[0].points).minY - bbox(loops(e, "box")[0].points).minY;
    expect(wall(b)).toBeCloseTo(wall(a), 9);
    expect(top(b)).toBeCloseTo(top(a), 9);
    expect(base(b)).toBeCloseTo(base(a), 9);
    const span = (e: ComponentEvaluation) => {
      const c = bbox(loops(e, "cell")[0].points);
      return c.maxX - c.minX;
    };
    expect(span(b) - span(a)).toBeCloseTo(1500, 9);
  });

  it("a haunch of size zero simply disappears", () => {
    const e = evalBox({ HaunchSize: 0 });
    expect(loops(e, "cell")[0].points).toHaveLength(4);
    expect(evalBox({ HaunchSize: 150 }).loops.find((l) => l.primitiveId === "cell")!.points).toHaveLength(8);
  });

  it("refuses haunches that meet across the opening", () => {
    const e = evalBox({ ClearSpan: 1000, HaunchSize: 600 });
    expect(hasBlockingIssues(e)).toBe(true);
    expect(e.issues.some((i) => i.code === "invariant:haunch_span")).toBe(true);
  });

  it("refuses a negative wall with a reason, and detects the inverted loop generically", () => {
    const e = evalBox({ SideWallThickness: -100 });
    expect(hasBlockingIssues(e)).toBe(true);
    expect(e.issues.map((i) => i.message).join(" ")).toMatch(/positive/);
  });

  it("flags out-of-range values as warnings, never silently clamps", () => {
    const e = evalBox({ SideWallThickness: 200 });
    expect(hasBlockingIssues(e)).toBe(false);
    expect(e.issues.some((i) => i.code === "below-range")).toBe(true);
    expect(e.scope.SideWallThickness).toBe(200);
  });

  it("keeps loop orientation (chirality) across valid edits", () => {
    const a = evalBox({});
    const b = evalBox({ ClearSpan: 6000, ClearHeight: 2000 });
    for (const l of a.loops.filter((x) => x.closed)) {
      const m = b.loops.find((x) => x.path === l.path);
      if (m) expect(Math.sign(signedArea(m.points))).toBe(Math.sign(signedArea(l.points)));
    }
  });
});

describe("assemblies", () => {
  const gad = componentRegistry.get("ir.bridge.gad")!;

  it("pier heights follow the levels, not a typed height", () => {
    const e = evaluateComponent(gad, { RailLevel: 108, FoundationLevel: 96 }, componentRegistry, undefined, G);
    const s = e.scope;
    expect(s.PierShaftHeight).toBeCloseTo(s.CapTopY - s.PierCapDepth - s.FoundY - s.PierFootingDepth, 9);
    const pierScope = e.scopes.find((x) => x.path === "pier[0]")!.scope;
    expect(pierScope.ShaftHeight).toBeCloseTo(s.PierShaftHeight, 9);
  });

  it("span count is topology: piers = spans − 1", () => {
    for (const n of [1, 2, 5]) {
      const e = evaluateComponent(gad, { SpanCount: n }, componentRegistry, undefined, G);
      const piers = new Set(e.loops.filter((l) => l.primitiveId === "shaft").map((l) => l.path.split("/")[0]));
      expect(piers.size).toBe(n - 1);
      expect(e.issues.filter((i) => i.severity === "error")).toEqual([]);
    }
  });

  it("elevation, plan and section share one set of values (cross-view consistency)", () => {
    const e = evaluateComponent(gad, { EffectiveSpan: 18300, SpanCount: 2 }, componentRegistry, undefined, G);
    const planDeck = e.loops.filter((l) => l.path.startsWith("plan/deck"));
    const elevDeck = e.loops.filter((l) => /^span\[\d\]\/deck/.test(l.path));
    const w = (l: { points: { x: number }[] }) => Math.max(...l.points.map((p) => p.x)) - Math.min(...l.points.map((p) => p.x));
    expect(planDeck).toHaveLength(2);
    expect(elevDeck).toHaveLength(2);
    expect(w(planDeck[0])).toBeCloseTo(w(elevDeck[0]), 6);
  });

  it("the section's rail top lands exactly on the rail level", () => {
    const e = evaluateComponent(gad, { RailLevel: 110.25 }, componentRegistry, undefined, G);
    const rails = e.loops.filter((l) => l.path.startsWith("section/rail"));
    expect(rails.length).toBe(2);
    const top = Math.max(...rails[0].points.map((p) => p.y));
    expect(top).toBeCloseTo(110250, 6);
  });

  it("the railing run adds posts rather than stretching them (§23.3 generalisation)", () => {
    const run = componentRegistry.get("generic.railing_run")!;
    const a = evaluateComponent(run, { RunLength: 6000, PostSpacing: 1500 }, componentRegistry, undefined, G);
    const b = evaluateComponent(run, { RunLength: 12000, PostSpacing: 1500 }, componentRegistry, undefined, G);
    const posts = (e: ComponentEvaluation) => e.loops.filter((l) => l.primitiveId === "post");
    expect(posts(a)).toHaveLength(5);
    expect(posts(b)).toHaveLength(9);
    const width = (l: { points: { x: number }[] }) => Math.max(...l.points.map((p) => p.x)) - Math.min(...l.points.map((p) => p.x));
    expect(width(posts(b)[3])).toBeCloseTo(width(posts(a)[0]), 9);
  });

  it("mirrored children stay the right way round (right abutment)", () => {
    const e = evaluateComponent(gad, {}, componentRegistry, undefined, G);
    const a1 = e.loops.find((l) => l.path === "a1/stem")!;
    const a2 = e.loops.find((l) => l.path === "a2/stem")!;
    const cx = (l: { points: { x: number }[] }) => l.points.reduce((s, p) => s + p.x, 0) / l.points.length;
    expect(cx(a2)).toBeGreaterThan(cx(a1));
    // Front faces face each other: A1's backfill is left of A1, A2's is right of A2.
    const f1 = e.hatches.find((h) => h.path === "a1/fill")!;
    const f2 = e.hatches.find((h) => h.path === "a2/fill")!;
    expect(Math.min(...f1.outer.map((p) => p.x))).toBeLessThan(cx(a1));
    expect(Math.max(...f2.outer.map((p) => p.x))).toBeGreaterThan(cx(a2));
  });
});

describe("pile group — guide acceptance test 6", () => {
  const pg = componentRegistry.get("ir.pile_group.plan")!;
  it("pile diameter change updates the piles and nothing else", () => {
    const a = evaluateComponent(pg, { PileDiameter: 1000 }, componentRegistry, undefined, G);
    const b = evaluateComponent(pg, { PileDiameter: 1200 }, componentRegistry, undefined, G);
    expect(b.circles.every((c) => c.r === 600)).toBe(true);
    expect(b.circles.map((c) => c.center)).toEqual(a.circles.map((c) => c.center));
    expect(b.facts.find((f) => f.key === "pile_diameter_mm")!.value).toBe(1200);
  });
  it("refuses overlapping piles", () => {
    const e = evaluateComponent(pg, { PileDiameter: 3200, SpacingX: 3000 }, componentRegistry, undefined, G);
    expect(hasBlockingIssues(e)).toBe(true);
  });
});

describe("ids", () => {
  it("every generated entity id is unique, for every library component", async () => {
    const { drawingReducer, initialDrawingState } = await import("@/lib/state/drawingReducer");
    for (const d of COMPONENT_LIBRARY) {
      const s = drawingReducer(initialDrawingState, { type: "CAD_INSERT_COMPONENT", definitionId: d.id, at: { x: 0, y: 0 } });
      const ids = [...s.shapes.map((x) => x.id), ...s.cad.annotations.map((x) => x.id)];
      expect(new Set(ids).size, d.id).toBe(ids.length);
    }
  });
});
