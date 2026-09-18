/**
 * Assemblies — whole drawings composed from components.
 *
 * An assembly is a component whose children are other components (§23.1). The
 * railway-bridge GAD below is the case the user asked for: one set of values
 * drives the longitudinal elevation, the plan and the cross-section together,
 * so the three views cannot disagree (railway guide acceptance test 3), and
 * every level marker sits at its true reduced level because the elevation's
 * local Y IS elevation in millimetres.
 *
 * Still data. The engine that composes these knows nothing about bridges.
 */

import type { ComponentDefinition } from "../types";
import { rect } from "./structures";

// ---------------------------------------------------------------------------
// Level set — water, ground, formation and rail lines with markers
// ---------------------------------------------------------------------------

const onOff = [
  { value: 1, label: "Shown" },
  { value: 0, label: "Hidden" },
];

export const LEVEL_SET: ComponentDefinition = {
  id: "ir.level_set",
  name: "Level set — HFL, bed, formation, rail",
  category: "component",
  semanticType: "level_set",
  view: "elevation",
  version: "1.0.0",
  description:
    "Horizontal level lines with reduced-level markers across a width. Local Y is elevation: place it with absolute elevation so the markers read true RLs.",
  tags: ["levels", "HFL", "hydraulic"],
  sources: ["ircm-402", "irbm-703"],
  parameters: [
    { name: "HFL", label: "High flood level", kind: "level", unit: "m", default: 103, group: "Levels", sourceRequired: true },
    { name: "LWL", label: "Low water level", kind: "level", unit: "m", default: 100.8, group: "Levels" },
    { name: "BedLevel", label: "Bed level", kind: "level", unit: "m", default: 100, group: "Levels", sourceRequired: true },
    { name: "FormationLevel", label: "Formation level", kind: "level", unit: "m", default: 105.6, group: "Levels", sourceRequired: true },
    { name: "RailLevel", label: "Rail level", kind: "level", unit: "m", default: 106.5, group: "Levels", sourceRequired: true },
    { name: "DangerLevel", label: "Danger level", kind: "level", unit: "m", default: 102.5, group: "Levels" },
    { name: "ShowHFL", kind: "choice", unit: "-", default: 1, options: onOff, group: "Show" },
    { name: "ShowLWL", kind: "choice", unit: "-", default: 1, options: onOff, group: "Show" },
    { name: "ShowBed", kind: "choice", unit: "-", default: 1, options: onOff, group: "Show" },
    { name: "ShowFormation", kind: "choice", unit: "-", default: 1, options: onOff, group: "Show" },
    { name: "ShowRail", kind: "choice", unit: "-", default: 1, options: onOff, group: "Show" },
    { name: "ShowDanger", kind: "choice", unit: "-", default: 0, options: onOff, group: "Show" },
    { name: "StartX", label: "Lines start at", kind: "length", unit: "mm", default: -5000, group: "Extent" },
    { name: "Extent", label: "Line length", kind: "length", unit: "mm", default: 50000, min: 1000, group: "Extent" },
  ],
  formulas: [{ name: "EndX", expr: "StartX + Extent" }],
  primitives: [
    { id: "hfl", kind: "path", role: "HFL", layer: "water", label: "HFL", when: "ShowHFL", points: [["StartX", "HFL * 1000"], ["EndX", "HFL * 1000"]] },
    { id: "lwl", kind: "path", role: "LWL", layer: "water", label: "LWL", when: "ShowLWL", points: [["StartX", "LWL * 1000"], ["EndX", "LWL * 1000"]] },
    { id: "danger", kind: "path", role: "danger_level", layer: "water", label: "Danger level", when: "ShowDanger", points: [["StartX", "DangerLevel * 1000"], ["EndX", "DangerLevel * 1000"]] },
    { id: "bed", kind: "path", role: "bed_level", layer: "ground", label: "Bed", when: "ShowBed", points: [["StartX", "BedLevel * 1000"], ["EndX", "BedLevel * 1000"]] },
    { id: "formation", kind: "path", role: "formation_level", layer: "level", label: "Formation", when: "ShowFormation", points: [["StartX", "FormationLevel * 1000"], ["StartX + Extent * 0.12", "FormationLevel * 1000"]] },
    { id: "formation_r", kind: "path", role: "formation_level", layer: "level", label: "Formation (far side)", when: "ShowFormation", points: [["EndX - Extent * 0.12", "FormationLevel * 1000"], ["EndX", "FormationLevel * 1000"]] },
    { id: "rail", kind: "path", role: "rail_level", layer: "level", label: "Rail level", when: "ShowRail", points: [["StartX", "RailLevel * 1000"], ["EndX", "RailLevel * 1000"]] },
  ],
  levels: [
    { id: "hfl", at: ["StartX + TXT * 2", "HFL * 1000"], label: "H.F.L.", when: "ShowHFL" },
    { id: "lwl", at: ["StartX + TXT * 2", "LWL * 1000"], label: "L.W.L.", when: "ShowLWL" },
    { id: "danger", at: ["EndX - TXT * 2", "DangerLevel * 1000"], label: "D.L.", side: "left", when: "ShowDanger" },
    { id: "bed", at: ["EndX - TXT * 2", "BedLevel * 1000"], label: "BED LEVEL", side: "left", when: "ShowBed" },
    { id: "formation", at: ["StartX + TXT * 2", "FormationLevel * 1000"], label: "FORMATION", when: "ShowFormation" },
    { id: "rail", at: ["EndX - TXT * 2", "RailLevel * 1000"], label: "RAIL LEVEL", side: "left", when: "ShowRail" },
  ],
  invariants: [
    { id: "rail_above_formation", expr: "RailLevel", op: ">", than: "FormationLevel", message: "Rail level must be above formation level.", severity: "error" },
    { id: "hfl_above_bed", expr: "HFL", op: ">=", than: "BedLevel", message: "HFL is below bed level — check the hydraulic data.", severity: "warning" },
  ],
  facts: [
    { key: "hfl_m", expr: "HFL" },
    { key: "bed_level_m", expr: "BedLevel" },
    { key: "formation_level_m", expr: "FormationLevel" },
    { key: "rail_level_m", expr: "RailLevel" },
  ],
};

