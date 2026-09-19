/**
 * Units in the solver, and the rigid-body anchor.
 *
 * Found by the drafting agent's stress test on an 11.4 m box section:
 *
 *   - convergence was judged with one millimetre tolerance scaled by the
 *     drawing's extent, but angular rows are sines. On 11 m edges that let a
 *     corner settle 0.17 mm out while reporting "converged";
 *   - an angle residual (already a cosine difference) was divided by two edge
 *     lengths again, so on metre-long edges an angle dimension held nothing;
 *   - "pin to the sheet" held two of the three rigid freedoms, and a pinned box
 *     tilted five degrees when a value changed.
 */

import { describe, it, expect } from "vitest";
import { regenerate, namesOf, addConstraint } from "@/lib/upce/document";
import { AuthoringSketch, emptySketch, SketchConstraint } from "@/lib/upce/types";
import { suggestCompletion, applyAction } from "@/lib/upce/completion";
import { measurablesIn, nameMeasurement } from "@/lib/upce/link";
import { detectCandidates } from "@/lib/upce/detect";
import { structuralDof, countDof } from "@/lib/upce/dof";
import { makeProvenance } from "@/lib/upce/parameters";
import { assessReadiness } from "@/lib/upce/template";
import type { Shape } from "@/lib/geometry/types";

const hard = (c: Omit<SketchConstraint, "id" | "strength" | "driving" | "state" | "provenance">, id: string): SketchConstraint => ({
  ...c,
  id,
  strength: "hard",
  driving: true,
  state: "active",
  provenance: makeProvenance("user", "test"),
});

