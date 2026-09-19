/**
 * The construction route: plan first, construct from primitives with
 * coordinates written as expressions of the plan's values, derive geometry
 * symbolically (mirror, offset, copy, rotate, booleans), annotate, verify
 * against the reference's written numbers, compare with the reference image,
 * finish. No model in the loop — the tools are driven directly.
 */

import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext, buildScene, readingTiles } from "@/lib/agent/drafter/tools";
import { constructionEvaluation, currentDefinition } from "@/lib/agent/drafter/construction";
import { decodePng } from "@/lib/agent/drafter/reference";
import { evalExpr } from "@/lib/components/expr";
import { evaluateInstance } from "@/lib/cad/document";

function context(references?: { data: string; mimeType: string }[]): ToolContext {
  return { ws: new DraftingWorkspace(), hasReference: Boolean(references?.length), viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0, references };
}
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => runTool(ctx, name, args);
async function ok(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  const r = await call(ctx, name, args);
  expect(r.ok, `${name}: ${r.text}`).toBe(true);
  return r;
}

const V = (name: string, expr: string | number, unit = "mm", note?: string) => ({ name, expr: String(expr), unit, note });

/** A two-cell box at true levels, symmetric about x = 0. */
const BOX_PLAN = {
  route: "construction",
  title: "BOX SECTION",
  analysis: "A two-cell RCC box at true levels, symmetric about the centre line; cells with haunches; bed level line both sides.",
  frame: "x = 0 on the centre line, y = RL x 1000",
  scale: 100,
  values: [
    V("FormationLevel", 59.913, "m"),
    V("BedLevel", 56.538, "m"),
    V("ClearSpan", 2180),
    V("ClearHeight", 2870),
    V("Wall", 400),
    V("MidWall", 350),
    V("TopSlab", 400),
    V("BottomSlab", 500),
    V("Haunch", 200),
    V("Wearing", 150),
    V("FloorY", "BedLevel * 1000 - Wearing"),
    V("SoffitY", "FloorY + ClearHeight"),
    V("TopY", "SoffitY + TopSlab"),
    V("BottomY", "FloorY - BottomSlab"),
    V("HalfWidth", "ClearSpan + MidWall / 2 + Wall"),
    V("CellIn", "MidWall / 2"),
    V("CellOut", "CellIn + ClearSpan"),
  ],
  checks: [
    { label: "cushion", expr: "FormationLevel * 1000 - TopY", expect: 255 },
    { label: "top of slab", expr: "TopY / 1000", expect: 59.658, unit: "m" },
  ],
  features: [
    { name: "Box", description: "outer box and cells" },
    { name: "Annotation", description: "levels and dimensions" },
  ],
  expect: {
    dimensions: [2180, 2180, 350, 2870],
    levels: [{ label: "TOP OF SLAB", rl: 59.658 }, { label: "BED LEVEL", rl: 56.538 }],
    texts: ["HAUNCH 200 X 200"],
  },
};

const CELL = [
  ["CellIn + Haunch", "FloorY"],
  ["CellOut - Haunch", "FloorY"],
  ["CellOut", "FloorY + Haunch"],
  ["CellOut", "SoffitY - Haunch"],
  ["CellOut - Haunch", "SoffitY"],
  ["CellIn + Haunch", "SoffitY"],
  ["CellIn", "SoffitY - Haunch"],
  ["CellIn", "FloorY + Haunch"],
];

async function buildBox(ctx: ToolContext) {
  await ok(ctx, "plan", BOX_PLAN);
  await ok(ctx, "construct", {
    feature: "Box",
    entities: [
      { id: "BoxOuter", kind: "rect", x: "-HalfWidth", y: "BottomY", w: "2 * HalfWidth", h: "TopY - BottomY" },
      { id: "RightCell", kind: "loop", points: CELL },
      { id: "CL", kind: "line", from: ["0", "BottomY - 500"], to: ["0", "TopY + 800"], layer: "centre" },
      { id: "FormLine", kind: "line", from: ["-HalfWidth - 3000", "FormationLevel * 1000"], to: ["HalfWidth", "FormationLevel * 1000"], layer: "level" },
    ],
  });
  await ok(ctx, "transform", { op: "mirror", targets: ["RightCell"], axis_x: "0", ids: ["LeftCell"] });
}

async function annotateBox(ctx: ToolContext) {
  const y = "FloorY + 1400";
  for (const [from, to] of [
    [["-CellOut", y], ["-CellIn", y]],
    [["-CellIn", y], ["CellIn", y]],
    [["CellIn", y], ["CellOut", y]],
    [["CellIn + 500", "SoffitY"], ["CellIn + 500", "FloorY"]],
  ]) {
    await ok(ctx, "annotate", { kind: "dimension", feature: "Annotation", from, to, offset: 0 });
  }
  await ok(ctx, "annotate", { kind: "level", feature: "Annotation", at: ["-HalfWidth - 4000", "TopY"], label: "TOP OF SLAB", format: "{label} {rl}" });
  await ok(ctx, "annotate", { kind: "level", feature: "Annotation", at: ["-HalfWidth - 4000", "BedLevel * 1000"], label: "BED LEVEL", format: "{label} {rl}", symbol: "ground" });
  await ok(ctx, "annotate", { kind: "leader", feature: "Annotation", text: "HAUNCH 200 X 200", points: [["CellOut - Haunch / 2", "SoffitY - Haunch / 2"], ["HalfWidth + 800", "TopY + 600"], ["HalfWidth + 2400", "TopY + 600"]] });
}

