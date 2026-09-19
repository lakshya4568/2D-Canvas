/**
 * The draftsman's method, enforced by the tools (no model in the loop):
 *   - the plan says what is built, which views, which datums, in what order,
 *     and where every typed value comes from — nothing invented;
 *   - datums before the structure, the structure before its details;
 *   - check_geometry before any dimension or annotation, on the geometry as it
 *     is now; dimensions and levels stand on the geometry;
 *   - repeated parts from one pattern and a count value.
 * The RCC box ladder (single cell → multi-cell → skew → wings) is built with
 * the same generic tools a steel plate uses: nothing here is box-specific.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext } from "@/lib/agent/drafter/tools";
import { constructionEvaluation, currentDefinition } from "@/lib/agent/drafter/construction";
import { evaluateInstance } from "@/lib/cad/document";
import { runAudit } from "@/lib/bridge/audit";

/** The worked example, as a person would write the brief. No bedding thickness is given. */
const BRIEF =
  "Draw the cross section of a 3 cell RCC box culvert: clear span 2000 mm, clear height 2000 mm, walls 350 mm, top slab 300 mm, base slab 350 mm, invert RL 100.000, rail level 104.500, HFL 101.800. Lean concrete bedding under the base slab.";

function context(brief = BRIEF): ToolContext {
  return { ws: new DraftingWorkspace(), hasReference: false, brief, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => runTool(ctx, name, args);
async function ok(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  const r = await call(ctx, name, args);
  expect(r.ok, `${name}: ${r.text}`).toBe(true);
  return r;
}

const G = (name: string, expr: number, unit = "mm") => ({ name, expr: String(expr), unit, source: "given" });
const D = (name: string, expr: string, unit = "mm") => ({ name, expr, unit });

const BOX = {
  route: "construction",
  structure: "Three-cell RCC box culvert under a railway — cross section at the track centre line",
  views: [{ name: "Section", shows: "the box cut across its cells, with rail, HFL and invert levels" }],
  analysis: "Three equal cells side by side under the track; outer and interior walls the same thickness; top slab continuous over the cells; bedding under the base slab; levels on one datum.",
  frame: "x = 0 on the box centre line, y = RL x 1000",
  values: [
    G("CellCount", 3, "-"),
    G("ClearSpan", 2000),
    G("ClearHeight", 2000),
    G("Wall", 350),
    D("MidWall", "Wall"),
    G("TopSlab", 300),
    G("BaseSlab", 350),
    { name: "Bedding", expr: "150", unit: "mm", source: "required", note: "lean concrete thickness — not given" },
    { name: "BeddingProjection", expr: "150", unit: "mm", source: "required", note: "how far the bedding runs past the box — not given" },
    G("InvertLevel", 100, "m"),
    G("RailLevel", 104.5, "m"),
    G("HFL", 101.8, "m"),
    D("InvertY", "InvertLevel * 1000"),
    D("SoffitY", "InvertY + ClearHeight"),
    D("TopY", "SoffitY + TopSlab"),
    D("BaseY", "InvertY - BaseSlab"),
    D("OuterWidth", "CellCount * ClearSpan + 2 * Wall + (CellCount - 1) * MidWall"),
    D("HalfWidth", "OuterWidth / 2"),
    D("Pitch", "ClearSpan + MidWall"),
  ],
  checks: [
    { label: "soffit", expr: "SoffitY / 1000", expect: 102, unit: "m" },
    { label: "top of slab", expr: "TopY / 1000", expect: 102.3, unit: "m" },
    { label: "outer width", expr: "OuterWidth", expect: 7400 },
  ],
  constraints: [{ label: "the box sits below the rail", expr: "RailLevel * 1000", op: ">", than: "TopY" }],
  features: [
    { name: "Datums", description: "centre line; rail, HFL and invert level lines", stage: "datum" },
    { name: "Cells", description: "the clear openings, one pattern repeated CellCount times", stage: "primary", after: ["Datums"] },
    { name: "Box", description: "the concrete around the cells", stage: "primary", after: ["Cells"] },
    { name: "Bedding", description: "lean concrete under the base slab", stage: "detail", after: ["Box"] },
    { name: "Dimensions", description: "clear spans, height, thicknesses, overall", stage: "annotation" },
    { name: "Levels", description: "rail, HFL, invert callouts", stage: "annotation" },
  ],
  expect: {
    dimensions: [2000, 2000, 2000, 2000, 350, 300, 350, 7400],
    levels: [{ label: "RAIL LEVEL", rl: 104.5 }, { label: "HFL", rl: 101.8 }, { label: "INVERT LEVEL", rl: 100 }],
    texts: [],
  },
};

const DATUMS = {
  feature: "Datums",
  entities: [
    { id: "CL", kind: "line", from: ["0", "BaseY - 1000"], to: ["0", "RailLevel * 1000 + 500"], layer: "centre" },
    { id: "RailLine", kind: "line", from: ["-HalfWidth - 3000", "RailLevel * 1000"], to: ["HalfWidth + 1000", "RailLevel * 1000"], layer: "level" },
    { id: "HflLine", kind: "line", from: ["-HalfWidth - 3000", "HFL * 1000"], to: ["-HalfWidth", "HFL * 1000"], layer: "water" },
    { id: "InvertLine", kind: "line", from: ["-HalfWidth - 3000", "InvertY"], to: ["-HalfWidth", "InvertY"], layer: "ground" },
  ],
};
const CELLS = { feature: "Cells", entities: [{ id: "Cell", kind: "rect", x: "-HalfWidth + Wall + k * Pitch", y: "InvertY", w: "ClearSpan", h: "ClearHeight", repeat: { count: "CellCount", index: "k" } }] };
const OUTER = { feature: "Box", entities: [{ id: "BoxOuter", kind: "rect", x: "-HalfWidth", y: "BaseY", w: "OuterWidth", h: "TopY - BaseY" }] };
const BEDDING = { feature: "Bedding", entities: [{ id: "Bed", kind: "rect", x: "-HalfWidth - BeddingProjection", y: "BaseY - Bedding", w: "OuterWidth + 2 * BeddingProjection", h: "Bedding" }] };

async function buildGeometry(ctx: ToolContext) {
  await ok(ctx, "plan", BOX);
  await ok(ctx, "construct", DATUMS);
  await ok(ctx, "construct", CELLS);
  await ok(ctx, "construct", OUTER);
  await ok(ctx, "construct", BEDDING);
}

async function annotate(ctx: ToolContext) {
  await ok(ctx, "annotate", {
    feature: "Dimensions",
    items: [
      { kind: "dimension", from: ["-HalfWidth + Wall + k * Pitch", "SoffitY"], to: ["-HalfWidth + Wall + k * Pitch + ClearSpan", "SoffitY"], offset: "-DIM", repeat: { count: "CellCount", index: "k" } },
      { kind: "dimension", from: ["-HalfWidth + Wall", "InvertY"], to: ["-HalfWidth + Wall", "SoffitY"], offset: "DIM" },
      { kind: "dimension", from: ["-HalfWidth", "BaseY"], to: ["-HalfWidth + Wall", "BaseY"], offset: "-DIM" },
      { kind: "dimension", from: ["HalfWidth", "SoffitY"], to: ["HalfWidth", "TopY"], offset: "DIM" },
      { kind: "dimension", from: ["HalfWidth", "BaseY"], to: ["HalfWidth", "InvertY"], offset: "DIM" },
      { kind: "dimension", from: ["-HalfWidth", "TopY"], to: ["HalfWidth", "TopY"], offset: "2 * DIM" },
    ],
  });
  await ok(ctx, "annotate", {
    feature: "Levels",
    items: [
      { kind: "level", at: ["-HalfWidth - 3000", "RailLevel * 1000"], label: "RAIL LEVEL" },
      { kind: "level", at: ["-HalfWidth - 3000", "HFL * 1000"], label: "HFL", symbol: "water" },
      { kind: "level", at: ["-HalfWidth - 3000", "InvertY"], label: "INVERT LEVEL", symbol: "ground" },
    ],
  });
}

const xsOf = (ctx: ToolContext, id: string) => constructionEvaluation(ctx.ws)!.loops.filter((l) => l.primitiveId === id).flatMap((l) => l.points.map((p) => p.x));

describe("think before drawing: the plan says what, which views, which datums, in what order", () => {
  it("wants the structure, its views and a stage for every feature", async () => {
    const ctx = context();
    expect((await call(ctx, "plan", { ...BOX, structure: undefined })).text).toMatch(/Say what you are building/);
    expect((await call(ctx, "plan", { ...BOX, views: [] })).text).toMatch(/List the views/);
    expect((await call(ctx, "plan", { ...BOX, features: BOX.features.map((f) => ({ ...f, stage: undefined })) })).text).toMatch(/Give every feature its stage/);
    expect((await call(ctx, "plan", { ...BOX, features: BOX.features.filter((f) => f.stage !== "datum").map((f) => ({ ...f, after: undefined })) })).text).toMatch(/Set out first/);
    const r = await ok(ctx, "plan", BOX);
    expect(r.text).toMatch(/Construction sequence: Datums \(datum\) → Cells \(primary\) → Box \(primary\) → Bedding \(detail\) → Dimensions \(annotation\) → Levels \(annotation\)/);
  });
});

describe("the agent drafts; it does not design", () => {
  it("wants a source for every typed value", async () => {
    const ctx = context();
    const r = await call(ctx, "plan", { ...BOX, values: BOX.values.map((v) => ({ ...v, source: undefined })) });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/Say where each value you typed comes from/);
  });

  it("refuses a 'given' number the brief does not write", async () => {
    const ctx = context();
    const r = await call(ctx, "plan", { ...BOX, values: BOX.values.map((v) => (v.name === "Wall" ? G("Wall", 400) : v)) });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/The brief does not write Wall = 400/);
    expect(r.text).toMatch(/mark it "required"/);
    // "scaled" needs an image to scale from.
    const s = await call(ctx, "plan", { ...BOX, values: BOX.values.map((v) => (v.name === "Bedding" ? { ...v, source: "scaled" } : v)) });
    expect(s.text).toMatch(/none is attached/);
  });

  it("draws a required input as a placeholder and says so everywhere", async () => {
    const ctx = context();
    const plan = await ok(ctx, "plan", BOX);
    expect(plan.text).toMatch(/REQUIRED INPUTS not provided .*Bedding=150 mm/);
    await buildGeometry(ctx);
    const bedding = currentDefinition(ctx.ws)!.parameters.find((p) => p.name === "Bedding")!;
    expect(bedding.provenance).toBe("required");
    expect(bedding.group).toBe("Required inputs (placeholders)");
    expect(bedding.description).toMatch(/placeholder/);
    expect(currentDefinition(ctx.ws)!.parameters.find((p) => p.name === "ClearSpan")!.provenance).toBe("given");
    const g = await ok(ctx, "check_geometry");
    expect(g.text).toMatch(/design inputs still required: Bedding = 150 mm/);
    const audit = runAudit(ctx.ws.allShapes(), ctx.ws.cad);
    const finding = audit.results.find((x) => x.ruleId === "PARAM-REQUIRED-INPUT")!;
    expect(finding.status).toBe("requires_review");
    expect(finding.message).toMatch(/not provided and are drawn with placeholders/);
    // Once a person enters the approved value, it is no longer a placeholder.
    ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: ctx.ws.construction.instanceId!, values: { Bedding: 100, BeddingProjection: 200 } });
    expect(runAudit(ctx.ws.allShapes(), ctx.ws.cad).results.some((x) => x.ruleId === "PARAM-REQUIRED-INPUT")).toBe(false);
  });
});

