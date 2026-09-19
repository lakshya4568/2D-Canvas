/**
 * Text, dimension and arrow sizes: settings that reach every annotation, a
 * "readable" scale chosen from the drawing's own size, and the agent refusing
 * text nobody could read.
 */

import { describe, it, expect } from "vitest";
import { readableAnnotationScale, ANNOTATION_SCALES } from "@/lib/cad/sheet";
import { annotationPrims } from "@/lib/cad/annotationPrims";
import { DEFAULT_DRAWING_SETTINGS, type Annotation } from "@/lib/cad/types";
import { annotationGlobals } from "@/lib/components/instantiate";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool, type ToolContext } from "@/lib/agent/drafter/tools";

const dim: Annotation = { id: "d", type: "dimension", kind: "linear", axis: "x", p1: { kind: "point", x: 0, y: 0 }, p2: { kind: "point", x: 400, y: 0 }, offset: -50, mode: "reference" } as Annotation;
const prims = (settings: Partial<typeof DEFAULT_DRAWING_SETTINGS>) => annotationPrims(dim, { shapes: new Map(), settings: { ...DEFAULT_DRAWING_SETTINGS, ...settings } });

describe("sizes that follow the settings", () => {
  it("dimension text and arrows take their own sizes, in paper mm at the scale", () => {
    const text = (p: ReturnType<typeof prims>) => p.find((x) => x.k === "text") as { height: number };
    expect(text(prims({ annotationScale: 5 })).height).toBe(12.5);
    expect(text(prims({ annotationScale: 5, dimTextHeight: 4 })).height).toBe(20);
    const arrowLen = (p: ReturnType<typeof prims>) => {
      const f = p.find((x) => x.k === "fill") as { points: { x: number; y: number }[] };
      const xs = f.points.map((q) => q.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(arrowLen(prims({ annotationScale: 5, arrowSize: 5 }))).toBeCloseTo(2 * arrowLen(prims({ annotationScale: 5 })), 6);
  });

  it("dimension rows are spaced for their text", () => {
    expect(annotationGlobals({ annotationScale: 10, textHeight: 2.5 }).DIM).toBe(80);
    expect(annotationGlobals({ annotationScale: 10, textHeight: 2.5, dimTextHeight: 5 }).DIM).toBe(160);
  });
});

describe("a readable scale from the drawing's own size", () => {
  it("sizes text at about 1/100 of the drawing, on a standard scale", () => {
    expect(readableAnnotationScale(400, 250, 2.5)).toBe(2); // 5 mm text beside a 400 mm plate
    expect(readableAnnotationScale(26000, 10000, 2.5)).toBe(100);
    expect(readableAnnotationScale(50, 20, 2.5)).toBe(1);
    expect(ANNOTATION_SCALES).toContain(readableAnnotationScale(9000, 3000, 3.5));
  });
});

describe("the agent's drawings can be read", () => {
  const PLATE = {
    route: "construction",
    structure: "Steel base plate — plan view",
    views: [{ name: "Plan", shows: "the plate and its holes" }],
    analysis: "A steel base plate with four bolt holes, symmetric both ways; sizes given in the brief.",
    values: [{ name: "W", expr: "400", unit: "mm", source: "given" }, { name: "H", expr: "250", unit: "mm", source: "given" }],
    features: [
      { name: "Axes", description: "centre lines", stage: "datum" },
      { name: "Plate", description: "outline", stage: "primary" },
    ],
  };
  const context = (): ToolContext => ({ ws: new DraftingWorkspace(), hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 });

  it("without a written scale, text is sized to be read", async () => {
    const ctx = context();
    await runTool(ctx, "plan", PLATE);
    await runTool(ctx, "construct", { feature: "Axes", entities: [{ id: "CX", kind: "line", from: ["0", "H / 2"], to: ["W", "H / 2"], layer: "centre" }] });
    await runTool(ctx, "construct", { feature: "Plate", entities: [{ id: "P", kind: "rect", x: "0", y: "0", w: "W", h: "H" }] });
    expect(ctx.ws.cad.settings.annotationScale).toBe(2);
    expect((await runTool(ctx, "verify", {})).text).not.toMatch(/too small to read/);
  });

  it("refuses 1:1 text on a part, and says what would work", async () => {
    const ctx = context();
    await runTool(ctx, "plan", { ...PLATE, scale: 1 });
    await runTool(ctx, "construct", { feature: "Axes", entities: [{ id: "CX", kind: "line", from: ["0", "H / 2"], to: ["W", "H / 2"], layer: "centre" }] });
    await runTool(ctx, "construct", { feature: "Plate", entities: [{ id: "P", kind: "rect", x: "0", y: "0", w: "W", h: "H" }] });
    const r = await runTool(ctx, "verify", {});
    expect(r.text).toMatch(/Text and dimensions are 2.5 mm high on a 400 mm drawing — too small to read/);
    expect(r.text).toMatch(/1:2/);
  });
});
