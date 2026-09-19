/**
 * Drafting skills: playbooks the agent loads when a job matches.
 *
 * The system prompt teaches the method; a skill teaches one kind of drawing —
 * what it contains, how Indian Railways drafters lay it out, which values
 * drive it, which formulas (docs/bridge-formulas ids) connect them and in what
 * order to construct it from primitives. No skill contains a drawing's
 * geometry: sizes always come from the brief or the reference. The agent has
 * no component library; every skill describes construction from scratch.
 * They are plain text on purpose: the agent reads them with `use_skill`, and a
 * person can read them here to see what the agent was told.
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

const DRAFTSMAN_METHOD = `# The draftsman's method — any structure

Do not make the drawing look correct first. Make the geometry correct first; then make the drawing look complete. The tools enforce this order.

## 1. Before any tool: what am I building, and how would a draftsman build it?
- What exactly am I asked to build? What type of structure is it? (plan.structure)
- Which views does it need — plan, elevation, section, details, key plan? (plan.views) They are one model: every view reads the same values.
- What are the controlling axes and levels? (datum features) Centre lines, the structure axis, and the level lines that everything hangs from.
- Which sizes drive the geometry, and which follow from them? (typed values vs formulas)
- Which of those sizes were actually GIVEN? Anything the design must supply and nobody gave is source "required": a placeholder, reported — never invented. You draft; you do not design.
- Which parts depend on which? (feature stage and after) What sequence would a real draftsman use, and which tool builds each part (construct, offset, mirror, repeat, boolean) instead of approximating it?

## 2. The sequence (stages, enforced)
1. datum — set out: centre line(s), structure axis, controlling level lines (long lines at their true height). Construction lines that should not plot go on layer construction.
2. primary — the main body from the datums. The defining space first (a clear opening, a deck profile), then the material around it by offsets (walls, slabs). Repeated parts from one pattern and a count value (construct repeat {count, index}, or transform copy).
3. detail — what attaches to the body: haunches, bedding and lean concrete, footings, headwalls, wing/return walls, curtain/drop walls, aprons, protection.
4. context — what the structure serves or sits in: ground/bed line, embankment, formation, ballast, track.
5. check_geometry — must pass before any annotation: checks hold, nothing collapses or inverts, every written number EXISTS in the geometry, every level has a line at its height, every value regenerates cleanly.
6. annotation — dimensions (controlling sizes first), level callouts on their lines, leaders, notes, hatching, section marks, titles.
7. verify (and compare_reference with a reference), correct at the cause, finish.

## 3. Geometry, mathematically
- Derive, do not type: OuterWidth = n × Span + 2 × Wall + (n − 1) × MidWall; SoffitY = InvertY + ClearHeight; TopY = SoffitY + TopSlab. If one value changes, every dependent face moves with it and nothing else does.
- Every face has a datum value (an X or a Y); outlines are built from datums, so they stay closed and square under any edit.
- A thickness is the distance between two faces (offset), never a separately guessed rectangle. A clear opening is inside face to inside face.
- A count is a value: CellCount drives a repeat; interior walls = CellCount − 1 (repeat with count "CellCount - 1").
- Skew is a rotation of the plan about the structure's centre by SkewAngle (transform rotate, angle an expression): the square span and the skew span are both geometry — dimension both.
- Relationships that must survive edits (a span longer than two haunches, a positive cushion) go in plan.constraints.

## 4. Dimensions come from geometry
Dimension only after check_geometry, between points of the geometry: a clear span inside-to-inside, a thickness across its member, an overall size outside-to-outside, a level difference between the two level lines. The number is measured, never typed; when the geometry changes the dimension changes. A dimension on exactly one value's two faces becomes that value's handle.

## 5. Annotation is presentation over correct geometry
Level callouts on their lines (RL read from the height), flow direction, structural labels, material notes, standard/RDSO references where the brief gives them, section markers, hatching, existing/proposed notation, title. Texts that state a value use its placeholder ({Span}, {Span:m}).

## 6. Learn the grammar, not the example
Axes establish position. Levels establish vertical relationships. Clear openings define internal space. Thicknesses are offsets. Repeats come from a pattern. Wings relate to the structure and the alignment. The track relates to the railway centre line and sits on the formation, above the structure. Dimensions describe the finished geometry; annotation explains it.`;

const RCC_BOX_CULVERT = `# RCC box culvert (railway) — built from its geometry

The simplest complete railway-bridge drawing: one closed concrete box with its clear opening, walls, slabs, invert, levels and wings. Slab, T-beam and larger bridges reuse the same grammar. Load draftsman-method first. Formula ids: bridge_reference id=RCR-GEO-001 etc.

## Inputs — from the brief/DBR/RDSO drawing, never invented
Cell count; clear span and clear height per cell; outer and interior wall thickness; top and bottom slab thickness; haunch (if shown); invert/bed level; rail, formation, HFL; skew angle; foundation/bedding thickness; wing/return wall type and length; cushion below sleeper. What the brief does not give is source "required" (placeholder, reported). IRBM: skew generally restricted to 30°; boxes are not normally used on a scour-prone bed; minimum clear span 1 m for new bridges — "requires review", never "compliant".

## Datums (stage datum)
Section: the structure centre line (x = 0) and the level lines — rail, formation, HFL, bed/invert, bottom of foundation — at y = RL × 1000. Plan: the railway centre line (track axis) and the structure axis (square, or rotated by SkewAngle), upstream/downstream faces, direction of increasing kilometrage.

## Values and relations (typical — follow what the brief actually gives)
- InvertY = BedLevel × 1000 (or bed − wearing course when a wearing course sits inside the cell: RCR-GEO-004…007).
- SoffitY = InvertY + ClearHeight; TopY = SoffitY + TopSlab; BaseY = InvertY − BottomSlab; bedding below BaseY.
- OuterWidth = CellCount × ClearSpan + 2 × Wall + (CellCount − 1) × MidWall (RCR-GEO-001); HalfWidth = OuterWidth / 2 with x = 0 at the centre.
- Cell k's inside faces (k = 0 … CellCount − 1): XIn = −HalfWidth + Wall + k × (ClearSpan + MidWall); XOut = XIn + ClearSpan.
- Checks: every written level against the chain (soffit, top of slab, bottom of box); overall width; cushion = formation − top of slab.

## Primary (stage primary)
1. The clear openings: one cell loop written with the index k (construct repeat {count: "CellCount", index: "k"}), haunches cut from its corners if shown.
2. The concrete around them: the outer outline (rect −HalfWidth … HalfWidth, BaseY … TopY). Outer minus openings is the walls and slabs — do not draw walls as separate guessed rectangles.
3. Top slab continuous over the cells unless the drawing says otherwise.

## Details and context (stages detail, context)
Bedding / lean concrete under the base slab; headwalls/face walls at inlet and outlet (plan and elevation); curtain/drop wall, apron, pitching, toe wall where the drawing requires; wing walls (splayed) or return walls (parallel), symmetric about the centre line unless the site is not; then formation, ballast/cushion and the track on top — the box and its levels come before the track.

## Progression (learn in this order)
Single-cell square box → multi-cell box (CellCount drives the repeat) → skew box (plan rotated by SkewAngle; square and skew spans both shown) → box with wings, curtain/drop walls and apron → slab culvert on abutments → multi-span slab → T-beam with bearings and diaphragms.

## Dimensions (after check_geometry), in this order
1 clear span of each cell (repeat the dimension with the cell's index); 2 clear height; 3 wall thicknesses; 4 slab thicknesses; 5 overall outer width and height; 6 foundation/bedding thickness; 7 wing wall lengths and splay; 8 chainage and length along the track; 9 skew angle; 10 distances from reference points.

## Levels and notes (annotation)
Rail, formation, HFL, bed/invert, soffit (if shown), bottom of foundation — callouts on their lines. Flow direction; bore-log/founding note; material grades, loading standard and RDSO drawing number only as the brief gives them; revision/approval block. Hatch concrete in section, earth/backfill behind walls.

## Worked check (from a brief, not a default)
3 cells, clear span 2000, walls 350: OuterWidth = 3 × 2000 + 4 × 350 = 7400. Change the span to 2500 and the walls stay 350: OuterWidth = 8900. That is the relation the construction must keep.`;

const RCC_BRIDGE_SEQUENCE = `# RCC slab / T-beam / multi-span bridge — drawing sequence

The same grammar as the box culvert, with more parts. Load draftsman-method first. Build in this order (datum → primary → detail → context → annotation):
1. datum: alignment, chainage, track centre line, flow direction, levels (rail, formation, HFL, bed, foundation); abutment and pier centre lines — setting-out before outlines.
2. primary: foundations (open footing, pile cap, well — as the design gives), abutments, piers, then the superstructure: RCC slab or T-beams/girders seated on them. Spans and pier positions from a span count and span length (repeat or copy along the alignment).
3. detail: bed blocks and bearings (deck seating depends on them), diaphragms, wing/return walls, weep holes after the wall outline (only if the drawing shows them), parapets, drainage.
4. context: deck, ballast, track; protection works and approaches.
5. annotation: dimensions, RL/HFL callouts, schedules, notes, title block.
IRBM classification (major / important), vertical clearance and free board are design matters: show the values the brief gives, cite them as "requires review", never invent them.`;

const RECONSTRUCTION = `# Reconstructing a GAD from a reference image — any structure

The goal: the same drawing, constructed from primitives, where every written number is measured back from your geometry and every line sits on the reference's line.

## 1. Inventory (plan.analysis)
Go region by region (left annotation column, structure, right side, below ground, titles) with zoom_reference — magnified, every number and text is read exactly — and list:
- parts: outlines, openings, layers, walls, slopes, foundations, piers, girders — what each IS;
- topology: what sits on what (a slab on walls, a layer under the box, a slope ending at a corner), what is inside what (cells inside the box), what touches (a wall face on a footing edge);
- views: which half is SECTION (cut: hatched, layers shown) and which ELEVATION (outside face; below ground hidden = dashed);
- symmetry: the centre line (℄) and what is mirrored about it; repeats (cells, spans, piles, steps);
- line types: continuous, hidden (dashed), centre (dash-dot), level lines;
- every written number: dimensions (with what they span), levels (label + RL), callouts with numbers ("600 mm. WELL HAND PACKED BOULDERS", "150 mm. PCC BASE COURSE", "HAUNCH 200 X 200", "SLOPE 2:1"), notes, titles, scale;
- for stacked layers, which band each callout's arrow tip sits in — that fixes their order (top to bottom);
- contradictions: two written numbers that cannot both hold (a dimension that disagrees with the levels it spans).

## 2. Mathematics (plan.values, plan.checks)
- Frame: x = 0 on the centre line; y = RL × 1000 (mm) when levels are written.
- Typed values: every number read, with a note saying where it is written. Levels in m (unit m), sizes in mm.
- Relations: derive the level chain and every face position (datums): e.g. FloorY = BedLevel*1000 − WearingCourse, SoffitY = FloorY + ClearHeight, TopY = SoffitY + TopSlab, BottomY = FloorY − BottomSlab, HalfWidth = n*ClearSpan/2 + … . Keep ONE source for each number: if a level is written AND follows from other written numbers, type the inputs and CHECK the level.
- Checks: every written number you did not type (F.B., clearances, levels that follow from the chain, overall widths). A failing check = a misread number, a wrong relation, or a contradiction on the reference — decide which, now.
- Unwritten sizes (a wall's length, where a slope stops, a coping's thickness): derive from written ratios where possible (a 2:1 slope spanning a known height has a known width); otherwise scale them from the image: construct the written structure first, call compare_reference with locate points to read image positions in model mm, then add them to the plan as values (note: "scaled from the reference").

## 3. Construction order (plan.features, each with its stage)
0. datum: the centre line (layer centre) and the level lines (layer centre or level, as the reference draws them) — long lines at their Y, starting and stopping where the reference does. Every level the reference writes needs its line before it can be called out.
1. primary: structure outline(s) and openings from datums (loops; mirror about the centre line; repeat or copy for repeated cells/spans).
2. detail: layers and bands (cushion, wearing course, PCC, fillings) as loops — rect or offset of an edge — each closed so it can be hatched.
3. context: ground/bed line (layer ground), embankment slopes (ratio from the text), boulder or pitching zones, return/wing walls, footings (hidden below ground on the elevation half).
4. check_geometry — it must pass before any annotation.
5. annotation: level callouts, dimensions (same rows and sides as the reference), leaders (tip inside the thing named, text on the shelf), hatches, texts, titles, direction arrows/station names if drawn.

## 3b. Layout
The annotation is part of the reproduction: level lines start and stop where the reference's do, level texts sit where its texts sit, callouts and titles in its places. Use compare_reference locate on their start points (one call, many points) and write those positions as values.

## 4. Verify and compare
- verify must pass: checks, geometry, features, every expected dimension measured, every level at its RL, texts present.
- compare_reference: two pairs you can point at precisely (outer corners of the main structure are best); later calls reuse the fit. Read "entities off the reference", LOOK at each (focus=<id>), and fix the cause (value, relation, face, extent). A level line or ground line drawn longer/shorter than the reference shows as off — match the reference's extents.
- Look at the overlay yourself: missing lines (grey reference with no blue on it) are features you did not construct.

## 5. Honesty
- Never draw something the reference does not show to satisfy a check; never drop an expected number because it is hard — only a genuine contradiction goes to expect.disputed, with the numbers that contradict it.
- In finish, list: values scaled from the image, disputed numbers, design data still needed.`;

const GAD_STYLE = `# Indian Railways GAD drafting style

The drawing is judged by an engineer who reads hundreds of these. It must look like one — and like the reference, when there is one: its layout wins over these defaults.

## Levels
- Every level is a long horizontal line at its true height (y = RL × 1000 in mm) with its callout written ON the line at its left end. annotate kind=level at the line's left end: the RL is READ from the point's height, never typed. format '{label} {rl}' writes "PROP. FORMATION LEVEL 59.913"; the default gad format writes "PROP. FORMATION LEVEL = 59.913M." — use whichever the reference uses.
- HFL: water layer, symbol water; bed level: symbol ground. "PROP." for proposed work, "EX." for existing. Stack callouts so no two texts touch; where a callout would collide, drop its text below and jog its line, as IR drafters do.

## Clearances written as dimensions
- F.B. (free board, formation − HFL) and V.C./C.L. (clearance, soffit − HFL) are vertical dimensions on the far left with the prefix in the text ("FB-2245", "V.C. 3400"): annotate kind=dimension prefix "FB-", layer water.

## Dimensions
- Clear span of each cell and wall thicknesses on ONE row inside the openings ("400 | 2180 | 350 | 2180 | 400").
- Slab thicknesses and clear height as short vertical dimensions beside the wall; clear height inside a cell.
- Numbers only, mm, no units; the number is measured from the geometry.

## Hatches (materials, on closed loops)
- Earth cushion / sand filling: sand stipple; PCC and wearing course: pcc; boulders: boulder; granular filling: granular or gravel; earth/embankment: earth; stone pitching on a slope: pitching with angle = slope angle; RCC in section: rcc (often left unhatched on culvert GADs — follow the reference).
- Only the SECTION half is hatched; the ELEVATION half shows outlines, and anything below ground there is hidden (dashed).

## Callouts
- Leaders with the text written ON the shelf (placement above), the arrow INSIDE the thing named: "HAUNCH 200 X 200", "600 mm. WELL HAND PACKED BOULDERS". Layer callouts stacked below the structure, one leader per layer.
- Boxed notes (e.g. "BACK FILL MATERIAL GW, GP, SW") are text with a rectangle constructed around it.

## Line types
- Structure outline continuous; hidden (below ground in elevation, behind the cut) dashed; centre line dash-dot with its title at the top ("℄ OF BR. No.: …"); level lines as the reference draws them.

## Title
- Under the view, centred and bold: e.g. "HALF SECTION / HALF ELEVATION AT (A-A)", then "SCALE 1:100". Text heights are paper mm (2.5 default; titles 5).

## Before finishing
- verify, compare_reference, and look at the overlay: every level called out, every member dimensioned once, every material hatched on the section half, every callout present, title present.`;

const RCC_HALF_SECTION = `# RCC box culvert — HALF SECTION & HALF ELEVATION (railway), constructed

Load reference-reconstruction and gad-drafting-style too. Formula ids are in the bridge reference (bridge_reference id=...).

## What the view contains
Section half: the box cut through (outer outline, cells with haunches), earth cushion over the top slab, wearing course on the bottom slab inside the cell, PCC base course and filling layers under the box (hatched), boulder backing against the outer wall, the embankment slope ending at the box, level lines and callouts, F.B. and clearance dimensions.
Elevation half: the box end face with the cell opening, everything below ground dashed, a small gap (e.g. 25 mm) then the return/wing wall with its coping following the slope, its footing below ground (dashed) with depth dimensions, the ground line.
Centre line ℄ between the halves; for a multi-cell box it runs through the middle of the intermediate wall.

## Values and relations (plan)
- Read: clear span per cell, clear height, outer wall, intermediate wall, top slab, bottom slab, haunch, wearing course, PCC, filling thicknesses, boulder thickness, cell count; levels: rail, formation, HFL, bed (plus any others written).
- Level chain (RCR-GEO-004…007, RCR-LVL-001/002): FloorY (top of bottom slab) = BedLevel*1000 − WearingCourse; SoffitY = FloorY + ClearHeight; TopY = SoffitY + TopSlab; BoxBottomY = FloorY − BottomSlab; foundation layers below (RCR-LVL-004/005); cushion = FormY − TopY (RCR-LVL-002) — a CHECK against the written cushion, not a typed value.
- Width (RCR-GEO-001): total = n × ClearSpan + (n − 1) × MidWall + 2 × Wall; with ℄ in the middle: HalfWidth = total / 2; a cell's faces from the centre: MidWall/2 … MidWall/2 + ClearSpan (two cells).
- Rail = formation + 0.762 (RCR-LVL-006) is a check when rail level is written.
- Checks from the drawing: F.B. = FormY − HflY; clearance = SoffitY − HflY; each written RL (top of slab, soffit, top of bottom slab, bottom of box, bottom of foundation) against the chain; the height inside the cell above the wearing course (clear height − wearing course).
- Limits (RCR-VAL-001…008) "require review" — mention, never "compliant".

## Construction
Stage by stage (draftsman-method): datums, then the box, then details and context, check_geometry, then annotation.
0. datum: ℄ (x = 0, layer centre) and the level lines (formation, rail, HFL, bed, foundation) at their Y.
1. BoxOuter: rect from −HalfWidth, BoxBottomY, width 2·HalfWidth, height TopY − BoxBottomY.
2. One cell as a loop of 8 points (haunch corners cut from the datums), mirror about x = 0 for the other (copy for more cells).
3. Layers: cushion (rect TopY…FormY), wearing course line at bed level inside the section-half cell with its zone (draw:false) hatched, PCC and filling rects under the box on the section half; on the elevation half the same edges dashed (hidden).
4. Embankment: slope line from formation down to the box corner at the written ratio; boulder zone against the outer wall (loop, its bottom cut by the slope); ground line at bed level each side.
5. Elevation side: gap, return wall outline (coping following the slope, flat end at its written RL), vertical lines at its kinks, footing below ground dashed, depth dimensions.
6. After check_geometry passes: level callouts on their lines, F.B./clearance dimensions, the dimension row across the cells, slab and height dimensions, callouts, hatches, ℄ with its title, the view title and scale.`;

const MAKE_PARAMETRIC = `# Make a free sketch parametric (sketch route only)

Your construction is parametric already — every coordinate is an expression of your plan values. This is for FREE sketch geometry (the sketch route, or a drawing a person drew by hand) that must follow values afterwards.

1. Draw at true levels (y = RL × 1000) if the drawing has levels; put the centre line at x = 0.
2. Classify the level lines (bed_level, HFL, formation_level, rail_level …) — site levels become inputs, in metres.
3. Dimension what should be changeable. The first chain of dimensions reaching a line drives it; a dimension closing a loop becomes a RESULT. A width symmetric about the centre line stays symmetric.
4. Callouts that state a thickness and point INTO it become values ("150TH. WEARING COURSE" inside a 150 band).
5. make_parametric preview:true shows the plan; rename keys; then make_parametric. Refused if any vertex would move.
6. relationship name = expression on the result (levels in m, lengths in mm); add_input for your own inputs; edit_geometry to change the shape, then make_parametric again.`;

const LEVELS = `# Bridge levels and clearance checks

Levels are elevations in metres (RL). Draw them at y = RL × 1000 mm.
- Rail level = formation + track depth (BG ≈ 0.762 m) (RCR-LVL-006, HPC-LVL-008).
- Formation: top of embankment; free board F.B. = formation − HFL, ≥ 1.0 m for railway bridges (IRBM 313; relaxations need PCE/CBE approval).
- Soffit: underside of the superstructure/top slab; vertical clearance V.C. = soffit − HFL (IRBM 312, depends on discharge; culverts are exempt as pressure conduits).
- RCC box (railway): top of bottom slab = bed − wearing course; soffit = that + clear height; top of slab = soffit + top slab; cushion = formation − top of slab (RCR-GEO-004…007, RCR-LVL-002). Highway box: z_bot = bed − bottom slab (HWB-GEO-004), cushion = road − top − wearing coat (HWB-LVL-002).
- Hume pipe: pipe crown = bed + D + wall; cushion = formation − crown; barrel length = formation width + 4 × cushion (HPC-GEO-005…007).
- PSC slab deck: slab top = formation − wearing coat − camber; slab bottom = top − depth at support; HFL clearance = slab bottom − HFL ≥ 0.6 m, 1.5 m preferred (PSC-LVL-001/002/008).
- Composite girder: deck bottom = top − deck − wearing course; girder bottom = deck bottom − girder depth; clearance ≥ 1.0 m (CG-LVL-001/002/006).
Write these as plan values/checks; record every level you read in design_basis (INFERRED); never call a check "compliant" — say "requires review".`;

const HUME_PIPE = `# Hume pipe culvert (railway) — section

Values: pipe internal diameter D, number of pipes, wall thickness, bed, formation, rail, HFL, bedding, levelling course, rubble soling, formation width.
Formulas: flow area = n × π × (D/2)² (HPC-GEO-004); pipe top = bed + D + wall (HPC-GEO-005); cushion = max(0, formation − pipe top) (HPC-GEO-006); barrel length = formation width + 4 × cushion (HPC-GEO-007); bedding bottom = bed − bedding; levelling bottom = that − levelling; soling bottom = that − soling (HPC-LVL-004…006); scour = bed − founding depth if not given (HPC-LVL-001); face wall stem above GL = pipe top − bed + 150 (HPC-STR-003).
Checks: rail > formation > bed; HFL ≤ formation (HPC-VAL-001…003).
Construct: pipes as circle pairs (inner D/2, outer D/2 + wall) centred at y = bed*1000 + D/2 (copy for more pipes at their spacing), the cradle/bedding as loops under them, face wall and wing walls as loops, levels and callouts per gad-drafting-style.`;

const PSC_SLAB = `# PSC slab bridge

Spans from the RDSO standard list; slab depth by span and type from RDSO tables (PSC-SLAB-001/002); camber = depth at centre − depth at support (PSC-SLAB-003); minimum depth L/25, preferred max L/12 (PSC-SLAB-005/006); wearing coat 60 mm (80 for U-slab) (PSC-SLAB-007).
Levels: slab top = formation − wearing coat − camber; slab bottom = top − depth at support; bearing top = slab bottom − girder depth (0 for slabs); bearing bottom = − bearing height; cap bottom = − cap height (PSC-LVL-001…005). HFL clearance ≥ 0.6 m (1.5 m free board preferred) (PSC-LVL-008).
Pier cap width ≥ deck width + 2 × 0.608 m inspection path (PSC-GEO-004); pier shaft ≥ 1.2 m wide; bearing seat ≥ 300 mm.
Construct the elevation: deck as a loop per span (copy along the spans), piers (cap, shaft with battered faces from the batter ratio, footing) as loops mirrored about each pier's centre line, abutments at the ends, levels and span dimensions below.`;

const COMPOSITE = `# Composite girder bridge

Number of girders nG = floor(deck width / spacing), at least 2 (CG-GEO-003); bearings = (piers + 2) × nG (CG-GEO-004). Levels: deck bottom = top − deck − wearing course; girder bottom = deck bottom − girder depth; bearing top = girder bottom − bearing height; cap bottom = bearing − cap height; pier height = cap bottom − base (CG-LVL-001…005). Clearance girder bottom − HFL ≥ 1.0 m (CG-LVL-006). Girder depth ≥ span / 20 (CG-VAL-002).
Construct the elevation (girders as loops per span, bearings as small rects, piers and abutments as loops) and the cross-section (deck slab loop, girders copied at their spacing, mirrored about the centre line).`;

const OWG = `# Open web girder (through truss)

Spans 30.5 – 106.7 m with 6–18 panels; panel length = span / panels (OWG-GEO-001); parabolic camber at panel i: 4 c r (1 − r), r = x / span (OWG-GEO-004); Warren crown for 14/18 panels (OWG-GEO-005/006); bearing gap 1060 mm (OWG-GEO-003). Truss height and member sizes come from RDSO/B-10022 tables by span — ask for them or record an assumption; never invent member sizes.
Construct the truss elevation: chords as polylines, one panel's verticals and diagonals as lines, copy them along the span (count = panels − 1, dx = PanelLength), mirror the diagonals about mid-span.`;

const HIGHWAY_BOX = `# RCC box culvert (highway)

Same geometry as railway (HWB-GEO-001…003) but levels differ: bottom of box = bed − bottom slab (no wearing course inside) (HWB-GEO-004); top = bed + cH + top slab (HWB-GEO-005); cushion = road − top − wearing coat (HWB-LVL-002); drawing extent = width + 2 × cushion (HWB-LVL-003). Minimum haunch 150 mm (HWB-VAL-007); road level ≥ top of box (HWB-VAL-008). Standards: IRC:SP:13.
Construct it as in rcc-box-half-section with these level relations and "road level" in place of formation.`;

export const DRAFTING_SKILLS: DraftingSkill[] = [
  { name: "draftsman-method", title: "The draftsman's method — geometry first, annotation last (any structure)", when: "always, before planning any drawing: what to build, how a draftsman builds it, which tools, what not to invent", body: DRAFTSMAN_METHOD },
  { name: "rcc-box-culvert", title: "RCC box culvert (railway) — built from its geometry: single, multi-cell, skew, wings", when: "an RCC box culvert from a brief or design data (section, plan, elevation), or learning the box grammar", body: RCC_BOX_CULVERT },
  { name: "rcc-bridge-sequence", title: "RCC slab / T-beam / multi-span bridge — drawing sequence", when: "slab culverts, slab bridges, T-beam and multi-span RCC bridges", body: RCC_BRIDGE_SEQUENCE },
  { name: "reference-reconstruction", title: "Reconstruct any GAD from a reference image, from scratch", when: "a reference drawing is attached, or the brief is to reproduce a GAD — any structure type", body: RECONSTRUCTION },
  { name: "rcc-box-half-section", title: "RCC box culvert — half section & half elevation (railway GAD view)", when: "the brief or reference is an RCC box culvert / box bridge section, half section & half elevation, earth cushion over a box", body: RCC_HALF_SECTION },
  { name: "gad-drafting-style", title: "Indian Railways GAD drafting style", when: "any bridge or culvert drawing that must look like an IR GAD (levels, hatches, callouts, title)", body: GAD_STYLE },
  { name: "make-parametric", title: "Make a free sketch parametric (sketch route)", when: "free sketch geometry (not your construction) must follow values; the person asks to parametrize their own drawing", body: MAKE_PARAMETRIC },
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
