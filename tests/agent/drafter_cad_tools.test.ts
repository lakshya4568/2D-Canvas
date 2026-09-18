/**
 * The drafting agent's CAD-document tools: components, understanding of its
 * own drawing, the design basis (enter, never confirm), audit and sheet.
 */

import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, ToolContext, checkReport } from "@/lib/agent/drafter/tools";

function context(ws = new DraftingWorkspace()): ToolContext {
  return { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
}

async function call(ctx: ToolContext, name: string, args: Record<string, unknown> = {}) {
  return runTool(ctx, name, args);
}

describe("component tools", () => {
  it("inserts a component with the brief's values and reports what it worked out", async () => {
    const ctx = context();
    const r = await call(ctx, "insert_component", { definition: "ir.box_culvert.gad", values: [{ name: "CellCount", value: 2 }, { name: "ClearSpan", value: 3000 }, { name: "HFL", value: 102.1 }] });
    expect(r.ok).toBe(true);
    expect(r.mutated).toBe(true);
    expect(r.text).toMatch(/Earth cushion over box=/);
    expect(ctx.ws.cad.components).toHaveLength(1);
    expect(ctx.ws.cadShapes.length).toBeGreaterThan(20);
    // A drawing made only of components passes the check without anchors or rules.
    expect(checkReport(ctx.ws).blockers).toEqual([]);
  });

  it("refuses values that break the component, with the reason", async () => {
    const ctx = context();
    await call(ctx, "insert_component", { definition: "ir.box_culvert.section" });
    const id = ctx.ws.cad.components[0].id;
    const r = await call(ctx, "set_component_values", { instance: id, values: [{ name: "HaunchSize", value: 2000 }] });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/haunches would meet/i);
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

  it("audits and lays out a sheet", async () => {
    const ctx = context();
    await call(ctx, "insert_component", { definition: "ir.bridge.gad" });
    await call(ctx, "project_info", { bridge_number: "123", chainage: "km 45/6-7" });
    const a = await call(ctx, "audit");
    expect(a.text).toMatch(/Audit: \d+ blocker/);
    expect(a.text).toMatch(/Suggested classification: MAJOR/);
    const s = await call(ctx, "make_sheet", { size: "A0" });
    expect(s.text).toMatch(/A0 at 1:\d+ \(locked\)/);
    expect(ctx.ws.toState().cad?.sheets).toHaveLength(1);
  });
});