describe("geometry first, in the draftsman's order", () => {
  it("builds datums, then the structure, then its details", async () => {
    const ctx = context();
    await ok(ctx, "plan", BOX);
    const early = await call(ctx, "construct", CELLS);
    expect(early.ok).toBe(false);
    expect(early.text).toMatch(/Build in order: Cells \(primary\) comes after Datums \(datum\)/);
    await ok(ctx, "construct", DATUMS);
    const detail = await call(ctx, "construct", BEDDING);
    expect(detail.text).toMatch(/comes after Cells \(primary\), Box \(primary\)/);
    const box = await call(ctx, "construct", OUTER);
    expect(box.text).toMatch(/Box is built from Cells — construct it first/);
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    // Annotation features are not construction.
    const ann = await call(ctx, "construct", { feature: "Dimensions", entities: [{ id: "X", kind: "line", from: ["0", "0"], to: ["1", "1"] }] });
    expect(ann.text).toMatch(/annotation feature: .* added with annotate, after check_geometry passes/);
  });

  it("annotates only after check_geometry passes on the geometry as it is now", async () => {
    const ctx = context();
    await buildGeometry(ctx);
    const early = await call(ctx, "annotate", { kind: "level", feature: "Levels", at: ["-HalfWidth - 3000", "InvertY"], label: "INVERT LEVEL" });
    expect(early.ok).toBe(false);
    expect(early.text).toMatch(/Geometry first/);
    const g = await ok(ctx, "check_geometry");
    expect(g.text, g.text).toMatch(/CHECK GEOMETRY: PASS/);
    expect(g.text).toMatch(/Written numbers in the geometry: 4\/4 lengths, 3\/3 levels/);
    expect(g.text).toMatch(/CellCount moves/);
    await ok(ctx, "annotate", { kind: "level", feature: "Levels", at: ["-HalfWidth - 3000", "InvertY"], label: "INVERT LEVEL" });
    // A change to the geometry sends it back through the check.
    await ok(ctx, "plan", { update: true, values: [G("TopSlab", 300)], features: [{ name: "Haunch", description: "a fillet", stage: "detail", after: ["Box"] }] });
    await ok(ctx, "construct", { feature: "Haunch", entities: [{ id: "Fillet", kind: "loop", points: [["-HalfWidth + Wall", "SoffitY"], ["-HalfWidth + Wall + TopSlab / 2", "SoffitY"], ["-HalfWidth + Wall", "SoffitY - TopSlab / 2"]] }] });
    const stale = await call(ctx, "annotate", { kind: "level", feature: "Levels", at: ["-HalfWidth - 3000", "HFL * 1000"], label: "HFL" });
    expect(stale.text).toMatch(/The geometry changed since check_geometry passed/);
    await ok(ctx, "check_geometry");
    await ok(ctx, "annotate", { kind: "level", feature: "Levels", at: ["-HalfWidth - 3000", "HFL * 1000"], label: "HFL" });
  });

  it("finds a written number or level the geometry does not contain", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX, expect: { ...BOX.expect, dimensions: [...BOX.expect.dimensions, 2450], levels: [...BOX.expect.levels, { label: "FORMATION LEVEL", rl: 103.9 }] } });
    await ok(ctx, "construct", DATUMS);
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    const g = await ok(ctx, "check_geometry");
    expect(g.text).toMatch(/CHECK GEOMETRY: FAIL/);
    expect(g.text).toMatch(/Numbers the drawing writes that your geometry does not contain anywhere: 2450/);
    expect(g.text).toMatch(/Levels with no constructed line or face at their height: FORMATION LEVEL 103\.900/);
    expect((await call(ctx, "annotate", { kind: "level", feature: "Levels", at: ["0", "InvertY"], label: "X" })).text).toMatch(/check_geometry found problems/);
  });

  it("dimensions run between points of the geometry; levels stand on constructed lines", async () => {
    const ctx = context();
    await buildGeometry(ctx);
    await ok(ctx, "check_geometry");
    const loose = await call(ctx, "annotate", { kind: "dimension", feature: "Dimensions", from: ["-HalfWidth", "TopY"], to: ["-HalfWidth + 1234", "TopY"] });
    expect(loose.ok).toBe(false);
    expect(loose.text).toMatch(/A dimension measures the geometry.*to x = -2466 is not at any face or point of your geometry/);
    const floating = await call(ctx, "annotate", { kind: "level", feature: "Levels", at: ["-HalfWidth - 3000", "103000"], label: "FORMATION LEVEL" });
    expect(floating.ok).toBe(false);
    expect(floating.text).toMatch(/Construct the level line first/);
  });
});

