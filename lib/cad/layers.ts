/**
 * Layer standards.
 *
 * A layer standard is data, not code: the names below are a sensible default
 * for Indian Railways bridge GADs, but every client, zone and consultant has its
 * own, so tools and validators look layers up by CATEGORY and a project can
 * load a different standard without touching either.
 *
 * Colour `#ffffff` means "ink" — AutoCAD's colour 7, which plots black on white
 * paper and shows white on a dark screen. Renderers swap it for the theme's
 * foreground in light mode.
 */

import type { Layer, LayerCategory, LayerStandard, LineType } from "./types";

export const INK = "#ffffff";

function layer(
  id: string,
  category: LayerCategory,
  color: string,
  lineType: LineType,
  lineWeight: number,
  description: string,
  plot = true
): Layer {
  return {
    id,
    name: id,
    category,
    color,
    lineType,
    lineWeight,
    visible: true,
    frozen: false,
    locked: false,
    plot,
    description,
  };
}

/**
 * Bridge-GAD layers following the logical categories of the tooling blueprint
 * (§7) plus the construction-stage groups of the railway integration guide
 * (§8.1). Existing railway and survey context is locked by default so an edit
 * cannot move an operating line by accident.
 */
export const IR_BRIDGE_GAD_STANDARD: LayerStandard = {
  id: "ir-bridge-gad",
  name: "IR Bridge GAD",
  description:
    "Default layer set for Indian Railways bridge general arrangement drawings. Rename freely; tools use the categories.",
  layers: [
    layer("0", "general", INK, "continuous", 0.25, "Default layer. Entities should not stay here."),
    layer("BRG-OUTLINE", "outline", INK, "continuous", 0.5, "Main visible concrete and steel outlines"),
    layer("BRG-SECONDARY", "secondary", "#9ca3af", "continuous", 0.25, "Secondary visible edges"),
    layer("BRG-HIDDEN", "hidden", "#fbbf24", "hidden", 0.25, "Hidden and concealed edges"),
    layer("BRG-CENTRE", "centre", "#f87171", "center", 0.18, "Centre lines, grid lines, axes"),
    layer("BRG-DIM", "dimension", "#4ade80", "continuous", 0.18, "Dimensions and extension lines"),
    layer("BRG-TEXT", "text", "#e5e7eb", "continuous", 0.25, "Notes, callouts and labels"),
    layer("BRG-LEADER", "leader", "#a3e635", "continuous", 0.18, "Leaders and callouts"),
    layer("BRG-HATCH", "hatch", "#94a3b8", "continuous", 0.13, "Material hatches"),
    layer("BRG-LEVEL", "level", "#38bdf8", "continuous", 0.18, "Reduced-level markers and level lines"),
    layer("BRG-WATER", "water", "#60a5fa", "dashdot", 0.18, "HFL, LWL, danger level and water lines"),
    layer("BRG-GROUND", "ground", "#a16207", "continuous", 0.25, "Existing ground and bed profile"),
    layer("BRG-REBAR", "rebar", "#f472b6", "continuous", 0.35, "Reinforcement detailing"),
    layer("BRG-PROPOSED", "proposed", "#fb923c", "continuous", 0.5, "Proposed work"),
    layer("EXISTING-RAILWAY", "existing", "#9ca3af", "continuous", 0.25, "Existing track, OHE and structures"),
    layer("SURVEY-SETTINGOUT", "survey", "#c084fc", "continuous", 0.18, "Baselines, controls, benchmarks"),
    layer("BRG-XREF", "reference", "#6b7280", "continuous", 0.18, "Reference underlays"),
    layer("BRG-NPLOT", "construction", "#22d3ee", "dotted", 0.13, "Construction guides — never plotted", false),
    layer("BRG-TITLE", "title", INK, "continuous", 0.35, "Title block and border"),
    layer("BRG-REVISION", "revision", "#f43f5e", "continuous", 0.25, "Revision clouds and notes"),
    layer("TEMP-WORKS", "temporary", "#facc15", "phantom", 0.25, "Staging, trestles, cofferdams, launching equipment"),
    layer("SAFETY-ZONE", "safety", "#ef4444", "dashdot", 0.25, "Exclusion zones and hazards"),
  ].map((l) =>
    l.category === "existing" || l.category === "survey" ? { ...l, locked: true } : l
  ),
};

export const LAYER_STANDARDS: LayerStandard[] = [IR_BRIDGE_GAD_STANDARD];

export function layerStandard(id: string | undefined): LayerStandard {
  return LAYER_STANDARDS.find((s) => s.id === id) ?? IR_BRIDGE_GAD_STANDARD;
}

/** A fresh copy of a standard's layers, safe to put into a document. */
export function instantiateLayers(standardId?: string): Layer[] {
  return layerStandard(standardId).layers.map((l) => ({ ...l }));
}

/**
 * The layer a category maps to in this document.
 *
 * Falls back to layer "0" rather than inventing one, so a missing category is
 * visible in the audit ("entities on layer 0") instead of hidden in a new layer
 * nobody asked for.
 */
export function layerIdFor(layers: Layer[], category: LayerCategory): string {
  return layers.find((l) => l.category === category)?.id ?? layers[0]?.id ?? "0";
}

export function findLayer(layers: Layer[], id: string | undefined): Layer | undefined {
  if (!id) return undefined;
  return layers.find((l) => l.id === id);
}

/** Screen/plot dash pattern for a line type, in multiples of the lineweight-free base unit. */
export function dashPattern(lineType: LineType): number[] | null {
  switch (lineType) {
    case "hidden":
      return [6, 3];
    case "center":
      return [16, 3, 3, 3];
    case "phantom":
      return [16, 3, 3, 3, 3, 3];
    case "dashdot":
      return [10, 3, 1, 3];
    case "dotted":
      return [1, 3];
    default:
      return null;
  }
}

/** Is this layer drawn at all? */
export function isLayerShown(layer: Layer | undefined): boolean {
  if (!layer) return true;
  return layer.visible && !layer.frozen;
}

/** Can entities on this layer be selected and edited? */
export function isLayerEditable(layer: Layer | undefined): boolean {
  if (!layer) return true;
  return layer.visible && !layer.frozen && !layer.locked;
}

export function uniqueLayerName(layers: Layer[], base: string): string {
  const clean = base.trim().toUpperCase().replace(/\s+/g, "-") || "LAYER";
  if (!layers.some((l) => l.id === clean)) return clean;
  let n = 2;
  while (layers.some((l) => l.id === `${clean}-${n}`)) n++;
  return `${clean}-${n}`;
}