describe("plan before geometry", () => {
  it("refuses every drawing tool until a plan is recorded", async () => {
    const ctx = context();
    for (const [tool, args] of [
      ["construct", { feature: "Box", entities: [{ id: "A", kind: "rect", x: 0, y: 0, w: 10, h: 10 }] }],
      ["draw_rectangle", { name: "A", x: 0, y: 0, width: 10, height: 10 }],
      ["annotate", { kind: "text", at: ["0", "0"], text: "X" }],
    ] as const) {
      const r = await call(ctx, tool, args);
      expect(r.ok, tool).toBe(false);
      expect(r.text).toMatch(/Plan first/);
    }
    expect(ctx.ws.cad.components).toHaveLength(0);
    expect(ctx.ws.shapes).toHaveLength(0);
  });

  it("wants a real analysis and features before it records a construction plan", async () => {
    const ctx = context();
    expect((await call(ctx, "plan", { ...BOX_PLAN, analysis: "a box" })).text).toMatch(/Write the analysis first/);
    expect((await call(ctx, "plan", { ...BOX_PLAN, features: [] })).text).toMatch(/List the features/);
  });

  it("evaluates the values in dependency order and reports each check", async () => {
    const ctx = context();
    const r = await ok(ctx, "plan", BOX_PLAN);
    expect(r.text).toMatch(/TopY = SoffitY \+ TopSlab = 59658 mm/);
    expect(r.text).toMatch(/ok {3}cushion: .* = 255, the reference says 255/);
    expect(r.text).toMatch(/ok {3}top of slab: .* = 59\.658/);
    // A misread number fails its check before anything is drawn.
    const wrong = await ok(ctx, "plan", { ...BOX_PLAN, values: BOX_PLAN.values.map((v) => (v.name === "TopSlab" ? V("TopSlab", 430) : v)) });
    expect(wrong.text).toMatch(/FAIL cushion: .* = 225, the reference says 255/);
    expect(wrong.text).toMatch(/check\(s\) FAIL/);
  });

  it("revises only what changes with update, and the drawing follows", async () => {
    const ctx = context();
    await buildBox(ctx);
    const r = await ok(ctx, "plan", { update: true, values: [V("ClearSpan", 2500)], checks: [{ label: "span", expr: "ClearSpan", expect: 2500 }] });
    expect(ctx.ws.construction.plan!.values).toHaveLength(BOX_PLAN.values.length);
    expect(r.text).toMatch(/ok {3}span/);
    const box = constructionEvaluation(ctx.ws)!.loops.find((l) => l.primitiveId === "BoxOuter")!;
    expect(Math.max(...box.points.map((p) => p.x))).toBeCloseTo(3075, 6);
    await ok(ctx, "plan", { update: true, remove: ["span"] });
    expect(ctx.ws.construction.plan!.checks.map((c) => c.label)).toEqual(["cushion", "top of slab"]);
  });

  it("refuses unknown names and circular relations, changing nothing", async () => {
    const ctx = context();
    const unknown = await call(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("X", "Nope * 2")] });
    expect(unknown.ok).toBe(false);
    expect(unknown.text).toMatch(/uses Nope/);
    const circle = await call(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("A", "B + 1"), V("B", "A + 1")] });
    expect(circle.ok).toBe(false);
    expect(circle.text).toMatch(/in a circle: A, B/);
    expect(ctx.ws.construction.plan).toBeNull();
  });

  it("keeps the routes apart: no free sketch lines in a construction", async () => {
    const ctx = context();
    await ok(ctx, "plan", BOX_PLAN);
    const r = await call(ctx, "draw_line", { name: "L", from: [0, 0], to: [1, 1] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/construction route/);
    const d = await call(ctx, "dimension", { name: "X", what: "length", a: "L" });
    expect(d.text).toMatch(/annotate kind=dimension/);
  });
});

