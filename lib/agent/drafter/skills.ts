/**
 * Drafting skills: playbooks the agent loads when a job matches.
 *
 * The system prompt teaches the method; a skill teaches one kind of drawing —
 * what it contains, how Indian Railways drafters lay it out, which values
 * drive it and which formulas (docs/bridge-formulas ids) connect them — so a
 * "draw an RCC box half section" brief produces the full GAD view, not an
 * outline. They are plain text on purpose: the agent reads them with
 * `use_skill`, and a person can read them here to see what the agent was told.
 *
 * Each skill names the formula ids it relies on; `bridge_reference` returns
 * the full entry, so the agent quotes the formula instead of guessing it.
 */

export interface DraftingSkill {
  name: string;
  title: string;
  /** One line: when to load it. */
  when: string;
  body: string;
}

const GAD_STYLE = `# Indian Railways GAD drafting style

The drawing is judged by an engineer who reads hundreds of these. It must look like one.

## Levels
- Every level is a long horizontal line at its true height (y = RL × 1000 in mm) with its callout WRITTEN ON the line at its left end: "PROP. RAIL LEVEL = 105.762M.", "PROP. FORMATION LEVEL = 105.000M.", "TOP OF SLAB = 101.000M.", "BOTTOM OF TOP SLAB = 100.200M.", "BED LEVEL = 96.100M.", "R.L. = 94.150M." (bottom of foundation). Use annotate kind=level with style="gad" — the RL is read from the point's height, never typed.
- HFL is drawn on the water layer (dash-dot, blue) with the water symbol (▽ with receding lines): annotate level label "HFL", style "gad", format "{label} = {rl}M", symbol "water". Bed level gets symbol "ground".
- Level callouts start 5–7 m left of the structure and are stacked so no two texts touch.
- "PROP." for proposed work, "EX." for existing.

## Clearances written as dimensions
- V.C. (vertical clearance, soffit − HFL) and F.B. (free board, formation − HFL) are vertical dimensions on the far left, in the water colour, with the prefix in the text: "V.C. 3400", "F.B. 8200".

## Dimensions
- Clear span of each cell and wall thicknesses on ONE row inside the opening ("350 | 10700 | 350").
- Slab thicknesses as short vertical dimensions just inside the wall ("800" top and bottom).
- Clear height inside the cell, right of centre.
- Overall width above the earth cushion, just above formation.
- Numbers only, in mm, no units, text above the line.

## Hatches (materials)
- Earth cushion over the box: sand/dot stipple, from formation down to 225 mm above the slab (the clear fill line), inside a dashed outline.
- Embankment fill on the section side: earth pattern; boulder backing next to the wall: honeycomb ("boulder").
- PCC base course: fine stipple ("pcc"); granular filling: gravel or vertical dashes ("granular"); wearing course: fine stipple.
- Stone pitching on a slope: ovals along the slope ("pitching", angle = slope angle).
- Only the SECTION half is hatched; the ELEVATION half shows outlines, and anything below ground there is hidden (dashed).

## Callouts
- Leaders with the text written ON the shelf, shelf running away from the structure: "HAUNCH 600 X 600mm", "600 THK. BOULDER" (annotate kind=leader placement="above").
- Layer callouts stacked on the right below the structure, one leader per layer dropping from inside the layer: "150TH. WEARING COURSE", "150TH. PCC BASE COURSE", "850THK. GRANULAR FILLING".
- Small notes: "16mm GAP" at the joint between box and return wall; "100 DIA PVC DRAINAGE PIPE" with two leaders; "STEPS" over the steps.
- Earth cushion depth written beside its dimension: "4000 mm / EARTH / CUSHION" (three lines).

## Line types and layers
- Structure outline: continuous, heavy. Hidden (below ground in elevation, earth cushion boundary): dashed. Centre line: dash-dot with "℄ OF PROP. BRIDGE" at its top. HFL: dash-dot on the water layer. Construction/level guides never plot.

## Title
- Under the view, centred: "HALF SECTION & HALF ELEVATION" (bold, larger), then "PROPOSED BRIDGE", then "(SCALE: 1:100)". Text height 2.5 mm on paper at the view's scale (1:100 for culvert views).

## Before finishing
- view the drawing and compare: every level called out, every member dimensioned once, every material hatched on the section half, every layer called out, title present. Then audit.`;

