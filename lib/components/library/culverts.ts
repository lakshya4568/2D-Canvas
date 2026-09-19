/**
 * Culvert GAD views drawn the way Indian Railways drawings draw them.
 *
 * RCC box — "HALF SECTION & HALF ELEVATION". The left half of the sheet is the
 * section through the embankment (earth slope, boulder backing, level
 * callouts, the V.C. and F.B. checks); the right half is the elevation seen
 * from outside (return wall, stone pitching on the slope, drainage pipes,
 * steps, and the foundation drawn hidden below ground). One set of values
 * drives both halves, and every level on the sheet is the true reduced level
 * because local Y IS elevation (mm).
 *
 * The level chain follows the project formula documentation
 * (docs/bridge-formulas/01-rcc-box-railway.txt), cited per formula:
 *
 *   top of bottom slab = bed level − wearing course            RCR-GEO-004
 *   bottom of box      = top of bottom slab − bottom slab      RCR-GEO-005
 *   soffit             = top of bottom slab + clear height     RCR-GEO-007
 *   top of slab        = soffit + top slab                     RCR-GEO-006
 *   earth cushion      = max(formation − top of slab, 0)       RCR-LVL-002
 *   rail level         = formation + rail-over-formation       RCR-LVL-006 (auto until typed)
 *
 * Still data: the engine that evaluates this knows nothing about culverts.
 */

import type { ComponentDefinition } from "../types";

const onOff = [
  { value: 1, label: "Shown" },
  { value: 0, label: "Hidden" },
];

/** Cell i: its left inner face. */
const cx = "Cell0X + i * CellPitch";
/** A foundation layer's top and bottom (table row k). */
const layTop = "PccBottomY - Layers_before_thickness";
const layBot = "PccBottomY - Layers_before_thickness - Layers_thickness";
/** Weep hole k: row r = floor(k / WeepCols), staggered every other row. */
const weepX = "RwX0 + 300 + (k % WeepCols) * WeepHoleSpacing + (floor(k / WeepCols) % 2) * WeepHoleSpacing / 2";
const weepY = "BedY + 600 + floor(k / WeepCols) * WeepHoleSpacing";

