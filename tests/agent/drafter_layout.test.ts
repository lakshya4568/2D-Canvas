/**
 * The drawing cleanup pass, through the agent's tools.
 *
 * Two things are being held at once: the labels must end up readable, and
 * nothing else about the drawing may change to achieve it. The second is the
 * harder promise — the geometry, what each dimension measures, where each
 * leader points and the height of every character have to come out of the pass
 * exactly as they went in.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, type ToolContext } from "@/lib/agent/drafter/tools";
import { currentDefinition } from "@/lib/agent/drafter/construction";
import { annotationClashes } from "@/lib/agent/drafter/layoutPass";
import { evaluateInstance } from "@/lib/cad/document";

const BRIEF = "Draw a steel plate 2000 mm long and 800 mm high in elevation, 20 mm thick, with a 60 mm diameter bolt hole 100 mm in from each end.";

function context(): ToolContext {
  return { ws: new DraftingWorkspace(), hasReference: false, brief: BRIEF, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => runTool(ctx, name, args);
async function ok(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  const r = await call(ctx, name, args);
  expect(r.ok, `${name}: ${r.text}`).toBe(true);
  return r;
}

const PLAN = {
  route: "construction",
  structure: "Steel plate in elevation with two bolt holes",
  views: [{ name: "Elevation", shows: "the plate and its holes" }],
  analysis: "A rectangular plate with a hole near each end; the holes sit on the plate's own centre line, set in from each end by the same distance.",
  frame: "x = 0 at the left end, y = 0 at the bottom",
  values: [
    { name: "PlateLength", expr: "2000", unit: "mm", source: "given", note: "written: 2000" },
    { name: "PlateHeight", expr: "800", unit: "mm", source: "given", note: "written: 800" },
    { name: "EdgeDistance", expr: "100", unit: "mm", source: "given", note: "written: 100" },
    { name: "HoleDiameter", expr: "60", unit: "mm", source: "given", note: "written: 60" },
    { name: "HoleRadius", expr: "HoleDiameter / 2", unit: "mm" },
    { name: "MidHeight", expr: "PlateHeight / 2", unit: "mm" },
  ],
  checks: [{ label: "half height", expr: "MidHeight", expect: 400, unit: "mm" }],
  features: [
    { name: "Axes", description: "plate centre line", stage: "datum" },
    { name: "Plate", description: "the plate outline and its holes", stage: "primary", after: ["Axes"] },
    { name: "Notes", description: "dimensions and notes", stage: "annotation", after: ["Plate"] },
  ],
};

/** A drawing whose notes are deliberately piled on the same spot. */
async function crowded(ctx: ToolContext) {
  await ok(ctx, "plan", PLAN);
  await ok(ctx, "construct", {
    feature: "Axes",
    entities: [{ id: "CL", kind: "line", from: ["0", "MidHeight"], to: ["PlateLength", "MidHeight"], layer: "centre" }],
  });
  await ok(ctx, "construct", {
    feature: "Plate",
    entities: [
      { id: "Plate", kind: "rect", x: "0", y: "0", w: "PlateLength", h: "PlateHeight" },
      { id: "HoleL", kind: "circle", center: ["EdgeDistance", "MidHeight"], r: "HoleRadius" },
      { id: "HoleR", kind: "circle", center: ["PlateLength - EdgeDistance", "MidHeight"], r: "HoleRadius" },
    ],
  });
  await ok(ctx, "check_geometry");
  await ok(ctx, "annotate", {
    feature: "Notes",
    items: [
      { id: "DimLength", kind: "dimension", of: "horizontal", from: ["0", "0"], to: ["PlateLength", "0"], offset: "-150", drives: "PlateLength" },
      { id: "DimHeight", kind: "dimension", of: "vertical", from: ["0", "0"], to: ["0", "PlateHeight"], offset: "-150", drives: "PlateHeight" },
      // Two notes written at the same point: unreadable until one is moved.
      { id: "NoteA", kind: "text", at: ["PlateLength / 2", "PlateHeight + 150"], text: "PLATE {PlateLength} X {PlateHeight}" },
      { id: "NoteB", kind: "text", at: ["PlateLength / 2", "PlateHeight + 150"], text: "20 THK" },
    ],
  });
  return ctx;
}

const geometryOf = (ctx: ToolContext) => {
  const def = currentDefinition(ctx.ws)!;
  const out = evaluateInstance(ctx.ws.cad.components[0], ctx.ws.cad)!;
  return {
    loops: out.evaluation.loops.map((l) => `${l.path}:${l.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|")}`).join(";"),
    circles: out.evaluation.circles.map((c) => `${c.path}:${c.center.x.toFixed(3)},${c.center.y.toFixed(3)},${c.r}`).join(";"),
    primitives: JSON.stringify(def.primitives),
  };
};

const annotationsOf = (ctx: ToolContext) => evaluateInstance(ctx.ws.cad.components[0], ctx.ws.cad)!.annotations;