describe("construction from expressions", () => {
  it("builds from the plan's values; the engine does the arithmetic", async () => {
    const ctx = context();
    await buildBox(ctx);
    const def = currentDefinition(ctx.ws)!;
    const box = def.primitives!.find((p) => p.id === "BoxOuter")!;
    expect(box.kind).toBe("loop");
    // Coordinates are stored as expressions, not as numbers the model computed.
    expect(box.kind === "loop" && box.points[0]).toEqual(["-HalfWidth", "BottomY"]);
    const ev = constructionEvaluation(ctx.ws)!;
    const left = ev.loops.find((l) => l.primitiveId === "LeftCell")!;
    expect(left.points.map((p) => [p.x, p.y])).toContainEqual([-2355, 56588]);
    // It is a component of the drawing's own, never a library part.
    expect(def.origin?.kind).toBe("drawn");
    expect(def.id).toMatch(/^drawing\.agent-/);
  });

  it("refers to points already built: Box.p2.x, Box.e1.mid", async () => {
    const ctx = context();
    await buildBox(ctx);
    const r = await ok(ctx, "construct", { feature: "Box", entities: [{ id: "Tick", kind: "line", from: "BoxOuter.e1.mid", to: ["BoxOuter.p2.x", "BoxOuter.p2.y - 300"] }] });
    expect(r.text).toMatch(/Tick path: p1 \(0, 55888\) p2 \(2755, 55588\)/);
  });

  it("refuses an outline that crosses itself, and changes nothing", async () => {
    const ctx = context();
    await buildBox(ctx);
    const before = currentDefinition(ctx.ws)!.primitives!.length;
    const r = await call(ctx, "construct", { feature: "Box", entities: [{ id: "Bow", kind: "loop", points: [["0", "0"], ["1000", "1000"], ["1000", "0"], ["0", "1000"]] }] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/Refused/);
    expect(currentDefinition(ctx.ws)!.primitives!.length).toBe(before);
  });

  it("follows a revised value everywhere, mirrored copies included", async () => {
    const ctx = context();
    await buildBox(ctx);
    await ok(ctx, "plan", { ...BOX_PLAN, values: BOX_PLAN.values.map((v) => (v.name === "ClearSpan" ? V("ClearSpan", 2500) : v)) });
    const ev = constructionEvaluation(ctx.ws)!;
    const xs = (id: string) => ev.loops.find((l) => l.primitiveId === id)!.points.map((p) => p.x);
    expect(Math.min(...xs("LeftCell"))).toBeCloseTo(-2675, 6);
    expect(Math.max(...xs("RightCell"))).toBeCloseTo(2675, 6);
    expect(Math.max(...xs("BoxOuter"))).toBeCloseTo(3075, 6);
    // Nothing else moved: the haunch legs are still 200.
    const cell = ev.loops.find((l) => l.primitiveId === "RightCell")!.points;
    expect(cell[1].x - cell[0].x).toBeCloseTo(2500 - 400, 6);
    expect(cell[2].y - cell[1].y).toBeCloseTo(200, 6);
  });
});

describe("symbolic transforms and booleans", () => {
  it("offsets an outline exactly, and the band stays that thick when values change", async () => {
    const ctx = context();
    await buildBox(ctx);
    const r = await ok(ctx, "transform", { op: "offset", targets: ["BoxOuter"], distance: "Wall", side: "inside", ids: ["Inner"] });
    expect(r.text).toMatch(/Inner loop: p1 \(-2355, 56288\)/);
    await ok(ctx, "plan", { ...BOX_PLAN, values: BOX_PLAN.values.map((v) => (v.name === "Wall" ? V("Wall", 500) : v)) });
    const ev = constructionEvaluation(ctx.ws)!;
    const outer = ev.loops.find((l) => l.primitiveId === "BoxOuter")!.points;
    const inner = ev.loops.find((l) => l.primitiveId === "Inner")!.points;
    expect(inner[0].x - outer[0].x).toBeCloseTo(500, 6);
    expect(inner[0].y - outer[0].y).toBeCloseTo(500, 6);
  });

  it("offsets a sloped line along its own normal", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("Slope", 2, "-")] });
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "S", kind: "line", from: ["0", "0"], to: ["Slope * 1000", "1000"] }] });
    await ok(ctx, "transform", { op: "offset", targets: ["S"], distance: "100", side: "left", ids: ["S2"] });
    const ev = constructionEvaluation(ctx.ws)!;
    const [a] = ev.loops.find((l) => l.primitiveId === "S")!.points;
    const [b] = ev.loops.find((l) => l.primitiveId === "S2")!.points;
    // Perpendicular distance from the offset line's start to the original line is 100.
    const d = Math.abs((b.x - a.x) * 1000 - (b.y - a.y) * 2000) / Math.hypot(2000, 1000);
    expect(d).toBeCloseTo(100, 6);
  });

  it("copies an array and turns a copy by a quarter turn", async () => {
    const ctx = context();
    await buildBox(ctx);
    const c = await ok(ctx, "transform", { op: "copy", targets: ["CL"], dx: "HalfWidth", count: 2 });
    expect(c.text).toMatch(/CL_c1 .*p1 \(2755,/);
    expect(c.text).toMatch(/CL_c2 .*p1 \(5510,/);
    const r = await ok(ctx, "transform", { op: "rotate", targets: ["CL_c1"], center: ["HalfWidth", "BottomY"], angle: 90 });
    expect(r.text).toMatch(/CL_c1 path \[centre\]: p1 \(3255, 55888\) p2 \(-1815, 55888\)/);
  });

  it("unions and subtracts outlines; the result follows the values", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("W", 1000), V("Notch", 300)] });
    await ok(ctx, "construct", {
      feature: "Box",
      entities: [
        { id: "A", kind: "rect", x: "0", y: "0", w: "W", h: "W" },
        { id: "B", kind: "rect", x: "W - Notch", y: "W - Notch", w: "2 * Notch", h: "2 * Notch" },
      ],
    });
    const u = await ok(ctx, "boolean", { op: "difference", a: ["A"], b: ["B"], id: "Cut" });
    expect(u.text).toMatch(/difference: 1 loop/);
    const pts = () => constructionEvaluation(ctx.ws)!.loops.find((l) => l.primitiveId === "Cut")!.points;
    const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, q, i) => s + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0) / 2);
    expect(area(pts())).toBeCloseTo(1000 * 1000 - 300 * 300, 3);
    // Its vertices are expressions of W and Notch, so a new value moves them.
    await ok(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("W", 1000), V("Notch", 400)] });
    expect(area(pts())).toBeCloseTo(1000 * 1000 - 400 * 400, 3);
    const union = await ok(ctx, "construct", { feature: "Box", entities: [{ id: "C", kind: "rect", x: "W", y: "0", w: "W", h: "W" }, { id: "D", kind: "rect", x: "W * 1.5", y: "W / 2", w: "W", h: "W" }] });
    expect(union.ok).toBe(true);
    const r = await ok(ctx, "boolean", { op: "union", a: ["C"], b: ["D"], id: "CD" });
    expect(r.text).toMatch(/union: 1 loop/);
    const cd = constructionEvaluation(ctx.ws)!.loops.find((l) => l.primitiveId === "CD")!.points;
    expect(area(cd)).toBeCloseTo(2 * 1000 * 1000 - 500 * 500, 3);
  });
});