const RCC_HALF_SECTION = `# RCC box culvert — HALF SECTION & HALF ELEVATION (railway)

Load gad-drafting-style too. Formula ids below are in the bridge reference (bridge_reference id=...).

## What the view contains
Left half (SECTION through the embankment): the box cut through, 1:1 embankment slope with 600 thk boulder backing against the outer wall, level callouts (rail, formation, top of slab, bottom of top slab, bed, HFL, R.L.), V.C. and F.B. dimensions, earth cushion over the box (hatched), PCC and foundation layers hatched.
Right half (ELEVATION from outside): the box face, a 16 mm gap, the return wall (rectangle from top of slab to bed) with coping, the 1V:1.5H slope in front of it with stone pitching, drainage pipes (dots) with a leader, the return wall foundation below bed (dashed) with its depth, steps from bed to formation beyond the return wall, layer callouts stacked on the right.
Centre line ℄ between the halves; the box is symmetric about it.

## Level chain (RCR formulas — the box is set from the bed, the cushion is a result)
- top of bottom slab = BedLevel − wearing course (RCR-GEO-004)
- bottom of box = top of bottom slab − bottom slab (RCR-GEO-005)
- soffit (bottom of top slab) = top of bottom slab + clear height cH (RCR-GEO-007)
- top of slab = soffit + top slab (RCR-GEO-006, RCR-LVL-001)
- earth cushion = max(formation − top of slab, 0) (RCR-LVL-002)
- rail level = formation + 0.762 m for BG unless given (RCR-LVL-006)
- PCC bottom = bottom of box − PCC; foundation bottom (R.L.) = PCC bottom − Σ layers (RCR-LVL-004/005)
- total width = cells × clear span + 2 × outer wall + (cells − 1) × inner wall (RCR-GEO-001)
- checks: walls and top slab ≥ 300, cH ≥ 1000, HFL below soffit, cushion ≥ 75, haunch ≥ 300 (RCR-VAL-001…008; "requires review")

## Route A — the component (use this when the brief is this view)
insert_component definition="ir.rcc_box.half_section" with values read from the brief or reference. Reading a reference drawing:
- "PROP. FORMATION LEVEL = 105.000M." → FormationLevel 105.0; "PROP. RAIL LEVEL = 105.762M." → RailLevel 105.762 (or leave it: it follows formation + 762); "BED LEVEL = 96.100M." → BedLevel 96.1; "HFL = 96.800M" → HFL 96.8.
- "TOP OF SLAB = 101.000M." and "BOTTOM OF TOP SLAB = 100.200M." are RESULTS: TopSlab = 101.000 − 100.200 = 800; ClearHeight = soffit − (bed − wearing course) = 100.200 − (96.100 − 0.150) = 4250.
- "10700" between inner faces → ClearSpan; "350" walls → SideWall; "800" slabs → TopSlab / BottomSlab; "HAUNCH 600 X 600mm" → Haunch 600; "150TH. WEARING COURSE" → WearingCourse 150; "150TH. PCC BASE COURSE" → PccThickness 150; "600 THK. BOULDER" → BoulderThickness 600; "16mm GAP" → ConstructionGap 16; "1(V):1.5(H)" → ReturnSlope 1.5; "SLOPE NOT STEEPER THAN 1:1" → EmbankmentSlope 1; "1550" under the return wall → ReturnWallFoundation; steps "1800"/"1200"/"150" → StepsOffset/StepWidth/StepRise.
- Foundation layers ("850THK. GRANULAR FILLING", further layers) → set_table table="Layers" rows=[{name:"GRANULAR FILLING", thickness:850, hatch:2}, …] (hatch: 0 none, 1 granular dashes, 2 gravel, 3 earth, 4 rock, 5 concrete, 6 sand).
- "11400", "4000 mm EARTH CUSHION", "V.C. 3400", "F.B. 8200", "R.L." are results — check them against describe_component instead of typing them. If one disagrees, a value you read is wrong: find which.
- Then: describe_component, view, audit. Put the levels you read into design_basis (INFERRED).

## Route B — by hand, then make_parametric (when the brief shows a different arrangement)
Draw at true levels (y = RL × 1000), centre line at x = 0 (draw_line construction, then classify bridge_centreline):
1. Level lines (construction) for rail, formation, bed, HFL — classify each (rail_level, formation_level, bed_level, HFL); annotate level style "gad" at their left ends.
2. The box: outer rectangle; the opening as ONE closed polyline with the haunch corners cut (classify clear_opening). Wearing course line at bed level inside the opening.
3. Earth cushion outline above the box (dashed), PCC and foundation layers under it; embankment slope and boulder strip on the left; return wall, slope, steps on the right.
4. Dimensions (annotate kind=dimension) for everything that should be changeable: clear span (between the inner faces), each wall, each slab, clear height, cushion. Callouts with numbers (annotate leader placement "above"): "HAUNCH 600 X 600mm" pointing at a haunch edge, "150TH. WEARING COURSE" pointing into the layer…
5. Hatches (annotate kind=hatch at a point inside each closed region, with the material).
6. make_parametric preview:true — read the plan: site levels are inputs, dimensions drive, the cushion is a result, callouts became values. Rename (e.g. D1 → TopSlab), then make_parametric.
7. Relationships: relationship instance=… name="RailLevel" expr="FormationLevel + 0.762".`;