describe("the worked example: parametric, repeated, verified", () => {
  it("3 × 2000 with 350 walls is 7400; a span of 2500 makes it 8900 and the walls stay 350", async () => {
    const ctx = context();
    await buildGeometry(ctx);
    await ok(ctx, "check_geometry");
    await annotate(ctx);
    const v = await ok(ctx, "verify");
    expect(v.text, v.text).toMatch(/VERIFY: PASS/);
    expect(v.text).toMatch(/Dimensions: 8\/8/);
    expect(v.text).toMatch(/Levels: 3\/3/);
    expect(Math.max(...xsOf(ctx, "BoxOuter")) - Math.min(...xsOf(ctx, "BoxOuter"))).toBeCloseTo(7400, 6);

    const inst = ctx.ws.construction.instanceId!;
    const r = ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst, values: { ClearSpan: 2500 } });
    expect(r.ok, r.message).toBe(true);
    const ev = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === inst)!, ctx.ws.cad)!.evaluation;
    const outer = ev.loops.find((l) => l.primitiveId === "BoxOuter")!.points.map((p) => p.x);
    expect(Math.max(...outer) - Math.min(...outer)).toBeCloseTo(8900, 6);
    const cells = ev.loops.filter((l) => l.primitiveId === "Cell").map((l) => l.points.map((p) => p.x));
    expect(cells).toHaveLength(3);
    // Every wall, outer and interior, is still 350.
    const faces = [Math.min(...outer), ...cells.flatMap((c) => [Math.min(...c), Math.max(...c)]), Math.max(...outer)].sort((a, b) => a - b);
    for (let i = 0; i < faces.length; i += 2) expect(faces[i + 1] - faces[i]).toBeCloseTo(i === 0 || i === faces.length - 2 ? 350 : i % 2 === 0 ? 350 : 2500, 6);
    // Each cell's clear-span dimension follows: three of them, 2500 each.
    const spans = ev.dimensions.filter((d) => d.path.startsWith("D1")).map((d) => Math.abs(d.to.x - d.from.x));
    expect(spans).toEqual([2500, 2500, 2500]);
  });

  it("a count is a value: four cells regenerate from the same pattern", async () => {
    const ctx = context();
    await buildGeometry(ctx);
    const inst = ctx.ws.construction.instanceId!;
    const r = ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst, values: { CellCount: 4 } });
    expect(r.ok, r.message).toBe(true);
    const ev = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === inst)!, ctx.ws.cad)!.evaluation;
    expect(ev.loops.filter((l) => l.primitiveId === "Cell")).toHaveLength(4);
    const outer = ev.loops.find((l) => l.primitiveId === "BoxOuter")!.points.map((p) => p.x);
    expect(Math.max(...outer) - Math.min(...outer)).toBeCloseTo(4 * 2000 + 5 * 350, 6);
  });
});