describe("the annotation layout pass", () => {
  it("finds the pile-up and reports it before anything is moved", async () => {
    const ctx = await crowded(context());
    const before = annotationClashes(ctx.ws);
    expect(before.clashes.some((c) => c.kind === "overlap")).toBe(true);
    expect(before.text).toMatch(/overlapping/);
  });

  it("moves the labels apart, and says what it moved", async () => {
    const ctx = await crowded(context());
    const r = await ok(ctx, "layout_annotations");
    expect(r.text).toMatch(/moved/);
    expect(annotationClashes(ctx.ws).clashes.filter((c) => c.kind === "overlap")).toEqual([]);
  });

  it("changes nothing about the geometry", async () => {
    const ctx = await crowded(context());
    const before = geometryOf(ctx);
    await ok(ctx, "layout_annotations");
    expect(geometryOf(ctx)).toEqual(before);
  });

  it("keeps every annotation attached to what it describes", async () => {
    const ctx = await crowded(context());
    const before = annotationsOf(ctx);
    await ok(ctx, "layout_annotations");
    const after = annotationsOf(ctx);
    const find = (list: typeof before, id: string) => list.find((a) => a.id.endsWith(id))!;

    // A dimension still measures the same two points, and still drives its value.
    for (const id of ["DimLength", "DimHeight"]) {
      const b = find(before, id) as { p1: { x: number; y: number }; p2: { x: number; y: number }; drives?: string };
      const a = find(after, id) as typeof b;
      expect({ p1: a.p1, p2: a.p2, drives: a.drives }).toEqual({ p1: b.p1, p2: b.p2, drives: b.drives });
    }
    // The words themselves are untouched — only where they sit may change.
    for (const id of ["NoteA", "NoteB"]) {
      const b = find(before, id) as { text: string; height: number };
      const a = find(after, id) as typeof b;
      expect(a.text).toBe(b.text);
      expect(a.height).toBe(b.height);
    }
  });

  it("does not shrink anything to make it fit", async () => {
    const ctx = await crowded(context());
    const heights = () => annotationsOf(ctx).map((a) => (a as { height?: number }).height ?? 0);
    const before = heights();
    await ok(ctx, "layout_annotations");
    expect(heights()).toEqual(before);
    expect(ctx.ws.cad.settings.textHeight).toBe(context().ws.cad.settings.textHeight);
  });

  it("records the move as placement, leaving the author's own expression in charge", async () => {
    const ctx = await crowded(context());
    await ok(ctx, "layout_annotations");
    const def = currentDefinition(ctx.ws)!;
    const moved = [...(def.texts ?? []), ...(def.dimensions ?? [])].filter((e) => e.layout);
    expect(moved.length).toBeGreaterThan(0);
    for (const e of moved) expect(e.layout?.reason).toMatch(/layout/i);
    // The authored offsets and positions are still exactly as written.
    expect(def.dimensions?.find((d) => d.id === "DimLength")?.offset).toBe(-150);
    expect(def.texts?.find((t) => t.id === "NoteA")?.at).toEqual(["PlateLength / 2", "PlateHeight + 150"]);
  });

  it("settles: running it again moves nothing more", async () => {
    const ctx = await crowded(context());
    await ok(ctx, "layout_annotations");
    const again = await ok(ctx, "layout_annotations");
    expect(again.text).toMatch(/0 moved|Checked|Nothing could be improved/);
    expect(annotationClashes(ctx.ws).clashes.filter((c) => c.kind === "overlap")).toEqual([]);
  });

  it("still regenerates: a placed label follows its geometry when a value changes", async () => {
    const ctx = await crowded(context());
    await ok(ctx, "layout_annotations");
    const def = currentDefinition(ctx.ws)!;
    const noteAt = (length: number) => {
      const inst = { ...ctx.ws.cad.components[0], values: { PlateLength: length } };
      const out = evaluateInstance(inst, ctx.ws.cad)!;
      return out.annotations.find((a) => a.id.endsWith("NoteA")) as unknown as { at: { x: number } };
    };
    expect(def.texts?.find((t) => t.id === "NoteA")?.layout).toBeDefined();
    // The note is written at mid-length: a longer plate carries it along.
    expect(noteAt(3000).at.x).toBeGreaterThan(noteAt(2000).at.x);
  });

  it("is refused before there is anything to place", async () => {
    const ctx = context();
    await ok(ctx, "plan", PLAN);
    const r = await call(ctx, "layout_annotations");
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/nothing drawn|no dimensions/i);
  });

  it("runs on its own when the drawing is finished", async () => {
    const ctx = await crowded(context());
    await ok(ctx, "verify");
    const done = await ok(ctx, "finish", { title: "STEEL PLATE", summary: "A plate with two holes, dimensioned and noted." });
    expect(done.text).toMatch(/Laid out|moved/);
    expect(annotationClashes(ctx.ws).clashes.filter((c) => c.kind === "overlap")).toEqual([]);
  });
});
