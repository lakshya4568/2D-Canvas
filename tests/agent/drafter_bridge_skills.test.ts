/**
 * The agent's bridge tooling: skills, the formula reference, the RCC box half
 * section component with its layer table and relationships, and the manual
 * route — draw by hand, make parametric, change a value, edit the shape.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext, buildScene } from "@/lib/agent/drafter/tools";
import { DRAFTER_SYSTEM_PROMPT } from "@/lib/agent/drafter/prompt";
import { evaluateInstance } from "@/lib/cad/document";

function context(ws = new DraftingWorkspace()): ToolContext {
  return { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}
const call = (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => runTool(ctx, name, args);

describe("skills and the reference", () => {
  it("the prompt lists the skills and both routes", () => {
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/rcc-box-half-section/);
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/make_parametric/);
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/bridge_reference/);
  });

  it("loads a skill by name and lists them without one", async () => {
    const ctx = context();
    const list = await call(ctx, "use_skill");
    expect(list.ok).toBe(true);
    expect(list.text).toMatch(/gad-drafting-style/);
    const skill = await call(ctx, "use_skill", { name: "rcc-box-half-section" });
    expect(skill.text).toMatch(/ir\.rcc_box\.half_section/);
    expect(skill.text).toMatch(/RCR-LVL-002/);
    expect((await call(ctx, "use_skill", { name: "no-such-skill" })).ok).toBe(false);
  });

  it("looks up a formula and says which component implements it", async () => {
    const ctx = context();
    const r = await call(ctx, "bridge_reference", { query: "RCR-LVL-002" });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/earthCushion = max\(formLvl - rccBoxTopLvl, 0\)/);
    expect(r.text).toMatch(/ir\.rcc_box\.half_section/);
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

describe("component route", () => {
  it("draws the half section, takes the foundation layers as a table and a relationship on rail level", async () => {
    const ctx = context();
    const ins = await call(ctx, "insert_component", { definition: "ir.rcc_box.half_section", values: [{ name: "FormationLevel", value: 105 }, { name: "BedLevel", value: 96.1 }, { name: "HFL", value: 96.8 }] });
    expect(ins.ok).toBe(true);
    expect(ins.text).toMatch(/RailLevel=105\.762m \(auto\)/);
    const id = ctx.ws.cad.components[0].id;
    const t = await call(ctx, "set_table", { instance: id, table: "Layers", rows: [{ name: "GRANULAR FILLING", thickness: 850, hatch: 2 }, { name: "SAND FILLING", thickness: 300, hatch: 6 }] });
    expect(t.ok).toBe(true);
    expect(t.text).toMatch(/SAND FILLING/);
    const rel = await call(ctx, "relationship", { instance: id, name: "RailLevel", expr: "FormationLevel + 0.8" });
    expect(rel.ok).toBe(true);
    expect(rel.text).toMatch(/RailLevel=105\.8m \(relationship\)/);
    const bad = await call(ctx, "relationship", { instance: id, name: "TopSlab", expr: "Nope * 2" });
    expect(bad.ok).toBe(false);
    expect(bad.text).toMatch(/Nope/);
    const inp = await call(ctx, "add_input", { instance: id, name: "SlabRatio", value: 0.08, unit: "-" });
    expect(inp.ok).toBe(true);
    const rel2 = await call(ctx, "relationship", { instance: id, name: "TopSlab", expr: "SlabRatio * ClearSpan" });
    expect(rel2.ok).toBe(true);
    const ev = evaluateInstance(ctx.ws.cad.components[0], ctx.ws.cad)!.evaluation;
    expect(ev.scope.TopSlab).toBeCloseTo(856, 6);
    // The extra 300 mm layer lowers the bottom of the foundation by 300 mm.
    expect(ev.scope.FoundationLevel).toBeCloseTo(94.15 - 0.3, 6);
  });

  it("the agent's view shows the callouts, not just the outline", async () => {
    const ctx = context();
    await call(ctx, "insert_component", { definition: "ir.rcc_box.half_section" });
    const scene = buildScene(ctx.ws);
    const notes = (scene.notes ?? []).map((n) => n.text);
    expect(notes).toContain("PROP. RAIL LEVEL = 105.762M.");
    expect(notes).toContain("HALF SECTION & HALF ELEVATION");
    expect((scene.thin ?? []).length).toBeGreaterThan(100);
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