describe("the ladder: the same generic tools from a single cell to a skewed box with wings", () => {
  it("single cell: CellCount 1 is the same construction", async () => {
    const ctx = context(BRIEF.replace("3 cell", "1 cell"));
    await ok(ctx, "plan", { ...BOX, values: BOX.values.map((v) => (v.name === "CellCount" ? G("CellCount", 1, "-") : v)), checks: BOX.checks.filter((c) => c.label !== "outer width"), expect: { ...BOX.expect, dimensions: [2000, 2000, 350, 300, 350, 2700] } });
    await ok(ctx, "construct", DATUMS);
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    const g = await ok(ctx, "check_geometry");
    expect(g.text, g.text).toMatch(/CHECK GEOMETRY: PASS/);
    expect(Math.max(...xsOf(ctx, "BoxOuter")) - Math.min(...xsOf(ctx, "BoxOuter"))).toBeCloseTo(2700, 6);
  });

  it("skew box in plan: the barrel turned by the skew angle; square and skew spans both in the geometry", async () => {
    const brief = "Plan of a single cell RCC box culvert: clear span 2000 mm, walls 350 mm, barrel length 12000 mm, skew 30 degrees to the track.";
    const ctx = context(brief);
    await ok(ctx, "plan", {
      route: "construction",
      structure: "Single-cell skew RCC box culvert — plan view",
      views: [{ name: "Plan", shows: "the barrel under the track, skewed" }],
      analysis: "One cell; the barrel runs across the track at a skew (0 = square, barrel perpendicular to the track); walls both sides of the opening; the track centre line crosses at the origin.",
      values: [G("ClearSpan", 2000), G("Wall", 350), G("Length", 12000), G("Skew", 30, "deg"), D("HalfLen", "Length / 2"), D("HalfIn", "ClearSpan / 2"), D("HalfOut", "HalfIn + Wall"), D("SkewSpan", "ClearSpan / cos(Skew)")],
      features: [
        { name: "Axes", description: "track centre line and the barrel axis", stage: "datum" },
        { name: "Barrel", description: "opening and walls, square to the barrel axis, then turned by the skew", stage: "primary", after: ["Axes"] },
        { name: "Dimensions", description: "square and skew spans, walls", stage: "annotation" },
      ],
      expect: { dimensions: [2000, 350], levels: [], texts: [] },
    });
    await ok(ctx, "construct", { feature: "Axes", entities: [{ id: "Track", kind: "line", from: ["0", "-HalfLen"], to: ["0", "HalfLen"], layer: "centre" }, { id: "Axis", kind: "line", from: ["-HalfLen", "0"], to: ["HalfLen", "0"], layer: "centre" }] });
    await ok(ctx, "construct", {
      feature: "Barrel",
      entities: [
        { id: "Opening", kind: "rect", x: "-HalfLen", y: "-HalfIn", w: "Length", h: "ClearSpan", layer: "hidden" },
        { id: "Outer", kind: "rect", x: "-HalfLen", y: "-HalfOut", w: "Length", h: "2 * HalfOut" },
      ],
    });
    await ok(ctx, "transform", { op: "rotate", targets: ["Opening", "Outer", "Axis"], center: ["0", "0"], angle: "Skew" });
    const g = await ok(ctx, "check_geometry");
    expect(g.text, g.text).toMatch(/CHECK GEOMETRY: PASS/);
    // The skew span along the track: the opening's two long edges cross the track centre line 2000 / cos 30° apart.
    const ev = constructionEvaluation(ctx.ws)!;
    const opening = ev.loops.find((l) => l.primitiveId === "Opening")!.points;
    const crossings: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = opening[i];
      const b = opening[(i + 1) % 4];
      if ((a.x < 0) !== (b.x < 0)) crossings.push(a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x));
    }
    expect(Math.abs(crossings[0] - crossings[1])).toBeCloseTo(2000 / Math.cos(Math.PI / 6), 3);
  });

  it("box with splayed wing walls: one wing built from the box corner, mirrored about the centre line", async () => {
    const brief = "Plan of a 1 cell RCC box culvert, clear span 2000 mm, walls 350 mm, barrel length 12000 mm, splayed wing walls 3000 mm long at 45 degrees, 300 mm thick.";
    const ctx = context(brief);
    await ok(ctx, "plan", {
      route: "construction",
      structure: "Single-cell RCC box culvert with splayed wing walls — plan view",
      views: [{ name: "Plan", shows: "barrel, face walls and the four splayed wings" }],
      analysis: "A square box; at each end the walls continue as wing walls splayed outward at 45 degrees; symmetric about both centre lines.",
      values: [G("ClearSpan", 2000), G("Wall", 350), G("Length", 12000), G("WingLength", 3000), G("Splay", 45, "deg"), G("WingThick", 300), D("HalfLen", "Length / 2"), D("HalfOut", "ClearSpan / 2 + Wall")],
      features: [
        { name: "Axes", description: "barrel axis and the track centre line", stage: "datum" },
        { name: "Barrel", description: "the box in plan", stage: "primary", after: ["Axes"] },
        { name: "Wings", description: "splayed wing walls at the four corners", stage: "detail", after: ["Barrel"] },
        { name: "Dimensions", description: "spans, walls, wing lengths", stage: "annotation" },
      ],
      expect: { dimensions: [2000, 350, 12000], levels: [], texts: [] },
    });
    await ok(ctx, "construct", { feature: "Axes", entities: [{ id: "Axis", kind: "line", from: ["-HalfLen - 4000", "0"], to: ["HalfLen + 4000", "0"], layer: "centre" }, { id: "Track", kind: "line", from: ["0", "-6000"], to: ["0", "6000"], layer: "centre" }] });
    await ok(ctx, "construct", {
      feature: "Barrel",
      entities: [
        { id: "Opening", kind: "rect", x: "-HalfLen", y: "-ClearSpan / 2", w: "Length", h: "ClearSpan", layer: "hidden" },
        { id: "Outer", kind: "rect", x: "-HalfLen", y: "-HalfOut", w: "Length", h: "2 * HalfOut" },
      ],
    });
    // One wing, from the outer corner, turned out by the splay; then mirrored about both axes.
    await ok(ctx, "construct", { feature: "Wings", entities: [{ id: "Wing", kind: "rect", x: "HalfLen", y: "HalfOut - WingThick", w: "WingLength", h: "WingThick" }] });
    await ok(ctx, "transform", { op: "rotate", targets: ["Wing"], center: ["HalfLen", "HalfOut"], angle: "Splay" });
    await ok(ctx, "transform", { op: "mirror", targets: ["Wing"], axis_y: "0", ids: ["WingB"] });
    await ok(ctx, "transform", { op: "mirror", targets: ["Wing", "WingB"], axis_x: "0", ids: ["WingC", "WingD"] });
    const g = await ok(ctx, "check_geometry");
    expect(g.text, g.text).toMatch(/CHECK GEOMETRY: PASS/);
    // A longer barrel moves every wing with the box end; a wing stays 3000 long.
    await ok(ctx, "plan", { update: true, values: [G("Length", 12000)] });
    const inst = ctx.ws.construction.instanceId!;
    ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst, values: { Length: 14000 } });
    const ev = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === inst)!, ctx.ws.cad)!.evaluation;
    for (const id of ["Wing", "WingB", "WingC", "WingD"]) {
      const p = ev.loops.find((l) => l.primitiveId === id)!.points;
      const long = Math.max(...p.map((q, i) => Math.hypot(p[(i + 1) % p.length].x - q.x, p[(i + 1) % p.length].y - q.y)));
      expect(long).toBeCloseTo(3000, 6);
      expect(Math.min(...p.map((q) => Math.abs(q.x)))).toBeCloseTo(7000, 6);
    }
  });
});