// ---------------------------------------------------------------------------
// Box culvert GAD — cross-section at true levels, with embankment cushion
// ---------------------------------------------------------------------------

const BOX_FORWARD = [
  "CellCount",
  "ClearSpan",
  "ClearHeight",
  "SideWallThickness",
  "InteriorWallThickness",
  "TopSlabThickness",
  "BaseSlabThickness",
  "HaunchSize",
  "PccThickness",
  "PccProjection",
];

export const BOX_CULVERT_GAD: ComponentDefinition = {
  id: "ir.box_culvert.gad",
  name: "Box culvert GAD — section at levels",
  category: "assembly",
  semanticType: "box_culvert",
  view: "section",
  version: "1.0.0",
  description:
    "RCC box culvert cross-section placed at its true invert level under the railway embankment, with HFL, bed, formation and rail levels. Earth cushion and free board follow from the levels.",
  tags: ["culvert", "box", "GAD", "levels"],
  sources: ["ircm-402", "irbm-313", "irbm-311-3"],
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
    { name: "InvertLevel", label: "Invert level", kind: "level", unit: "m", default: 100, group: "Levels", sourceRequired: true },
    { name: "BedLevel", label: "Bed level", kind: "level", unit: "m", default: 100, group: "Levels", sourceRequired: true },
    { name: "HFL", label: "High flood level", kind: "level", unit: "m", default: 102.2, group: "Levels", sourceRequired: true },
    { name: "FormationLevel", label: "Formation level", kind: "level", unit: "m", default: 105.5, group: "Levels", sourceRequired: true },
    { name: "RailLevel", label: "Rail level", kind: "level", unit: "m", default: 106.3, group: "Levels", sourceRequired: true },
    { name: "FormationWidth", label: "Formation width", kind: "length", unit: "mm", default: 6850, min: 3000, max: 20000, step: 50, group: "Embankment" },
    { name: "EmbankmentSlope", label: "Side slope (horizontal per vertical)", kind: "ratio", unit: "-", default: 2, min: 1, max: 4, step: 0.25, group: "Embankment" },
  ],
  formulas: [
    { name: "OuterWidth", expr: "CellCount * ClearSpan + 2 * SideWallThickness + (CellCount - 1) * InteriorWallThickness", label: "Overall width", unit: "mm", report: true, group: "Structure" },
    { name: "OuterHeight", expr: "BaseSlabThickness + ClearHeight + TopSlabThickness", label: "Overall height", unit: "mm", report: true, group: "Structure" },
    { name: "BoxBottomY", expr: "InvertLevel * 1000 - BaseSlabThickness" },
    { name: "BoxTopY", expr: "BoxBottomY + OuterHeight" },
    { name: "TopOfBoxLevel", expr: "BoxTopY / 1000", label: "Top of box", unit: "m", report: true, group: "Levels" },
    { name: "FormY", expr: "FormationLevel * 1000" },
    { name: "BedY", expr: "BedLevel * 1000" },
    { name: "CushionDepth", expr: "FormY - BoxTopY", label: "Earth cushion over box", unit: "mm", report: true, group: "Embankment" },
    { name: "FreeBoard", expr: "(FormationLevel - HFL) * 1000", label: "Free board (formation − HFL)", unit: "mm", report: true, group: "Levels" },
    { name: "EmbBaseHalf", expr: "FormationWidth / 2 + EmbankmentSlope * (FormY - BedY)" },
    { name: "Cx", expr: "OuterWidth / 2" },
  ],
  children: [
    {
      id: "box",
      component: "ir.box_culvert.section",
      values: Object.fromEntries(BOX_FORWARD.map((n) => [n, n])),
      place: { at: [0, "BoxBottomY"] },
    },
    {
      id: "levels",
      component: "ir.level_set",
      values: {
        HFL: "HFL",
        BedLevel: "BedLevel",
        FormationLevel: "FormationLevel",
        RailLevel: "RailLevel",
        LWL: "BedLevel",
        ShowLWL: 0,
        ShowDanger: 0,
        StartX: "Cx - EmbBaseHalf - 3000",
        Extent: "2 * EmbBaseHalf + 6000",
      },
      place: { at: [0, 0] },
    },
  ],
  primitives: [
    {
      id: "embankment",
      kind: "loop",
      role: "earth_fill",
      layer: "ground",
      label: "Embankment",
      when: "CushionDepth",
      points: [
        ["Cx - EmbBaseHalf", "BedY"],
        ["-PccProjection", "BedY"],
        ["-PccProjection", "BoxTopY"],
        ["OuterWidth + PccProjection", "BoxTopY"],
        ["OuterWidth + PccProjection", "BedY"],
        ["Cx + EmbBaseHalf", "BedY"],
        ["Cx + FormationWidth / 2", "FormY"],
        ["Cx - FormationWidth / 2", "FormY"],
      ],
    },
  ],
  hatches: [{ id: "earth", boundary: "embankment", material: "earth", when: "CushionDepth" }],
  dimensions: [
    { id: "cushion", kind: "vertical", from: ["OuterWidth * 0.25", "BoxTopY"], to: ["OuterWidth * 0.25", "FormY"], offset: 0, when: "CushionDepth" },
    { id: "formation_w", kind: "horizontal", from: ["Cx - FormationWidth / 2", "FormY"], to: ["Cx + FormationWidth / 2", "FormY"], offset: "DIM * 2.5", drives: "FormationWidth" },
  ],
  texts: [{ id: "title", at: ["Cx", "BoxBottomY - PccThickness - 3.4 * DIM"], text: "CROSS SECTION OF BOX CULVERT", height: 4, align: "center" }],
  invariants: [
    { id: "rail_above_formation", expr: "RailLevel", op: ">", than: "FormationLevel", message: "Rail level must be above formation level.", severity: "error" },
    { id: "cushion", expr: "CushionDepth", op: ">=", than: 0, message: "Formation is below the top of the box — the track would bear on the slab. Check levels.", severity: "warning" },
    { id: "invert_vs_bed", expr: "abs(InvertLevel - BedLevel)", op: "<=", than: 0.5, message: "Invert level is more than 0.5 m from bed level — confirm against the longitudinal section.", severity: "warning" },
  ],
  facts: [
    { key: "freeboard_mm", expr: "FreeBoard" },
    { key: "cushion_mm", expr: "CushionDepth" },
  ],
};