describe("solver units", () => {
  it("settles a large rectangle to micrometres, not tenths of a millimetre", () => {
    const shapes: Shape[] = [{ id: "R", type: "rectangle", x: 0, y: -5600, width: 11400, height: 5600 }];
    let sk = regenerate(shapes, emptySketch(), { source: "geometry" }).sketch;
    const fix = suggestCompletion(sk).quickFixes.find((q) => q.id === "anchor")!;
    sk = applyAction(sk, fix);
    const h = measurablesIn(sk, ["R"]).find((m) => m.id === "edge_R_y")!;
    sk = nameMeasurement(sk, h, "Height").sketch;
    const w = measurablesIn(sk, ["R"]).find((m) => m.id === "edge_R_x")!;
    sk = nameMeasurement(sk, w, "Width").sketch;
    const solved = regenerate(shapes, sk).sketch;

    const next: AuthoringSketch = {
      ...solved,
      parameters: { ...solved.parameters, Height: { ...solved.parameters.Height, value: 4800 } },
    };
    const r = regenerate(shapes, next);
    const rect = r.shapes[0];
    expect(rect.type).toBe("rectangle");
    if (rect.type !== "rectangle") return;
    expect(Math.abs(rect.height - 4800)).toBeLessThan(1e-4);
    expect(Math.abs(rect.width - 11400)).toBeLessThan(1e-4);
    expect(Math.abs(rect.rotation ?? 0)).toBeLessThan(1e-6);
  });

  it("enforces an angle dimension between long edges", () => {
    // Two 5 m lines from a common corner, 60° apart, driven to 45°.
    const L = 5000;
    const shapes: Shape[] = [
      { id: "A", type: "line", x1: 0, y1: 0, x2: L, y2: 0 },
      { id: "B", type: "line", x1: 0, y1: 0, x2: L * Math.cos(Math.PI / 3), y2: -L * Math.sin(Math.PI / 3) },
    ];
    const base = regenerate(shapes, emptySketch(), { source: "geometry" }).sketch;
    const sketch: AuthoringSketch = {
      ...base,
      parameters: {
        Theta: {
          name: "Theta", role: "DRIVING", type: "ANGLE", unit: "deg", value: 45,
          provenance: makeProvenance("user", "test"), boundConstraints: ["ang"], published: true,
        },
      },
      constraints: [
        hard({ kind: "fix", points: ["A:v0"], segments: [], value: 0, valueY: 0, label: "pin" }, "pin"),
        hard({ kind: "horizontal", points: [], segments: ["A:e0"], label: "A level" }, "lvl"),
        hard({ kind: "distance", points: ["A:v0", "A:v1"], segments: [], value: L, label: "A length" }, "la"),
        hard({ kind: "distance", points: ["A:v0", "B:v1"], segments: [], value: L, label: "B length" }, "lb"),
        hard({ kind: "angle", points: [], segments: ["A:e0", "B:e0"], paramRef: "Theta", paramScale: Math.PI / 180, label: "angle" }, "ang"),
      ],
    };
    const r = regenerate(shapes, sketch);
    expect(r.rejection).toBeUndefined();
    const b = r.shapes.find((s) => s.id === "B");
    if (!b || b.type !== "line") throw new Error("B missing");
    const deg = (Math.atan2(-(b.y2 - b.y1), b.x2 - b.x1) * 180) / Math.PI;
    expect(deg).toBeCloseTo(45, 4);
  });

  it("does not count a construction line's own slide as unfinished structure", () => {
    const shapes: Shape[] = [
      { id: "R", type: "rectangle", x: 0, y: -1000, width: 2000, height: 1000 },
      { id: "CL", type: "line", x1: 1000, y1: 500, x2: 1000, y2: -1500, isReference: true },
    ];
    let sk = regenerate(shapes, emptySketch(), { source: "geometry" }).sketch;
    sk = applyAction(sk, suggestCompletion(sk).quickFixes.find((q) => q.id === "anchor")!);
    for (const id of ["edge_R_x", "edge_R_y"]) {
      sk = nameMeasurement(sk, measurablesIn(sk, ["R"]).find((m) => m.id === id)!, id).sketch;
    }
    // The centreline is free to slide and stretch: four freedoms, none structural.
    expect(countDof(sk)).toBe(4);
    expect(structuralDof(sk)).toBe(0);
  });

  it("filters detections by kind before minimising them away", () => {
    const shapes: Shape[] = [
      { id: "O", type: "rectangle", x: 0, y: -1000, width: 2000, height: 1000 },
      { id: "i1", type: "line", x1: 200, y1: -200, x2: 1800, y2: -200 },
      { id: "i2", type: "line", x1: 1800, y1: -200, x2: 1800, y2: -800 },
      { id: "i3", type: "line", x1: 1800, y1: -800, x2: 200, y2: -800 },
      { id: "i4", type: "line", x1: 200, y1: -800, x2: 200, y2: -200 },
    ];
    const sk = regenerate(shapes, emptySketch(), { source: "geometry" }).sketch;
    const all = detectCandidates(sk, { limit: 100 }).filter((c) => c.constraint.kind === "horizontal" || c.constraint.kind === "vertical");
    const axis = detectCandidates(sk, { limit: 100, kinds: ["horizontal", "vertical"] });
    expect(axis.length).toBeGreaterThan(all.length);
    expect(axis.length).toBe(5);
  });

  it("pins with all three rigid freedoms, so a pinned box cannot tilt", () => {
    const shapes: Shape[] = [
      { id: "R1", type: "rectangle", x: 0, y: 0, width: 2000, height: 1200, name: "Box" },
      { id: "L1", type: "line", x1: 0, y1: 1800, x2: 1500, y2: 1800, name: "Deck" },
    ];
    const names = namesOf(shapes);
    let sk = regenerate(shapes, emptySketch(), { shapeNames: names, source: "geometry" }).sketch;
    const pick = (id: string) => measurablesIn(sk, ["R1", "L1"], names).find((m) => m.id === id)!;
    sk = nameMeasurement(sk, pick("edge_R1_x"), "BoxWidth").sketch;
    sk = nameMeasurement(sk, pick("pos_L1:v0_y"), "DeckLevel").sketch;
    sk = nameMeasurement(sk, pick("gap_L1_R1_y"), "Cushion").sketch;
    const anchor = suggestCompletion(sk, names).quickFixes.find((q) => q.id === "anchor")!;
    expect(anchor.createsConstraints.map((c) => c.kind).sort()).toEqual(["fix", "horizontal"]);
    sk = regenerate(shapes, applyAction(sk, anchor), { shapeNames: names }).sketch;

    const moved = regenerate(shapes, {
      ...sk,
      parameters: { ...sk.parameters, DeckLevel: { ...sk.parameters.DeckLevel, value: 2400 } },
    }, { shapeNames: names });
    const box = moved.shapes.find((s) => s.id === "R1");
    if (!box || box.type !== "rectangle") throw new Error("box missing");
    expect(Math.abs(box.rotation ?? 0)).toBeLessThan(1e-6);
    expect(Math.abs(box.x)).toBeLessThan(1e-6);
  });
});