describe("no size without a name and a source", () => {
  it("refuses sizes typed into structural coordinates or formulas, until they are named", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX, features: [...BOX.features, { name: "Backing", description: "boulder backing against the outer wall", stage: "context", after: ["Box"] }] });
    await ok(ctx, "construct", DATUMS);
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    await ok(ctx, "construct", { feature: "Backing", entities: [{ id: "Boulders", kind: "rect", x: "-HalfWidth - 600", y: "BaseY", w: "600", h: "TopY - BaseY" }] });
    const g = await ok(ctx, "check_geometry");
    expect(g.text).toMatch(/CHECK GEOMETRY: FAIL/);
    expect(g.text).toMatch(/Sizes with no name and no source — typed into Boulders \(600\)/);
    // Named, with an honest source, it passes.
    await ok(ctx, "plan", { update: true, values: [{ name: "BoulderWidth", expr: "600", unit: "mm", source: "required" }] });
    await ok(ctx, "construct", { feature: "Backing", entities: [{ id: "Boulders", kind: "rect", x: "-HalfWidth - BoulderWidth", y: "BaseY", w: "BoulderWidth", h: "TopY - BaseY" }] });
    expect((await ok(ctx, "check_geometry")).text).toMatch(/CHECK GEOMETRY: PASS/);
    // A number hidden in a formula is the same thing.
    await ok(ctx, "plan", { update: true, values: [D("FormationY", "RailLevel * 1000 - 762")] });
    expect((await ok(ctx, "check_geometry")).text).toMatch(/inside formulas: FormationY = RailLevel \* 1000 - 762 \(762\)/);
  });

  it("a drafting value may place things, never size them or move a level", async () => {
    const ctx = context();
    await ok(ctx, "plan", {
      ...BOX,
      values: [...BOX.values, { name: "LevelRun", expr: "3000", unit: "mm", source: "drafting" }, { name: "TrackDepth", expr: "762", unit: "mm", source: "drafting" }, D("FormationY", "RailLevel * 1000 - TrackDepth")],
    });
    await ok(ctx, "construct", {
      feature: "Datums",
      entities: [...DATUMS.entities, { id: "FormationLine", kind: "line", from: ["-HalfWidth - LevelRun", "FormationY"], to: ["HalfWidth + LevelRun", "FormationY"], layer: "level" }],
    });
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    const g = await ok(ctx, "check_geometry");
    expect(g.text).toMatch(/Values marked drafting that size the structure or move a level: TrackDepth \(the level of FormationLine\)/);
    expect(g.text).not.toMatch(/LevelRun \(/);
  });

  it("marks a placeholder (TBC) wherever the drawing states it, until the approved value is entered", async () => {
    const ctx = context();
    await buildGeometry(ctx);
    await ok(ctx, "check_geometry");
    await ok(ctx, "annotate", {
      feature: "Dimensions",
      items: [
        { kind: "dimension", from: ["HalfWidth", "BaseY - Bedding"], to: ["HalfWidth", "BaseY"], offset: "DIM" },
        { kind: "text", at: ["0", "BaseY - 2000"], text: "{Bedding} mm LEAN CONCRETE BEDDING" },
      ],
    });
    const ev = () => constructionEvaluation(ctx.ws)!;
    expect(ev().texts.find((t) => t.text.includes("BEDDING"))!.text).toBe("150 (TBC) mm LEAN CONCRETE BEDDING");
    const dim = ev().dimensions.find((d) => Math.abs(Math.abs(d.to.y - d.from.y) - 150) < 1e-6)!;
    expect(dim.suffix).toBe(" (TBC)");
    ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: ctx.ws.construction.instanceId!, values: { Bedding: 100 } });
    const after = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === ctx.ws.construction.instanceId)!, ctx.ws.cad)!.evaluation;
    expect(after.texts.find((t) => t.text.includes("BEDDING"))!.text).toBe("100 mm LEAN CONCRETE BEDDING");
  });

  it("refuses notes that state numbers nobody gave, or a placeholder as fact", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX, expect: { ...BOX.expect, texts: ["M-25 GRADE RCC", "150 MM BEDDING"] } });
    await ok(ctx, "construct", DATUMS);
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    await ok(ctx, "check_geometry");
    await annotate(ctx);
    await ok(ctx, "annotate", { feature: "Levels", items: [{ kind: "text", at: ["0", "TopY + 500"], text: "M-25 GRADE RCC" }, { kind: "text", at: ["0", "BaseY - 2000"], text: "150 MM BEDDING" }] });
    const v = await ok(ctx, "verify");
    expect(v.text).toMatch(/Notes stating numbers the brief does not give and no value holds: T\d+ "M-25 GRADE RCC" \(25\)/);
    expect(v.text).toMatch(/Texts that state a placeholder as if it were design data: T\d+ writes 150, the placeholder for Bedding → \{Bedding\}/);
  });
});

