/**
 * The drafting agent's tools, driven the way the system prompt teaches, with no
 * model in the loop. Every assertion is about the kernel's behaviour after the
 * agent is done: does the drawing hold its design intent when a value changes,
 * and does it reach Run Mode as real, bound parameters.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext, flexReport, checkReport } from "@/lib/agent/drafter/tools";
import { regenerate } from "@/lib/upce/document";
import { buildManifest } from "@/lib/upce/template";

function context(ws = new DraftingWorkspace()): ToolContext {
  return { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}

async function ok(ctx: ToolContext, name: string, args: Record<string, unknown>) {
  const r = await runTool(ctx, name, args);
  if (!r.ok) throw new Error(`${name} refused: ${r.text}`);
  return r;
}

/** Box culvert from the reference: 10700 x 4000 clear, 350 walls, 800 slabs, 600 haunches, 4000 cushion. */
async function culvert() {
  const ctx = context();
  await ok(ctx, "draw_rectangle", { name: "Outer", x: 0, y: 0, width: 11400, height: 5600 });
  await ok(ctx, "draw_polyline", {
    name: "Opening",
    points: [[950, 800], [10450, 800], [11050, 1400], [11050, 4200], [10450, 4800], [950, 4800], [350, 4200], [350, 1400]],
    closed: true,
  });
  await ok(ctx, "draw_line", { name: "Centreline", from: [5700, -1000], to: [5700, 10500], construction: true });
  await ok(ctx, "draw_rectangle", { name: "Cushion", x: 0, y: 5600, width: 11400, height: 4000 });
  await ok(ctx, "auto_rules", { kinds: ["horizontal", "vertical"] });
  await ok(ctx, "rule", { kind: "anchor", a: "Outer.bottom_left" });
  await ok(ctx, "dimension", { name: "ClearSpan", what: "horizontal", a: "Opening.p7", b: "Opening.p3", group: "Opening" });
  await ok(ctx, "dimension", { name: "ClearHeight", what: "vertical", a: "Opening.p1", b: "Opening.p5", group: "Opening" });
  await ok(ctx, "dimension", { name: "WallThickness", what: "offset", a: "Outer.left", b: "Opening.p7" });
  await ok(ctx, "dimension", { name: "WallThickness", what: "offset", a: "Outer.right", b: "Opening.p3" });
  await ok(ctx, "dimension", { name: "BottomSlabThickness", what: "offset", a: "Outer.bottom", b: "Opening.p1" });
  await ok(ctx, "dimension", { name: "TopSlabThickness", what: "offset", a: "Outer.top", b: "Opening.p5" });
  for (const [a, b] of [["Opening.p8", "Opening.p1"], ["Opening.p2", "Opening.p3"], ["Opening.p4", "Opening.p5"], ["Opening.p6", "Opening.p7"]]) {
    await ok(ctx, "dimension", { name: "HaunchSize", what: "horizontal", a, b });
    await ok(ctx, "dimension", { name: "HaunchSize", what: "vertical", a, b });
  }
  await ok(ctx, "dimension", { name: "CushionDepth", what: "vertical", a: "Cushion.bottom_left", b: "Cushion.top_left" });
  await ok(ctx, "rule", { kind: "symmetric", a: "Outer.bottom_left", b: "Outer.bottom_right", about: "Centreline" });
  await ok(ctx, "formula", { name: "OverallWidth", expression: "ClearSpan + 2 * WallThickness" });
  return ctx;
}

const len = (ws: DraftingWorkspace, id: string, shapes = ws.shapes) => {
  const s = shapes.find((x) => x.id === id);
  if (!s || s.type !== "line") throw new Error(`${id} is not a line`);
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
};

