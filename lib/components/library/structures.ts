/**
 * Structural components — cross-sections and elevations of the parts a
 * railway bridge or culvert is built from.
 *
 * These are DATA. Every coordinate is an expression of named values in the
 * component's own frame (mm, Y up); the engine in ../evaluate.ts is the only
 * code that reads them, and it knows nothing about bridges. Defaults are
 * drafting aids (railway guide §1.3), not design values: every dimension that
 * matters must come from the approved design basis before issue.
 *
 * Conventions used throughout:
 *   DIM, TXT — annotation spacing and text height at the drawing's scale,
 *              supplied by the engine; only annotation placement reads them.
 */

import type { ComponentDefinition, Expr, XY } from "../types";

/** Rectangle from two corners, as four expression points. */
export function rect(x0: Expr, y0: Expr, x1: Expr, y1: Expr): XY[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

// ---------------------------------------------------------------------------
// RCC box culvert — cross-section normal to flow, N cells
// ---------------------------------------------------------------------------

const cellX0 = "SideWallThickness + i * CellPitch";
const cellX1 = "SideWallThickness + i * CellPitch + ClearSpan";

export const BOX_CULVERT_SECTION: ComponentDefinition = {
  id: "ir.box_culvert.section",
  name: "RCC box culvert — section",
  category: "component",
  semanticType: "box_culvert",
  view: "section",
  version: "1.0.0",
  description:
    "Single or multi-cell RCC box, haunched cells, with PCC levelling course. Cell count is topology: changing it regenerates cells and intermediate walls; nothing is scaled.",
  tags: ["culvert", "box", "rcc", "multi-cell"],
  sources: ["irbm-311-3", "irbm-312"],
  parameters: [
    { name: "CellCount", label: "Number of cells", kind: "count", unit: "-", default: 2, min: 1, max: 8, group: "Opening" },
    { name: "ClearSpan", label: "Clear span of each cell", kind: "length", unit: "mm", default: 3000, min: 1000, max: 8000, step: 50, group: "Opening", sourceRequired: true },
    { name: "ClearHeight", label: "Clear height", kind: "length", unit: "mm", default: 3000, min: 1200, max: 8000, step: 50, group: "Opening", sourceRequired: true },
    { name: "SideWallThickness", label: "Side wall thickness", kind: "length", unit: "mm", default: 350, min: 250, max: 1200, step: 10, group: "Structure", sourceRequired: true },
    { name: "InteriorWallThickness", label: "Intermediate wall thickness", kind: "length", unit: "mm", default: 300, min: 250, max: 1000, step: 10, group: "Structure", sourceRequired: true },
    { name: "TopSlabThickness", label: "Top slab thickness", kind: "length", unit: "mm", default: 350, min: 200, max: 1200, step: 10, group: "Structure", sourceRequired: true },
    { name: "BaseSlabThickness", label: "Base slab thickness", kind: "length", unit: "mm", default: 400, min: 200, max: 1200, step: 10, group: "Structure", sourceRequired: true },
    { name: "HaunchSize", label: "Haunch (each leg)", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Structure" },
    { name: "PccThickness", label: "PCC levelling course", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 25, group: "Foundation" },
    { name: "PccProjection", label: "PCC projection beyond box", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Foundation" },
  ],
  formulas: [
    { name: "CellPitch", expr: "ClearSpan + InteriorWallThickness", label: "Cell pitch", unit: "mm", report: true, group: "Opening" },
    { name: "OuterWidth", expr: "CellCount * ClearSpan + 2 * SideWallThickness + (CellCount - 1) * InteriorWallThickness", label: "Overall width", unit: "mm", report: true, group: "Structure" },
    { name: "OuterHeight", expr: "BaseSlabThickness + ClearHeight + TopSlabThickness", label: "Overall height", unit: "mm", report: true, group: "Structure" },
    { name: "LinearWaterway", expr: "CellCount * ClearSpan", label: "Linear waterway", unit: "mm", report: true, group: "Opening" },
    { name: "WaterwayArea", expr: "CellCount * ClearSpan * ClearHeight / 1000000", label: "Waterway area", unit: "m2", report: true, group: "Opening" },
  ],
  primitives: [
    { id: "box", kind: "loop", role: "concrete_section", layer: "outline", label: "Box", points: rect(0, 0, "OuterWidth", "OuterHeight") },
    {
      id: "cell",
      kind: "loop",
      role: "clear_opening",
      layer: "outline",
      label: "Cell",
      repeat: { count: "CellCount", index: "i" },
      points: [
        [`${cellX0} + HaunchSize`, "BaseSlabThickness"],
        [`${cellX1} - HaunchSize`, "BaseSlabThickness"],
        [cellX1, "BaseSlabThickness + HaunchSize"],
        [cellX1, "BaseSlabThickness + ClearHeight - HaunchSize"],
        [`${cellX1} - HaunchSize`, "BaseSlabThickness + ClearHeight"],
        [`${cellX0} + HaunchSize`, "BaseSlabThickness + ClearHeight"],
        [cellX0, "BaseSlabThickness + ClearHeight - HaunchSize"],
        [cellX0, "BaseSlabThickness + HaunchSize"],
      ],
    },
    { id: "pcc", kind: "loop", role: "pcc_levelling", layer: "outline", label: "PCC", when: "PccThickness", points: rect("-PccProjection", "-PccThickness", "OuterWidth + PccProjection", 0) },
    { id: "axis", kind: "path", role: "structure_centreline", layer: "centre", label: "Centre line", points: [["OuterWidth / 2", "-PccThickness - DIM"], ["OuterWidth / 2", "OuterHeight + DIM * 0.5"]] },
  ],
  hatches: [
    { id: "concrete", boundary: "box", holes: ["cell"], material: "rcc" },
    { id: "pcc_fill", boundary: "pcc", material: "pcc", when: "PccThickness" },
  ],
  anchors: [
    { id: "base_left", at: [0, 0] },
    { id: "base_right", at: ["OuterWidth", 0] },
    { id: "base_centre", at: ["OuterWidth / 2", 0] },
    { id: "top_left", at: [0, "OuterHeight"] },
    { id: "top_right", at: ["OuterWidth", "OuterHeight"] },
    { id: "top_centre", at: ["OuterWidth / 2", "OuterHeight"] },
    { id: "invert", at: ["SideWallThickness + ClearSpan / 2", "BaseSlabThickness"] },
    { id: "founding", at: ["OuterWidth / 2", "-PccThickness"] },
  ],
  dimensions: [
    { id: "wall_l", kind: "horizontal", from: [0, "OuterHeight"], to: ["SideWallThickness", "OuterHeight"], offset: "DIM", drives: "SideWallThickness" },
    { id: "span", kind: "horizontal", repeat: { count: "CellCount", index: "i" }, from: [cellX0, "OuterHeight"], to: [cellX1, "OuterHeight"], offset: "DIM", drives: "ClearSpan" },
    { id: "midwall", kind: "horizontal", repeat: { count: "CellCount - 1", index: "i" }, from: [cellX1, "OuterHeight"], to: ["SideWallThickness + (i + 1) * CellPitch", "OuterHeight"], offset: "DIM", drives: "InteriorWallThickness" },
    { id: "wall_r", kind: "horizontal", from: ["OuterWidth - SideWallThickness", "OuterHeight"], to: ["OuterWidth", "OuterHeight"], offset: "DIM", drives: "SideWallThickness" },
    { id: "width", kind: "horizontal", from: [0, "OuterHeight"], to: ["OuterWidth", "OuterHeight"], offset: "2 * DIM" },
    { id: "base", kind: "vertical", from: ["OuterWidth", 0], to: ["OuterWidth", "BaseSlabThickness"], offset: "DIM", drives: "BaseSlabThickness" },
    { id: "clear_h", kind: "vertical", from: ["OuterWidth", "BaseSlabThickness"], to: ["OuterWidth", "BaseSlabThickness + ClearHeight"], offset: "DIM", drives: "ClearHeight" },
    { id: "top", kind: "vertical", from: ["OuterWidth", "BaseSlabThickness + ClearHeight"], to: ["OuterWidth", "OuterHeight"], offset: "DIM", drives: "TopSlabThickness" },
    { id: "height", kind: "vertical", from: ["OuterWidth", 0], to: ["OuterWidth", "OuterHeight"], offset: "2 * DIM" },
    { id: "pcc_t", kind: "vertical", from: ["-PccProjection", "-PccThickness"], to: ["-PccProjection", 0], offset: "-DIM", drives: "PccThickness", when: "PccThickness" },
  ],
  texts: [
    { id: "haunch", when: "HaunchSize", at: ["SideWallThickness + HaunchSize + TXT", "BaseSlabThickness + ClearHeight - HaunchSize - TXT"], text: "HAUNCH {HaunchSize}×{HaunchSize}", align: "left", height: 2 },
    { id: "title", at: ["OuterWidth / 2", "-PccThickness - 2 * DIM"], text: "{CellCount} CELL RCC BOX {ClearSpan:m} × {ClearHeight:m} m", align: "center", height: 3.5 },
  ],
  invariants: [
    { id: "span_positive", expr: "ClearSpan", op: ">", than: 0, message: "Clear span must be positive.", severity: "error" },
    { id: "height_positive", expr: "ClearHeight", op: ">", than: 0, message: "Clear height must be positive.", severity: "error" },
    { id: "walls_positive", expr: "min(SideWallThickness, TopSlabThickness, BaseSlabThickness)", op: ">", than: 0, message: "Wall and slab thicknesses must be positive.", severity: "error" },
    { id: "midwall_positive", expr: "if(CellCount - 1, InteriorWallThickness, 1)", op: ">", than: 0, message: "Intermediate wall thickness must be positive.", severity: "error" },
    { id: "cells", expr: "CellCount", op: ">=", than: 1, message: "A box needs at least one cell.", severity: "error" },
    { id: "haunch_span", expr: "ClearSpan", op: ">", than: "2 * HaunchSize", message: "The haunches would meet across the opening — reduce the haunch or widen the span.", severity: "error" },
    { id: "haunch_height", expr: "ClearHeight", op: ">", than: "2 * HaunchSize", message: "The haunches would meet top to bottom — reduce the haunch or raise the clear height.", severity: "error" },
    { id: "haunch_nonneg", expr: "HaunchSize", op: ">=", than: 0, message: "Haunch size cannot be negative.", severity: "error" },
    { id: "pcc_nonneg", expr: "min(PccThickness, PccProjection)", op: ">=", than: 0, message: "PCC thickness and projection cannot be negative.", severity: "error" },
  ],
  facts: [
    { key: "clear_opening_mm", expr: "ClearSpan" },
    { key: "clear_height_mm", expr: "ClearHeight" },
    { key: "cell_count", expr: "CellCount" },
    { key: "linear_waterway_mm", expr: "LinearWaterway" },
    { key: "waterway_area_m2", expr: "WaterwayArea" },
    { key: "culvert_exempt_clearance", expr: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Pipe culvert — section, N pipes with concrete cradle
// ---------------------------------------------------------------------------

export const PIPE_CULVERT_SECTION: ComponentDefinition = {
  id: "ir.pipe_culvert.section",
  name: "Pipe culvert — section",
  category: "component",
  semanticType: "pipe_culvert",
  view: "section",
  version: "1.0.0",
  description: "One or more RCC pipes on a concrete cradle. Pipes are repeated at a pitch; the cradle follows the pipe count.",
  tags: ["culvert", "pipe"],
  sources: ["irbm-311-3", "irbm-312"],
  parameters: [
    { name: "PipeCount", label: "Number of pipes", kind: "count", unit: "-", default: 2, min: 1, max: 6, group: "Opening" },
    { name: "InternalDiameter", label: "Internal diameter", kind: "length", unit: "mm", default: 1200, min: 1000, max: 3000, step: 50, group: "Opening", sourceRequired: true },
    { name: "PipeWall", label: "Pipe wall thickness", kind: "length", unit: "mm", default: 120, min: 50, max: 300, step: 5, group: "Structure" },
    { name: "PipeGap", label: "Clear gap between pipes", kind: "length", unit: "mm", default: 600, min: 300, max: 3000, step: 50, group: "Structure" },
    { name: "CradleDepthBelow", label: "Cradle depth below pipe", kind: "length", unit: "mm", default: 300, min: 150, max: 1000, step: 25, group: "Foundation" },
    { name: "CradleRise", label: "Cradle rise (from pipe invert)", kind: "length", unit: "mm", default: 600, min: 0, max: 2000, step: 25, group: "Foundation" },
    { name: "CradleProjection", label: "Cradle projection beyond pipes", kind: "length", unit: "mm", default: 300, min: 0, max: 1000, step: 25, group: "Foundation" },
  ],
  formulas: [
    { name: "OuterDiameter", expr: "InternalDiameter + 2 * PipeWall", label: "Outside diameter", unit: "mm", report: true, group: "Structure" },
    { name: "PipePitch", expr: "OuterDiameter + PipeGap", label: "Pipe pitch", unit: "mm", report: true, group: "Structure" },
    { name: "CradleWidth", expr: "(PipeCount - 1) * PipePitch + OuterDiameter + 2 * CradleProjection", label: "Cradle width", unit: "mm", report: true, group: "Foundation" },
    { name: "LinearWaterway", expr: "PipeCount * InternalDiameter", label: "Linear waterway", unit: "mm", report: true, group: "Opening" },
    { name: "WaterwayArea", expr: "PipeCount * PI * InternalDiameter * InternalDiameter / 4000000", label: "Waterway area", unit: "m2", report: true, group: "Opening" },
  ],
  primitives: [
    { id: "outer", kind: "circle", role: "pipe", layer: "outline", label: "Pipe", repeat: { count: "PipeCount", index: "i" }, center: ["CradleProjection + OuterDiameter / 2 + i * PipePitch", "CradleDepthBelow + OuterDiameter / 2"], r: "OuterDiameter / 2" },
    { id: "bore", kind: "circle", role: "clear_opening", layer: "outline", label: "Bore", repeat: { count: "PipeCount", index: "i" }, center: ["CradleProjection + OuterDiameter / 2 + i * PipePitch", "CradleDepthBelow + OuterDiameter / 2"], r: "InternalDiameter / 2" },
    { id: "cradle", kind: "path", role: "cradle", layer: "outline", label: "Cradle", points: [[0, "CradleDepthBelow + CradleRise"], [0, 0], ["CradleWidth", 0], ["CradleWidth", "CradleDepthBelow + CradleRise"]] },
  ],
  hatches: [{ id: "pipe_wall", boundary: "outer", holes: ["bore"], material: "rcc" }],
  anchors: [
    { id: "base_left", at: [0, 0] },
    { id: "base_centre", at: ["CradleWidth / 2", 0] },
    { id: "invert", at: ["CradleProjection + OuterDiameter / 2", "CradleDepthBelow + PipeWall"] },
    { id: "top_centre", at: ["CradleWidth / 2", "CradleDepthBelow + OuterDiameter"] },
  ],
  dimensions: [
    { id: "id", kind: "diameter", from: ["CradleProjection + OuterDiameter / 2", "CradleDepthBelow + OuterDiameter / 2"], to: ["CradleProjection + OuterDiameter / 2 + InternalDiameter / 2 * 0.7071", "CradleDepthBelow + OuterDiameter / 2 + InternalDiameter / 2 * 0.7071"], offset: 0, drives: "InternalDiameter" },
    { id: "width", kind: "horizontal", from: [0, 0], to: ["CradleWidth", 0], offset: "-DIM" },
    { id: "gap", kind: "horizontal", repeat: { count: "PipeCount - 1", index: "i" }, from: ["CradleProjection + OuterDiameter + i * PipePitch", "CradleDepthBelow + OuterDiameter / 2"], to: ["CradleProjection + (i + 1) * PipePitch", "CradleDepthBelow + OuterDiameter / 2"], offset: 0, drives: "PipeGap" },
  ],
  invariants: [
    { id: "wall", expr: "PipeWall", op: ">", than: 0, message: "Pipe wall must be positive.", severity: "error" },
    { id: "gap", expr: "if(PipeCount - 1, PipeGap, 1)", op: ">", than: 0, message: "Pipes would touch or overlap.", severity: "error" },
    { id: "id", expr: "InternalDiameter", op: ">", than: 0, message: "Internal diameter must be positive.", severity: "error" },
  ],
  facts: [
    { key: "clear_opening_mm", expr: "InternalDiameter" },
    { key: "clear_height_mm", expr: "InternalDiameter" },
    { key: "linear_waterway_mm", expr: "LinearWaterway" },
    { key: "waterway_area_m2", expr: "WaterwayArea" },
    { key: "culvert_exempt_clearance", expr: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Pier — longitudinal elevation (footing, shaft, cap, bearing pedestals)
// ---------------------------------------------------------------------------

export const PIER_ELEVATION: ComponentDefinition = {
  id: "ir.pier.elevation",
  name: "Pier — elevation",
  category: "component",
  semanticType: "pier",
  view: "elevation",
  version: "1.0.0",
  description:
    "Open-foundation pier in longitudinal elevation: PCC, footing, battered or straight shaft, pier cap and two bearing pedestals. Origin at the bottom centre of the footing.",
  tags: ["pier", "substructure"],
  sources: ["ircm-t403", "irbm-401"],
  parameters: [
    { name: "ShaftWidth", label: "Shaft width at top", kind: "length", unit: "mm", default: 1500, min: 600, max: 6000, step: 50, group: "Shaft", sourceRequired: true },
    { name: "ShaftHeight", label: "Shaft height", kind: "length", unit: "mm", default: 6000, min: 500, max: 40000, step: 50, group: "Shaft" },
    { name: "Batter", label: "Face batter (horizontal per vertical)", kind: "ratio", unit: "-", default: 0, min: 0, max: 0.1, step: 0.005, group: "Shaft" },
    { name: "CapWidth", label: "Pier cap width", kind: "length", unit: "mm", default: 2800, min: 1000, max: 8000, step: 50, group: "Cap", sourceRequired: true },
    { name: "CapDepth", label: "Pier cap depth", kind: "length", unit: "mm", default: 900, min: 300, max: 3000, step: 25, group: "Cap" },
    { name: "BearingSpacing", label: "Bearing spacing on the cap", kind: "length", unit: "mm", default: 1000, min: 300, max: 5000, step: 25, group: "Cap" },
    { name: "PedestalWidth", label: "Bearing pedestal width", kind: "length", unit: "mm", default: 600, min: 200, max: 1500, step: 25, group: "Cap" },
    { name: "PedestalHeight", label: "Bearing pedestal height", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Cap" },
    { name: "FootingWidth", label: "Footing width", kind: "length", unit: "mm", default: 4500, min: 1000, max: 20000, step: 50, group: "Foundation", sourceRequired: true },
    { name: "FootingDepth", label: "Footing depth", kind: "length", unit: "mm", default: 1500, min: 300, max: 5000, step: 50, group: "Foundation", sourceRequired: true },
    { name: "PccThickness", label: "PCC levelling course", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 25, group: "Foundation" },
    { name: "PccProjection", label: "PCC projection", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Foundation" },
  ],
  formulas: [
    { name: "ShaftBaseWidth", expr: "ShaftWidth + 2 * Batter * ShaftHeight", label: "Shaft width at base", unit: "mm", report: true, group: "Shaft" },
    { name: "CapBottom", expr: "FootingDepth + ShaftHeight" },
    { name: "CapTop", expr: "CapBottom + CapDepth" },
    { name: "PierHeight", expr: "CapTop", label: "Height, footing bottom to cap top", unit: "mm", report: true, group: "Shaft" },
    { name: "BearingEdgeClearance", expr: "CapWidth / 2 - BearingSpacing / 2 - PedestalWidth / 2", label: "Cap edge beyond pedestals", unit: "mm", report: true, group: "Cap" },
  ],
  primitives: [
    { id: "pcc", kind: "loop", role: "pcc_levelling", layer: "outline", label: "PCC", when: "PccThickness", points: rect("-FootingWidth / 2 - PccProjection", "-PccThickness", "FootingWidth / 2 + PccProjection", 0) },
    { id: "footing", kind: "loop", role: "open_footing", layer: "outline", label: "Footing", points: rect("-FootingWidth / 2", 0, "FootingWidth / 2", "FootingDepth") },
    { id: "shaft", kind: "loop", role: "pier", layer: "outline", label: "Pier shaft", points: [["-ShaftBaseWidth / 2", "FootingDepth"], ["ShaftBaseWidth / 2", "FootingDepth"], ["ShaftWidth / 2", "CapBottom"], ["-ShaftWidth / 2", "CapBottom"]] },
    { id: "cap", kind: "loop", role: "pier_cap", layer: "outline", label: "Pier cap", points: rect("-CapWidth / 2", "CapBottom", "CapWidth / 2", "CapTop") },
    { id: "pedestal", kind: "loop", role: "bed_block", layer: "outline", label: "Pedestal", when: "PedestalHeight", repeat: { count: 2, index: "k" }, points: rect("(k - 0.5) * BearingSpacing - PedestalWidth / 2", "CapTop", "(k - 0.5) * BearingSpacing + PedestalWidth / 2", "CapTop + PedestalHeight") },
    { id: "axis", kind: "path", role: "pier_axis", layer: "centre", label: "Pier axis", points: [[0, "-PccThickness - DIM * 0.6"], [0, "CapTop + PedestalHeight + DIM * 0.6"]] },
  ],
  hatches: [
    { id: "f", boundary: "footing", material: "rcc" },
    { id: "s", boundary: "shaft", material: "rcc" },
    { id: "c", boundary: "cap", material: "rcc" },
    { id: "p", boundary: "pedestal", material: "rcc", when: "PedestalHeight" },
    { id: "l", boundary: "pcc", material: "pcc", when: "PccThickness" },
  ],
  anchors: [
    { id: "footing_bottom", at: [0, 0] },
    { id: "founding", at: [0, "-PccThickness"] },
    { id: "cap_top", at: [0, "CapTop"] },
    { id: "bearing_left", at: ["-BearingSpacing / 2", "CapTop + PedestalHeight"] },
    { id: "bearing_right", at: ["BearingSpacing / 2", "CapTop + PedestalHeight"] },
  ],
  dimensions: [
    { id: "footing_w", kind: "horizontal", from: ["-FootingWidth / 2", 0], to: ["FootingWidth / 2", 0], offset: "-PccThickness - DIM", drives: "FootingWidth" },
    { id: "cap_w", kind: "horizontal", from: ["-CapWidth / 2", "CapTop"], to: ["CapWidth / 2", "CapTop"], offset: "PedestalHeight + DIM", drives: "CapWidth" },
    { id: "shaft_w", kind: "horizontal", from: ["-ShaftWidth / 2", "CapBottom"], to: ["ShaftWidth / 2", "CapBottom"], offset: "-DIM", drives: "ShaftWidth" },
    { id: "footing_d", kind: "vertical", from: ["FootingWidth / 2", 0], to: ["FootingWidth / 2", "FootingDepth"], offset: "DIM", drives: "FootingDepth" },
    { id: "shaft_h", kind: "vertical", from: ["FootingWidth / 2", "FootingDepth"], to: ["FootingWidth / 2", "CapBottom"], offset: "DIM" },
    { id: "cap_d", kind: "vertical", from: ["FootingWidth / 2", "CapBottom"], to: ["FootingWidth / 2", "CapTop"], offset: "DIM", drives: "CapDepth" },
  ],
  invariants: [
    { id: "shaft_h", expr: "ShaftHeight", op: ">", than: 0, message: "The pier shaft has no height — the cap would sit on or below the footing. Check the levels.", severity: "error" },
    { id: "widths", expr: "min(ShaftWidth, CapWidth, FootingWidth, CapDepth, FootingDepth)", op: ">", than: 0, message: "Pier widths and depths must be positive.", severity: "error" },
    { id: "footing_covers_shaft", expr: "FootingWidth", op: ">=", than: "ShaftBaseWidth", message: "The shaft base is wider than the footing.", severity: "error" },
    { id: "cap_covers_shaft", expr: "CapWidth", op: ">=", than: "ShaftWidth", message: "The cap is narrower than the shaft it sits on.", severity: "warning" },
    { id: "bearings_on_cap", expr: "BearingEdgeClearance", op: ">=", than: 0, message: "The bearing pedestals overhang the pier cap.", severity: "error" },
    { id: "bearing_edge_150", expr: "BearingEdgeClearance", op: ">=", than: 150, message: "Less than 150 mm of cap beyond the bearings (RDSO GAD checklist, item 16).", severity: "warning", source: "ircm-t403" },
  ],
  facts: [
    { key: "pier_shaft_width_mm", expr: "ShaftWidth" },
    { key: "pier_height_mm", expr: "PierHeight" },
    { key: "foundation_open", expr: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Abutment — longitudinal elevation (left hand; mirror for the right)
// ---------------------------------------------------------------------------

export const ABUTMENT_ELEVATION: ComponentDefinition = {
  id: "ir.abutment.elevation",
  name: "Abutment — elevation",
  category: "component",
  semanticType: "abutment",
  view: "elevation",
  version: "1.0.0",
  description:
    "Open-foundation abutment in longitudinal elevation, span to the right: footing with toe and heel, stem with battered back face, cap, ballast wall, bearing pedestal, backfill and wing-wall outline. Mirror it for the far abutment. Origin at the stem front face, bottom of footing.",
  tags: ["abutment", "substructure", "wing wall"],
  sources: ["ircm-t403"],
  parameters: [
    { name: "StemHeight", label: "Stem height", kind: "length", unit: "mm", default: 5000, min: 500, max: 30000, step: 50, group: "Stem" },
    { name: "StemTopWidth", label: "Stem width at top", kind: "length", unit: "mm", default: 1200, min: 500, max: 5000, step: 50, group: "Stem", sourceRequired: true },
    { name: "StemBatter", label: "Back face batter (horizontal per vertical)", kind: "ratio", unit: "-", default: 0.1, min: 0, max: 0.4, step: 0.01, group: "Stem" },
    { name: "CapDepth", label: "Abutment cap depth", kind: "length", unit: "mm", default: 600, min: 300, max: 2000, step: 25, group: "Cap" },
    { name: "CapFrontProjection", label: "Cap projection beyond stem face", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Cap" },
    { name: "BearingOffset", label: "Bearing centre from cap front edge", kind: "length", unit: "mm", default: 500, min: 200, max: 2000, step: 25, group: "Cap" },
    { name: "PedestalWidth", label: "Bearing pedestal width", kind: "length", unit: "mm", default: 600, min: 200, max: 1500, step: 25, group: "Cap" },
    { name: "PedestalHeight", label: "Bearing pedestal height", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Cap" },
    { name: "BallastWallThickness", label: "Ballast wall thickness", kind: "length", unit: "mm", default: 400, min: 200, max: 1000, step: 25, group: "Cap" },
    { name: "BallastWallHeight", label: "Ballast wall height above cap", kind: "length", unit: "mm", default: 1500, min: 0, max: 5000, step: 25, group: "Cap" },
    { name: "FootingToe", label: "Footing toe (in front of stem)", kind: "length", unit: "mm", default: 1000, min: 0, max: 5000, step: 50, group: "Foundation", sourceRequired: true },
    { name: "FootingHeel", label: "Footing heel (behind stem)", kind: "length", unit: "mm", default: 2000, min: 0, max: 8000, step: 50, group: "Foundation", sourceRequired: true },
    { name: "FootingDepth", label: "Footing depth", kind: "length", unit: "mm", default: 1500, min: 300, max: 5000, step: 50, group: "Foundation", sourceRequired: true },
    { name: "PccThickness", label: "PCC levelling course", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 25, group: "Foundation" },
    { name: "PccProjection", label: "PCC projection", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Foundation" },
    { name: "BackfillLength", label: "Backfill shown behind the wall", kind: "length", unit: "mm", default: 3000, min: 0, max: 20000, step: 100, group: "Approach" },
    { name: "WingTopLength", label: "Wing wall level top length", kind: "length", unit: "mm", default: 1500, min: 0, max: 10000, step: 100, group: "Approach" },
    { name: "WingSlope", label: "Wing wall top slope (horizontal per vertical)", kind: "ratio", unit: "-", default: 1.5, min: 0, max: 3, step: 0.25, group: "Approach" },
  ],
  formulas: [
    { name: "StemBaseWidth", expr: "StemTopWidth + StemBatter * StemHeight", label: "Stem width at base", unit: "mm", report: true, group: "Stem" },
    { name: "StemTop", expr: "FootingDepth + StemHeight" },
    { name: "CapTop", expr: "StemTop + CapDepth" },
    { name: "WallTop", expr: "CapTop + BallastWallHeight" },
    { name: "PedestalX", expr: "CapFrontProjection - BearingOffset" },
    { name: "HeelX", expr: "-(StemBaseWidth + FootingHeel)" },
    { name: "BearingToBallastWall", expr: "PedestalX - PedestalWidth / 2 - (-StemTopWidth + BallastWallThickness)", label: "Clear seat behind the bearing", unit: "mm", report: true, group: "Cap" },
  ],
  primitives: [
    { id: "pcc", kind: "loop", role: "pcc_levelling", layer: "outline", label: "PCC", when: "PccThickness", points: rect("HeelX - PccProjection", "-PccThickness", "FootingToe + PccProjection", 0) },
    { id: "footing", kind: "loop", role: "open_footing", layer: "outline", label: "Footing", points: rect("HeelX", 0, "FootingToe", "FootingDepth") },
    { id: "stem", kind: "loop", role: "abutment", layer: "outline", label: "Abutment stem", points: [[0, "FootingDepth"], [0, "StemTop"], ["-StemTopWidth", "StemTop"], ["-StemBaseWidth", "FootingDepth"]] },
    { id: "cap", kind: "loop", role: "abutment_cap", layer: "outline", label: "Abutment cap", points: rect("-StemTopWidth", "StemTop", "CapFrontProjection", "CapTop") },
    { id: "ballast_wall", kind: "loop", role: "ballast_wall", layer: "outline", label: "Ballast wall", when: "BallastWallHeight", points: rect("-StemTopWidth", "CapTop", "-StemTopWidth + BallastWallThickness", "WallTop") },
    { id: "pedestal", kind: "loop", role: "bed_block", layer: "outline", label: "Pedestal", when: "PedestalHeight", points: rect("PedestalX - PedestalWidth / 2", "CapTop", "PedestalX + PedestalWidth / 2", "CapTop + PedestalHeight") },
    {
      id: "backfill",
      kind: "loop",
      role: "earth_fill",
      layer: "ground",
      label: "Backfill",
      when: "BackfillLength",
      draw: false,
      points: [["-StemTopWidth", "WallTop"], ["-StemTopWidth", "StemTop"], ["-StemBaseWidth", "FootingDepth"], ["HeelX", "FootingDepth"], ["HeelX - BackfillLength", "FootingDepth"], ["HeelX - BackfillLength", "WallTop"]],
    },
    { id: "wing", kind: "path", role: "wing_wall", layer: "outline", label: "Wing wall", when: "WingTopLength + WingSlope", points: [["-StemTopWidth", "WallTop"], ["-StemTopWidth - WingTopLength", "WallTop"], ["-StemTopWidth - WingTopLength - WingSlope * (WallTop - FootingDepth)", "FootingDepth"]] },
    { id: "axis", kind: "path", role: "abutment_axis", layer: "centre", label: "Bearing axis", points: [["PedestalX", "CapTop - DIM * 0.3"], ["PedestalX", "WallTop + DIM"]] },
  ],
  hatches: [
    { id: "f", boundary: "footing", material: "rcc" },
    { id: "s", boundary: "stem", material: "rcc" },
    { id: "c", boundary: "cap", material: "rcc" },
    { id: "b", boundary: "ballast_wall", material: "rcc", when: "BallastWallHeight" },
    { id: "p", boundary: "pedestal", material: "rcc", when: "PedestalHeight" },
    { id: "l", boundary: "pcc", material: "pcc", when: "PccThickness" },
    { id: "fill", boundary: "backfill", material: "backfill", when: "BackfillLength" },
  ],
  anchors: [
    { id: "bearing", at: ["PedestalX", "CapTop + PedestalHeight"] },
    { id: "front_face_base", at: [0, "FootingDepth"] },
    { id: "footing_bottom", at: [0, 0] },
    { id: "founding", at: [0, "-PccThickness"] },
    { id: "cap_top_front", at: ["CapFrontProjection", "CapTop"] },
    { id: "wall_top_back", at: ["-StemTopWidth", "WallTop"] },
  ],
  dimensions: [
    { id: "footing_w", kind: "horizontal", from: ["HeelX", 0], to: ["FootingToe", 0], offset: "-PccThickness - DIM" },
    { id: "toe", kind: "horizontal", from: [0, "FootingDepth"], to: ["FootingToe", "FootingDepth"], offset: "-FootingDepth - PccThickness - 2 * DIM", drives: "FootingToe" },
    { id: "stem_top", kind: "horizontal", from: ["-StemTopWidth", "WallTop"], to: [0, "WallTop"], offset: "DIM", drives: "StemTopWidth" },
    { id: "footing_d", kind: "vertical", from: ["FootingToe", 0], to: ["FootingToe", "FootingDepth"], offset: "DIM", drives: "FootingDepth" },
    { id: "stem_h", kind: "vertical", from: ["FootingToe", "FootingDepth"], to: ["FootingToe", "StemTop"], offset: "DIM" },
    { id: "cap_d", kind: "vertical", from: ["FootingToe", "StemTop"], to: ["FootingToe", "CapTop"], offset: "DIM", drives: "CapDepth" },
  ],
  invariants: [
    { id: "stem_h", expr: "StemHeight", op: ">", than: 0, message: "The abutment stem has no height — the cap would sit on or below the footing. Check the levels.", severity: "error" },
    { id: "sizes", expr: "min(StemTopWidth, CapDepth, FootingDepth)", op: ">", than: 0, message: "Abutment sizes must be positive.", severity: "error" },
    { id: "ballast_wall_fits", expr: "StemTopWidth", op: ">", than: "BallastWallThickness", message: "The ballast wall is thicker than the stem top it stands on.", severity: "error" },
    { id: "bearing_clear_of_wall", expr: "BearingToBallastWall", op: ">=", than: 0, message: "The bearing pedestal runs into the ballast wall — move the bearing forward or thin the wall.", severity: "error" },
    { id: "bearing_edge_150", expr: "BearingOffset - PedestalWidth / 2", op: ">=", than: 150, message: "Less than 150 mm of cap in front of the bearing (RDSO GAD checklist, item 16).", severity: "warning", source: "ircm-t403" },
    { id: "ballast_nonneg", expr: "BallastWallHeight", op: ">=", than: 0, message: "The cap is above formation level — the ballast wall height went negative.", severity: "error" },
  ],
  facts: [{ key: "foundation_open", expr: 1 }],
};

// ---------------------------------------------------------------------------
// Superstructure span — elevation between bearings
// ---------------------------------------------------------------------------

export const SPAN_ELEVATION: ComponentDefinition = {
  id: "ir.span.elevation",
  name: "Superstructure span — elevation",
  category: "component",
  semanticType: "span",
  view: "elevation",
  version: "1.0.0",
  description: "A simply supported slab or girder span in elevation, on two bearings. Origin at the left bearing centre, bearing seat level.",
  tags: ["deck", "girder", "slab", "superstructure"],
  parameters: [
    { name: "EffectiveSpan", label: "Effective span (c/c bearings)", kind: "length", unit: "mm", default: 12200, min: 1000, max: 80000, step: 100, group: "Span", sourceRequired: true },
    { name: "EndOverhang", label: "Deck beyond bearing centre", kind: "length", unit: "mm", default: 300, min: 100, max: 1500, step: 25, group: "Span" },
    { name: "Depth", label: "Superstructure depth", kind: "length", unit: "mm", default: 1100, min: 200, max: 6000, step: 25, group: "Span", sourceRequired: true },
    { name: "BearingHeight", label: "Bearing height", kind: "length", unit: "mm", default: 100, min: 0, max: 600, step: 10, group: "Bearings" },
    { name: "BearingLength", label: "Bearing length", kind: "length", unit: "mm", default: 300, min: 100, max: 1000, step: 25, group: "Bearings" },
  ],
  formulas: [
    { name: "GirderLength", expr: "EffectiveSpan + 2 * EndOverhang", label: "Overall length", unit: "mm", report: true, group: "Span" },
    { name: "Soffit", expr: "BearingHeight" },
  ],
  primitives: [
    { id: "deck", kind: "loop", role: "deck", layer: "outline", label: "Superstructure", points: rect("-EndOverhang", "Soffit", "EffectiveSpan + EndOverhang", "Soffit + Depth") },
    { id: "bearing", kind: "loop", role: "bearing", layer: "outline", label: "Bearing", when: "BearingHeight", repeat: { count: 2, index: "k" }, points: rect("k * EffectiveSpan - BearingLength / 2", 0, "k * EffectiveSpan + BearingLength / 2", "BearingHeight") },
  ],
  anchors: [
    { id: "left_bearing", at: [0, 0] },
    { id: "right_bearing", at: ["EffectiveSpan", 0] },
    { id: "soffit_mid", at: ["EffectiveSpan / 2", "Soffit"] },
    { id: "top_mid", at: ["EffectiveSpan / 2", "Soffit + Depth"] },
  ],
  dimensions: [{ id: "span", kind: "horizontal", from: [0, 0], to: ["EffectiveSpan", 0], offset: "-DIM * 0.8", drives: "EffectiveSpan" }],
  texts: [{ id: "label", at: ["EffectiveSpan / 2", "Soffit + Depth / 2 + TXT / 2"], text: "SPAN {EffectiveSpan:m} m c/c BRG", align: "center", height: 2.5 }],
  invariants: [
    { id: "span", expr: "EffectiveSpan", op: ">", than: 0, message: "Effective span must be positive.", severity: "error" },
    { id: "depth", expr: "Depth", op: ">", than: 0, message: "Superstructure depth must be positive.", severity: "error" },
  ],
  facts: [{ key: "effective_span_mm", expr: "EffectiveSpan" }],
};

// ---------------------------------------------------------------------------
// Ballasted deck slab — cross-section with track
// ---------------------------------------------------------------------------

export const DECK_SLAB_SECTION: ComponentDefinition = {
  id: "ir.deck_slab.section",
  name: "Ballasted deck slab — section",
  category: "component",
  semanticType: "deck_section",
  view: "section",
  version: "1.0.0",
  description: "RCC/PSC slab deck cross-section with ballast retainers, ballast, sleeper and rails. Origin at the soffit centre.",
  tags: ["deck", "slab", "track", "ballast"],
  parameters: [
    { name: "DeckWidth", label: "Deck width", kind: "length", unit: "mm", default: 5200, min: 3000, max: 16000, step: 50, group: "Deck", sourceRequired: true },
    { name: "SlabThickness", label: "Slab thickness", kind: "length", unit: "mm", default: 700, min: 200, max: 2000, step: 25, group: "Deck", sourceRequired: true },
    { name: "KerbWidth", label: "Ballast retainer width", kind: "length", unit: "mm", default: 300, min: 150, max: 800, step: 25, group: "Deck" },
    { name: "KerbHeight", label: "Ballast retainer height", kind: "length", unit: "mm", default: 650, min: 200, max: 1500, step: 25, group: "Deck" },
    { name: "BallastCushion", label: "Ballast cushion below sleeper", kind: "length", unit: "mm", default: 350, min: 150, max: 800, step: 25, group: "Track", sourceRequired: true },
    { name: "SleeperDepth", label: "Sleeper depth", kind: "length", unit: "mm", default: 210, min: 150, max: 300, step: 5, group: "Track" },
    { name: "SleeperLength", label: "Sleeper length", kind: "length", unit: "mm", default: 2750, min: 1500, max: 3200, step: 25, group: "Track" },
    { name: "Gauge", label: "Track gauge", kind: "length", unit: "mm", default: 1676, min: 1000, max: 1700, step: 1, group: "Track", options: [{ value: 1676, label: "Broad gauge 1676" }, { value: 1435, label: "Standard gauge 1435" }, { value: 1000, label: "Metre gauge 1000" }] },
    { name: "RailHeight", label: "Rail height", kind: "length", unit: "mm", default: 172, min: 100, max: 200, step: 1, group: "Track" },
    { name: "TrackOffset", label: "Track centre from deck centre", kind: "length", unit: "mm", default: 0, min: -3000, max: 3000, step: 25, group: "Track" },
  ],
  formulas: [
    { name: "DeckTop", expr: "SlabThickness" },
    { name: "SleeperBottom", expr: "DeckTop + BallastCushion" },
    { name: "SleeperTop", expr: "SleeperBottom + SleeperDepth" },
    { name: "RailTop", expr: "SleeperTop + RailHeight" },
    { name: "TrackDepth", expr: "RailTop - DeckTop", label: "Rail top above deck", unit: "mm", report: true, group: "Track" },
    { name: "ClearBetweenKerbs", expr: "DeckWidth - 2 * KerbWidth", label: "Clear width between retainers", unit: "mm", report: true, group: "Deck" },
  ],
  primitives: [
    { id: "slab", kind: "loop", role: "deck", layer: "outline", label: "Deck slab", points: rect("-DeckWidth / 2", 0, "DeckWidth / 2", "DeckTop") },
    { id: "kerb", kind: "loop", role: "kerb", layer: "outline", label: "Ballast retainer", repeat: { count: 2, index: "k" }, points: rect("-DeckWidth / 2 + k * (DeckWidth - KerbWidth)", "DeckTop", "-DeckWidth / 2 + k * (DeckWidth - KerbWidth) + KerbWidth", "DeckTop + KerbHeight") },
    {
      id: "ballast",
      kind: "loop",
      role: "ballast",
      layer: "secondary",
      label: "Ballast",
      points: [
        ["-DeckWidth / 2 + KerbWidth", "DeckTop"],
        ["DeckWidth / 2 - KerbWidth", "DeckTop"],
        ["DeckWidth / 2 - KerbWidth", "min(SleeperTop, DeckTop + KerbHeight)"],
        ["TrackOffset + SleeperLength / 2", "min(SleeperTop, DeckTop + KerbHeight)"],
        ["TrackOffset + SleeperLength / 2", "SleeperBottom"],
        ["TrackOffset - SleeperLength / 2", "SleeperBottom"],
        ["TrackOffset - SleeperLength / 2", "min(SleeperTop, DeckTop + KerbHeight)"],
        ["-DeckWidth / 2 + KerbWidth", "min(SleeperTop, DeckTop + KerbHeight)"],
      ],
    },
    { id: "sleeper", kind: "loop", role: "sleeper", layer: "secondary", label: "Sleeper", points: rect("TrackOffset - SleeperLength / 2", "SleeperBottom", "TrackOffset + SleeperLength / 2", "SleeperTop") },
    { id: "rail", kind: "loop", role: "rail", layer: "outline", label: "Rail", repeat: { count: 2, index: "r" }, points: rect("TrackOffset + (r - 0.5) * Gauge - 36", "SleeperTop", "TrackOffset + (r - 0.5) * Gauge + 36", "RailTop") },
    { id: "track_cl", kind: "path", role: "track_centreline", layer: "centre", label: "Track centre line", points: [["TrackOffset", "-DIM * 0.5"], ["TrackOffset", "RailTop + DIM"]] },
  ],
  hatches: [
    { id: "s", boundary: "slab", material: "rcc" },
    { id: "k", boundary: "kerb", material: "rcc" },
    { id: "b", boundary: "ballast", material: "ballast" },
  ],
  anchors: [
    { id: "soffit_centre", at: [0, 0] },
    { id: "deck_top_centre", at: [0, "DeckTop"] },
    { id: "rail_top", at: ["TrackOffset", "RailTop"] },
  ],
  levels: [
    { id: "rl", at: ["TrackOffset + Gauge / 2 + 36", "RailTop"], label: "RAIL LEVEL", side: "right" },
    { id: "soffit", at: ["DeckWidth / 2", 0], label: "SOFFIT", side: "right" },
  ],
  dimensions: [
    { id: "width", kind: "horizontal", from: ["-DeckWidth / 2", 0], to: ["DeckWidth / 2", 0], offset: "-DIM", drives: "DeckWidth" },
    { id: "gauge", kind: "horizontal", from: ["TrackOffset - Gauge / 2", "RailTop"], to: ["TrackOffset + Gauge / 2", "RailTop"], offset: "DIM", drives: "Gauge" },
    { id: "slab_t", kind: "vertical", from: ["-DeckWidth / 2", 0], to: ["-DeckWidth / 2", "DeckTop"], offset: "-DIM", drives: "SlabThickness" },
    { id: "cushion", kind: "vertical", from: ["TrackOffset - SleeperLength / 2", "DeckTop"], to: ["TrackOffset - SleeperLength / 2", "SleeperBottom"], offset: "-DIM * 0.6", drives: "BallastCushion" },
    { id: "kerb_h", kind: "vertical", from: ["DeckWidth / 2", "DeckTop"], to: ["DeckWidth / 2", "DeckTop + KerbHeight"], offset: "DIM", drives: "KerbHeight" },
  ],
  invariants: [
    { id: "sleeper_fits", expr: "ClearBetweenKerbs", op: ">=", than: "SleeperLength + 2 * abs(TrackOffset)", message: "The sleeper does not fit between the ballast retainers.", severity: "error" },
    { id: "gauge_on_sleeper", expr: "SleeperLength", op: ">", than: "Gauge + 144", message: "The rails fall off the sleeper — sleeper shorter than the gauge.", severity: "error" },
    { id: "positive", expr: "min(SlabThickness, KerbWidth, KerbHeight)", op: ">", than: 0, message: "Deck sizes must be positive.", severity: "error" },
  ],
  facts: [
    { key: "ballast_cushion_mm", expr: "BallastCushion" },
    { key: "deck_width_mm", expr: "DeckWidth" },
  ],
};

// ---------------------------------------------------------------------------
// PSC / RCC girder deck — cross-section, N girders
// ---------------------------------------------------------------------------

const gc = "i * GirderSpacing";

export const GIRDER_DECK_SECTION: ComponentDefinition = {
  id: "ir.girder_deck.section",
  name: "Girder deck — section",
  category: "component",
  semanticType: "girder_deck",
  view: "section",
  version: "1.0.0",
  description: "Beam-and-slab deck cross-section: N I-girders at a pitch under a deck slab. Girder count is topology.",
  tags: ["deck", "psc", "girder", "t-beam"],
  parameters: [
    { name: "GirderCount", label: "Number of girders", kind: "count", unit: "-", default: 4, min: 1, max: 12, group: "Girders" },
    { name: "GirderSpacing", label: "Girder spacing", kind: "length", unit: "mm", default: 2000, min: 900, max: 4000, step: 50, group: "Girders", sourceRequired: true },
    { name: "GirderDepth", label: "Girder depth", kind: "length", unit: "mm", default: 1500, min: 400, max: 4000, step: 25, group: "Girders", sourceRequired: true },
    { name: "TopFlangeWidth", label: "Top flange width", kind: "length", unit: "mm", default: 800, min: 200, max: 2500, step: 25, group: "Girders" },
    { name: "TopFlangeThickness", label: "Top flange thickness", kind: "length", unit: "mm", default: 180, min: 80, max: 500, step: 10, group: "Girders" },
    { name: "BottomFlangeWidth", label: "Bottom flange width", kind: "length", unit: "mm", default: 600, min: 200, max: 1500, step: 25, group: "Girders" },
    { name: "BottomFlangeThickness", label: "Bottom flange thickness", kind: "length", unit: "mm", default: 250, min: 80, max: 600, step: 10, group: "Girders" },
    { name: "WebThickness", label: "Web thickness", kind: "length", unit: "mm", default: 250, min: 120, max: 600, step: 10, group: "Girders" },
    { name: "DeckThickness", label: "Deck slab thickness", kind: "length", unit: "mm", default: 220, min: 150, max: 500, step: 10, group: "Deck", sourceRequired: true },
    { name: "DeckOverhang", label: "Slab beyond outer girder centre", kind: "length", unit: "mm", default: 900, min: 0, max: 2500, step: 25, group: "Deck" },
  ],
  formulas: [
    { name: "DeckWidth", expr: "(GirderCount - 1) * GirderSpacing + 2 * DeckOverhang", label: "Deck width", unit: "mm", report: true, group: "Deck" },
    { name: "TotalDepth", expr: "GirderDepth + DeckThickness", label: "Superstructure depth", unit: "mm", report: true, group: "Deck" },
    { name: "FlangeGap", expr: "GirderSpacing - TopFlangeWidth", label: "Gap between top flanges", unit: "mm", report: true, group: "Girders" },
  ],
  primitives: [
    { id: "slab", kind: "loop", role: "deck", layer: "outline", label: "Deck slab", points: rect("-DeckOverhang", "GirderDepth", "(GirderCount - 1) * GirderSpacing + DeckOverhang", "GirderDepth + DeckThickness") },
    {
      id: "girder",
      kind: "loop",
      role: "PSC_girder",
      layer: "outline",
      label: "Girder",
      repeat: { count: "GirderCount", index: "i" },
      points: [
        [`${gc} - BottomFlangeWidth / 2`, 0],
        [`${gc} + BottomFlangeWidth / 2`, 0],
        [`${gc} + BottomFlangeWidth / 2`, "BottomFlangeThickness"],
        [`${gc} + WebThickness / 2`, "BottomFlangeThickness"],
        [`${gc} + WebThickness / 2`, "GirderDepth - TopFlangeThickness"],
        [`${gc} + TopFlangeWidth / 2`, "GirderDepth - TopFlangeThickness"],
        [`${gc} + TopFlangeWidth / 2`, "GirderDepth"],
        [`${gc} - TopFlangeWidth / 2`, "GirderDepth"],
        [`${gc} - TopFlangeWidth / 2`, "GirderDepth - TopFlangeThickness"],
        [`${gc} - WebThickness / 2`, "GirderDepth - TopFlangeThickness"],
        [`${gc} - WebThickness / 2`, "BottomFlangeThickness"],
        [`${gc} - BottomFlangeWidth / 2`, "BottomFlangeThickness"],
      ],
    },
    { id: "cl", kind: "path", role: "bridge_centreline", layer: "centre", label: "Deck centre line", points: [["(GirderCount - 1) * GirderSpacing / 2", "-DIM * 0.6"], ["(GirderCount - 1) * GirderSpacing / 2", "GirderDepth + DeckThickness + DIM * 0.6"]] },
  ],
  hatches: [
    { id: "s", boundary: "slab", material: "rcc" },
    { id: "g", boundary: "girder", material: "rcc" },
  ],
  anchors: [
    { id: "soffit_centre", at: ["(GirderCount - 1) * GirderSpacing / 2", 0] },
    { id: "deck_top_centre", at: ["(GirderCount - 1) * GirderSpacing / 2", "GirderDepth + DeckThickness"] },
  ],
  dimensions: [
    { id: "pitch", kind: "horizontal", repeat: { count: "GirderCount - 1", index: "i" }, from: [gc, 0], to: [`${gc} + GirderSpacing`, 0], offset: "-DIM", drives: "GirderSpacing" },
    { id: "width", kind: "horizontal", from: ["-DeckOverhang", "GirderDepth + DeckThickness"], to: ["(GirderCount - 1) * GirderSpacing + DeckOverhang", "GirderDepth + DeckThickness"], offset: "DIM" },
    { id: "depth", kind: "vertical", from: ["-DeckOverhang", 0], to: ["-DeckOverhang", "GirderDepth"], offset: "-DIM", drives: "GirderDepth" },
    { id: "slab_t", kind: "vertical", from: ["-DeckOverhang", "GirderDepth"], to: ["-DeckOverhang", "GirderDepth + DeckThickness"], offset: "-DIM", drives: "DeckThickness" },
  ],
  invariants: [
    { id: "flanges", expr: "if(GirderCount - 1, FlangeGap, 1)", op: ">", than: 0, message: "Top flanges of adjacent girders overlap — increase spacing or narrow the flange.", severity: "error" },
    { id: "web_in_flanges", expr: "min(TopFlangeWidth, BottomFlangeWidth) - WebThickness", op: ">", than: 0, message: "The web is wider than a flange.", severity: "error" },
    { id: "depth", expr: "GirderDepth - TopFlangeThickness - BottomFlangeThickness", op: ">", than: 0, message: "The flanges take up the whole girder depth.", severity: "error" },
  ],
  facts: [{ key: "girder_count", expr: "GirderCount" }],
};

// ---------------------------------------------------------------------------
// Pile group — plan
// ---------------------------------------------------------------------------

export const PILE_GROUP_PLAN: ComponentDefinition = {
  id: "ir.pile_group.plan",
  name: "Pile group — plan",
  category: "component",
  semanticType: "pile_group",
  view: "plan",
  version: "1.0.0",
  description: "Rectangular pile group under a pile cap, in plan. Rows × columns is topology; piles are generated with stable ids row by row.",
  tags: ["pile", "foundation", "plan", "setting out"],
  sources: ["irbm-409"],
  parameters: [
    { name: "Rows", label: "Rows (across)", kind: "count", unit: "-", default: 2, min: 1, max: 8, group: "Layout" },
    { name: "Columns", label: "Columns (along)", kind: "count", unit: "-", default: 3, min: 1, max: 10, group: "Layout" },
    { name: "PileDiameter", label: "Pile diameter", kind: "length", unit: "mm", default: 1000, min: 450, max: 2500, step: 50, group: "Piles", sourceRequired: true },
    { name: "SpacingX", label: "Spacing along", kind: "length", unit: "mm", default: 3000, min: 900, max: 10000, step: 50, group: "Layout", sourceRequired: true },
    { name: "SpacingY", label: "Spacing across", kind: "length", unit: "mm", default: 3000, min: 900, max: 10000, step: 50, group: "Layout", sourceRequired: true },
    { name: "EdgeDistance", label: "Pile centre to cap edge", kind: "length", unit: "mm", default: 1000, min: 300, max: 3000, step: 25, group: "Cap" },
    {
      name: "PileType",
      label: "Load transfer",
      kind: "choice",
      unit: "-",
      default: 1,
      group: "Piles",
      options: [
        { value: 1, label: "End bearing" },
        { value: 2, label: "Friction" },
        { value: 3, label: "Driven, loose sand/fill" },
      ],
    },
  ],
  formulas: [
    { name: "CapLength", expr: "(Columns - 1) * SpacingX + 2 * EdgeDistance", label: "Cap length", unit: "mm", report: true, group: "Cap" },
    { name: "CapWidth", expr: "(Rows - 1) * SpacingY + 2 * EdgeDistance", label: "Cap width", unit: "mm", report: true, group: "Cap" },
    { name: "PileCount", expr: "Rows * Columns", label: "Number of piles", unit: "-", report: true, group: "Layout" },
    { name: "MinSpacing", expr: "min(if(Columns - 1, SpacingX, 1000000000), if(Rows - 1, SpacingY, 1000000000))" },
    { name: "MaxSpacing", expr: "max(if(Columns - 1, SpacingX, 0), if(Rows - 1, SpacingY, 0))" },
  ],
  primitives: [
    { id: "cap", kind: "loop", role: "pile_cap", layer: "outline", label: "Pile cap", points: rect(0, 0, "CapLength", "CapWidth") },
    { id: "pile", kind: "circle", role: "pile", layer: "hidden", label: "Pile", repeat: { count: "Rows * Columns", index: "n" }, center: ["EdgeDistance + (n % Columns) * SpacingX", "EdgeDistance + floor(n / Columns) * SpacingY"], r: "PileDiameter / 2" },
    { id: "axis_x", kind: "path", role: "pier_axis", layer: "centre", label: "Longitudinal axis", points: [["-DIM * 0.6", "CapWidth / 2"], ["CapLength + DIM * 0.6", "CapWidth / 2"]] },
    { id: "axis_y", kind: "path", role: "pier_axis", layer: "centre", label: "Transverse axis", points: [["CapLength / 2", "-DIM * 0.6"], ["CapLength / 2", "CapWidth + DIM * 0.6"]] },
  ],
  anchors: [
    { id: "centre", at: ["CapLength / 2", "CapWidth / 2"] },
    { id: "pile", repeat: { count: "Rows * Columns", index: "n" }, at: ["EdgeDistance + (n % Columns) * SpacingX", "EdgeDistance + floor(n / Columns) * SpacingY"] },
  ],
  dimensions: [
    { id: "edge_l", kind: "horizontal", from: [0, "CapWidth"], to: ["EdgeDistance", "CapWidth"], offset: "DIM", drives: "EdgeDistance" },
    { id: "sx", kind: "horizontal", repeat: { count: "Columns - 1", index: "c" }, from: ["EdgeDistance + c * SpacingX", "CapWidth"], to: ["EdgeDistance + (c + 1) * SpacingX", "CapWidth"], offset: "DIM", drives: "SpacingX" },
    { id: "edge_r", kind: "horizontal", from: ["CapLength - EdgeDistance", "CapWidth"], to: ["CapLength", "CapWidth"], offset: "DIM" },
    { id: "length", kind: "horizontal", from: [0, "CapWidth"], to: ["CapLength", "CapWidth"], offset: "2 * DIM" },
    { id: "sy", kind: "vertical", repeat: { count: "Rows - 1", index: "r" }, from: [0, "EdgeDistance + r * SpacingY"], to: [0, "EdgeDistance + (r + 1) * SpacingY"], offset: "-DIM", drives: "SpacingY" },
    { id: "width", kind: "vertical", from: [0, 0], to: [0, "CapWidth"], offset: "-2 * DIM" },
    { id: "dia", kind: "diameter", from: ["EdgeDistance", "EdgeDistance"], to: ["EdgeDistance + PileDiameter / 2 * 0.7071", "EdgeDistance - PileDiameter / 2 * 0.7071"], offset: 0, drives: "PileDiameter" },
  ],
  texts: [{ id: "title", at: ["CapLength / 2", "-DIM * 1.4"], text: "{Rows} × {Columns} PILES Ø{PileDiameter} — PLAN", align: "center", height: 3 }],
  invariants: [
    { id: "no_overlap", expr: "MinSpacing", op: ">", than: "PileDiameter", message: "Piles overlap — spacing is not more than the diameter.", severity: "error" },
    { id: "inside_cap", expr: "EdgeDistance", op: ">", than: "PileDiameter / 2", message: "The outer piles stick out of the pile cap.", severity: "error" },
  ],
  facts: [
    { key: "pile_diameter_mm", expr: "PileDiameter" },
    { key: "pile_min_spacing_mm", expr: "if(PileCount - 1, MinSpacing, 0)" },
    { key: "pile_max_spacing_mm", expr: "MaxSpacing" },
    { key: "pile_type", expr: "PileType" },
    { key: "foundation_pile", expr: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Well foundation — vertical section through the centre
// ---------------------------------------------------------------------------

export const WELL_FOUNDATION_SECTION: ComponentDefinition = {
  id: "ir.well_foundation.section",
  name: "Well foundation — section",
  category: "component",
  semanticType: "well_foundation",
  view: "section",
  version: "1.0.0",
  description:
    "Circular well in vertical section: cutting edge and curb, steining, bottom plug, sand hearting, top plug and well cap. Origin at the cutting edge, well centre.",
  tags: ["well", "foundation", "caisson"],
  sources: ["irbm-316"],
  parameters: [
    { name: "OuterDiameter", label: "Outer diameter", kind: "length", unit: "mm", default: 6000, min: 2000, max: 15000, step: 100, group: "Well", sourceRequired: true },
    { name: "SteiningThickness", label: "Steining thickness", kind: "length", unit: "mm", default: 1200, min: 450, max: 3000, step: 25, group: "Well", sourceRequired: true },
    { name: "WellDepth", label: "Cutting edge to top of steining", kind: "length", unit: "mm", default: 15000, min: 3000, max: 60000, step: 100, group: "Well", sourceRequired: true },
    { name: "CurbHeight", label: "Curb height", kind: "length", unit: "mm", default: 1500, min: 500, max: 3000, step: 50, group: "Curb" },
    { name: "CuttingEdgeWidth", label: "Cutting edge width", kind: "length", unit: "mm", default: 150, min: 50, max: 400, step: 10, group: "Curb" },
    { name: "BottomPlugDepth", label: "Bottom plug depth", kind: "length", unit: "mm", default: 3000, min: 1000, max: 10000, step: 100, group: "Plugs" },
    { name: "TopPlugDepth", label: "Top plug depth", kind: "length", unit: "mm", default: 1000, min: 300, max: 3000, step: 50, group: "Plugs" },
    { name: "SandHearting", label: "Sand hearting", kind: "choice", unit: "-", default: 1, group: "Plugs", options: [{ value: 1, label: "Filled with sand" }, { value: 0, label: "Left empty" }] },
    { name: "CapDepth", label: "Well cap depth", kind: "length", unit: "mm", default: 1500, min: 500, max: 4000, step: 50, group: "Cap" },
    { name: "CapOverhang", label: "Cap overhang beyond steining", kind: "length", unit: "mm", default: 300, min: 0, max: 2000, step: 50, group: "Cap" },
  ],
  formulas: [
    { name: "R", expr: "OuterDiameter / 2" },
    { name: "Ri", expr: "R - SteiningThickness" },
    { name: "InnerDiameter", expr: "2 * Ri", label: "Dredge hole diameter", unit: "mm", report: true, group: "Well" },
    { name: "PlugTop", expr: "WellDepth - TopPlugDepth" },
  ],
  primitives: [
    { id: "curb", kind: "loop", role: "well_curb", layer: "outline", label: "Curb", repeat: { count: 2, index: "s" }, points: [["(2 * s - 1) * R", 0], ["(2 * s - 1) * (R - CuttingEdgeWidth)", 0], ["(2 * s - 1) * Ri", "CurbHeight"], ["(2 * s - 1) * R", "CurbHeight"]] },
    { id: "steining", kind: "loop", role: "well_steining", layer: "outline", label: "Steining", repeat: { count: 2, index: "s" }, points: rect("(2 * s - 1) * R", "CurbHeight", "(2 * s - 1) * Ri", "WellDepth") },
    {
      id: "bottom_plug",
      kind: "loop",
      role: "bottom_plug",
      layer: "outline",
      label: "Bottom plug",
      points: [["-(R - CuttingEdgeWidth)", 0], ["R - CuttingEdgeWidth", 0], ["Ri", "CurbHeight"], ["Ri", "BottomPlugDepth"], ["-Ri", "BottomPlugDepth"], ["-Ri", "CurbHeight"]],
    },
    { id: "hearting", kind: "loop", role: "sand_hearts", layer: "outline", label: "Sand hearting", when: "SandHearting", points: rect("-Ri", "BottomPlugDepth", "Ri", "PlugTop") },
    { id: "top_plug", kind: "loop", role: "top_plug", layer: "outline", label: "Top plug", points: rect("-Ri", "PlugTop", "Ri", "WellDepth") },
    { id: "cap", kind: "loop", role: "well_cap", layer: "outline", label: "Well cap", points: rect("-R - CapOverhang", "WellDepth", "R + CapOverhang", "WellDepth + CapDepth") },
    { id: "axis", kind: "path", role: "well_axis", layer: "centre", label: "Well axis", points: [[0, "-DIM * 0.6"], [0, "WellDepth + CapDepth + DIM * 0.6"]] },
  ],
  hatches: [
    { id: "c", boundary: "curb", material: "rcc" },
    { id: "s", boundary: "steining", material: "concrete" },
    { id: "b", boundary: "bottom_plug", material: "pcc" },
    { id: "h", boundary: "hearting", material: "sand", when: "SandHearting" },
    { id: "t", boundary: "top_plug", material: "concrete" },
    { id: "k", boundary: "cap", material: "rcc" },
  ],
  anchors: [
    { id: "cutting_edge", at: [0, 0] },
    { id: "cap_top", at: [0, "WellDepth + CapDepth"] },
  ],
  levels: [
    { id: "ce", at: ["-R", 0], label: "CUTTING EDGE", side: "left" },
    { id: "cap", at: ["R + CapOverhang", "WellDepth + CapDepth"], label: "WELL CAP TOP", side: "right" },
  ],
  dimensions: [
    { id: "od", kind: "horizontal", from: ["-R", 0], to: ["R", 0], offset: "-DIM", drives: "OuterDiameter" },
    { id: "st", kind: "horizontal", from: ["-R", "WellDepth"], to: ["-Ri", "WellDepth"], offset: "CapDepth + DIM", drives: "SteiningThickness" },
    { id: "depth", kind: "vertical", from: ["R + CapOverhang", 0], to: ["R + CapOverhang", "WellDepth"], offset: "2 * DIM", drives: "WellDepth" },
    { id: "curb_h", kind: "vertical", from: ["R + CapOverhang", 0], to: ["R + CapOverhang", "CurbHeight"], offset: "DIM", drives: "CurbHeight" },
    { id: "plug", kind: "vertical", from: ["-R", 0], to: ["-R", "BottomPlugDepth"], offset: "-DIM", drives: "BottomPlugDepth" },
  ],
  invariants: [
    { id: "dredge_hole", expr: "Ri", op: ">", than: 0, message: "The steining is thicker than the well radius — no dredge hole left.", severity: "error" },
    { id: "curb_edge", expr: "SteiningThickness", op: ">", than: "CuttingEdgeWidth", message: "The cutting edge is wider than the steining.", severity: "error" },
    { id: "plug_over_curb", expr: "BottomPlugDepth", op: ">=", than: "CurbHeight", message: "The bottom plug must at least fill the curb.", severity: "error" },
    { id: "plugs_fit", expr: "PlugTop", op: ">", than: "BottomPlugDepth", message: "Top and bottom plugs overlap — the well is too shallow for them.", severity: "error" },
  ],
  facts: [
    { key: "well_outer_diameter_mm", expr: "OuterDiameter" },
    { key: "foundation_well", expr: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Cantilever retaining / wing wall — section
// ---------------------------------------------------------------------------

export const RETAINING_WALL_SECTION: ComponentDefinition = {
  id: "ir.retaining_wall.section",
  name: "Retaining / wing wall — section",
  category: "component",
  semanticType: "wing_wall",
  view: "section",
  version: "1.0.0",
  description: "Cantilever wall section for wing and return walls: base with toe and heel, stem with battered back face, backfill and weep hole.",
  tags: ["wing wall", "return wall", "retaining"],
  parameters: [
    { name: "StemHeight", label: "Stem height", kind: "length", unit: "mm", default: 4000, min: 500, max: 12000, step: 50, group: "Stem" },
    { name: "StemTopWidth", label: "Stem width at top", kind: "length", unit: "mm", default: 300, min: 200, max: 1500, step: 25, group: "Stem", sourceRequired: true },
    { name: "StemBaseWidth", label: "Stem width at base", kind: "length", unit: "mm", default: 500, min: 200, max: 3000, step: 25, group: "Stem", sourceRequired: true },
    { name: "Toe", label: "Toe length", kind: "length", unit: "mm", default: 800, min: 0, max: 4000, step: 50, group: "Base", sourceRequired: true },
    { name: "Heel", label: "Heel length", kind: "length", unit: "mm", default: 1800, min: 0, max: 6000, step: 50, group: "Base", sourceRequired: true },
    { name: "BaseThickness", label: "Base thickness", kind: "length", unit: "mm", default: 500, min: 200, max: 2000, step: 25, group: "Base", sourceRequired: true },
    { name: "WeepHoleDiameter", label: "Weep hole diameter", kind: "length", unit: "mm", default: 100, min: 0, max: 200, step: 10, group: "Drainage" },
  ],
  formulas: [
    { name: "BaseWidth", expr: "Toe + StemBaseWidth + Heel", label: "Base width", unit: "mm", report: true, group: "Base" },
    { name: "WallTop", expr: "BaseThickness + StemHeight" },
  ],
  primitives: [
    { id: "base", kind: "loop", role: "open_footing", layer: "outline", label: "Base", points: rect(0, 0, "BaseWidth", "BaseThickness") },
    { id: "stem", kind: "loop", role: "wing_wall", layer: "outline", label: "Stem", points: [["Toe", "BaseThickness"], ["Toe + StemBaseWidth", "BaseThickness"], ["Toe + StemTopWidth", "WallTop"], ["Toe", "WallTop"]] },
    { id: "fill", kind: "loop", role: "earth_fill", layer: "ground", label: "Backfill", draw: false, points: [["Toe + StemTopWidth", "WallTop"], ["Toe + StemBaseWidth", "BaseThickness"], ["BaseWidth", "BaseThickness"], ["BaseWidth", "WallTop"]] },
    { id: "weep", kind: "circle", role: "weep_hole", layer: "outline", label: "Weep hole", when: "WeepHoleDiameter", center: ["Toe + StemBaseWidth / 2", "BaseThickness + 300"], r: "WeepHoleDiameter / 2" },
  ],
  hatches: [
    { id: "b", boundary: "base", material: "rcc" },
    { id: "s", boundary: "stem", material: "rcc" },
    { id: "f", boundary: "fill", material: "backfill" },
  ],
  anchors: [
    { id: "toe_bottom", at: [0, 0] },
    { id: "stem_front_top", at: ["Toe", "WallTop"] },
  ],
  dimensions: [
    { id: "toe", kind: "horizontal", from: [0, 0], to: ["Toe", 0], offset: "-DIM", drives: "Toe" },
    { id: "stem_b", kind: "horizontal", from: ["Toe", 0], to: ["Toe + StemBaseWidth", 0], offset: "-DIM", drives: "StemBaseWidth" },
    { id: "heel", kind: "horizontal", from: ["Toe + StemBaseWidth", 0], to: ["BaseWidth", 0], offset: "-DIM", drives: "Heel" },
    { id: "stem_t", kind: "horizontal", from: ["Toe", "WallTop"], to: ["Toe + StemTopWidth", "WallTop"], offset: "DIM", drives: "StemTopWidth" },
    { id: "h", kind: "vertical", from: [0, "BaseThickness"], to: [0, "WallTop"], offset: "-DIM", drives: "StemHeight" },
    { id: "bt", kind: "vertical", from: [0, 0], to: [0, "BaseThickness"], offset: "-DIM", drives: "BaseThickness" },
  ],
  invariants: [
    { id: "stem", expr: "StemBaseWidth", op: ">=", than: "StemTopWidth", message: "The stem is wider at the top than at the base.", severity: "warning" },
    { id: "positive", expr: "min(StemHeight, StemTopWidth, BaseThickness)", op: ">", than: 0, message: "Wall sizes must be positive.", severity: "error" },
  ],
};

export const STRUCTURE_COMPONENTS: ComponentDefinition[] = [
  BOX_CULVERT_SECTION,
  PIPE_CULVERT_SECTION,
  PIER_ELEVATION,
  ABUTMENT_ELEVATION,
  SPAN_ELEVATION,
  DECK_SLAB_SECTION,
  GIRDER_DECK_SECTION,
  PILE_GROUP_PLAN,
  WELL_FOUNDATION_SECTION,
  RETAINING_WALL_SECTION,
];