describe("values that drive nothing", () => {
  it("fails verify while a typed value drives no geometry", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("SoffitLevel", 59.258, "m", "written")] });
    await buildBox(ctx);
    // buildBox re-planned without it; plan again with it, typed but unused.
    await ok(ctx, "plan", { ...BOX_PLAN, values: [...BOX_PLAN.values, V("SoffitLevel", 59.258, "m", "written")] });
    await annotateBox(ctx);
    const r = await ok(ctx, "verify");
    expect(r.text).toMatch(/Values that drive nothing: SoffitLevel/);
    // The written level belongs in a check; then verify passes.
    await ok(ctx, "plan", { ...BOX_PLAN, checks: [...BOX_PLAN.checks, { label: "soffit", expr: "SoffitY / 1000", expect: 59.258, unit: "m" }] });
    expect((await ok(ctx, "verify")).text).toMatch(/VERIFY: PASS/);
  });
});

describe("annotation, measurement and verification", () => {
  it("reads levels from heights and dimensions from the geometry", async () => {
    const ctx = context();
    await buildBox(ctx);
    const lv = await ok(ctx, "annotate", { kind: "level", feature: "Annotation", at: ["-6000", "TopY"], label: "top of slab", format: "{label} {rl}" });
    expect(lv.text).toMatch(/"TOP OF SLAB" at RL 59\.658/);
    const d = await ok(ctx, "annotate", { kind: "dimension", feature: "Annotation", from: ["-CellOut", "SoffitY"], to: ["-CellIn", "SoffitY"], prefix: "C.S. " });
    expect(d.text).toMatch(/measuring 2180 \(reads "C\.S\. 2180"\)/);
    const scene = buildScene(ctx.ws);
    expect((scene.notes ?? []).map((n) => n.text)).toContain("TOP OF SLAB 59.658");
  });

  it("annotates many items in one call, refusing only the bad ones", async () => {
    const ctx = context();
    await buildBox(ctx);
    const r = await ok(ctx, "annotate", {
      feature: "Annotation",
      items: [
        { kind: "dimension", from: ["-CellOut", "SoffitY"], to: ["-CellIn", "SoffitY"] },
        { kind: "level", at: ["-6000", "TopY"], label: "TOP OF SLAB", format: "{label} {rl}" },
        { kind: "hatch", boundary: "NoSuchLoop", material: "sand" },
      ],
    });
    expect(r.text).toMatch(/2 of 3 added/);
    expect(r.text).toMatch(/3\. REFUSED: There is no entity "NoSuchLoop"/);
    expect(ctx.ws.construction.tags.D1).toBe("Annotation");
  });

  it("delete removes construction entities too (the model reaches for either name)", async () => {
    const ctx = context();
    await buildBox(ctx);
    const r = await ok(ctx, "delete", { targets: ["CL"] });
    expect(r.text).toMatch(/Removed CL/);
    expect(currentDefinition(ctx.ws)!.primitives!.some((p) => p.id === "CL")).toBe(false);
  });

  it("hatches the smallest constructed loop around a point", async () => {
    const ctx = context();
    await buildBox(ctx);
    const h = await ok(ctx, "annotate", { kind: "hatch", at: ["1000", "58000"], material: "sand" });
    expect(h.text).toMatch(/sand in RightCell/);
  });

  it("measures points, edges, entities and dimensions exactly", async () => {
    const ctx = context();
    await buildBox(ctx);
    expect((await ok(ctx, "measure", { a: "RightCell.e2" })).text).toMatch(/length 282\.8; dx 200, dy 200; direction 45°, slope 1H : 1V/);
    expect((await ok(ctx, "measure", { a: "LeftCell.p1", b: "RightCell.p1" })).text).toMatch(/distance 750; dx 750, dy 0/);
    expect((await ok(ctx, "measure", { a: "BoxOuter" })).text).toMatch(/x -2755…2755 \(5510\)/);
    expect((await ok(ctx, "measure", { a: "TopY / 1000" })).text).toBe("= 59.658");
  });

  it("verify passes only when every written number is measured back from the geometry", async () => {
    const ctx = context();
    await buildBox(ctx);
    const early = await ok(ctx, "verify");
    expect(early.text).toMatch(/VERIFY: FAIL/);
    expect(early.text).toMatch(/Feature "Annotation" .* has nothing constructed/);
    expect(early.text).toMatch(/Reference dimensions not found on your drawing: 2180, 2180, 350, 2870/);
    expect(early.text).toMatch(/Level "TOP OF SLAB" \(59\.658\) is not called out/);
    expect(early.text).toMatch(/Texts on the reference missing from yours: "HAUNCH 200 X 200"/);
    await annotateBox(ctx);
    const pass = await ok(ctx, "verify");
    expect(pass.text, pass.text).toMatch(/VERIFY: PASS/);
    expect(pass.text).toMatch(/Dimensions: 4\/4/);
    expect(pass.text).toMatch(/Levels: 2\/2/);
  });

  it("names the level that sits at the wrong height", async () => {
    const ctx = context();
    await buildBox(ctx);
    await annotateBox(ctx);
    await ok(ctx, "annotate", { kind: "level", id: "LV1", feature: "Annotation", at: ["-HalfWidth - 4000", "SoffitY"], label: "TOP OF SLAB", format: "{label} {rl}" });
    const r = await ok(ctx, "verify");
    expect(r.text).toMatch(/Level "TOP OF SLAB" is at RL 59\.258 on your drawing; the reference says 59\.658/);
  });

  it("reports a contradiction on the reference instead of faking it", async () => {
    const ctx = context();
    const bad = await call(ctx, "plan", { ...BOX_PLAN, expect: { ...BOX_PLAN.expect, disputed: [{ what: "225", reason: "typo" }] } });
    expect(bad.ok).toBe(false);
    expect(bad.text).toMatch(/say why/);
    await buildBox(ctx);
    await ok(ctx, "plan", { ...BOX_PLAN, expect: { ...BOX_PLAN.expect, disputed: [{ what: "cushion 225 on the right half", reason: "formation 59.913 − top of slab 59.658 gives 255, as the left half writes" }] } });
    await annotateBox(ctx);
    const r = await ok(ctx, "verify");
    expect(r.text).toMatch(/VERIFY: PASS/);
    expect(r.text).toMatch(/Disputed on the reference, not drawn: cushion 225 on the right half/);
    await ok(ctx, "view");
    const f = await ok(ctx, "finish", { title: "BOX", summary: "done" });
    expect(f.text).toMatch(/Reported as contradictions on the reference: cushion 225/);
  });
});

