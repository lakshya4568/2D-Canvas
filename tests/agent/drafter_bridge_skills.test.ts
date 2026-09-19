/**
 * The agent's bridge tooling: skills, the formula reference, the design data
 * rules, and the manual (sketch) route — draw by hand, make parametric,
 * change a value, edit the shape.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext, buildScene } from "@/lib/agent/drafter/tools";
import { DRAFTER_SYSTEM_PROMPT } from "@/lib/agent/drafter/prompt";
import { evaluateInstance } from "@/lib/cad/document";
import { DRAFTING_SKILLS } from "@/lib/agent/drafter/skills";
import { sketchPlanned } from "./plans";

function context(ws = new DraftingWorkspace({ construction: sketchPlanned() })): ToolContext {
  return { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => runTool(ctx, name, args);

describe("skills and the reference", () => {
  it("the prompt teaches plan → construct → verify → compare, and never the library", () => {
    for (const w of ["reference-reconstruction", "rcc-box-half-section", "bridge_reference", "plan", "construct", "verify", "compare_reference", "CONSTRUCT FROM SCRATCH"]) expect(DRAFTER_SYSTEM_PROMPT).toContain(w);
    for (const w of ["insert_component", "list_components", "ir.rcc_box"]) expect(DRAFTER_SYSTEM_PROMPT).not.toContain(w);
  });

  it("no skill sends the agent to a library component", () => {
    for (const k of DRAFTING_SKILLS) {
      expect(k.body, k.name).not.toMatch(/insert_component|list_components|\bir\.[a-z_]+\.[a-z_]+/);
    }
  });

  it("loads a skill by name and lists them without one", async () => {
    const ctx = context();
    const list = await call(ctx, "use_skill");
    expect(list.ok).toBe(true);
    expect(list.text).toMatch(/gad-drafting-style/);
    expect(list.text).toMatch(/reference-reconstruction/);
    const skill = await call(ctx, "use_skill", { name: "rcc-box-half-section" });
    expect(skill.text).toMatch(/RCR-LVL-002/);
    expect(skill.text).toMatch(/## Construction/);
    expect((await call(ctx, "use_skill", { name: "no-such-skill" })).ok).toBe(false);
  });

  it("looks up a formula without pointing at a library component", async () => {
    const ctx = context();
    const r = await call(ctx, "bridge_reference", { query: "RCR-LVL-002" });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/earthCushion = max\(formLvl - rccBoxTopLvl, 0\)/);
    expect(r.text).not.toMatch(/Implemented in component/);
    const s = await call(ctx, "bridge_reference", { query: "hume pipe barrel length" });
    expect(s.text).toMatch(/HPC-GEO-007/);
  });
});

describe("design data", () => {
  it("refuses to assume design data the drawing does not need", async () => {
    const ctx = context();
    const r = await call(ctx, "design_basis", { field: "designDischarge", value: "150", status: "ASSUMED_FOR_DRAFT" });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/data needed/);
    const lvl = await call(ctx, "design_basis", { field: "bedLevel", value: "96.1", status: "ASSUMED_FOR_DRAFT" });
    expect(lvl.ok).toBe(true);
    const typed = await call(ctx, "design_basis", { field: "designDischarge", value: "150", status: "PENDING_CONFIRMATION", note: "stated in the brief" });
    expect(typed.ok).toBe(true);
  });
});

describe("manual route", () => {
  async function drawBox(ctx: ToolContext) {
    const ok = async (name: string, args: Record<string, unknown>) => {
      const r = await call(ctx, name, args);
      expect(r.ok, `${name}: ${r.text}`).toBe(true);
      return r;
    };
    await ok("draw_line", { name: "CL", from: [0, 94000], to: [0, 106500], construction: true });
    await ok("classify", { ids: ["CL"], role: "bridge_centreline" });
    await ok("draw_rectangle", { name: "Box", x: -5700, y: 95150, width: 11400, height: 5850 });
    await ok("draw_polyline", {
      name: "Opening",
      points: [
        [-4750, 95950],
        [4750, 95950],
        [5350, 96550],
        [5350, 99600],
        [4750, 100200],
        [-4750, 100200],
        [-5350, 99600],
        [-5350, 96550],
      ],
    });
    await ok("draw_line", { name: "Bed", from: [-12000, 96100], to: [-5700, 96100], construction: true });
    await ok("classify", { ids: ["Bed"], role: "bed_level" });
    await ok("draw_line", { name: "Formation", from: [-12000, 105000], to: [-5700, 105000], construction: true });
    await ok("classify", { ids: ["Formation"], role: "formation_level" });
    await ok("annotate", { kind: "dimension", from: [-5350, 98000], to: [5350, 98000], offset: 0 });
    await ok("annotate", { kind: "dimension", from: [-5700, 98000], to: [-5350, 98000], offset: 0 });
    await ok("annotate", { kind: "dimension", from: [5350, 98000], to: [5700, 98000], offset: 0 });
    await ok("annotate", { kind: "dimension", from: [-5000, 101000], to: [-5000, 100200], offset: 0 });
    await ok("annotate", { kind: "dimension", from: [3000, 96100], to: [3000, 100200], offset: 0 });
    await ok("annotate", { kind: "dimension", from: [5700, 101000], to: [5700, 105000], offset: 800, hide_value: true });
    await ok("annotate", { kind: "text", at: [6700, 103500], text: "4000 mm EARTH CUSHION" });
    await ok("annotate", { kind: "leader", points: [[-5050, 99900], [-7200, 102500], [-11700, 102500]], text: "HAUNCH 600 X 600mm", placement: "above" });
    await ok("annotate", { kind: "level", at: [-11700, 101000], label: "TOP OF SLAB", style: "gad" });
  }

  it("draws a box by hand, makes it parametric, and drives it", async () => {
    const ctx = context();
    await drawBox(ctx);
    const pre = await call(ctx, "make_parametric", { preview: true, name: "Hand box" });
    expect(pre.ok).toBe(true);
    expect(pre.text).toMatch(/Input levels \(m\): .*BedLevel = 96\.1/);
    expect(pre.text).toMatch(/EarthCushion = 4000/);
    expect(pre.text).toMatch(/Haunch = 600/);
    const key = /(ann_\w+) → D\d+ \(drives, 800\)/.exec(pre.text)?.[1];
    expect(key).toBeTruthy();
    const made = await call(ctx, "make_parametric", { name: "Hand box", rename: [{ key, name: "TopSlab" }] });
    expect(made.ok, made.text).toBe(true);
    // Everything drawn freely is now the component.
    expect(ctx.ws.shapes).toHaveLength(0);
    const id = ctx.ws.cad.components[0].id;
    const set = await call(ctx, "set_component_values", { instance: id, values: [{ name: "TopSlab", value: 1000 }] });
    expect(set.ok, set.text).toBe(true);
    const ev = evaluateInstance(ctx.ws.cad.components[0], ctx.ws.cad)!.evaluation;
    expect(ev.scope.TopOfSlab).toBeCloseTo(101.2, 6);
    expect(ev.scope.EarthCushion).toBeCloseTo(3800, 6);

    const edit = await call(ctx, "edit_geometry", { instance: id });
    expect(edit.ok, edit.text).toBe(true);
    expect(ctx.ws.cad.components).toHaveLength(0);
    expect(ctx.ws.shapes.length).toBeGreaterThan(5);
  });
});