// ---------------------------------------------------------------------------
// Bridge plan
// ---------------------------------------------------------------------------

const px = "i * SpanPitch + EffectiveSpan + BearingSeparation / 2";
/** −1 for the wings of A1 (they run away from the span, towards −x), +1 for A2. */
const wingSx = "(2 * gt(q, 1.5) - 1)";
const wingSy = "(1 - 2 * (q % 2))";
const wingXb = "if(gt(q, 1.5), TotalLength - BearingOffset + AbutCapWidth, BearingOffset - AbutCapWidth)";

export const BRIDGE_PLAN: ComponentDefinition = {
  id: "ir.bridge.plan",
  name: "Bridge — plan",
  category: "component",
  semanticType: "bridge_plan",
  view: "plan",
  version: "1.0.0",
  description: "Plan of a multi-span bridge: deck spans, pier and abutment outlines (hidden below deck), splayed wing walls, track centre line and pier axes.",
  tags: ["bridge", "plan", "GAD"],
  sources: ["irbm-401"],
  parameters: [
    { name: "SpanCount", kind: "count", unit: "-", default: 3, min: 1, max: 30, group: "Arrangement" },
    { name: "EffectiveSpan", kind: "length", unit: "mm", default: 12200, min: 1000, group: "Arrangement" },
    { name: "BearingSeparation", kind: "length", unit: "mm", default: 1000, min: 0, group: "Arrangement" },
    { name: "EndOverhang", kind: "length", unit: "mm", default: 300, min: 0, group: "Arrangement" },
    { name: "DeckWidth", kind: "length", unit: "mm", default: 5200, min: 1000, group: "Deck" },
    { name: "PierThickness", label: "Pier shaft thickness (along)", kind: "length", unit: "mm", default: 1500, min: 300, group: "Pier" },
    { name: "PierLength", label: "Pier shaft length (across)", kind: "length", unit: "mm", default: 5000, min: 500, group: "Pier" },
    { name: "PierFootingWidth", kind: "length", unit: "mm", default: 4500, min: 500, group: "Pier" },
    { name: "PierFootingLength", kind: "length", unit: "mm", default: 7000, min: 500, group: "Pier" },
    { name: "BearingOffset", label: "Bearing to cap front edge", kind: "length", unit: "mm", default: 500, min: 0, group: "Abutment" },
    { name: "AbutCapWidth", label: "Abutment cap width (along)", kind: "length", unit: "mm", default: 1350, min: 300, group: "Abutment" },
    { name: "AbutFootingFront", label: "Footing toe beyond cap front", kind: "length", unit: "mm", default: 850, group: "Abutment" },
    { name: "AbutFootingWidth", label: "Abutment footing width (along)", kind: "length", unit: "mm", default: 5000, min: 500, group: "Abutment" },
    { name: "AbutLength", label: "Abutment length (across)", kind: "length", unit: "mm", default: 6000, min: 1000, group: "Abutment" },
    { name: "WingLength", kind: "length", unit: "mm", default: 4000, min: 0, group: "Wing walls" },
    { name: "WingSplay", label: "Wing splay from bridge axis", kind: "angle", unit: "deg", default: 45, min: 0, max: 90, group: "Wing walls" },
    { name: "WingThickness", kind: "length", unit: "mm", default: 500, min: 150, group: "Wing walls" },
  ],
  formulas: [
    { name: "SpanPitch", expr: "EffectiveSpan + BearingSeparation" },
    { name: "TotalLength", expr: "SpanCount * EffectiveSpan + (SpanCount - 1) * BearingSeparation" },
    { name: "HalfWidth", expr: "max(PierFootingLength, AbutLength + 2 * WingLength * sin(WingSplay), DeckWidth) / 2" },
    { name: "LeftEnd", expr: "BearingOffset - AbutCapWidth - WingLength * cos(WingSplay) - WingThickness" },
  ],
  primitives: [
    { id: "deck", kind: "loop", role: "deck", layer: "outline", label: "Deck", repeat: { count: "SpanCount", index: "k" }, points: rect("k * SpanPitch - EndOverhang", "-DeckWidth / 2", "k * SpanPitch + EffectiveSpan + EndOverhang", "DeckWidth / 2") },
    { id: "pier", kind: "loop", role: "pier", layer: "hidden", label: "Pier", repeat: { count: "SpanCount - 1", index: "i" }, points: rect(`${px} - PierThickness / 2`, "-PierLength / 2", `${px} + PierThickness / 2`, "PierLength / 2") },
    { id: "pier_footing", kind: "loop", role: "open_footing", layer: "hidden", label: "Pier footing", repeat: { count: "SpanCount - 1", index: "i" }, points: rect(`${px} - PierFootingWidth / 2`, "-PierFootingLength / 2", `${px} + PierFootingWidth / 2`, "PierFootingLength / 2") },
    { id: "abut_l", kind: "loop", role: "abutment", layer: "outline", label: "Abutment A1", points: rect("BearingOffset - AbutCapWidth", "-AbutLength / 2", "BearingOffset", "AbutLength / 2") },
    { id: "abut_r", kind: "loop", role: "abutment", layer: "outline", label: "Abutment A2", points: rect("TotalLength - BearingOffset", "-AbutLength / 2", "TotalLength - BearingOffset + AbutCapWidth", "AbutLength / 2") },
    { id: "abut_footing_l", kind: "loop", role: "open_footing", layer: "hidden", label: "A1 footing", points: rect("BearingOffset + AbutFootingFront - AbutFootingWidth", "-AbutLength / 2", "BearingOffset + AbutFootingFront", "AbutLength / 2") },
    { id: "abut_footing_r", kind: "loop", role: "open_footing", layer: "hidden", label: "A2 footing", points: rect("TotalLength - BearingOffset - AbutFootingFront", "-AbutLength / 2", "TotalLength - BearingOffset - AbutFootingFront + AbutFootingWidth", "AbutLength / 2") },
    {
      id: "wing",
      kind: "loop",
      role: "wing_wall",
      layer: "outline",
      label: "Wing wall",
      when: "WingLength",
      repeat: { count: 4, index: "q" },
      points: [
        [wingXb, `${wingSy} * AbutLength / 2`],
        [`${wingXb} + ${wingSx} * WingLength * cos(WingSplay)`, `${wingSy} * (AbutLength / 2 + WingLength * sin(WingSplay))`],
        [`${wingXb} + ${wingSx} * WingLength * cos(WingSplay) + ${wingSx} * WingThickness * sin(WingSplay)`, `${wingSy} * (AbutLength / 2 + WingLength * sin(WingSplay)) - ${wingSy} * WingThickness * cos(WingSplay)`],
        [`${wingXb} + ${wingSx} * WingThickness * sin(WingSplay)`, `${wingSy} * AbutLength / 2 - ${wingSy} * WingThickness * cos(WingSplay)`],
      ],
    },
    { id: "track", kind: "path", role: "track_centreline", layer: "centre", label: "Track centre line", points: [["LeftEnd - DIM", 0], ["TotalLength - LeftEnd + DIM", 0]] },
    { id: "pier_axis", kind: "path", role: "pier_axis", layer: "centre", label: "Pier axis", repeat: { count: "SpanCount - 1", index: "i" }, points: [[px, "-HalfWidth - DIM * 0.4"], [px, "HalfWidth + DIM * 0.4"]] },
    { id: "brg_axis", kind: "path", role: "abutment_axis", layer: "centre", label: "Abutment bearing axis", repeat: { count: 2, index: "s" }, points: [["s * TotalLength", "-HalfWidth - DIM * 0.4"], ["s * TotalLength", "HalfWidth + DIM * 0.4"]] },
  ],
  dimensions: [
    { id: "span", kind: "horizontal", repeat: { count: "SpanCount", index: "k" }, from: ["k * SpanPitch", "-HalfWidth"], to: ["k * SpanPitch + EffectiveSpan", "-HalfWidth"], offset: "-DIM", drives: "EffectiveSpan" },
    { id: "sep", kind: "horizontal", repeat: { count: "SpanCount - 1", index: "i" }, from: ["i * SpanPitch + EffectiveSpan", "-HalfWidth"], to: ["(i + 1) * SpanPitch", "-HalfWidth"], offset: "-DIM", drives: "BearingSeparation" },
    { id: "total", kind: "horizontal", from: [0, "-HalfWidth"], to: ["TotalLength", "-HalfWidth"], offset: "-2 * DIM" },
    { id: "deck_w", kind: "vertical", from: ["EffectiveSpan / 2", "-DeckWidth / 2"], to: ["EffectiveSpan / 2", "DeckWidth / 2"], offset: 0, drives: "DeckWidth" },
  ],
  anchors: [
    { id: "a1_bearing", at: [0, 0] },
    { id: "a2_bearing", at: ["TotalLength", 0] },
    { id: "pier", repeat: { count: "SpanCount - 1", index: "i" }, at: [px, 0] },
  ],
  texts: [{ id: "title", at: ["TotalLength / 2", "-HalfWidth - 3.2 * DIM"], text: "PLAN", height: 4, align: "center" }],
};