describe("drafting agent workspace", () => {
  it("draws in Y-up model coordinates onto the Y-down canvas", async () => {
    const ctx = context();
    await ok(ctx, "draw_rectangle", { name: "Slab", x: 100, y: 200, width: 1000, height: 300 });
    const r = ctx.ws.shapes[0];
    expect(r.type).toBe("rectangle");
    if (r.type !== "rectangle") return;
    // Canvas stores the top edge: model y 200..500 is canvas -500..-200.
    expect(r.y).toBe(-500);
    expect(ctx.ws.modelPoint(ctx.ws.pointId("Slab.bottom_left"))).toEqual({ x: 100, y: 200 });
    expect(ctx.ws.modelPoint(ctx.ws.pointId("Slab.top_right"))).toEqual({ x: 1100, y: 500 });
  });

  it("accepts axis rules even where a parallel finding would have absorbed them", async () => {
    const ctx = context();
    await ok(ctx, "draw_rectangle", { name: "Outer", x: 0, y: 0, width: 2000, height: 1000 });
    await ok(ctx, "draw_polyline", { name: "Inner", points: [[200, 200], [1800, 200], [1800, 800], [200, 800]], closed: true });
    const r = await ok(ctx, "auto_rules", { kinds: ["horizontal", "vertical"] });
    // Four inner edges, plus one to settle the outer rectangle's turn.
    expect(r.text).toMatch(/Accepted 5 detected/);
  });

  it("reaches zero structural freedom and publishes with bound values", async () => {
    const ctx = await culvert();
    const { ws } = ctx;
    expect(ws.structuralFreedom()).toBe(0);
    expect(checkReport(ws).blockers).toEqual([]);

    const done = await ok(ctx, "finish", { title: "RCC box culvert", summary: "test" });
    expect(done.finished).toBe(true);
    const manifest = buildManifest(ws.sketch, ws.names());
    expect(manifest.driving.map((d) => d.name).sort()).toEqual(
      ["BottomSlabThickness", "ClearHeight", "ClearSpan", "CushionDepth", "HaunchSize", "TopSlabThickness", "WallThickness"].sort()
    );
    expect(manifest.derived.map((d) => d.name)).toEqual(["OverallWidth"]);
    // Every published value drives geometry — the defect the old agent had.
    for (const d of manifest.driving) {
      expect(ws.sketch.parameters[d.name].boundConstraints.length).toBeGreaterThan(0);
    }
    expect(ws.sketch.parameters.WallThickness.boundConstraints).toHaveLength(2);
    expect(ws.sketch.parameters.HaunchSize.boundConstraints).toHaveLength(8);
  });

  it("keeps walls and haunches when the span changes in Run Mode", async () => {
    const { ws } = await culvert();
    const p = ws.sketch.parameters.ClearSpan;
    const run = regenerate(ws.shapes, { ...ws.sketch, parameters: { ...ws.sketch.parameters, ClearSpan: { ...p, value: 13000 } } });
    expect(run.rejection).toBeUndefined();

    const shapes = run.shapes;
    // The opening's floor grows by exactly the span change; haunch legs do not move.
    // Micrometre agreement is the bar: the solver's tolerance is nanometres per
    // metre of drawing, and a draftsman measures to a tenth of a millimetre.
    expect(len(ws, "Opening_1", shapes)).toBeCloseTo(9500 + 2300, 3);
    for (const h of ["Opening_2", "Opening_4", "Opening_6", "Opening_8"]) {
      expect(len(ws, h, shapes)).toBeCloseTo(600 * Math.SQRT2, 3);
    }
    // Walls stay 350: outer width is span + 2 walls.
    const outer = shapes.find((s) => s.id === "Outer");
    expect(outer?.type === "rectangle" && outer.width).toBeCloseTo(13700, 3);
    expect(outer?.type === "rectangle" && outer.height).toBeCloseTo(5600, 3);
    expect(run.sketch.parameters.OverallWidth.value).toBeCloseTo(13700, 6);
  });

  it("flex_test reports only the edges a value is meant to change", async () => {
    const { ws } = await culvert();
    const report = flexReport(ws, "WallThickness", [500]);
    expect(report.failures).toBe(0);
    const changed = report.text.match(/changed length: ([^;]*)/)?.[1] ?? "";
    expect(changed).toMatch(/Outer\.top/);
    expect(changed).not.toMatch(/Opening_/);
    expect(changed).not.toMatch(/Cushion\.left|Cushion\.right/);
  });

  it("refuses a second answer to the same question, and says what to do", async () => {
    const ctx = await culvert();
    const r = await runTool(ctx, "dimension", { name: "OverallWidth2", what: "length", a: "Outer.bottom" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/already fixed at 11400 mm by other rules/);
    expect(r.text).toMatch(/formula/);
  });

  it("refuses a shared name that does not describe the geometry", async () => {
    const ctx = await culvert();
    const r = await runTool(ctx, "dimension", { name: "WallThickness", what: "offset", a: "Outer.bottom", b: "Opening.p1" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/WallThickness is 350 mm, but .* measures 800/);
  });

  it("checks the model's arithmetic before accepting a formula", async () => {
    const ctx = await culvert();
    const wrong = await runTool(ctx, "formula", { name: "ClearHeight", expression: "CushionDepth - TopSlabThickness * 2" });
    expect(wrong.ok).toBe(false);
    expect(wrong.text).toMatch(/does not describe this drawing/);
  });

  it("will not finish while structure is still free", async () => {
    const ctx = context();
    await ok(ctx, "draw_rectangle", { name: "Plate", x: 0, y: 0, width: 400, height: 250 });
    const r = await runTool(ctx, "finish", { title: "Plate", summary: "x" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/anchors|freedom/i);
  });

  it("insists on a look before finishing when a reference was given", async () => {
    const ctx = await culvert();
    ctx.hasReference = true;
    const refused = await runTool(ctx, "finish", { title: "Box", summary: "x" });
    expect(refused.ok).toBe(false);
    expect(refused.text).toMatch(/Call view/);
    const view = await ok(ctx, "view", {});
    expect(view.image?.data.length).toBeGreaterThan(1000);
    expect(Buffer.from(view.image!.data, "base64").subarray(1, 4).toString()).toBe("PNG");
    await ok(ctx, "finish", { title: "Box", summary: "x" });
  });

  it("cuts a corner along both faces", async () => {
    const ctx = context();
    await ok(ctx, "draw_polyline", { name: "Cell", points: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], closed: true });
    await ok(ctx, "chamfer", { corner: "Cell.p1", leg: 150 });
    const ws = ctx.ws;
    expect(ws.shapes).toHaveLength(5);
    const haunch = ws.shapes.find((s) => s.id.includes("chamfer"));
    expect(haunch && haunch.type === "line" && len(ws, haunch.id)).toBeCloseTo(150 * Math.SQRT2, 3);
    expect(ws.connectivity().openEnds).toEqual([]);
  });

  it("offsets a closed outline inward with mitred corners", async () => {
    const ctx = context();
    await ok(ctx, "draw_polyline", { name: "Out", points: [[0, 0], [1000, 0], [1000, 600], [0, 600]], closed: true });
    const r = await ok(ctx, "offset", { target: "Out", distance: 100, side: "inside", name: "In" });
    expect(r.text).toMatch(/In_1/);
    const p = ctx.ws.modelPoint(ctx.ws.pointId("In.p1"));
    expect(p.x).toBeCloseTo(100, 3);
    expect(p.y).toBeCloseTo(100, 3);
  });

  it("reports disconnected geometry as a blocker", async () => {
    const ctx = context();
    await ok(ctx, "draw_line", { name: "A", from: [0, 0], to: [1000, 0] });
    await ok(ctx, "draw_line", { name: "B", from: [1003, 0], to: [1003, 800] });
    expect(checkReport(ctx.ws).blockers.join(" ")).toMatch(/Disconnected geometry: A\.end and B\.start are 3 mm apart/);
  });

  it("runs a tool the agent defined from other tools", async () => {
    const ctx = context();
    await ok(ctx, "define_tool", {
      name: "box",
      description: "A closed box",
      parameters: [{ name: "x", type: "number" }, { name: "w", type: "number" }, { name: "id", type: "string" }],
      steps: [{ tool: "draw_polyline", args_json: JSON.stringify({ name: "{{id}}", points: [["{{x}}", 0], ["=x + w", 0], ["=x + w", 500], ["{{x}}", 500]] }) }],
    });
    expect(ctx.ws.macros.map((m) => m.name)).toEqual(["box"]);
    await ok(ctx, "macro_box", { x: 100, w: 900, id: "BoxA" });
    expect(ctx.ws.modelPoint(ctx.ws.pointId("BoxA.p2"))).toEqual({ x: 1000, y: 0 });
  });

  it("changes a value and says what followed", async () => {
    const ctx = await culvert();
    const r = await ok(ctx, "set_value", { name: "WallThickness", value: 450 });
    expect(r.text).toMatch(/OverallWidth = 11600/);
    expect(r.text).not.toMatch(/Held by rules/);
  });
});
