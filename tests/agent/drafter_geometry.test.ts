/**
 * The agent reasoning about geometry through its tools.
 *
 * The question every test asks: when the angle, the slope or the ratio changes
 * later, does the drawing follow? A wall whose end was typed as a coordinate
 * will sit still and pass a screenshot; it fails here.
 *
 * Nothing in these tests is bridge-specific to the code under test — the same
 * `derive` that places a splayed return places a bracing member or a roof
 * valley. A wing wall is used because it is the plainest case of "the design
 * gives an angle, not a coordinate".
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, type ToolContext } from "@/lib/agent/drafter/tools";
import { currentDefinition } from "@/lib/agent/drafter/construction";
import { evaluateComponent } from "@/lib/components/evaluate";
import { makeRegistry } from "@/lib/components/instantiate";

const BRIEF =
  "Draw the plan of an abutment return wall: the wall leaves the abutment face at a splay of 30 degrees to the bridge axis and is 4000 mm long. The abutment face is 6000 mm wide. Wall thickness 400 mm.";

function context(brief = BRIEF): ToolContext {
  return { ws: new DraftingWorkspace(), hasReference: false, brief, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => runTool(ctx, name, args);
async function ok(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  const r = await call(ctx, name, args);
  expect(r.ok, `${name}: ${r.text}`).toBe(true);
  return r;
}

const PLAN = {
  route: "construction",
  structure: "Abutment return wall in plan: the wall leaves the abutment face at the splay angle the brief gives",
  views: [{ name: "Plan", shows: "the abutment face and the return wall splaying away from it" }],
  analysis:
    "A straight return wall of given length leaves the end of the abutment face at a given splay angle to the bridge axis. Its far end follows from the angle and the length; its back face is the front face offset by the wall thickness.",
  frame: "x = 0 on the bridge axis, y along the abutment face",
  values: [
    { name: "FaceWidth", expr: "6000", unit: "mm", source: "given", note: "written: 6000" },
    { name: "SplayAngle", expr: "30", unit: "deg", source: "given", note: "written: 30 degrees" },
    { name: "WallLength", expr: "4000", unit: "mm", source: "given", note: "written: 4000" },
    { name: "WallThickness", expr: "400", unit: "mm", source: "given", note: "written: 400" },
    { name: "HalfFace", expr: "FaceWidth / 2", unit: "mm" },
  ],
  checks: [{ label: "half the face", expr: "HalfFace", expect: 3000, unit: "mm" }],
  features: [
    { name: "Axes", description: "bridge axis and the abutment face line", stage: "datum" },
    { name: "Return", description: "the return wall, from the splay angle and its length", stage: "primary", after: ["Axes"] },
  ],
};

async function planned(ctx: ToolContext) {
  await ok(ctx, "plan", PLAN);
  await ok(ctx, "construct", {
    feature: "Axes",
    entities: [
      { id: "Axis", kind: "line", from: ["0", "-1000"], to: ["0", "HalfFace + 2000"], layer: "centre" },
      { id: "Face", kind: "line", from: ["0", "HalfFace"], to: ["HalfFace", "HalfFace"], layer: "centre" },
    ],
  });
}

describe("deriving a position from the relationship that fixes it", () => {
  it("places the far end of a member from its angle and length, and keeps the relationship", async () => {
    const ctx = context();
    await planned(ctx);

    const r = await ok(ctx, "derive", {
      op: "point_at_angle",
      from: "Face.end",
      angle: "SplayAngle",
      distance: "WallLength",
      name: "ReturnEnd",
      note: "the far end of the return wall",
    });
    // The answer is an expression of the values, not a coordinate.
    expect(r.text).toMatch(/cos\(SplayAngle\)/);
    expect(r.text).toMatch(/WallLength/);
    expect(r.text).toMatch(/Kept as ReturnEndX and ReturnEndY/);

    const def = currentDefinition(ctx.ws)!;
    const formulas = Object.fromEntries((def.formulas ?? []).map((f) => [f.name, String(f.expr)]));
    expect(formulas.ReturnEndX).toMatch(/cos\(SplayAngle\)/);
    expect(formulas.ReturnEndY).toMatch(/sin\(SplayAngle\)/);

    await ok(ctx, "construct", {
      feature: "Return",
      entities: [{ id: "ReturnFace", kind: "line", from: "Face.end", to: ["ReturnEndX", "ReturnEndY"] }],
    });

    // Turn the wall: the end, and the geometry built on it, follow.
    const reg = makeRegistry([currentDefinition(ctx.ws)!]);
    const endAt = (splay: number) => {
      const ev = evaluateComponent(currentDefinition(ctx.ws)!, { SplayAngle: splay }, reg);
      const line = ev.loops.find((l) => l.primitiveId === "ReturnFace")!;
      return line.points[1];
    };
    const at30 = endAt(30);
    const at45 = endAt(45);
    const rad = (d: number) => (d * Math.PI) / 180;
    expect(Math.abs(at30.x - (3000 + 4000 * Math.cos(rad(30))))).toBeLessThan(1e-6);
    expect(Math.abs(at45.y - (3000 + 4000 * Math.sin(rad(45))))).toBeLessThan(1e-6);
    expect(at45.y).toBeGreaterThan(at30.y);
  });

  it("falls a batter from the ratio it was written as", async () => {
    const ctx = context();
    await planned(ctx);
    const r = await ok(ctx, "derive", { op: "point_at_slope", from: ["0", "3000"], run: "WallLength", slope: "-1 / 4" });
    // 4000 out, 1000 down.
    expect(r.text).toMatch(/x = WallLength/);
    expect(r.text).toMatch(/2000\b/);
  });

  it("finds where two faces meet, and refuses to invent a crossing that is not there", async () => {
    const ctx = context();
    await planned(ctx);
    const hit = await ok(ctx, "derive", { op: "intersection", a: ["0", "0"], b: ["1000", "1000"], c: ["0", "HalfFace"], d: ["1000", "HalfFace"] });
    expect(hit.text).toMatch(/3000/);

    const parallel = await call(ctx, "derive", { op: "intersection", a: ["0", "0"], b: ["1000", "0"], c: ["0", "500"], d: ["1000", "500"] });
    expect(parallel.ok).toBe(false);
    expect(parallel.text).toMatch(/parallel/);
  });

  it("reports both answers of a two-answer construction rather than choosing for you", async () => {
    const ctx = context();
    await planned(ctx);
    const both = await ok(ctx, "derive", { op: "tangent_point", p: ["0", "0"], center: ["5000", "0"], r: "WallLength" });
    expect(both.text).toMatch(/two answers/);
    expect(both.text).toMatch(/pick/);
    const picked = await ok(ctx, "derive", { op: "tangent_point", p: ["0", "0"], center: ["5000", "0"], r: "WallLength", pick: "first" });
    expect(picked.text).not.toMatch(/two answers/);
  });

  it("sets out in the structure's own axes", async () => {
    const ctx = context();
    await planned(ctx);
    const g = await ok(ctx, "derive", { op: "to_global", origin: "Face.end", angle: "SplayAngle", u: "WallLength", v: "WallThickness", name: "BackEnd" });
    expect(g.text).toMatch(/cos\(SplayAngle\)/);
    expect(g.text).toMatch(/sin\(SplayAngle\)/);
  });

  it("reads a relationship back out of the geometry", async () => {
    const ctx = context();
    await planned(ctx);
    await ok(ctx, "construct", {
      feature: "Return",
      entities: [{ id: "ReturnFace", kind: "line", from: "Face.end", to: ["HalfFace + WallLength * cos(SplayAngle)", "HalfFace + WallLength * sin(SplayAngle)"] }],
    });
    const a = await ok(ctx, "derive", { op: "angle_of", a: "ReturnFace.start", b: "ReturnFace.end" });
    expect(a.text).toMatch(/atan2/);
    expect(a.text).toMatch(/\(30/);
  });
});

describe("turning a relationship round", () => {
  it("rearranges it and keeps the rearrangement, not the number", async () => {
    const ctx = context();
    await planned(ctx);
    const r = await ok(ctx, "solve", {
      equations: ["Rise = WallLength * sin(SplayAngle)"],
      for: ["SplayAngle"],
    });
    expect(r.text).toMatch(/asin\(Rise \/ WallLength\)/);
  });

  it("solves several relationships together", async () => {
    const ctx = context();
    await planned(ctx);
    const r = await ok(ctx, "solve", {
      equations: ["Rise = Run * Slope", "Diagonal = hypot(Run, Rise)"],
      for: ["Run", "Diagonal"],
    });
    expect(r.text).toMatch(/Run = Rise \/ Slope/);
    expect(r.text).toMatch(/Diagonal = /);
  });

  it("says what it cannot rearrange, and offers the numeric route", async () => {
    const ctx = context();
    await planned(ctx);
    const r = await call(ctx, "solve", { equations: ["Target = X + 100 * sin(X)"], for: ["X"] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/appears 2 times|min and max/);
  });

  it("keeps a numerically solved value as its relationship, so it is solved again when its input changes", async () => {
    const ctx = context();
    await planned(ctx);
    // Nobody gave this one, so it is a placeholder — the guard refuses to let it
    // be passed off as design data, which is the behaviour being relied on here.
    await ok(ctx, "plan", { update: true, values: [{ name: "Target", expr: "80", unit: "mm", source: "required", note: "the developed length the bend must reach — not given" }] });
    const r = await ok(ctx, "solve", {
      equations: ["Target = Bend + 100 * sin(Bend)"],
      for: ["Bend"],
      method: "numeric",
      min: "0",
      max: "90",
      name: "Bend",
      unit: "deg",
    });
    expect(r.text).toMatch(/re-solved/);

    const def = currentDefinition(ctx.ws)!;
    const bend = (def.formulas ?? []).find((f) => f.name === "Bend")!;
    expect(bend.solve?.equation).toMatch(/Bend \+ 100 \* sin\(Bend\)|Target = Bend/);

    const reg = makeRegistry([def]);
    const at = (target: number) => evaluateComponent(def, { Target: target }, reg).scope.Bend;
    expect(at(40)).toBeLessThan(at(80));
    expect(Math.abs(at(80) + 100 * Math.sin((at(80) * Math.PI) / 180) - 80)).toBeLessThan(1e-4);
  });
});

describe("what the tools refuse", () => {
  it("will not derive before there is a plan", async () => {
    const ctx = context();
    const r = await call(ctx, "derive", { op: "distance", a: ["0", "0"], b: ["1", "1"] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/Plan first/);
  });

  it("names the ops it has when asked for one it does not", async () => {
    const ctx = context();
    await planned(ctx);
    const r = await call(ctx, "derive", { op: "wing_wall", from: ["0", "0"] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/point_at_angle/);
  });
});