const MAKE_PARAMETRIC = `# Make a drawing parametric (the manual route)

Use when you (or the person) drew something by hand and it must follow values afterwards.

1. Draw at true levels (y = RL × 1000) if the drawing has levels; put the centre line at x = 0 and classify it (bridge_centreline).
2. Classify the level lines (bed_level, HFL, formation_level, rail_level …) — site levels become the inputs, in metres.
3. Dimension what should be changeable. A dimension between two lines becomes a value; the first chain of dimensions reaching a line drives it; a dimension that closes a loop (e.g. earth cushion between formation and top of slab) becomes a RESULT. A width symmetric about the centre line is kept symmetric. Mirror-image dimensions of the same size share one value.
4. Callouts that state a thickness and point INTO it become values too: a leader "150TH. WEARING COURSE" whose arrow sits inside a 150 mm band; "HAUNCH 600 X 600mm" whose arrow sits on the 600 × 600 haunch edge (every haunch of that polyline then follows it, both legs).
5. make_parametric preview:true shows the plan: inputs, driving values, results, named callouts, notes that will follow their numbers, positions that follow at a fixed offset. Rename with rename:[{key, name}] (keys are listed), make a driving dimension a result with results:[key], name a fixed offset to make it a value.
6. make_parametric (without preview) replaces the drawing with one component. It is refused if any vertex would move — the component reproduces the drawing exactly.
7. Change values with set_component_values; write relationships with relationship (name = expression; levels in m, lengths in mm); add your own inputs with add_input.
8. To change the shape itself: edit_geometry turns it back into lines (names are kept on the dimensions); edit; make_parametric again with the same definition id keeps the relationships.`;