export const RCC_BOX_HALF_SECTION: ComponentDefinition = {
  id: "ir.rcc_box.half_section",
  name: "RCC box — half section & half elevation",
  category: "assembly",
  semanticType: "box_culvert",
  view: "section",
  version: "1.0.0",
  drawingScale: 100,
  description:
    "Railway RCC box culvert GAD view: section through the embankment on the left, elevation with return wall, stone pitching, drainage pipes and steps on the right. Levels (rail, formation, top of slab, soffit, bed, HFL, foundation) are called out at their true RLs; V.C. and F.B. are dimensioned; foundation layers are a list you can extend.",
  tags: ["culvert", "box", "GAD", "half section", "half elevation", "railway", "levels"],
  sources: ["aagento-rcr", "irbm-311-3", "irbm-312", "irbm-313"],
  parameters: [
    { name: "Status", label: "Bridge", kind: "choice", unit: "-", default: 1, options: [{ value: 1, label: "PROP." }, { value: 0, label: "EX." }], group: "Drawing" },
    { name: "CellCount", label: "Number of cells", kind: "count", unit: "-", default: 1, min: 1, max: 6, group: "Opening" },
    { name: "ClearSpan", label: "Clear span of each cell", kind: "length", unit: "mm", default: 10700, min: 1000, max: 12000, step: 50, group: "Opening", sourceRequired: true, description: "Clear width between the inner faces of a cell (cW)." },
    { name: "ClearHeight", label: "Clear height (top of base slab to soffit)", kind: "length", unit: "mm", default: 4250, min: 1000, max: 8000, step: 50, group: "Opening", sourceRequired: true, description: "Structural clear height cH, measured from the top of the bottom slab; the clear height above bed is this less the wearing course." },
    { name: "SideWall", label: "Outer wall thickness", kind: "length", unit: "mm", default: 350, min: 300, max: 1200, step: 10, group: "Structure", sourceRequired: true },
    { name: "InnerWall", label: "Intermediate wall thickness", kind: "length", unit: "mm", default: 350, min: 300, max: 1000, step: 10, group: "Structure" },
    { name: "TopSlab", label: "Top slab thickness", kind: "length", unit: "mm", default: 800, min: 300, max: 1500, step: 10, group: "Structure", sourceRequired: true },
    { name: "BottomSlab", label: "Bottom slab thickness", kind: "length", unit: "mm", default: 800, min: 300, max: 1500, step: 10, group: "Structure", sourceRequired: true },
    { name: "Haunch", label: "Haunch (each leg)", kind: "length", unit: "mm", default: 600, min: 0, max: 900, step: 25, group: "Structure" },
    { name: "WearingCourse", label: "Wearing course", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 5, group: "Structure" },
    { name: "BedLevel", label: "Bed level", kind: "level", unit: "m", default: 96.1, group: "Levels", sourceRequired: true, description: "Finished bed inside the barrel (top of the wearing course)." },
    { name: "HFL", label: "High flood level", kind: "level", unit: "m", default: 96.8, group: "Levels", sourceRequired: true },
    { name: "FormationLevel", label: "Formation level", kind: "level", unit: "m", default: 105, group: "Levels", sourceRequired: true },
    { name: "RailOverFormation", label: "Rail level above formation", kind: "length", unit: "mm", default: 762, min: 0, max: 1500, group: "Levels", description: "BG track depth over formation (rail, sleeper, ballast) — 762 mm is the usual allowance." },
    { name: "RailLevel", label: "Rail level", kind: "level", unit: "m", default: 105.762, defaultExpr: "FormationLevel + RailOverFormation / 1000", group: "Levels", sourceRequired: true, description: "Follows formation + rail-over-formation until you type a value (RCR-LVL-006)." },
    { name: "PccThickness", label: "PCC base course", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 25, group: "Foundation" },
    { name: "PccProjection", label: "PCC projection beyond box", kind: "length", unit: "mm", default: 150, min: 0, max: 600, step: 25, group: "Foundation" },
    { name: "EmbankmentSlope", label: "Embankment slope (horizontal per 1 vertical)", kind: "ratio", unit: "-", default: 1, min: 0.5, max: 3, step: 0.25, group: "Section side" },
    { name: "BoulderThickness", label: "Boulder backing thickness", kind: "length", unit: "mm", default: 600, min: 0, max: 1200, step: 50, group: "Section side" },
    { name: "ConstructionGap", label: "Gap box ↔ return wall", kind: "length", unit: "mm", default: 16, min: 0, max: 50, group: "Elevation side" },
    { name: "ReturnSlope", label: "Slope in front of return wall (H per 1 V)", kind: "ratio", unit: "-", default: 1.5, min: 1, max: 3, step: 0.25, group: "Elevation side" },
    { name: "ReturnWallLength", label: "Return wall length", kind: "length", unit: "mm", default: 6984, defaultExpr: "ReturnSlope * (TopY - BedY) - SideWall - ConstructionGap", group: "Elevation side", description: "Follows the slope (its toe lands on the wall's inner face at bed level) until you type a value." },
    { name: "PitchingThickness", label: "Stone pitching band", kind: "length", unit: "mm", default: 450, min: 0, max: 1200, step: 50, group: "Elevation side" },
    { name: "ReturnWallFoundation", label: "Return wall foundation depth below bed", kind: "length", unit: "mm", default: 1550, min: 0, max: 5000, step: 50, group: "Elevation side" },
    { name: "LeanConcrete", label: "Lean concrete under return wall", kind: "length", unit: "mm", default: 150, min: 0, max: 300, step: 25, group: "Elevation side" },
    { name: "ShowCoping", label: "Coping on return wall", kind: "choice", unit: "-", default: 1, options: onOff, group: "Elevation side" },
    { name: "CopingThickness", label: "Coping thickness", kind: "length", unit: "mm", default: 150, min: 50, max: 400, group: "Elevation side" },
    { name: "CopingOverhang", label: "Coping overhang", kind: "length", unit: "mm", default: 75, min: 0, max: 200, group: "Elevation side" },
    { name: "ShowWeepHoles", label: "Drainage pipes", kind: "choice", unit: "-", default: 1, options: onOff, group: "Elevation side" },
    { name: "WeepHoleSpacing", label: "Drainage pipe spacing (staggered)", kind: "length", unit: "mm", default: 1500, min: 500, max: 3000, step: 100, group: "Elevation side" },
    { name: "WeepHoleDia", label: "Drainage pipe diameter", kind: "length", unit: "mm", default: 100, min: 50, max: 200, group: "Elevation side" },
    { name: "ShowSteps", label: "Inspection steps", kind: "choice", unit: "-", default: 1, options: onOff, group: "Steps" },
    { name: "StepsOffset", label: "Steps from end of return wall", kind: "length", unit: "mm", default: 1800, min: 0, max: 5000, step: 100, group: "Steps" },
    { name: "StepWidth", label: "Step width", kind: "length", unit: "mm", default: 1200, min: 600, max: 3000, step: 50, group: "Steps" },
    { name: "StepRise", label: "Step rise", kind: "length", unit: "mm", default: 150, min: 100, max: 300, step: 5, group: "Steps" },
    { name: "ShowParapetGap", label: "225 mm line over the slab", kind: "choice", unit: "-", default: 1, options: onOff, group: "Section side" },
    { name: "ParapetGap", label: "Clear fill over slab (unhatched)", kind: "length", unit: "mm", default: 225, min: 0, max: 600, group: "Section side" },
    { name: "LevelLabelOffset", label: "Level callouts start this far left of the box", kind: "length", unit: "mm", default: 6000, min: 2000, max: 20000, step: 250, group: "Drawing" },
  ],
  tables: [
    {
      name: "Layers",
      label: "Foundation layers under the PCC",
      group: "Foundation",
      description: "Top to bottom. Add a row for each layer; its callout reads its thickness and name.",
      columns: [
        { name: "name", label: "Layer", kind: "text", default: "NEW LAYER" },
        { name: "thickness", label: "Thickness", kind: "number", unit: "mm", default: 150 },
        {
          name: "hatch",
          label: "Hatch",
          kind: "choice",
          default: 1,
          options: [
            { value: 0, label: "None" },
            { value: 1, label: "Granular (dashes)" },
            { value: 2, label: "Gravel" },
            { value: 3, label: "Earth" },
            { value: 4, label: "Rock" },
            { value: 5, label: "Concrete" },
            { value: 6, label: "Sand" },
          ],
        },
      ],
      rows: [{ name: "GRANULAR FILLING", thickness: 850, hatch: 2 }],
      minRows: 0,
      maxRows: 12,
    },
  ],
  formulas: [
    { name: "OuterWidth", expr: "CellCount * ClearSpan + 2 * SideWall + (CellCount - 1) * InnerWall", label: "Overall width of box", unit: "mm", report: true, group: "Structure", cites: ["RCR-GEO-001"] },
    { name: "OuterHeight", expr: "BottomSlab + ClearHeight + TopSlab", label: "Overall height of box", unit: "mm", report: true, group: "Structure", cites: ["RCR-GEO-002"] },
    { name: "XL", expr: "-OuterWidth / 2" },
    { name: "XR", expr: "OuterWidth / 2" },
    { name: "BedY", expr: "BedLevel * 1000" },
    { name: "BaseTopY", expr: "BedY - WearingCourse", cites: ["RCR-GEO-004"] },
    { name: "BoxBottomY", expr: "BaseTopY - BottomSlab", cites: ["RCR-GEO-005"] },
    { name: "SoffitY", expr: "BaseTopY + ClearHeight", cites: ["RCR-GEO-007"] },
    { name: "TopY", expr: "SoffitY + TopSlab", cites: ["RCR-GEO-006"] },
    { name: "TopOfSlabLevel", expr: "TopY / 1000", label: "Top of slab", unit: "m", report: true, group: "Levels", cites: ["RCR-LVL-001"] },
    { name: "SoffitLevel", expr: "SoffitY / 1000", label: "Bottom of top slab (soffit)", unit: "m", report: true, group: "Levels", cites: ["RCR-GEO-007"] },
    { name: "BottomOfBoxLevel", expr: "BoxBottomY / 1000", label: "Bottom of box", unit: "m", report: true, group: "Levels", cites: ["RCR-GEO-005"] },
    { name: "FormY", expr: "FormationLevel * 1000" },
    { name: "RailY", expr: "RailLevel * 1000" },
    { name: "HflY", expr: "HFL * 1000" },
    { name: "EarthCushion", expr: "max(FormY - TopY, 0)", label: "Earth cushion", unit: "mm", report: true, group: "Levels", cites: ["RCR-LVL-002"] },
    { name: "VerticalClearance", expr: "SoffitY - HflY", label: "Vertical clearance V.C. (soffit − HFL)", unit: "mm", report: true, group: "Levels", cites: ["RCR-VAL-005"] },
    { name: "FreeBoard", expr: "FormY - HflY", label: "Free board F.B. (formation − HFL)", unit: "mm", report: true, group: "Levels" },
    { name: "ClearAboveBed", expr: "SoffitY - BedY", label: "Clear height above bed", unit: "mm", report: true, group: "Opening", cites: ["RCR-CELL-003"] },
    { name: "FlowArea", expr: "CellCount * ClearSpan * ClearHeight / 1000000", label: "Waterway area (cW × cH × cells)", unit: "m2", report: true, group: "Opening", cites: ["RCR-GEO-003"] },
    { name: "LinearWaterway", expr: "CellCount * ClearSpan" },
    { name: "PccBottomY", expr: "BoxBottomY - PccThickness", cites: ["RCR-LVL-004"] },
    { name: "FoundationBottomY", expr: "PccBottomY - Layers_sum_thickness", cites: ["RCR-LVL-005"] },
    { name: "FoundationLevel", expr: "FoundationBottomY / 1000", label: "Bottom of foundation layers (R.L.)", unit: "m", report: true, group: "Levels", cites: ["RCR-LVL-005"] },
    { name: "CellPitch", expr: "ClearSpan + InnerWall" },
    { name: "SpanDimY", expr: "(SoffitY + BaseTopY) / 2 - 0.15 * ClearHeight" },
    { name: "Cell0X", expr: "XL + SideWall", cites: ["RCR-CELL-001"] },
    { name: "WcInset", expr: "max(Haunch - WearingCourse, 0)" },
    { name: "WcRise", expr: "min(Haunch, WearingCourse)" },
    // Section side: the 1:S embankment slope through the PCC toe, cut at bed level.
    { name: "ToeX", expr: "XL - PccProjection" },
    { name: "SlopeTopX", expr: "ToeX - EmbankmentSlope * (TopY - BoxBottomY)" },
    { name: "CutX", expr: "ToeX - EmbankmentSlope * (BedY - BoxBottomY)", cites: ["RCR-CUT-006"] },
    { name: "SlopeLen", expr: "hypot(CutX - SlopeTopX, BedY - TopY)" },
    { name: "BldX", expr: "XL - BoulderThickness", cites: ["RCR-CUT-001"] },
    { name: "BldHitY", expr: "BoxBottomY + (ToeX - BldX) / EmbankmentSlope", cites: ["RCR-CUT-004"] },
    { name: "BldLowY", expr: "max(BedY, BldHitY)", cites: ["RCR-CUT-007"] },
    // Elevation side: return wall, and the slope in front of it clipped at the gap.
    { name: "RwX0", expr: "XR + ConstructionGap" },
    { name: "RwX1", expr: "RwX0 + ReturnWallLength" },
    { name: "RsToeX", expr: "RwX1 - ReturnSlope * (TopY - BedY)" },
    { name: "RsX0", expr: "max(RwX0, RsToeX)" },
    { name: "RsY0", expr: "TopY - (RwX1 - RsX0) / ReturnSlope" },
    { name: "RsLen", expr: "hypot(RwX1 - RsX0, TopY - RsY0)" },
    { name: "RwFdnY", expr: "BedY - ReturnWallFoundation" },
    { name: "WeepCols", expr: "max(0, floor((ReturnWallLength - 900) / WeepHoleSpacing) + 1)" },
    { name: "WeepRows", expr: "max(0, floor((TopY - BedY - 1200) / WeepHoleSpacing) + 1)" },
    { name: "WeepTopRow", expr: "WeepRows - 1" },
    { name: "WeepTopShift", expr: "(WeepTopRow % 2) * WeepHoleSpacing / 2" },
    { name: "WeepTopLastX", expr: "RwX0 + 300 + WeepTopShift + floor((ReturnWallLength - 600 - WeepTopShift) / WeepHoleSpacing) * WeepHoleSpacing" },
    { name: "WeepTopY", expr: "BedY + 600 + WeepTopRow * WeepHoleSpacing" },
    // Steps up the embankment from bed to formation.
    { name: "StairsX", expr: "RwX1 + StepsOffset" },
    { name: "StepCount", expr: "max(1, round((FormY - BedY) / StepRise))" },
    { name: "StepH", expr: "(FormY - BedY) / StepCount" },
    { name: "RightEndX", expr: "if(ShowSteps, StairsX + StepWidth, RwX1)" },
    // Annotation placement (reads TXT / DIM, never geometry).
    { name: "LabelX", expr: "XL - LevelLabelOffset" },
    { name: "VcX", expr: "SlopeTopX - 1500" },
    { name: "FbX", expr: "VcX - 600" },
    { name: "LineStartX", expr: "min(LabelX, FbX) - 300" },
    { name: "CalloutX", expr: "XR + 800" },
    { name: "CalloutPitch", expr: "1.6 * TXT" },
    // Callout rows start below the box, below the return wall's foundation and below the R.L. line, so no text sits on a line.
    { name: "CalloutY0", expr: "min(BoxBottomY - 400, if(gt(ReturnWallLength, 0) * gt(ReturnWallFoundation, 0), RwFdnY - LeanConcrete - 2 * TXT, BoxBottomY - 400), FoundationBottomY - 1.6 * TXT)" },
    { name: "CalloutLastY", expr: "CalloutY0 - (1 + Layers_count) * CalloutPitch" },
    { name: "WcTipX", expr: "XR - SideWall - Haunch - 500" },
    { name: "PccTipX", expr: "XR - SideWall - Haunch - 500 - TXT" },
    { name: "LayerTipX", expr: "PccTipX / 2" },
    { name: "HaunchShelfY", expr: "if(ge(EarthCushion, 1200), TopY + EarthCushion / 2, RailY + 700)" },
    { name: "BottomY", expr: "min(FoundationBottomY - 600, CalloutLastY)" },
    { name: "TitleY", expr: "BottomY - 3 * TXT" },
  ],
  primitives: [
    // ---- the box
    { id: "box_top", kind: "path", role: "concrete_section", layer: "outline", label: "Top of box", points: [["XL", "TopY"], ["XR", "TopY"]] },
    { id: "box_left", kind: "path", role: "concrete_section", layer: "outline", label: "Outer wall (left)", points: [["XL", "TopY"], ["XL", "BoxBottomY"]] },
    { id: "box_right", kind: "path", role: "concrete_section", layer: "outline", label: "Outer wall (right)", points: [["XR", "TopY"], ["XR", "BoxBottomY"]] },
    { id: "box_bottom_l", kind: "path", role: "concrete_section", layer: "outline", label: "Bottom of box (section)", points: [["XL", "BoxBottomY"], [0, "BoxBottomY"]] },
    { id: "box_bottom_r", kind: "path", role: "concrete_section", layer: "hidden", label: "Bottom of box (elevation, hidden)", points: [[0, "BoxBottomY"], ["XR", "BoxBottomY"]] },
    {
      id: "cell",
      kind: "loop",
      role: "clear_opening",
      layer: "outline",
      label: "Cell",
      repeat: { count: "CellCount", index: "i" },
      points: [
        [`${cx} + Haunch`, "BaseTopY"],
        [`${cx} + ClearSpan - Haunch`, "BaseTopY"],
        [`${cx} + ClearSpan`, "BaseTopY + Haunch"],
        [`${cx} + ClearSpan`, "SoffitY - Haunch"],
        [`${cx} + ClearSpan - Haunch`, "SoffitY"],
        [`${cx} + Haunch`, "SoffitY"],
        [cx, "SoffitY - Haunch"],
        [cx, "BaseTopY + Haunch"],
      ],
    },
    {
      id: "wearing_top",
      kind: "path",
      role: "wearing_course",
      layer: "secondary",
      label: "Top of wearing course",
      repeat: { count: "CellCount", index: "i" },
      when: "WearingCourse",
      points: [[`${cx} + WcInset`, "BedY"], [`${cx} + ClearSpan - WcInset`, "BedY"]],
    },
    {
      id: "wearing_region",
      kind: "loop",
      role: "wearing_course",
      layer: "hatch",
      label: "Wearing course (section half)",
      draw: false,
      repeat: { count: "CellCount", index: "i" },
      when: `gt(WearingCourse, 0) * lt(${cx} + WcInset, -1)`,
      points: [
        [`min(${cx} + Haunch, 0)`, "BaseTopY"],
        [`min(${cx} + ClearSpan - Haunch, 0)`, "BaseTopY"],
        [`min(${cx} + ClearSpan - WcInset, 0)`, "BaseTopY + WcRise"],
        [`min(${cx} + ClearSpan - WcInset, 0)`, "BedY"],
        [`min(${cx} + WcInset, 0)`, "BedY"],
        [`min(${cx} + WcInset, 0)`, "BaseTopY + WcRise"],
      ],
    },

    // ---- PCC and the foundation layers: section half solid, elevation half hidden
    { id: "pcc_l", kind: "path", role: "pcc_levelling", layer: "outline", label: "PCC base course", when: "PccThickness", points: [["XL", "BoxBottomY"], ["ToeX", "BoxBottomY"], ["ToeX", "PccBottomY"], [0, "PccBottomY"]] },
    { id: "pcc_r", kind: "path", role: "pcc_levelling", layer: "hidden", label: "PCC base course (hidden)", when: "PccThickness", points: [["XR", "BoxBottomY"], ["XR + PccProjection", "BoxBottomY"], ["XR + PccProjection", "PccBottomY"], [0, "PccBottomY"]] },
    { id: "pcc_region", kind: "loop", role: "pcc_levelling", layer: "hatch", label: "PCC (section half)", draw: false, when: "PccThickness", points: [["ToeX", "BoxBottomY"], [0, "BoxBottomY"], [0, "PccBottomY"], ["ToeX", "PccBottomY"]] },
    { id: "layer_l", kind: "path", role: "backfill", layer: "secondary", label: "Foundation layer", repeat: { table: "Layers", index: "k" }, when: "gt(Layers_thickness, 0)", points: [["XL", layTop], ["XL", layBot], [0, layBot]] },
    { id: "layer_r", kind: "path", role: "backfill", layer: "hidden", label: "Foundation layer (hidden)", repeat: { table: "Layers", index: "k" }, when: "gt(Layers_thickness, 0)", points: [["XR", layTop], ["XR", layBot], [0, layBot]] },
    { id: "layer_region", kind: "loop", role: "backfill", layer: "hatch", label: "Foundation layer (section half)", draw: false, repeat: { table: "Layers", index: "k" }, when: "gt(Layers_thickness, 0)", points: [["XL", layTop], [0, layTop], [0, layBot], ["XL", layBot]] },

    // ---- earth cushion over the box
    { id: "cushion", kind: "path", role: "earth_cushion", layer: "hidden", label: "Earth cushion", when: "gt(EarthCushion, 0)", points: [["XL", "TopY"], ["XL", "FormY"], ["XR", "FormY"], ["XR", "TopY"]] },
    { id: "cushion_region", kind: "loop", role: "earth_cushion", layer: "hatch", label: "Earth cushion fill", draw: false, when: "gt(EarthCushion, ShowParapetGap * ParapetGap)", points: [["XL", "FormY"], ["XR", "FormY"], ["XR", "TopY + ShowParapetGap * ParapetGap"], ["XL", "TopY + ShowParapetGap * ParapetGap"]] },
    { id: "parapet_line", kind: "path", role: "earth_cushion", layer: "secondary", label: "Clear fill line", when: "ShowParapetGap * gt(EarthCushion, ParapetGap) * gt(ParapetGap, 0)", points: [["XL", "TopY + ParapetGap"], ["XR", "TopY + ParapetGap"]] },

    // ---- section side: embankment slope, boulder backing
    { id: "embankment", kind: "path", role: "earth_fill", layer: "ground", label: "Embankment slope", points: [["XL", "TopY"], ["SlopeTopX", "TopY"], ["CutX", "BedY"], ["XL", "BedY"]] },
    {
      id: "embankment_region",
      kind: "loop",
      role: "earth_fill",
      layer: "hatch",
      label: "Embankment fill",
      draw: false,
      when: "gt(BldX - SlopeTopX, 1)",
      points: [["SlopeTopX", "TopY"], ["BldX", "TopY"], ["BldX", "BldLowY"], ["min(CutX, BldX)", "BldLowY"]],
    },
    {
      id: "boulder",
      kind: "loop",
      role: "pitching",
      layer: "secondary",
      label: "Boulder backing",
      when: "BoulderThickness",
      points: [["BldX", "TopY"], ["XL", "TopY"], ["XL", "BedY"], ["max(CutX, BldX)", "BedY"], ["BldX", "BldLowY"]],
    },

    // ---- levels, called out on the section side
    { id: "rail_line", kind: "path", role: "rail_level", layer: "level", label: "Rail level", points: [["LabelX", "RailY"], ["XL", "RailY"]] },
    { id: "rail_ext", kind: "path", role: "rail_level", layer: "hidden", label: "Rail level (over the box)", points: [["XL", "RailY"], ["XR + 150", "RailY"]] },
    { id: "formation_line", kind: "path", role: "formation_level", layer: "level", label: "Formation level", points: [["LineStartX", "FormY"], ["XL", "FormY"]] },
    { id: "formation_ext", kind: "path", role: "formation_level", layer: "hidden", label: "Formation level (over the box)", when: "le(EarthCushion, 0)", points: [["XL", "FormY"], ["XR + 150", "FormY"]] },
    { id: "top_line", kind: "path", role: "level_marker", layer: "level", label: "Top of slab level", points: [["LabelX", "TopY"], ["SlopeTopX", "TopY"]] },
    { id: "soffit_line", kind: "path", role: "soffit_level", layer: "level", label: "Bottom of top slab level", points: [["LabelX", "SoffitY"], ["XL", "SoffitY"]] },
    { id: "bed_line", kind: "path", role: "bed_level", layer: "level", label: "Bed level", points: [["LabelX", "BedY"], ["CutX", "BedY"]] },
    { id: "bed_ext", kind: "path", role: "bed_level", layer: "hidden", label: "Bed level (across)", points: [["XL", "BedY"], ["RightEndX", "BedY"]] },
    { id: "hfl_line", kind: "path", role: "HFL", layer: "water", label: "HFL", when: "ge(HflY, BedY)", points: [["LineStartX", "HflY"], ["XR", "HflY"]] },
    { id: "vc_ext", kind: "path", role: "soffit_level", layer: "water", label: "Soffit (to V.C.)", when: "gt(SoffitY, HflY) * lt(VcX, LabelX)", points: [["LabelX", "SoffitY"], ["VcX", "SoffitY"]] },
    { id: "fdn_line", kind: "path", role: "foundation_level", layer: "hidden", label: "Bottom of foundation", points: [["LabelX", "FoundationBottomY"], ["RightEndX", "FoundationBottomY"]] },
    { id: "centre", kind: "path", role: "bridge_centreline", layer: "centre", label: "Centre line of bridge", points: [[0, "RailY + 800"], [0, "FoundationBottomY - 600"]] },

    // ---- elevation side: return wall, coping, slope with pitching, foundation, drainage
    { id: "return_wall", kind: "loop", role: "return_wall", layer: "outline", label: "Return wall", when: "gt(ReturnWallLength, 0)", points: [["RwX0", "TopY"], ["RwX1", "TopY"], ["RwX1", "BedY"], ["RwX0", "BedY"]] },
    { id: "rw_foundation", kind: "path", role: "return_wall", layer: "hidden", label: "Return wall foundation", when: "gt(ReturnWallLength, 0) * gt(ReturnWallFoundation, 0)", points: [["RwX0", "BedY"], ["RwX0", "RwFdnY"], ["RwX1", "RwFdnY"], ["RwX1", "BedY"]] },
    { id: "rw_lean", kind: "path", role: "pcc_levelling", layer: "hidden", label: "Lean concrete", when: "gt(ReturnWallLength, 0) * gt(ReturnWallFoundation, 0) * gt(LeanConcrete, 0)", points: [["RwX0", "RwFdnY"], ["RwX0", "RwFdnY - LeanConcrete"], ["RwX1", "RwFdnY - LeanConcrete"], ["RwX1", "RwFdnY"]] },
    { id: "coping_base", kind: "path", role: "return_wall", layer: "outline", label: "Coping", when: "ShowCoping * gt(ReturnWallLength, 0)", points: [["RwX0", "TopY"], ["RwX0", "TopY + CopingThickness / 2"], ["RwX1 + CopingOverhang", "TopY + CopingThickness / 2"], ["RwX1 + CopingOverhang", "TopY"], ["RwX1", "TopY"]] },
    { id: "coping_top", kind: "path", role: "return_wall", layer: "outline", label: "Coping (upper)", when: "ShowCoping * gt(ReturnWallLength, 0)", points: [["RwX0", "TopY + CopingThickness / 2"], ["RwX0", "TopY + CopingThickness"], ["RwX1 + CopingOverhang * 0.47", "TopY + CopingThickness"], ["RwX1 + CopingOverhang", "TopY + CopingThickness / 2"]] },
    { id: "return_slope", kind: "path", role: "embankment", layer: "ground", label: "Slope in front of return wall", when: "gt(ReturnWallLength, 0)", points: [["RsX0", "RsY0"], ["RwX1", "TopY"]] },
    {
      id: "pitching_band",
      kind: "loop",
      role: "pitching",
      layer: "hatch",
      label: "Stone pitching",
      draw: false,
      when: "gt(ReturnWallLength, 0) * gt(PitchingThickness, 0)",
      points: [["RsX0", "RsY0"], ["RwX1", "TopY"], ["RwX1", "TopY - PitchingThickness"], ["RsX0", "max(RsY0 - PitchingThickness, BedY)"]],
    },
    { id: "weep", kind: "circle", role: "weep_hole", layer: "outline", label: "Drainage pipe", repeat: { count: "ShowWeepHoles * WeepRows * WeepCols", index: "k" }, when: `lt(${weepX}, RwX1 - 299) * lt(${weepY}, TopY - 299)`, center: [weepX, weepY], r: "WeepHoleDia / 2" },

    // ---- inspection steps
    { id: "stairs", kind: "loop", role: "inspection_steps", layer: "secondary", label: "Steps", when: "ShowSteps * gt(FormY, BedY)", points: [["StairsX", "BedY"], ["StairsX + StepWidth", "BedY"], ["StairsX + StepWidth", "FormY"], ["StairsX", "FormY"]] },
    { id: "step", kind: "path", role: "inspection_steps", layer: "secondary", label: "Step", repeat: { count: "ShowSteps * (StepCount - 1)", index: "j" }, points: [["StairsX", "BedY + (j + 1) * StepH"], ["StairsX + StepWidth", "BedY + (j + 1) * StepH"]] },
    { id: "stairs_top_link", kind: "path", role: "inspection_steps", layer: "secondary", label: "Top of slab to steps", when: "ShowSteps * gt(StepsOffset, 0)", points: [["RwX1", "TopY"], ["StairsX", "TopY"]] },
    { id: "stairs_bed_link", kind: "path", role: "inspection_steps", layer: "secondary", label: "Bed to steps", when: "ShowSteps * gt(StepsOffset, 0)", points: [["RwX1", "BedY"], ["StairsX", "BedY"]] },
  ],
  hatches: [
    { id: "wearing_hatch", boundary: "wearing_region", material: "pcc" },
    { id: "pcc_hatch", boundary: "pcc_region", material: "pcc" },
    { id: "layer_hatch", boundary: "layer_region", material: { pick: "Layers_hatch", from: [null, "granular", "gravel", "earth", "rock", "concrete", "sand"] } },
    { id: "cushion_hatch", boundary: "cushion_region", material: "sand" },
    { id: "embankment_hatch", boundary: "embankment_region", material: "earth" },
    { id: "boulder_hatch", boundary: "boulder", material: "boulder" },
    { id: "pitching_hatch", boundary: "pitching_band", material: "pitching", angle: "atan(1 / ReturnSlope)" },
    { id: "weep_fill", boundary: "weep", material: "solid" },
  ],
  levels: [
    { id: "rail", at: ["LabelX", "RailY"], label: "{Status:label} RAIL LEVEL", style: "gad" },
    { id: "formation", at: ["LabelX", "FormY"], label: "{Status:label} FORMATION LEVEL", style: "gad" },
    { id: "top", at: ["LabelX", "TopY"], label: "TOP OF SLAB", style: "gad" },
    { id: "soffit", at: ["LabelX", "SoffitY"], label: "BOTTOM OF TOP SLAB", style: "gad" },
    { id: "bed", at: ["LabelX", "BedY"], label: "BED LEVEL", style: "gad", symbol: "ground" },
    { id: "hfl", at: ["LabelX", "HflY"], label: "HFL", style: "gad", format: "{label} = {rl}M", symbol: "water", layer: "water", when: "ge(HflY, BedY)" },
    { id: "fdn", at: ["LabelX", "FoundationBottomY"], label: "R.L.", style: "gad" },
  ],
  dimensions: [
    { id: "width", kind: "horizontal", from: ["XL", "TopY"], to: ["XR", "TopY"], offset: "if(gt(EarthCushion, 0), EarthCushion + 150, 1500)" },
    { id: "span", kind: "horizontal", repeat: { count: "CellCount", index: "i" }, from: [cx, "SpanDimY"], to: [`${cx} + ClearSpan`, "SpanDimY"], offset: 0, drives: "ClearSpan" },
    { id: "clear_h", kind: "vertical", repeat: { count: "CellCount", index: "i" }, from: [`${cx} + 0.7 * ClearSpan`, "BedY"], to: [`${cx} + 0.7 * ClearSpan`, "SoffitY"], offset: 0 },
    { id: "wall_l", kind: "horizontal", from: ["XL", "SpanDimY"], to: ["XL + SideWall", "SpanDimY"], offset: 0, drives: "SideWall" },
    { id: "wall_r", kind: "horizontal", from: ["XR - SideWall", "SpanDimY"], to: ["XR", "SpanDimY"], offset: 0, drives: "SideWall" },
    { id: "midwall", kind: "horizontal", repeat: { count: "CellCount - 1", index: "i" }, from: [`${cx} + ClearSpan`, "SpanDimY"], to: [`${cx} + CellPitch`, "SpanDimY"], offset: 0, drives: "InnerWall" },
    { id: "top_slab", kind: "vertical", from: ["Cell0X + 350", "SoffitY"], to: ["Cell0X + 350", "TopY"], offset: 0, drives: "TopSlab" },
    { id: "bottom_slab", kind: "vertical", from: ["Cell0X + 350", "BoxBottomY"], to: ["Cell0X + 350", "BaseTopY"], offset: 0, drives: "BottomSlab" },
    { id: "parapet", kind: "vertical", when: "ShowParapetGap * gt(EarthCushion, ParapetGap) * gt(ParapetGap, 0)", from: ["XR - 300", "TopY"], to: ["XR - 300", "TopY + ParapetGap"], offset: 0 },
    { id: "cushion", kind: "vertical", when: "ge(EarthCushion, 1000)", from: ["XR", "TopY"], to: ["XR", "FormY"], offset: "1.2 * DIM", hideValue: true },
    { id: "vc", kind: "vertical", when: "gt(SoffitY, HflY)", from: ["VcX", "HflY"], to: ["VcX", "SoffitY"], offset: 0, prefix: "V.C. ", layer: "water" },
    { id: "fb", kind: "vertical", when: "gt(FormY, HflY)", from: ["FbX", "HflY"], to: ["FbX", "FormY"], offset: 0, prefix: "F.B. ", layer: "water" },
    { id: "rw_length", kind: "horizontal", when: "gt(ReturnWallLength, 0)", from: ["RwX0", "BedY + 0.25 * ClearHeight"], to: ["RwX1", "BedY + 0.25 * ClearHeight"], offset: 0, drives: "ReturnWallLength" },
    { id: "rw_fdn", kind: "vertical", when: "gt(ReturnWallLength, 0) * gt(ReturnWallFoundation, 0)", from: ["RwX1", "RwFdnY"], to: ["RwX1", "BedY"], offset: "DIM", drives: "ReturnWallFoundation" },
    { id: "rw_lean", kind: "vertical", when: "gt(ReturnWallLength, 0) * gt(ReturnWallFoundation, 0) * gt(LeanConcrete, 0)", from: ["RwX1", "RwFdnY - LeanConcrete"], to: ["RwX1", "RwFdnY"], offset: "DIM", drives: "LeanConcrete" },
    { id: "gap", kind: "horizontal", when: "gt(ConstructionGap, 0)", from: ["XR", "SoffitY"], to: ["RwX0", "SoffitY"], offset: 0, hideValue: true },
    { id: "step_rise", kind: "vertical", when: "ShowSteps * gt(StepCount, 1)", from: ["StairsX", "FormY - StepH"], to: ["StairsX", "FormY"], offset: "-DIM" },
    { id: "step_width", kind: "horizontal", when: "ShowSteps", from: ["StairsX", "FormY"], to: ["StairsX + StepWidth", "FormY"], offset: "1.5 * DIM", drives: "StepWidth" },
    { id: "steps_offset", kind: "horizontal", when: "ShowSteps * gt(StepsOffset, 0)", from: ["RwX1", "FormY"], to: ["StairsX", "FormY"], offset: "1.5 * DIM", drives: "StepsOffset" },
  ],
  leaders: [
    { id: "haunch", when: "Haunch", points: [["Cell0X + Haunch / 2", "SoffitY - Haunch / 2"], ["XL - 1500", "HaunchShelfY"], ["LabelX", "HaunchShelfY"]], text: "HAUNCH {Haunch} X {Haunch}mm", placement: "above" },
    { id: "boulder", when: "BoulderThickness", points: [["XL - BoulderThickness / 2", "BedY + 500"], ["BldX - 500", "BedY - 500"], ["BldX - 500 - 10 * TXT", "BedY - 500"]], text: "{BoulderThickness} THK. BOULDER", placement: "above" },
    { id: "wearing", when: "WearingCourse", points: [["WcTipX", "(BaseTopY + BedY) / 2"], ["WcTipX", "CalloutY0"], ["CalloutX", "CalloutY0"]], text: "{WearingCourse}TH. WEARING COURSE" },
    { id: "pcc", when: "PccThickness", points: [["PccTipX", "BoxBottomY - PccThickness / 2"], ["PccTipX", "CalloutY0 - CalloutPitch"], ["CalloutX", "CalloutY0 - CalloutPitch"]], text: "{PccThickness}TH. PCC BASE COURSE" },
    {
      id: "layer",
      repeat: { table: "Layers", index: "k" },
      when: "gt(Layers_thickness, 0)",
      points: [["LayerTipX", `(${layTop} + ${layBot}) / 2`], ["LayerTipX", "CalloutY0 - (2 + k) * CalloutPitch"], ["CalloutX", "CalloutY0 - (2 + k) * CalloutPitch"]],
      text: "{Layers_thickness}THK. {Layers_name}",
    },
    { id: "gap", when: "gt(ConstructionGap, 0)", points: [["XR", "BedY - 0.6 * TXT"], ["XR + 1.5 * TXT", "BedY - 2.6 * TXT"], ["XR + 4 * TXT", "BedY - 2.6 * TXT"]], text: "{ConstructionGap}mm GAP" },
    { id: "cushion_thin", when: "gt(EarthCushion, 0) * lt(EarthCushion, 1000)", points: [["XR - 600", "(TopY + FormY) / 2"], ["XR + 600", "FormY + 1000"], ["XR + 1200", "FormY + 1000"]], text: "{EarthCushion} mm EARTH CUSHION" },
    // Written above the return wall, where the sheet is clear.
    { id: "drain_a", when: "ShowWeepHoles * gt(ReturnWallLength, 0) * ge(WeepRows * WeepCols, 2)", points: [["WeepTopLastX", "WeepTopY"], ["RwX1 - 2 * TXT", "TopY + 3 * TXT"], ["RwX1 - 3 * TXT", "TopY + 3 * TXT"]], text: "{WeepHoleDia} DIA PVC\nDRAINAGE PIPE" },
    { id: "drain_b", when: "ShowWeepHoles * gt(ReturnWallLength, 0) * ge(WeepRows * WeepCols, 2)", points: [["WeepTopLastX - WeepHoleSpacing", "WeepTopY"], ["RwX1 - 2 * TXT", "TopY + 3 * TXT"]], text: "", arrow: "arrow" },
    { id: "steps", when: "ShowSteps * gt(FormY, BedY)", points: [["StairsX + StepWidth / 2", "FormY - 0.5 * TXT"], ["StairsX + StepWidth / 2", "FormY + 1.5 * DIM + 1.4 * TXT"]], text: "", arrow: "arrow" },
  ],
  texts: [
    { id: "cushion", when: "ge(EarthCushion, 1000)", at: ["XR + 1.2 * DIM + 0.6 * TXT", "(TopY + FormY) / 2"], text: "{EarthCushion} mm\nEARTH\nCUSHION", align: "left", valign: "middle" },
    { id: "slope_l", at: ["(SlopeTopX + CutX) / 2 + 2.2 * TXT * (BedY - TopY) / SlopeLen", "(TopY + BedY) / 2 - 2.2 * TXT * (CutX - SlopeTopX) / SlopeLen"], along: [["SlopeTopX", "TopY"], ["CutX", "BedY"]], text: "SLOPE NOT STEEPER\nTHAN 1:{EmbankmentSlope}", align: "center", valign: "middle", height: 2.2 },
    { id: "slope_r", when: "gt(ReturnWallLength, 0)", at: ["RsX0 + 0.4 * (RwX1 - RsX0) - 1.2 * TXT * (TopY - RsY0) / RsLen", "RsY0 + 0.4 * (TopY - RsY0) + 1.2 * TXT * (RwX1 - RsX0) / RsLen"], along: [["RsX0", "RsY0"], ["RwX1", "TopY"]], text: "1(V):{ReturnSlope}(H)", align: "center", valign: "middle", height: 2.2 },
    { id: "gap", when: "gt(ConstructionGap, 0)", at: ["RwX0 + 0.4 * TXT", "SoffitY + 0.3 * TXT"], text: "{ConstructionGap}mm GAP", align: "left", valign: "bottom", height: 2.2 },
    { id: "steps", when: "ShowSteps * gt(FormY, BedY)", at: ["StairsX + StepWidth / 2", "FormY + 1.5 * DIM + 1.6 * TXT"], text: "STEPS", align: "center", valign: "bottom", height: 2.2 },
    // One text, so a renderer without the ℄ glyph (PDF, DXF write "CL") cannot make the two collide.
    { id: "cl_text", at: ["-0.3 * TXT", "RailY + 900"], text: "℄ OF {Status:label} BRIDGE", align: "left", valign: "bottom" },
    { id: "title", at: [0, "TitleY"], text: "HALF SECTION & HALF ELEVATION", align: "center", valign: "top", height: 5, bold: true },
    { id: "subtitle_p", when: "Status", at: [0, "TitleY - 2.8 * TXT"], text: "PROPOSED BRIDGE", align: "center", valign: "top", height: 4 },
    { id: "subtitle_e", when: "1 - Status", at: [0, "TitleY - 2.8 * TXT"], text: "EXISTING BRIDGE", align: "center", valign: "top", height: 4 },
    { id: "scale", at: [0, "TitleY - 5.4 * TXT"], text: "(SCALE: 1:{SCALE})", align: "center", valign: "top", height: 3 },
  ],
  anchors: [
    { id: "centre_top", at: [0, "TopY"] },
    { id: "bed_left", at: ["XL", "BedY"] },
    { id: "return_wall_end", at: ["RwX1", "TopY"] },
  ],
  invariants: [
    { id: "cells", expr: "CellCount", op: ">=", than: 1, message: "A box needs at least one cell.", severity: "error" },
    { id: "positive", expr: "min(ClearSpan, ClearHeight, SideWall, TopSlab, BottomSlab)", op: ">", than: 0, message: "Spans, heights, walls and slabs must be positive.", severity: "error" },
    { id: "midwall_positive", expr: "if(CellCount - 1, InnerWall, 1)", op: ">", than: 0, message: "Intermediate wall thickness must be positive.", severity: "error" },
    { id: "haunch_span", expr: "ClearSpan", op: ">", than: "2 * Haunch", message: "The haunches would meet across the opening — reduce the haunch or widen the span.", severity: "error" },
    { id: "haunch_height", expr: "ClearHeight", op: ">", than: "2 * Haunch", message: "The haunches would meet top to bottom — reduce the haunch or raise the clear height.", severity: "error" },
    { id: "nonneg", expr: "min(Haunch, WearingCourse, PccThickness, PccProjection, BoulderThickness, ConstructionGap, PitchingThickness, ReturnWallFoundation, LeanConcrete, StepsOffset, ParapetGap)", op: ">=", than: 0, message: "Sizes cannot be negative.", severity: "error" },
    { id: "wearing_in_cell", expr: "WearingCourse", op: "<", than: "ClearHeight - Haunch", message: "The wearing course would reach the top haunches.", severity: "error" },
    { id: "slopes", expr: "min(EmbankmentSlope, ReturnSlope, StepRise, WeepHoleSpacing, StepWidth)", op: ">", than: 0, message: "Slopes, step sizes and pipe spacing must be positive.", severity: "error" },
    { id: "rail_above_formation", expr: "RailLevel", op: ">", than: "FormationLevel", message: "Rail level must be above formation level.", severity: "error" },
    { id: "boulder_fits", expr: "BoulderThickness", op: "<=", than: "XL - SlopeTopX", message: "The boulder backing is wider than the embankment above the box.", severity: "warning" },
    { id: "rcr_val_001", expr: "SideWall", op: ">=", than: 300, message: "Outer wall {SideWall} mm is under 300 mm — below the minimum the project reference quotes (RCR-VAL-001); requires review.", severity: "warning", source: "aagento-rcr" },
    { id: "rcr_val_002", expr: "TopSlab", op: ">=", than: 300, message: "Top slab {TopSlab} mm is under 300 mm (RCR-VAL-002); requires review.", severity: "warning", source: "aagento-rcr" },
    { id: "rcr_val_003", expr: "ClearHeight", op: ">=", than: 1000, message: "Clear height {ClearHeight} mm is under 1.0 m (RCR-VAL-003); requires review.", severity: "warning", source: "aagento-rcr" },
    { id: "rcr_val_005", expr: "HflY", op: "<=", than: "SoffitY", message: "HFL is above the soffit — the barrel would run full (RCR-VAL-004/005); requires review.", severity: "warning", source: "aagento-rcr" },
    { id: "rcr_val_007", expr: "if(gt(FormY, TopY), EarthCushion, 75)", op: ">=", than: 75, message: "Earth cushion {EarthCushion} mm is under 75 mm (RCR-VAL-007); requires review.", severity: "warning", source: "aagento-rcr" },
    { id: "rcr_val_008", expr: "if(Haunch, Haunch, 300)", op: ">=", than: 300, message: "Haunch {Haunch} mm is under 300 mm — check adequacy (RCR-VAL-008); requires review.", severity: "warning", source: "aagento-rcr" },
    { id: "formation_over_box", expr: "FormY", op: ">=", than: "TopY", message: "Formation is below the top of the box — check the levels.", severity: "warning" },
    { id: "hfl_over_bed", expr: "HflY", op: ">=", than: "BedY", message: "HFL is below bed level — check the hydraulic data.", severity: "warning" },
  ],
  facts: [
    { key: "clear_opening_mm", expr: "ClearSpan" },
    { key: "clear_height_mm", expr: "ClearAboveBed" },
    { key: "cell_count", expr: "CellCount" },
    { key: "linear_waterway_mm", expr: "LinearWaterway" },
    { key: "waterway_area_m2", expr: "FlowArea" },
    { key: "culvert_exempt_clearance", expr: 1 },
    { key: "cushion_mm", expr: "EarthCushion" },
    { key: "freeboard_mm", expr: "FreeBoard" },
    { key: "hfl_m", expr: "HFL" },
    { key: "bed_level_m", expr: "BedLevel" },
    { key: "formation_level_m", expr: "FormationLevel" },
    { key: "rail_level_m", expr: "RailLevel" },
    { key: "soffit_level_m", expr: "SoffitY / 1000" },
  ],
};

export const CULVERT_VIEWS: ComponentDefinition[] = [RCC_BOX_HALF_SECTION];
