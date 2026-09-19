/**
 * The drafting agent's CAD-document tools: no access to the component library,
 * understanding of its own drawing, the design basis (enter, never confirm),
 * audit and sheet.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext, BASE_TOOLS } from "@/lib/agent/drafter/tools";
import { sketchPlanned } from "./plans";

function context(ws = new DraftingWorkspace({ construction: sketchPlanned() })): ToolContext {
  return { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}

async function call(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  return runTool(ctx, name, args);
}

describe("the component library is the draftsman's", () => {
  it("offers the agent no library tool, and refuses one if called", async () => {
    const names = BASE_TOOLS.map((t) => t.name);
    for (const n of ["list_components", "component_info", "insert_component", "set_table"]) expect(names).not.toContain(n);
    const ctx = context();
    for (const n of ["list_components", "insert_component", "component_info"]) {
      const r = await call(ctx, n, { definition: "ir.box_culvert.gad" });
      expect(r.ok).toBe(false);
      expect(r.text).toMatch(/belongs to the draftsman/);
    }
    expect(ctx.ws.cad.components).toHaveLength(0);
  });

  it("will not read, change or reuse a library component the draftsman placed", async () => {
    const ctx = context();
    ctx.ws.applyCad({ type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.section", at: { x: 0, y: 0 } });
    const id = ctx.ws.cad.components[0].id;
    for (const [tool, args] of [
      ["set_component_values", { instance: id, values: [{ name: "HaunchSize", value: 300 }] }],
      ["describe_component", { instance: id }],
      ["relationship", { instance: id, name: "HaunchSize", expr: "ClearSpan / 10" }],
      ["edit_geometry", { instance: id }],
      ["delete_component", { instance: id }],
    ] as const) {
      const r = await call(ctx, tool, args);
      expect(r.ok, tool).toBe(false);
      expect(r.text).toMatch(/library component/);
    }
    expect(ctx.ws.cad.components).toHaveLength(1);
    expect(ctx.ws.cad.components[0].values.HaunchSize).toBeUndefined();
  });
});

describe("understanding its own drawing", () => {
  it("classifies a hand-drawn level line and the editor marks and reads it", async () => {
    const ctx = context();
    await call(ctx, "draw_rectangle", { name: "Box", x: 0, y: 100000, width: 3700, height: 3750 });
    await call(ctx, "draw_line", { name: "HFL", from: [-3000, 102300], to: [7000, 102300], construction: true });
    const rec = await call(ctx, "recognize");
    expect(rec.ok).toBe(true);
    const r = await call(ctx, "classify", { ids: ["HFL"], role: "HFL" });
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/High flood level/);
    const marker = ctx.ws.cad.annotations.find((a) => a.type === "level");
    expect(marker && marker.type === "level" && marker.label).toBe("H.F.L.");
    const audit = await call(ctx, "audit");
    expect(audit.text).not.toMatch(/HFL is not marked/);
    const bad = await call(ctx, "classify", { ids: ["HFL"], role: "flux_capacitor" });
    expect(bad.ok).toBe(false);
  });
});

describe("design basis authority", () => {
  it("the agent can enter a value but never confirm it", async () => {
    const ctx = context();
    const ok = await call(ctx, "design_basis", { field: "hfl", value: "102.3", status: "INFERRED", note: "read from the reference" });
    expect(ok.ok).toBe(true);
    expect(ctx.ws.cad.project.dbr.hfl).toMatchObject({ value: 102.3, status: "INFERRED", setBy: "agent" });
    const no = await call(ctx, "design_basis", { field: "hfl", value: "102.3", status: "CONFIRMED_APPROVED" });
    expect(no.ok).toBe(false);
    expect(no.text).toMatch(/cannot confirm/);
  });

  it("audits and lays out a sheet of the draftsman's drawing", async () => {
    const ctx = context();
    // The draftsman placed a bridge GAD; the agent reviews it.
    ctx.ws.applyCad({ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } });
    await call(ctx, "project_info", { bridge_number: "123", chainage: "km 45/6-7" });
    const a = await call(ctx, "audit");
    expect(a.text).toMatch(/Audit: \d+ blocker/);
    expect(a.text).toMatch(/Suggested classification: MAJOR/);
    const s = await call(ctx, "make_sheet", { size: "A0" });
    expect(s.text).toMatch(/A0 at 1:\d+ \(locked\)/);
    expect(ctx.ws.toState().cad?.sheets).toHaveLength(1);
  });
});