const LEVELS = `# Bridge levels and clearance checks

Levels are elevations in metres (RL). Draw them at y = RL × 1000 mm.
- Rail level = formation + track depth (BG ≈ 0.762 m) (RCR-LVL-006, HPC-LVL-008).
- Formation: top of embankment; free board F.B. = formation − HFL, ≥ 1.0 m for railway bridges (IRBM 313; relaxations need PCE/CBE approval).
- Soffit: underside of the superstructure/top slab; vertical clearance V.C. = soffit − HFL (IRBM 312, depends on discharge; culverts are exempt as pressure conduits).
- RCC box (railway): top of bottom slab = bed − wearing course; soffit = that + clear height; top of slab = soffit + top slab; cushion = formation − top of slab (RCR-GEO-004…007, RCR-LVL-002). Highway box: z_bot = bed − bottom slab (HWB-GEO-004), cushion = road − top − wearing coat (HWB-LVL-002).
- Hume pipe: pipe crown = bed + D + wall; cushion = formation − crown; barrel length = formation width + 4 × cushion (HPC-GEO-005…007).
- PSC slab deck: slab top = formation − wearing coat − camber; slab bottom = top − depth at support; HFL clearance = slab bottom − HFL ≥ 0.6 m, 1.5 m preferred (PSC-LVL-001/002/008).
- Composite girder: deck bottom = top − deck − wearing course; girder bottom = deck bottom − girder depth; clearance ≥ 1.0 m (CG-LVL-001/002/006).
Record every level you read in design_basis (INFERRED) and never call a check "compliant" — say "requires review".`;

const HUME_PIPE = `# Hume pipe culvert (railway) — section

Values: pipe internal diameter D (spanVal), number of pipes, wall thickness (default 180 mm), bed level, formation level, rail level, HFL, bedding (300), levelling course (150), rubble soling (300), formation width (7.85 m, split left/right).
Formulas: flow area = n × π × (D/2)² (HPC-GEO-004); pipe top = bed + D + wall (HPC-GEO-005); cushion = max(0, formation − pipe top) (HPC-GEO-006); barrel length = formation width + 4 × cushion (HPC-GEO-007); bedding bottom = bed − bedding; levelling bottom = that − levelling; soling bottom = that − soling (HPC-LVL-004…006); scour = bed − founding depth (1.75 m) if not given (HPC-LVL-001); face wall stem above GL = pipe top − bed + 150 (HPC-STR-003).
Checks: rail > formation > bed; HFL ≤ formation (HPC-VAL-001…003).
Draw: ir.pipe_culvert.section is a ready component for the pipes and cradle; for a full GAD view draw the headwall/face wall and levels by hand following gad-drafting-style, dimension, then make_parametric.`;

const PSC_SLAB = `# PSC slab bridge

Spans from RDSO standard list (3.05, 3.66, 4.57, 6.10, 9.15, 12.2, 18.3 m). Slab depth by span and type (post-tensioned / pretensioned / U-slab) from RDSO tables (PSC-SLAB-001/002); camber = depth at centre − depth at support (PSC-SLAB-003); minimum depth L/25, preferred max L/12 (PSC-SLAB-005/006); wearing coat 60 mm (80 for U-slab) (PSC-SLAB-007).
Levels: slab top = formation − wearing coat − camber; slab bottom = top − depth at support; bearing top = slab bottom − girder depth (0 for slabs); bearing bottom = − bearing height; cap bottom = − cap height (PSC-LVL-001…005). HFL clearance ≥ 0.6 m (1.5 m free board preferred) (PSC-LVL-008).
Pier cap width ≥ deck width + 2 × 0.608 m inspection path (PSC-GEO-004); pier shaft ≥ 1.2 m wide; bearing seat ≥ 300 mm.
Use ir.bridge.gad (multi-span elevation + plan + section, one set of values) for the GAD, then adjust.`;

