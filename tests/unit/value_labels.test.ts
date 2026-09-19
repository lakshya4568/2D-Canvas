/**
 * The names a person reads in Run mode: the author's label, or the value's
 * name spelled out — never the agent's note on where a number came from.
 */

import { describe, it, expect } from "vitest";
import { humanName, valueLabel } from "@/lib/components/labels";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, type ToolContext } from "@/lib/agent/drafter/tools";
import { currentDefinition } from "@/lib/agent/drafter/construction";
import type { ComponentDefinition } from "@/lib/components/types";

describe("a value's name, spelled out", () => {
  it("splits words and keeps abbreviations", () => {
    expect(humanName("ClearSpan")).toBe("Clear span");
    expect(humanName("HFLLevel")).toBe("HFL level");
    expect(humanName("TopSlabY")).toBe("Top slab Y");
    expect(humanName("HoleBRShiftX")).toBe("Hole BR shift X");
    expect(humanName("wall_outer")).toBe("Wall outer");
    expect(humanName("Wall2")).toBe("Wall 2");
    expect(humanName("W")).toBe("W");
  });
});

describe("what Run mode shows", () => {
  const agentBuilt = { origin: { kind: "drawn", construction: { plan: {}, tags: {} } } } as unknown as ComponentDefinition;
  it("shows an author's label as written", () => {
    expect(valueLabel({ name: "ClearSpan", label: "Clear span of each cell", description: "written: 2180" }, agentBuilt)).toBe("Clear span of each cell");
    expect(valueLabel({ name: "Span", label: "Span (library)" })).toBe("Span (library)");
  });
  it("never shows a source note as a name — including on drawings built before the fix", () => {
    expect(valueLabel({ name: "ClearSpan", label: "written: 2180", description: "written: 2180" }, agentBuilt)).toBe("Clear span");
    expect(valueLabel({ name: "HalfWidth", label: "ClearSpan + MidWall / 2 + Wall" }, agentBuilt)).toBe("Half width");
    expect(valueLabel({ name: "CellCount" }, agentBuilt)).toBe("Cell count");
  });

  it("the agent's construction names its values for people and keeps the source as the hint", async () => {
    const ctx: ToolContext = { ws: new DraftingWorkspace(), hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
    const r = await runTool(ctx, "plan", {
      route: "construction",
      structure: "A rectangular steel plate — plan view",
      views: [{ name: "Plan", shows: "the plate" }],
      analysis: "A single rectangular plate; width and height are given in the brief; nothing else.",
      values: [
        { name: "PlateWidth", expr: "400", unit: "mm", source: "given", note: "written: 400", label: "Plate width" },
        { name: "PlateHeight", expr: "250", unit: "mm", source: "given", note: "written: 250" },
        { name: "HalfWidth", expr: "PlateWidth / 2", unit: "mm", note: "half of the width" },
      ],
      features: [
        { name: "Axes", description: "centre line", stage: "datum" },
        { name: "Plate", description: "outline", stage: "primary" },
      ],
    });
    expect(r.ok, r.text).toBe(true);
    await runTool(ctx, "construct", { feature: "Axes", entities: [{ id: "CL", kind: "line", from: ["HalfWidth", "0"], to: ["HalfWidth", "PlateHeight"], layer: "centre" }] });
    await runTool(ctx, "construct", { feature: "Plate", entities: [{ id: "P", kind: "rect", x: "0", y: "0", w: "PlateWidth", h: "PlateHeight" }] });
    const def = currentDefinition(ctx.ws)!;
    const shown = (n: string) => valueLabel([...def.parameters, ...(def.formulas ?? [])].find((p) => p.name === n)!, def);
    expect(shown("PlateWidth")).toBe("Plate width");
    expect(shown("PlateHeight")).toBe("Plate height");
    expect(shown("HalfWidth")).toBe("Half width");
    expect(def.parameters.find((p) => p.name === "PlateHeight")!.description).toBe("written: 250");
  });
});