/** Rasterises the construction's outlines at a known scale — a stand-in for a scanned reference. */
function referenceOf(ctx: ToolContext, s: number, ox: number, oy: number, w: number, h: number): string {
  const ev = constructionEvaluation(ctx.ws)!;
  const px = new Uint8Array(w * h * 3).fill(255);
  for (const l of ev.loops) {
    const n = l.closed ? l.points.length : l.points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = l.points[i];
      const b = l.points[(i + 1) % l.points.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * s * 2) + 1;
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(ox + s * (a.x + ((b.x - a.x) * k) / steps));
        const y = Math.round(oy - s * (a.y + ((b.y - a.y) * k) / steps));
        if (x >= 0 && y >= 0 && x < w && y < h) px.set([200, 0, 0], (y * w + x) * 3);
      }
    }
  }
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(px.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(t), body]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

describe("comparison with the reference image", () => {
  const s = 0.08;
  const ox = 400;
  const oy = 0.08 * 60500;
  const W = 800;
  const H = 480;
  const pairs = [
    { img_x: ((ox - 2755 * s) / W) * 1000, img_y: ((oy - 55888 * s) / H) * 1000, model: ["-HalfWidth", "BottomY"] },
    { img_x: ((ox + 2755 * s) / W) * 1000, img_y: ((oy - 59658 * s) / H) * 1000, model: ["HalfWidth", "TopY"] },
  ];

  it("decodes the reference", async () => {
    const ctx = context();
    await buildBox(ctx);
    const png = decodePng(Buffer.from(referenceOf(ctx, s, ox, oy, W, H), "base64"));
    expect([png.width, png.height]).toEqual([W, H]);
  });

  it("fits the drawing onto the reference and finds the entity drawn on the wrong face", async () => {
    const built = context();
    await buildBox(built);
    const ref = referenceOf(built, s, ox, oy, W, H);
    const ctx = context([{ data: ref, mimeType: "image/png" }]);
    await buildBox(ctx);
    const good = await ok(ctx, "compare_reference", { pairs });
    expect(good.image?.mimeType).toBe("image/png");
    expect(good.text).toMatch(/1 px of the reference = 12\.5 mm/);
    expect(good.text).toMatch(/Every constructed outline lies on the reference's lines/);
    // A cell built 300 mm too high is caught and named.
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "LeftCell", kind: "loop", points: CELL.map(([x, y]) => [`-(${x})`, `${y} + 300`]) }] });
    const bad = await ok(ctx, "compare_reference", { pairs, locate: [{ img_x: pairs[0].img_x, img_y: pairs[0].img_y, label: "corner" }] });
    expect(bad.text).toMatch(/LeftCell: \d+% on the lines/);
    expect(bad.text).not.toMatch(/RightCell:/);
    // Within a pixel of the reference (12.5 mm here).
    const [, x, y] = /corner: \((-?[\d.]+), (-?[\d.]+)\)/.exec(bad.text)!;
    expect(Math.abs(Number(x) + 2755)).toBeLessThan(12.5);
    expect(Math.abs(Number(y) - 55888)).toBeLessThan(12.5);
  });

  it("zooms into the reference, before and after a fit, and on an entity that is off", async () => {
    const built = context();
    await buildBox(built);
    const ctx = context([{ data: referenceOf(built, s, ox, oy, W, H), mimeType: "image/png" }]);
    // Reading the reference needs no plan.
    const z = await ok(ctx, "zoom_reference", { region: [300, 400, 700, 800] });
    expect(z.image?.mimeType).toBe("image/png");
    expect(z.text).toMatch(/magnified 4×/);
    expect((await call(ctx, "zoom_reference", { region: [300, 400, 700, 800], overlay: true })).text).toMatch(/no fit yet/);
    await buildBox(ctx);
    await ok(ctx, "compare_reference", { pairs });
    expect((await ok(ctx, "zoom_reference", { region: [300, 400, 700, 800], overlay: true })).text).toMatch(/1 px of the reference = 12\.5 mm/);
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "LeftCell", kind: "loop", points: CELL.map(([x, y]) => [`-(${x})`, `${y} + 300`]) }] });
    // The fit is reused without pairs; focus magnifies around the entity's worst point.
    const many = await ok(ctx, "zoom_reference", { regions: [[0, 0, 500, 500], [500, 500, 1000, 1000]] });
    expect(many.images).toHaveLength(1);
    expect(many.text).toMatch(/Image 2: region x 500–1000/);
    const f = await ok(ctx, "compare_reference", { focus: "LeftCell" });
    expect(f.text).toMatch(/1 px of the reference = 12\.5 mm/);
    expect(f.text).toMatch(/magnified [\d.]+× around LeftCell/);
  });

  it("compares one part at a time (a reference whose spans are shortened by break lines)", async () => {
    const built = context();
    await buildBox(built);
    const ctx = context([{ data: referenceOf(built, s, ox, oy, W, H), mimeType: "image/png" }]);
    await buildBox(ctx);
    await ok(ctx, "construct", { feature: "Annotation", entities: [{ id: "Far", kind: "rect", x: "HalfWidth + 9000", y: "BottomY", w: "1000", h: "1000" }] });
    const whole = await ok(ctx, "compare_reference", { pairs });
    expect(whole.text).toMatch(/Far: 0% on the lines/);
    const box = await ok(ctx, "compare_reference", { pairs, entities: ["Box"] });
    expect(box.text).toMatch(/Every constructed outline lies on the reference's lines/);
    // The part's result replaces only its own entities; Far stays listed.
    expect(ctx.lastCompare!.off.map((o) => o.id)).toEqual(["Far"]);
  });

  it("sizes text for the whole drawing when the reference writes no scale", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX_PLAN, scale: undefined });
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "Small", kind: "rect", x: "0", y: "0", w: "500", h: "500" }] });
    const small = ctx.ws.cad.settings.annotationScale;
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "Big", kind: "rect", x: "0", y: "0", w: "40000", h: "8000" }] });
    expect(ctx.ws.cad.settings.annotationScale).toBeGreaterThan(small);
  });

  it("cuts the reference into magnified reading tiles for the brief", async () => {
    const built = context();
    await buildBox(built);
    const tiles = readingTiles({ data: referenceOf(built, s, ox, oy, W, H) })!;
    expect(tiles.images).toHaveLength(6);
    expect(tiles.text).toMatch(/Tile 6: x 627–1000, y 460–1000/);
    expect(readingTiles({ data: Buffer.from("not an image").toString("base64") })).toBeNull();
  });

  it("will not finish before verify passes and the drawing was compared after the last change", async () => {
    const built = context();
    await buildBox(built);
    const ctx = context([{ data: referenceOf(built, s, ox, oy, W, H), mimeType: "image/png" }]);
    await buildBox(ctx);
    const early = await call(ctx, "finish", { title: "BOX", summary: "x" });
    expect(early.ok).toBe(false);
    expect(early.text).toMatch(/Reference dimensions not found/);
    await annotateBox(ctx);
    const unseen = await call(ctx, "finish", { title: "BOX", summary: "x" });
    expect(unseen.ok).toBe(false);
    expect(unseen.text).toMatch(/compare_reference/);
    await ok(ctx, "compare_reference", { pairs });
    const f = await ok(ctx, "finish", { title: "BOX", summary: "x" });
    expect(f.finished).toBe(true);
    expect(f.text).toMatch(/constructed from scratch and verified/);
    expect(f.text).toMatch(/(9\d|100)% of the linework lies on its lines/);
  });

  it("will not finish while an entity is off the reference, unless the reason is given", async () => {
    const built = context();
    await buildBox(built);
    const ctx = context([{ data: referenceOf(built, s, ox, oy, W, H), mimeType: "image/png" }]);
    await buildBox(ctx);
    await annotateBox(ctx);
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "LeftCell", kind: "loop", points: CELL.map(([x, y]) => [`-(${x})`, `${y} + 300`]) }] });
    await ok(ctx, "compare_reference", { pairs });
    const refused = await call(ctx, "finish", { title: "BOX", summary: "x" });
    expect(refused.ok).toBe(false);
    expect(refused.text).toMatch(/LeftCell is off the reference/);
    const kept = await ok(ctx, "finish", { title: "BOX", summary: "x", off_reference: [{ id: "LeftCell", reason: "test: the reference is known to be drawn out of scale here" }] });
    expect(kept.text).toMatch(/kept off it, with reasons: LeftCell \(test: the reference/);
  });
});