// ---------------------------------------------------------------------------
// Railway bridge GAD — elevation + plan + cross-section from one set of values
// ---------------------------------------------------------------------------

const SLAB = "1 - IsGirder";

export const BRIDGE_GAD: ComponentDefinition = {
  id: "ir.bridge.gad",
  name: "Railway bridge GAD — elevation, plan, section",
  category: "assembly",
  semanticType: "bridge",
  view: "elevation",
  version: "1.0.0",
  description:
    "Multi-span railway bridge general arrangement: longitudinal elevation at true reduced levels (abutments, piers, spans, bearings, HFL/bed/formation/rail lines), plan, and deck cross-section. Pier and abutment heights, ballast wall height, vertical clearance and free board all follow from the levels.",
  tags: ["bridge", "GAD", "railway", "slab", "girder", "pier", "abutment"],
  sources: ["ircm-402", "ircm-t403", "irbm-312", "irbm-313", "irbm-1103-3", "irbm-401"],
  parameters: [
    { name: "SpanCount", label: "Number of spans", kind: "count", unit: "-", default: 3, min: 1, max: 20, group: "Arrangement" },
    { name: "EffectiveSpan", label: "Effective span (c/c bearings)", kind: "length", unit: "mm", default: 12200, min: 3000, max: 60000, step: 100, group: "Arrangement", sourceRequired: true },
    { name: "BearingSeparation", label: "Bearing c/c over a pier", kind: "length", unit: "mm", default: 1000, min: 300, max: 4000, step: 25, group: "Arrangement" },
    { name: "EndOverhang", label: "Deck beyond bearing centre", kind: "length", unit: "mm", default: 300, min: 100, max: 1500, step: 25, group: "Arrangement" },

    { name: "RailLevel", label: "Rail level", kind: "level", unit: "m", default: 106.5, group: "Levels", sourceRequired: true },
    { name: "FormationLevel", label: "Formation level", kind: "level", unit: "m", default: 105.6, group: "Levels", sourceRequired: true },
    { name: "HFL", label: "High flood level", kind: "level", unit: "m", default: 102.6, group: "Levels", sourceRequired: true },
    { name: "LWL", label: "Low water level", kind: "level", unit: "m", default: 100.8, group: "Levels" },
    { name: "BedLevel", label: "Bed level", kind: "level", unit: "m", default: 100, group: "Levels", sourceRequired: true },
    { name: "FoundationLevel", label: "Foundation level (bottom of footing)", kind: "level", unit: "m", default: 97, group: "Levels", sourceRequired: true },

    { name: "DeckType", label: "Superstructure", kind: "choice", unit: "-", default: 1, group: "Deck", options: [{ value: 1, label: "Ballasted RCC/PSC slab" }, { value: 2, label: "PSC/RCC girders with deck slab" }] },
    { name: "DeckWidth", label: "Deck width", kind: "length", unit: "mm", default: 5200, min: 3000, max: 16000, step: 50, group: "Deck", sourceRequired: true },
    { name: "SlabThickness", label: "Slab thickness (slab deck)", kind: "length", unit: "mm", default: 850, min: 300, max: 2000, step: 25, group: "Deck", sourceRequired: true },
    { name: "GirderCount", label: "Girders (girder deck)", kind: "count", unit: "-", default: 3, min: 2, max: 10, group: "Deck" },
    { name: "GirderSpacing", label: "Girder spacing", kind: "length", unit: "mm", default: 1800, min: 900, max: 4000, step: 50, group: "Deck" },
    { name: "GirderDepth", label: "Girder depth", kind: "length", unit: "mm", default: 1300, min: 400, max: 4000, step: 25, group: "Deck" },
    { name: "DeckThickness", label: "Deck slab on girders", kind: "length", unit: "mm", default: 220, min: 150, max: 500, step: 10, group: "Deck" },
    { name: "KerbWidth", label: "Ballast retainer width", kind: "length", unit: "mm", default: 300, min: 150, max: 800, step: 25, group: "Deck" },
    { name: "KerbHeight", label: "Ballast retainer height", kind: "length", unit: "mm", default: 650, min: 200, max: 1500, step: 25, group: "Deck" },

    { name: "BallastCushion", label: "Ballast cushion below sleeper", kind: "length", unit: "mm", default: 350, min: 150, max: 800, step: 25, group: "Track", sourceRequired: true },
    { name: "SleeperDepth", label: "Sleeper depth", kind: "length", unit: "mm", default: 210, min: 150, max: 300, step: 5, group: "Track" },
    { name: "SleeperLength", label: "Sleeper length", kind: "length", unit: "mm", default: 2750, min: 1500, max: 3200, step: 25, group: "Track" },
    { name: "Gauge", label: "Track gauge", kind: "length", unit: "mm", default: 1676, min: 1000, max: 1700, step: 1, group: "Track" },
    { name: "RailHeight", label: "Rail height", kind: "length", unit: "mm", default: 172, min: 100, max: 200, step: 1, group: "Track" },

    { name: "BearingHeight", label: "Bearing height", kind: "length", unit: "mm", default: 100, min: 0, max: 600, step: 10, group: "Bearings" },
    { name: "PedestalHeight", label: "Pedestal height", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Bearings" },
    { name: "PedestalWidth", label: "Pedestal width", kind: "length", unit: "mm", default: 600, min: 200, max: 1500, step: 25, group: "Bearings" },

    { name: "PierShaftWidth", label: "Pier thickness (along)", kind: "length", unit: "mm", default: 1500, min: 600, max: 6000, step: 50, group: "Pier", sourceRequired: true },
    { name: "PierLength", label: "Pier length (across)", kind: "length", unit: "mm", default: 5000, min: 1000, max: 20000, step: 50, group: "Pier" },
    { name: "PierBatter", label: "Pier batter", kind: "ratio", unit: "-", default: 0, min: 0, max: 0.1, step: 0.005, group: "Pier" },
    { name: "PierCapWidth", label: "Pier cap width (along)", kind: "length", unit: "mm", default: 2800, min: 1000, max: 8000, step: 50, group: "Pier" },
    { name: "PierCapDepth", label: "Pier cap depth", kind: "length", unit: "mm", default: 900, min: 300, max: 3000, step: 25, group: "Pier" },
    { name: "PierFootingWidth", label: "Pier footing width (along)", kind: "length", unit: "mm", default: 4500, min: 1000, max: 20000, step: 50, group: "Pier", sourceRequired: true },
    { name: "PierFootingLength", label: "Pier footing length (across)", kind: "length", unit: "mm", default: 7000, min: 1000, max: 25000, step: 50, group: "Pier", sourceRequired: true },
    { name: "PierFootingDepth", label: "Pier footing depth", kind: "length", unit: "mm", default: 1500, min: 300, max: 5000, step: 50, group: "Pier", sourceRequired: true },

    { name: "AbutStemTopWidth", label: "Abutment stem top width", kind: "length", unit: "mm", default: 1200, min: 500, max: 5000, step: 50, group: "Abutment", sourceRequired: true },
    { name: "AbutBatter", label: "Abutment back batter", kind: "ratio", unit: "-", default: 0.1, min: 0, max: 0.4, step: 0.01, group: "Abutment" },
    { name: "AbutCapDepth", label: "Abutment cap depth", kind: "length", unit: "mm", default: 600, min: 300, max: 2000, step: 25, group: "Abutment" },
    { name: "CapFrontProjection", label: "Cap projection beyond stem", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Abutment" },
    { name: "BearingOffset", label: "Bearing centre from cap front", kind: "length", unit: "mm", default: 500, min: 200, max: 2000, step: 25, group: "Abutment" },
    { name: "BallastWallThickness", label: "Ballast wall thickness", kind: "length", unit: "mm", default: 400, min: 200, max: 1000, step: 25, group: "Abutment" },
    { name: "AbutToe", label: "Abutment footing toe", kind: "length", unit: "mm", default: 1000, min: 0, max: 5000, step: 50, group: "Abutment", sourceRequired: true },
    { name: "AbutHeel", label: "Abutment footing heel", kind: "length", unit: "mm", default: 2500, min: 0, max: 8000, step: 50, group: "Abutment", sourceRequired: true },
    { name: "AbutFootingDepth", label: "Abutment footing depth", kind: "length", unit: "mm", default: 1500, min: 300, max: 5000, step: 50, group: "Abutment", sourceRequired: true },
    { name: "AbutLength", label: "Abutment length (across)", kind: "length", unit: "mm", default: 6000, min: 1000, max: 25000, step: 50, group: "Abutment" },
    { name: "AbutBackfill", label: "Backfill shown behind abutment", kind: "length", unit: "mm", default: 3000, min: 0, max: 20000, step: 100, group: "Abutment" },
    { name: "WingTopLength", label: "Wing wall level top (elevation)", kind: "length", unit: "mm", default: 1500, min: 0, max: 10000, step: 100, group: "Wing walls" },
    { name: "WingSlope", label: "Wing wall top slope (H per V)", kind: "ratio", unit: "-", default: 1.5, min: 0, max: 3, step: 0.25, group: "Wing walls" },
    { name: "WingLength", label: "Wing wall length (plan)", kind: "length", unit: "mm", default: 4000, min: 0, max: 20000, step: 100, group: "Wing walls" },
    { name: "WingSplay", label: "Wing splay from bridge axis", kind: "angle", unit: "deg", default: 45, min: 0, max: 90, step: 5, group: "Wing walls" },
    { name: "WingThickness", label: "Wing wall thickness (plan)", kind: "length", unit: "mm", default: 500, min: 150, max: 2000, step: 25, group: "Wing walls" },

    { name: "PccThickness", label: "PCC levelling course", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 25, group: "Foundation" },
    { name: "PccProjection", label: "PCC projection", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Foundation" },
    { name: "ViewGap", label: "Space between views", kind: "length", unit: "mm", default: 8000, min: 1000, max: 50000, step: 500, group: "Layout" },
  ],
  formulas: [
    { name: "SpanPitch", expr: "EffectiveSpan + BearingSeparation" },
    { name: "TotalLength", expr: "SpanCount * EffectiveSpan + (SpanCount - 1) * BearingSeparation", label: "Length, end bearing to end bearing", unit: "mm", report: true, group: "Arrangement" },
    { name: "IsGirder", expr: "gt(DeckType, 1.5)" },
    { name: "TrackDepth", expr: "BallastCushion + SleeperDepth + RailHeight", label: "Rail top above deck", unit: "mm", report: true, group: "Track" },
    { name: "SuperDepth", expr: "if(IsGirder, GirderDepth + DeckThickness, SlabThickness)", label: "Superstructure depth", unit: "mm", report: true, group: "Deck" },
    { name: "GirderOverhang", expr: "(DeckWidth - (GirderCount - 1) * GirderSpacing) / 2" },
    { name: "RailY", expr: "RailLevel * 1000" },
    { name: "DeckTopY", expr: "RailY - TrackDepth" },
    { name: "SoffitY", expr: "DeckTopY - SuperDepth" },
    { name: "SoffitLevel", expr: "SoffitY / 1000", label: "Soffit level", unit: "m", report: true, group: "Levels" },
    { name: "SeatY", expr: "SoffitY - BearingHeight" },
    { name: "CapTopY", expr: "SeatY - PedestalHeight" },
    { name: "BedBlockLevel", expr: "CapTopY / 1000", label: "Top of pier/abutment cap", unit: "m", report: true, group: "Levels" },
    { name: "FoundY", expr: "FoundationLevel * 1000" },
    { name: "PierShaftHeight", expr: "CapTopY - PierCapDepth - FoundY - PierFootingDepth", label: "Pier shaft height", unit: "mm", report: true, group: "Pier" },
    { name: "AbutStemHeight", expr: "CapTopY - AbutCapDepth - FoundY - AbutFootingDepth", label: "Abutment stem height", unit: "mm", report: true, group: "Abutment" },
    { name: "BallastWallHeight", expr: "FormationLevel * 1000 - CapTopY", label: "Ballast wall height", unit: "mm", report: true, group: "Abutment" },
    { name: "AbutFaceX", expr: "BearingOffset - CapFrontProjection" },
    { name: "AbutStemBase", expr: "AbutStemTopWidth + AbutBatter * AbutStemHeight" },
    { name: "ElevExtent", expr: "max(AbutStemBase + AbutHeel + AbutBackfill, AbutStemTopWidth + WingTopLength + WingSlope * (AbutStemHeight + AbutCapDepth + BallastWallHeight))" },
    { name: "ClearWaterway", expr: "TotalLength - 2 * AbutFaceX - (SpanCount - 1) * PierShaftWidth", label: "Linear waterway (clear)", unit: "mm", report: true, group: "Hydraulics" },
    { name: "EndClearOpening", expr: "if(gt(SpanCount, 1), EffectiveSpan + BearingSeparation / 2 - PierShaftWidth / 2 - AbutFaceX, TotalLength - 2 * AbutFaceX)" },
    { name: "MaxClearOpening", expr: "max(EndClearOpening, if(gt(SpanCount, 2), SpanPitch - PierShaftWidth, 0))", label: "Largest clear opening", unit: "mm", report: true, group: "Hydraulics" },
    { name: "VerticalClearance", expr: "SoffitY - HFL * 1000", label: "Vertical clearance (soffit − HFL)", unit: "mm", report: true, group: "Hydraulics" },
    { name: "FreeBoard", expr: "(FormationLevel - HFL) * 1000", label: "Free board (formation − HFL)", unit: "mm", report: true, group: "Hydraulics" },
    { name: "Headroom", expr: "SoffitY - BedLevel * 1000", label: "Headroom above bed", unit: "mm", report: true, group: "Hydraulics" },
    { name: "ElevationBottom", expr: "FoundY - PccThickness" },
    { name: "PlanHalf", expr: "max(PierFootingLength, AbutLength + 2 * WingLength * sin(WingSplay), DeckWidth) / 2" },
    { name: "PlanY", expr: "ElevationBottom - ViewGap - PlanHalf - 2 * DIM" },
    { name: "SectionX", expr: "TotalLength - AbutFaceX + ElevExtent + ViewGap + DeckWidth / 2 + 2 * DIM" },
  ],
  children: [
    {
      id: "a1",
      component: "ir.abutment.elevation",
      values: {
        StemHeight: "AbutStemHeight",
        StemTopWidth: "AbutStemTopWidth",
        StemBatter: "AbutBatter",
        CapDepth: "AbutCapDepth",
        CapFrontProjection: "CapFrontProjection",
        BearingOffset: "BearingOffset",
        PedestalWidth: "PedestalWidth",
        PedestalHeight: "PedestalHeight",
        BallastWallThickness: "BallastWallThickness",
        BallastWallHeight: "BallastWallHeight",
        FootingToe: "AbutToe",
        FootingHeel: "AbutHeel",
        FootingDepth: "AbutFootingDepth",
        PccThickness: "PccThickness",
        PccProjection: "PccProjection",
        BackfillLength: "AbutBackfill",
        WingTopLength: "WingTopLength",
        WingSlope: "WingSlope",
      },
      place: { at: ["AbutFaceX", "FoundY"] },
    },
    {
      id: "a2",
      component: "ir.abutment.elevation",
      values: {
        StemHeight: "AbutStemHeight",
        StemTopWidth: "AbutStemTopWidth",
        StemBatter: "AbutBatter",
        CapDepth: "AbutCapDepth",
        CapFrontProjection: "CapFrontProjection",
        BearingOffset: "BearingOffset",
        PedestalWidth: "PedestalWidth",
        PedestalHeight: "PedestalHeight",
        BallastWallThickness: "BallastWallThickness",
        BallastWallHeight: "BallastWallHeight",
        FootingToe: "AbutToe",
        FootingHeel: "AbutHeel",
        FootingDepth: "AbutFootingDepth",
        PccThickness: "PccThickness",
        PccProjection: "PccProjection",
        BackfillLength: "AbutBackfill",
        WingTopLength: "WingTopLength",
        WingSlope: "WingSlope",
      },
      place: { at: ["TotalLength - AbutFaceX", "FoundY"], mirror: true },
    },
    {
      id: "pier",
      component: "ir.pier.elevation",
      repeat: { count: "SpanCount - 1", index: "i" },
      values: {
        ShaftWidth: "PierShaftWidth",
        ShaftHeight: "PierShaftHeight",
        Batter: "PierBatter",
        CapWidth: "PierCapWidth",
        CapDepth: "PierCapDepth",
        BearingSpacing: "BearingSeparation",
        PedestalWidth: "PedestalWidth",
        PedestalHeight: "PedestalHeight",
        FootingWidth: "PierFootingWidth",
        FootingDepth: "PierFootingDepth",
        PccThickness: "PccThickness",
        PccProjection: "PccProjection",
      },
      place: { at: ["i * SpanPitch + EffectiveSpan + BearingSeparation / 2", "FoundY"] },
    },
    {
      id: "span",
      component: "ir.span.elevation",
      repeat: { count: "SpanCount", index: "k" },
      values: { EffectiveSpan: "EffectiveSpan", EndOverhang: "EndOverhang", Depth: "SuperDepth", BearingHeight: "BearingHeight" },
      place: { at: ["k * SpanPitch", "SeatY"] },
    },
    {
      id: "levels",
      component: "ir.level_set",
      values: {
        HFL: "HFL",
        LWL: "LWL",
        BedLevel: "BedLevel",
        FormationLevel: "FormationLevel",
        RailLevel: "RailLevel",
        ShowDanger: 0,
        StartX: "AbutFaceX - ElevExtent - 2000",
        Extent: "TotalLength - 2 * AbutFaceX + 2 * ElevExtent + 4000",
      },
      place: { at: [0, 0] },
    },
    {
      id: "plan",
      component: "ir.bridge.plan",
      values: {
        SpanCount: "SpanCount",
        EffectiveSpan: "EffectiveSpan",
        BearingSeparation: "BearingSeparation",
        EndOverhang: "EndOverhang",
        DeckWidth: "DeckWidth",
        PierThickness: "PierShaftWidth",
        PierLength: "PierLength",
        PierFootingWidth: "PierFootingWidth",
        PierFootingLength: "PierFootingLength",
        BearingOffset: "BearingOffset",
        AbutCapWidth: "AbutStemTopWidth + CapFrontProjection",
        AbutFootingFront: "AbutToe - CapFrontProjection",
        AbutFootingWidth: "AbutToe + AbutStemBase + AbutHeel",
        AbutLength: "AbutLength",
        WingLength: "WingLength",
        WingSplay: "WingSplay",
        WingThickness: "WingThickness",
      },
      place: { at: [0, "PlanY"] },
    },
    {
      id: "section",
      component: "ir.deck_slab.section",
      when: SLAB,
      values: {
        DeckWidth: "DeckWidth",
        SlabThickness: "SlabThickness",
        KerbWidth: "KerbWidth",
        KerbHeight: "KerbHeight",
        BallastCushion: "BallastCushion",
        SleeperDepth: "SleeperDepth",
        SleeperLength: "SleeperLength",
        Gauge: "Gauge",
        RailHeight: "RailHeight",
      },
      place: { at: ["SectionX", "SoffitY"] },
    },
    {
      id: "girder_section",
      component: "ir.girder_deck.section",
      when: "IsGirder",
      values: {
        GirderCount: "GirderCount",
        GirderSpacing: "GirderSpacing",
        GirderDepth: "GirderDepth",
        DeckThickness: "DeckThickness",
        DeckOverhang: "GirderOverhang",
      },
      place: { at: ["SectionX - (GirderCount - 1) * GirderSpacing / 2", "SoffitY"] },
    },
  ],
  dimensions: [{ id: "overall", kind: "horizontal", from: [0, "RailY"], to: ["TotalLength", "RailY"], offset: "1.6 * DIM" }],
  texts: [
    { id: "arrangement", at: ["TotalLength / 2", "RailY + 3.2 * DIM"], text: "SPAN ARRANGEMENT {SpanCount} × {EffectiveSpan:m} m (c/c BEARINGS)", height: 3.5, align: "center" },
    { id: "elev_title", at: ["TotalLength / 2", "ElevationBottom - 2.6 * DIM"], text: "LONGITUDINAL ELEVATION", height: 4, align: "center" },
    { id: "sec_title", at: ["SectionX", "SoffitY - 3 * DIM"], text: "CROSS SECTION", height: 4, align: "center" },
  ],
  invariants: [
    { id: "rail_above_formation", expr: "RailLevel", op: ">", than: "FormationLevel", message: "Rail level must be above formation level.", severity: "error" },
    { id: "foundation_below_bed", expr: "FoundationLevel", op: "<", than: "BedLevel", message: "Foundation level is at or above bed level — confirm the founding level against the scour depth.", severity: "warning", source: "irs-substructure" },
    { id: "girders_fit", expr: "if(IsGirder, GirderOverhang, 1)", op: ">", than: 0, message: "The girders are wider apart than the deck.", severity: "error" },
  ],
  facts: [
    { key: "span_count", expr: "SpanCount" },
    { key: "effective_span_mm", expr: "EffectiveSpan" },
    { key: "linear_waterway_mm", expr: "ClearWaterway" },
    { key: "max_clear_opening_mm", expr: "MaxClearOpening" },
    { key: "clear_opening_mm", expr: "MaxClearOpening" },
    { key: "vertical_clearance_mm", expr: "VerticalClearance" },
    { key: "freeboard_mm", expr: "FreeBoard" },
    { key: "headroom_mm", expr: "Headroom" },
    { key: "soffit_level_m", expr: "SoffitLevel" },
    { key: "hfl_m", expr: "HFL" },
    { key: "formation_level_m", expr: "FormationLevel" },
    { key: "rail_level_m", expr: "RailLevel" },
    { key: "bed_level_m", expr: "BedLevel" },
    { key: "foundation_level_m", expr: "FoundationLevel" },
    { key: "waterway_area_m2", expr: "ClearWaterway / 1000 * (HFL - BedLevel)" },
  ],
};

// ---------------------------------------------------------------------------
// The generalisation proof of §23.3 — nothing like a culvert
// ---------------------------------------------------------------------------

export const RAILING_POST: ComponentDefinition = {
  id: "generic.railing_post",
  name: "Railing post",
  category: "component",
  semanticType: "post",
  view: "elevation",
  version: "1.0.0",
  description: "A single post. One driving value, one port at its base.",
  tags: ["railing", "post", "generic"],
  parameters: [
    { name: "PostHeight", kind: "length", unit: "mm", default: 1100, min: 300, max: 3000, group: "Post" },
    { name: "PostWidth", kind: "length", unit: "mm", default: 150, min: 50, max: 500, group: "Post" },
  ],
  primitives: [{ id: "post", kind: "loop", role: "post", layer: "outline", label: "Post", points: rect("-PostWidth / 2", 0, "PostWidth / 2", "PostHeight") }],
  anchors: [
    { id: "base", at: [0, 0] },
    { id: "top", at: [0, "PostHeight"] },
  ],
};

export const RAILING_RUN: ComponentDefinition = {
  id: "generic.railing_run",
  name: "Railing run",
  category: "assembly",
  semanticType: "railing",
  view: "elevation",
  version: "1.0.0",
  description: "Posts repeated along a run: ceil(RunLength / PostSpacing) + 1 posts on a top rail. Changing the length adds posts; nothing is stretched.",
  tags: ["railing", "repeat", "generic"],
  parameters: [
    { name: "RunLength", kind: "length", unit: "mm", default: 6000, min: 500, max: 200000, group: "Run" },
    { name: "PostSpacing", kind: "length", unit: "mm", default: 1500, min: 300, max: 5000, group: "Run" },
    { name: "PostHeight", kind: "length", unit: "mm", default: 1100, min: 300, max: 3000, group: "Run" },
  ],
  formulas: [
    { name: "PostCount", expr: "ceil(RunLength / PostSpacing) + 1", label: "Posts", unit: "-", report: true, group: "Run" },
    { name: "Pitch", expr: "RunLength / (PostCount - 1)", label: "Actual pitch", unit: "mm", report: true, group: "Run" },
  ],
  children: [{ id: "post", component: "generic.railing_post", repeat: { count: "PostCount", index: "i" }, values: { PostHeight: "PostHeight" }, place: { at: ["i * Pitch", 0] } }],
  primitives: [{ id: "rail", kind: "path", role: "railing", layer: "outline", label: "Top rail", points: [[0, "PostHeight"], ["RunLength", "PostHeight"]] }],
  dimensions: [{ id: "run", kind: "horizontal", from: [0, 0], to: ["RunLength", 0], offset: "-DIM", drives: "RunLength" }],
};

export const ASSEMBLIES: ComponentDefinition[] = [LEVEL_SET, BOX_CULVERT_GAD, BRIDGE_PLAN, BRIDGE_GAD, RAILING_POST, RAILING_RUN];