describe("placeholders stay visible, however far they travel", () => {
  it("marks what is worked out from a placeholder: a level and the dimensions that read it", async () => {
    const ctx = context();
    await ok(ctx, "plan", {
      ...BOX,
      values: [...BOX.values, { name: "TrackDepth", expr: "762", unit: "mm", source: "required" }, D("FormationY", "RailLevel * 1000 - TrackDepth")],
      expect: { ...BOX.expect, levels: [...BOX.expect.levels, { label: "FORMATION LEVEL", rl: 103.738 }] },
    });
    await ok(ctx, "construct", { feature: "Datums", entities: [...DATUMS.entities, { id: "FormationLine", kind: "line", from: ["-HalfWidth - 3000", "FormationY"], to: ["HalfWidth", "FormationY"], layer: "level" }] });
    await ok(ctx, "construct", CELLS);
    await ok(ctx, "construct", OUTER);
    await ok(ctx, "construct", BEDDING);
    await ok(ctx, "check_geometry");
    await ok(ctx, "annotate", {
      feature: "Levels",
      items: [
        { kind: "level", at: ["-HalfWidth - 3000", "FormationY"], label: "FORMATION LEVEL" },
        { kind: "level", at: ["-HalfWidth - 3000", "RailLevel * 1000"], label: "RAIL LEVEL" },
        { kind: "dimension", from: ["-HalfWidth - 2000", "HFL * 1000"], to: ["-HalfWidth - 2000", "FormationY"], prefix: "FB-" },
        { kind: "dimension", from: ["HalfWidth", "TopY"], to: ["HalfWidth", "FormationY"] },
      ],
    });
    const ev = constructionEvaluation(ctx.ws)!;
    expect(ev.levels.find((l) => l.label.startsWith("FORMATION"))!.label).toBe("FORMATION LEVEL (TBC)");
    expect(ev.levels.find((l) => l.label.startsWith("RAIL"))!.label).toBe("RAIL LEVEL");
    const fb = ev.dimensions.find((d) => d.prefix === "FB-")!;
    expect(fb.suffix).toBe(" (TBC)");
    // Once the approved track depth is entered, the marks go.
    ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: ctx.ws.construction.instanceId!, values: { TrackDepth: 700 } });
    const after = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === ctx.ws.construction.instanceId)!, ctx.ws.cad)!.evaluation;
    expect(after.levels.find((l) => l.label.startsWith("FORMATION"))!.label).toBe("FORMATION LEVEL");
    expect(after.dimensions.find((d) => d.prefix === "FB-")!.suffix).toBeUndefined();
  });

  it("catches a grade written straight after its letter (M15)", async () => {
    const ctx = context();
    await buildGeometry(ctx);
    await ok(ctx, "check_geometry");
    await ok(ctx, "annotate", { feature: "Levels", kind: "text", at: ["0", "BaseY - 2000"], text: "LEAN CONCRETE M15" });
    expect((await ok(ctx, "verify")).text).toMatch(/"LEAN CONCRETE M15" \(15\)/);
  });
});

describe("the title block and design basis carry only what the brief gives", () => {
  it("refuses identity data nobody wrote, and 'inferred' numbers the brief does not write", async () => {
    const ctx = context();
    const pi = await call(ctx, "project_info", { chainage: "km 45/6-7", railway: "NORTHERN RAILWAY", drawing_title: "CROSS SECTION OF 3 CELL RCC BOX CULVERT" });
    expect(pi.ok).toBe(false);
    expect(pi.text).toMatch(/The brief does not give railway "NORTHERN RAILWAY", chainage "km 45\/6-7"/);
    await ok(ctx, "project_info", { drawing_title: "CROSS SECTION OF 3 CELL RCC BOX CULVERT", structure_type: "box_culvert" });
    const db = await call(ctx, "design_basis", { field: "formationLevel", value: "103.738", status: "INFERRED" });
    expect(db.text).toMatch(/the brief does not write 103\.738/);
    await ok(ctx, "design_basis", { field: "hfl", value: "101.800", status: "INFERRED" });
    await ok(ctx, "design_basis", { field: "formationLevel", value: "103.738", status: "ASSUMED_FOR_DRAFT", note: "rail 104.500 − 0.762 track depth (required input)" });
  });
});