describe("touching solids", () => {
  // A box with an opening and a layer resting on it: the layer's corners weld to
  // the box's, so box + layer is ONE branched connected profile.
  const shapes: Shape[] = [
    { id: "Box", type: "rectangle", x: 0, y: -5600, width: 11400, height: 5600 },
    { id: "Fill", type: "rectangle", x: 0, y: -9600, width: 11400, height: 4000 },
    { id: "Cell", type: "rectangle", x: 350, y: -4800, width: 10700, height: 4000 },
  ];
  const sketch = () => regenerate(shapes, emptySketch(), { source: "geometry" }).sketch;

  it("splits a branched profile into the faces it bounds", async () => {
    const { closedLoops } = await import("@/lib/upce/profile");
    const loops = closedLoops(sketch()).map((l) => l.label).sort();
    expect(loops).toEqual(["Box", "Cell", "Fill"]);
  });

  it("finds the regions, and the opening as a void in the box", async () => {
    const { sketchRegions } = await import("@/lib/upce/fusion");
    const regions = sketchRegions(sketch());
    const box = regions.find((r) => r.label === "Box");
    expect(regions.map((r) => r.label).sort()).toEqual(["Box", "Fill"]);
    expect(box?.holes).toHaveLength(1);
    expect(box?.areaMm2).toBeCloseTo(11400 * 5600 - 10700 * 4000, 3);
  });

  it("still sees the wall and slab clearances under a resting layer", async () => {
    const { findOffsets } = await import("@/lib/upce/completion");
    const found = findOffsets(sketch()).filter((f) => f.inner.id === "Cell");
    expect(found.map((f) => Math.round(f.distance)).sort((a, b) => a - b)).toEqual([350, 350, 800, 800]);
  });

  it("refuses to publish a template whose value pushes an opening through its wall", () => {
    let sk = sketch();
    sk = applyAction(sk, suggestCompletion(sk).quickFixes.find((q) => q.id === "anchor")!);
    const pick = (id: string, name: string) => {
      const m = measurablesIn(sk, ["Box", "Cell", "Fill"]).find((x) => x.id === id);
      if (!m) throw new Error(`no measurable ${id}`);
      sk = nameMeasurement(sk, m, name).sketch;
    };
    pick("edge_Box_x", "OverallWidth");
    pick("edge_Box_y", "OverallHeight");
    pick("edge_Cell_x", "ClearSpan");
    pick("edge_Cell_y", "ClearHeight");
    pick("edge_Fill_y", "FillDepth");
    // The cell is placed by its left and bottom clearances only; the right wall
    // is whatever is left over — nobody named it.
    const at = (raw: string) => sk.pointAliases[raw] ?? raw;
    const place = (kind: "distance_x" | "distance_y", name: string) => {
      const a = sk.points[at("Box:v3")];
      const b = sk.points[at("Cell:v3")];
      const value = kind === "distance_x" ? b.x - a.x : a.y - b.y;
      sk = nameMeasurement(sk, {
        id: `${name}_m`, label: name, kind,
        points: kind === "distance_x" ? [at("Box:v3"), at("Cell:v3")] : [at("Cell:v3"), at("Box:v3")],
        value, suggestedName: name,
      }, name).sketch;
    };
    place("distance_x", "LeftWall");
    place("distance_y", "BottomSlab");
    sk = addConstraint(sk, hard({ kind: "horizontal", points: [], segments: ["Cell:e0"], label: "cell level" }, "lvl"));
    expect(countDof(sk)).toBe(0);
    const solved = regenerate(shapes, { ...sk, meta: { ...sk.meta, freedomIsIntentional: true } }).sketch;
    const report = assessReadiness(
      { ...solved, parameters: { ...solved.parameters, ClearSpan: { ...solved.parameters.ClearSpan, min: 5000, max: 12000 } } },
      shapes
    );
    const escaped = report.sweep.filter((r) => r.brokenInvariants.some((b) => /no longer inside/.test(b)));
    expect(escaped.length).toBeGreaterThan(0);
    expect(report.ready).toBe(false);
  });
});

describe("holes that run into each other", () => {
  it("fails the publish sweep when a value puts two holes on top of each other", async () => {
    const { DraftingWorkspace } = await import("@/lib/agent/drafter/workspace");
    const { runTool } = await import("@/lib/agent/drafter/tools");
    const { sketchPlanned } = await import("../agent/plans");
    const ws = new DraftingWorkspace({ construction: sketchPlanned() });
    const ctx = { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
    const run = async (name: string, args: Record<string, unknown>) => {
      const r = await runTool(ctx, name, args);
      if (!r.ok) throw new Error(`${name}: ${r.text}`);
      return r;
    };
    await run("draw_rectangle", { name: "Plate", x: 0, y: 0, width: 400, height: 250 });
    await run("draw_circle", { name: "HoleL", center: [50, 125], radius: 11 });
    await run("draw_circle", { name: "HoleR", center: [350, 125], radius: 11 });
    await run("rule", { kind: "anchor", a: "Plate.bottom_left" });
    await run("dimension", { name: "PlateWidth", what: "length", a: "Plate.bottom" });
    await run("dimension", { name: "PlateHeight", what: "length", a: "Plate.left" });
    await run("dimension", { name: "HoleRadius", what: "radius", a: "HoleL" });
    await run("dimension", { name: "HoleRadius", what: "radius", a: "HoleR" });
    await run("dimension", { name: "Edge", what: "offset", a: "Plate.left", b: "HoleL.center" });
    await run("dimension", { name: "Edge", what: "offset", a: "Plate.right", b: "HoleR.center" });
    await run("dimension", { name: "HoleLevel", what: "offset", a: "Plate.bottom", b: "HoleL.center" });
    await run("dimension", { name: "HoleLevel", what: "offset", a: "Plate.bottom", b: "HoleR.center" });
    await run("describe_value", { name: "PlateWidth", min: 100, max: 800 });
    const r = await runTool(ctx, "flex_test", { name: "PlateWidth", values: [100] });
    expect(r.text).toMatch(/HoleL and HoleR run into each other/);
    const finish = await runTool(ctx, "finish", { title: "Plate", summary: "x" });
    expect(finish.ok).toBe(false);
    expect(finish.text).toMatch(/run into each other/);
  });
});