const COMPOSITE = `# Composite girder bridge

Number of girders nG = floor(deck width / spacing), at least 2 (CG-GEO-003); bearings = (piers + 2) × nG (CG-GEO-004). Levels: deck bottom = top − deck − wearing course; girder bottom = deck bottom − girder depth; bearing top = girder bottom − bearing height; cap bottom = bearing − cap height; pier height = cap bottom − base (CG-LVL-001…005). Clearance girder bottom − HFL ≥ 1.0 m (CG-LVL-006). Girder depth ≥ span / 20 (CG-VAL-002).
Draw with ir.bridge.gad and a girder deck section (ir.girder_deck.section), or by hand + make_parametric.`;

const OWG = `# Open web girder (through truss)

Spans 30.5 – 106.7 m with 6–18 panels; panel length = span / panels (OWG-GEO-001); parabolic camber at panel i: 4 c r (1 − r), r = x / span (OWG-GEO-004); Warren crown for 14/18 panels (OWG-GEO-005/006); bearing gap 1060 mm (OWG-GEO-003). Truss height and member sizes come from RDSO/B-10022 tables by span — ask for them or record an assumption; never invent member sizes.
Draw the truss elevation by hand (top chord, bottom chord, verticals, diagonals as lines), repeat panels with copy/array, dimension panel length and height, make_parametric.`;

const HIGHWAY_BOX = `# RCC box culvert (highway)

Same geometry as railway (HWB-GEO-001…003) but levels differ: bottom of box = bed − bottom slab (no wearing course inside) (HWB-GEO-004); top = bed + cH + top slab (HWB-GEO-005); cushion = road − top − wearing coat (HWB-LVL-002); drawing extent = width + 2 × cushion (HWB-LVL-003). Minimum haunch 150 mm (HWB-VAL-007); road level ≥ top of box (HWB-VAL-008). Standards: IRC:SP:13.
Use ir.rcc_box.half_section for the drawing layout (set RailOverFormation 0 and read "formation" as road level), or draw by hand + make_parametric.`;

export const DRAFTING_SKILLS: DraftingSkill[] = [
  { name: "rcc-box-half-section", title: "RCC box culvert — half section & half elevation (railway GAD view)", when: "the brief or reference is an RCC box culvert / box bridge section, half section & half elevation, earth cushion over a box", body: RCC_HALF_SECTION },
  { name: "gad-drafting-style", title: "Indian Railways GAD drafting style", when: "any bridge or culvert drawing that must look like an IR GAD (levels, hatches, callouts, title)", body: GAD_STYLE },
  { name: "make-parametric", title: "Make a hand-drawn drawing parametric", when: "you drew geometry by hand and it must follow values; the person asks to parametrize their own drawing", body: MAKE_PARAMETRIC },
  { name: "bridge-levels", title: "Bridge levels and clearance checks", when: "levels, RLs, HFL, free board, vertical clearance, cushion or rail/formation are involved", body: LEVELS },
  { name: "hume-pipe-culvert", title: "Hume pipe culvert", when: "pipe culvert, hume pipe, NP4 pipes", body: HUME_PIPE },
  { name: "highway-rcc-box", title: "RCC box culvert (highway)", when: "a box culvert under a road (IRC)", body: HIGHWAY_BOX },
  { name: "psc-slab-bridge", title: "PSC slab bridge", when: "PSC / prestressed slab spans, RDSO standard slab spans", body: PSC_SLAB },
  { name: "composite-girder", title: "Composite girder bridge", when: "steel girders with an RCC deck", body: COMPOSITE },
  { name: "open-web-girder", title: "Open web girder (through truss)", when: "OWG, truss bridge, long spans", body: OWG },
];

export function findSkill(name: string): DraftingSkill | undefined {
  const n = name.trim().toLowerCase();
  return DRAFTING_SKILLS.find((s) => s.name === n) ?? DRAFTING_SKILLS.find((s) => s.name.includes(n) || s.title.toLowerCase().includes(n));
}

/** One line per skill, for the system prompt. */
export function skillsIndex(): string {
  return DRAFTING_SKILLS.map((s) => `- ${s.name}: ${s.title} — load when ${s.when}.`).join("\n");
}