describe("the construction afterwards", () => {
  it("takes relationships like any drawing-owned component, but values change through the plan", async () => {
    const ctx = context();
    await buildBox(ctx);
    const id = ctx.ws.construction.instanceId!;
    const set = await call(ctx, "set_component_values", { instance: id, values: [{ name: "ClearSpan", value: 3000 }] });
    expect(set.ok).toBe(false);
    expect(set.text).toMatch(/revising it in plan/);
    const rel = await ok(ctx, "relationship", { instance: id, name: "CushionRatio", expr: "(FormationLevel * 1000 - TopY) / ClearSpan" });
    expect(rel.text).toMatch(/CushionRatio=0\.117 \(your relationship\)/);
  });

  it("survives a round trip through the saved state", async () => {
    const ctx = context();
    await buildBox(ctx);
    const again = new DraftingWorkspace(JSON.parse(JSON.stringify(ctx.ws.toState())));
    expect(again.construction.plan?.values.length).toBe(BOX_PLAN.values.length);
    const def = currentDefinition(again)!;
    expect(evalExpr(String((def.primitives![0] as { points: unknown[][] }).points[1][0]), { HalfWidth: 2755 })).toBe(2755);
  });
});

describe("a parametric model, not a static drawing", () => {
  it("finds which value each dimension drives, and editing the value regenerates everything", async () => {
    const ctx = context();
    await buildBox(ctx);
    await annotateBox(ctx);
    const dims = currentDefinition(ctx.ws)!.dimensions!;
    // Found by sensitivity: each dimension that measures a typed value one for one drives it.
    expect(dims.map((d) => d.drives)).toEqual(["ClearSpan", "MidWall", "ClearSpan", "ClearHeight"]);
    const inst = ctx.ws.construction.instanceId!;
    const driving = ctx.ws.cad.annotations.filter((a) => a.componentInstanceId === inst && a.type === "dimension" && a.mode === "driving");
    expect(driving).toHaveLength(4);
    // What a person does in the editor (double-click the dimension, type 2600):
    const r = ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst, values: { ClearSpan: 2600 } });
    expect(r.ok, r.message).toBe(true);
    const ev = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === inst)!, ctx.ws.cad)!.evaluation;
    const outer = ev.loops.find((l) => l.primitiveId === "BoxOuter")!.points;
    expect(Math.max(...outer.map((p) => p.x))).toBeCloseTo(2600 + 175 + 400, 6);
    // The mirrored cell followed; the haunch legs did not change.
    const left = ev.loops.find((l) => l.primitiveId === "LeftCell")!.points;
    expect(Math.min(...left.map((p) => p.x))).toBeCloseTo(-(175 + 2600), 6);
    expect(left[2].y - left[1].y).toBeCloseTo(200, 6);
  });

  it("lets the author rewrite the drawing's own formulas, but not a library part's", async () => {
    const ctx = context();
    await buildBox(ctx);
    const inst = ctx.ws.construction.instanceId!;
    const r = await ok(ctx, "relationship", { instance: inst, name: "CellIn", expr: "MidWall / 2 + 100" });
    expect(r.text).toMatch(/CellIn/);
    const ev = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === inst)!, ctx.ws.cad)!.evaluation;
    expect(ev.scope.CellIn).toBeCloseTo(275, 6);
    expect(ev.sources.CellIn).toBe("related");
    expect(Math.min(...ev.loops.find((l) => l.primitiveId === "RightCell")!.points.map((p) => p.x))).toBeCloseTo(275, 6);
  });

  it("keeps the plan's constraints through every later edit", async () => {
    const ctx = context();
    await ok(ctx, "plan", { ...BOX_PLAN, constraints: [{ label: "haunches fit the span", expr: "ClearSpan", op: ">", than: "2 * Haunch" }] });
    await buildBox(ctx);
    await ok(ctx, "plan", { update: true, constraints: [{ label: "haunches fit the span", expr: "ClearSpan", op: ">", than: "2 * Haunch" }] });
    const inst = ctx.ws.construction.instanceId!;
    const r = ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst, values: { Haunch: 1200 } });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/haunches fit the span/);
    expect((await call(ctx, "plan", { ...BOX_PLAN, constraints: [{ label: "impossible", expr: "ClearSpan", op: "<", than: "100" }] })).text).toMatch(/do not hold even for the values read/);
  });

  it("takes the construction up again from the drawing alone", async () => {
    const ctx = context();
    await buildBox(ctx);
    const { cad, cadShapes } = ctx.ws.toState();
    // What the editor sends back: the drawing, without the agent's session.
    const again: ToolContext = { ...context(), ws: new DraftingWorkspace({ cad: JSON.parse(JSON.stringify(cad)), cadShapes }) };
    expect(again.ws.construction.plan?.features.map((f) => f.name)).toEqual(["Box", "Annotation"]);
    expect(again.ws.construction.tags.BoxOuter).toBe("Box");
    await ok(again, "plan", { update: true, values: [V("Wall", 500)] });
    const box = constructionEvaluation(again.ws)!.loops.find((l) => l.primitiveId === "BoxOuter")!;
    expect(Math.max(...box.points.map((p) => p.x))).toBeCloseTo(2180 + 175 + 500, 6);
  });

  it("will not keep a number that follows from others as a second copy", async () => {
    const ctx = context();
    await buildBox(ctx);
    // TopY typed from the written level instead of derived from the soffit and the slab.
    await ok(ctx, "plan", { update: true, values: [V("TopSlabLevel", 59.658, "m"), V("SoffitLevel", 59.258, "m"), V("SoffitY", "SoffitLevel * 1000"), V("TopY", "TopSlabLevel * 1000"), V("ClearHeight", "SoffitY - FloorY")] });
    await annotateBox(ctx);
    const r = await ok(ctx, "verify");
    // Wall and TopSlab are both 400: either names the relation.
    expect(r.text).toMatch(/TopSlabLevel = SoffitLevel \+ (TopSlab|Wall) \/ 1000/);
  });

  it("points at texts that repeat a value as digits, and texts with placeholders follow an edit", async () => {
    const ctx = context();
    await buildBox(ctx);
    await annotateBox(ctx);
    expect((await ok(ctx, "verify")).text).toMatch(/LD1 "200" is Haunch → \{Haunch\}/);
    await ok(ctx, "annotate", { kind: "text", id: "Title", feature: "Annotation", at: ["0", "BottomY - 2000"], text: "2 X {ClearSpan:m} X {ClearHeight:m} mt. BOX" });
    const inst = ctx.ws.construction.instanceId!;
    ctx.ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst, values: { ClearSpan: 3000 } });
    const ev = evaluateInstance(ctx.ws.cad.components.find((c) => c.id === inst)!, ctx.ws.cad)!.evaluation;
    expect(ev.texts.find((t) => t.path === "Title")?.text).toBe("2 X 3.000 X 2.870 mt. BOX");
  });

  it("regenerates every value ±5% in verify, and names a relation that breaks", async () => {
    const ctx = context();
    await buildBox(ctx);
    await annotateBox(ctx);
    expect((await ok(ctx, "verify")).text).toMatch(/every typed value changed ±5% regenerates cleanly/);
    // A band between two typed positions turns inside out when one moves past the other.
    await ok(ctx, "plan", { update: true, values: [V("BandLow", 60000), V("BandHigh", 60040)] });
    await ok(ctx, "construct", { feature: "Box", entities: [{ id: "Band", kind: "rect", x: "0", y: "BandLow", w: "1000", h: "BandHigh - BandLow" }] });
    const r = await ok(ctx, "verify");
    expect(r.text).toMatch(/Changing Band(Low|High) to [\d.]+ breaks the drawing/);
  });
});
