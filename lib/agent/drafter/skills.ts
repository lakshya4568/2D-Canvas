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

const GEOMETRIC_REASONING = `# Geometric reasoning — slopes, angles, ratios, rotations

A position that follows from an angle, a slope, a ratio or a rotation is never a coordinate you worked out. Say what the relationship IS and let the engine write the coordinates: then the relationship is what the drawing holds, and changing the angle moves everything built on it.

## The relationships, and their inverses
    slope  = rise / run                 rise = run * slope
    angle  = atan2(rise, run)           run  = rise / tan(angle)
    rise   = length * sin(angle)        length = rise / sin(angle)
    run    = length * cos(angle)        length = hypot(rise, run)
    ratio  = part / whole               part = whole * ratio
Angles are DEGREES, counter-clockwise from +x, everywhere: sin, cos, tan, asin, acos, atan, atan2 all work in degrees. Also available: sqrt, hypot, pow, abs, min, max, round, floor, ceil, sign, if/gt/ge/lt/le, PI.

Gradients on drawings are written as ratios ("1 in 4", "2:1", "1V:1.5H") and must stay written that way: the value is the ratio the design gave, and the slope in an expression is "1 / BatterRun" or "Rise / Run" — never the decimal it happens to equal.

## Ask the engine, with derive
- point_at_angle (from, angle, distance) — the far end of a member of that length at that inclination. This is rise = L sin θ / run = L cos θ, written for you.
- point_at_slope (from, run, slope) — a batter or a fall stated as a ratio.
- along_line (a, b, distance or fraction, offset) — a point part-way along something, or parallel to it.
- intersection (a, b, c, d) — where two faces or two lines meet: a sloping wall against a footing, a batter against the ground line.
- perpendicular_foot / offset_point / offset_from_line — square to a face: the thickness of an inclined member, a point set out normal to a skewed axis.
- bisector (vertex, arm_a, arm_b, length) — a mitre where two faces meet at an angle.
- tangent_point, line_circle, circle_circle — where a straight runs into a curve, and where two curves meet.
- to_global / to_local (origin, angle, u, v) — set out in the structure's own axes ("1200 along the wall, 300 out from it") and get global coordinates. This is how skewed and splayed work is built: one frame, ordinary local sizes.
- mirror_point, rotate_point — symmetry and rotation of a single point (whole entities: transform mirror / rotate).
- distance, angle_of, slope_of, angle_between — read a relationship back OUT of the geometry, as an expression.
Two-answer constructions (a line cutting a circle) report both; say pick: first or second.

A "name" keeps the answer as a value of the drawing (a point becomes <Name>X and <Name>Y), so the relationship is visible in Author mode, can drive a dimension, and regenerates with everything else.

## Turn a relationship round, with solve
"What angle gives this rise over this length?" is the same relationship read backwards. solve rearranges it and keeps the REARRANGEMENT:
    solve for WingAngle, equations ["Rise = WingLength * sin(WingAngle)"]  ->  WingAngle = asin(Rise / WingLength)
Several equations with several unknowns are solved together by substitution. When no rearrangement exists — the unknown appears twice, or under a function with no inverse — give min and max and it is solved numerically; named, the equation itself is stored and the engine solves it again on every regeneration.

## The method, for any sloped or rotated geometry
1. Say the intent in words: "the return wall leaves the abutment face at the splay angle the design gives and runs until it meets the embankment slope".
2. Name what the design gave, with its source: the angle or the ratio is a value (given if the brief writes it, required if nobody gave it — never a number you liked the look of). Do not hardcode an angle, a splay or a batter in the geometry.
3. Choose the relationship that fixes each end: one end is usually a point you already built; the other is an angle plus a length, a slope plus a run, or an intersection with something else.
4. derive the point(s), name them, and construct from the names.
5. Check it: measure the edge (it reports length, direction and slope), and let check_geometry's ±5% sweep prove the dependent geometry really follows the angle. An end that does not move when the angle changes was typed, not derived.

## What this is not
It is not a wing-wall tool, a skew tool or a batter tool. A slope is a slope whether it belongs to a wing wall, a bracing member, an apron or a roof; the structure's own rules come from the brief, the design data or the reference — never from this skill.`

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

Then lay it out. A drawing whose labels sit on each other is not finished, however right the geometry is:
- layout_annotations reads the sheet as it will plot — real text boxes, real dimension lines, real arrowheads — and moves what is in the way: a dimension line out by whole rows of the standard spacing (so the rows still line up), a level callout to the other side of its point, a note or a leader's shelf by a few text heights. It reports what it could not place.
- It never moves the geometry, never changes what a dimension measures or where a leader points, and never shrinks the lettering: one text height, one dimension scale, one spacing, over the whole sheet. A label that cannot be placed needs shorter words, a leader instead of a note in the gap, or a different part of the drawing to describe — not smaller type.
- Lines crossing lines is ordinary drafting (every dimension chain crosses its neighbour's extension lines). Words crossed by anything, words on words, and leaders crossing each other are not.
- Run it after annotating, and again after any change to the annotation. finish runs it once more and refuses a drawing whose labels still overlap.

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

const SUBSTRUCTURE_PIERS_ABUTMENTS = `# Substructure — piers, abutments, wing walls, return walls and bed blocks

Drafting substructure elements from geometric primitives, engineering batters and Indian Railways standards (IRBM Para 605, IRS Substructure Code). Load draftsman-method and geometric-reasoning first. Formula ids: bridge_reference id=SUB-BAT-001 etc.

## 1. Controlling axes and datums (stage datum)
- Elevation & Section: Pier/abutment center line (x = 0 locally or at station chainage along alignment), bed level line, HFL, low water level (LWL), cap top level, bed block top level.
- Plan: Track center line, bridge transverse axis (square or skewed by SkewAngle), pier transverse axis, abutment face line.

## 2. Piers (mass concrete, hammerhead, framed/cellular)
- Batter: Pier shafts feature symmetrical face batters between 1:12 and 1:24 (typically 1:20 or 1:24; front and rear vertical or rounded cutwaters). Derive bottom width from top width, height, and batter ratio (SUB-BAT-001): BottomWidth = TopWidth + 2 * (Height * BatterSlope).
- Cutwaters / Starlings: Semi-circular (radius = HalfWidth) or triangular (included angle 60° to 90°) on upstream face to minimize afflux and hydrodynamic drag; downstream semi-circular or square (SUB-BAT-002).
- Pier Cap & Inspection Shelf: Sized to accommodate bearing assemblies, jacks for bearing replacement (SUB-BAT-003), and inspection walkways (minimum 600 mm clear on all sides, IRS Substructure Code). Cap depth tapered at ends or horizontal cantilever.

## 3. Abutments (gravity, spill-through, counterfort)
- Water face battered at 1:10 to 1:16 (SUB-ABT-001); rear (earth face) vertical or stepped. Front face offset from bridge center line by half clear opening.
- Ballast Wall (Dirt Wall): Sits at back of abutment cap up to formation level; minimum thickness 450 mm (SUB-ABT-002). Sized to retain track ballast and cushion while preventing soil spillage onto bearings.
- Inspection Shelf: Horizontal bench on cap front of ballast wall >= 600 mm wide for bearing maintenance (SUB-ABT-003).

## 4. Wing walls and return walls
- Splayed Wing Walls: Oriented at 30° to 45° to the track alignment to funnel stream discharge smoothly (SUB-WNG-001). Top follows embankment slope (typically 2:1 or 1.5:1) down to bed/ground level with a stepped or horizontal concrete coping.
- Return Walls: Parallel to track alignment; used where embankment height is high or site boundaries are constrained (SUB-RET-001).
- Movement Joints: 18 mm to 25 mm expansion joints with bitumen/polyethylene filler provided between abutment stem and wing walls.

## 5. Drainage and backing
- Boulder Backing: Continuous layer of hand-packed stone boulders, thickness >= 600 mm, placed along the entire rear face of abutment and wing walls (SUB-BCK-001; IRBM Para 605, IRS Substructure Cl. 7.5). Geotextile filter layer placed behind boulders.
- Weep Holes: 100 mm to 150 mm diameter PVC/AC pipes spaced at 1.0 m to 1.5 m staggered horizontal and vertical centers (SUB-DRN-001). Lowest row placed >= 250 mm above bed level / HFL with outward slope 1:20 for self-drainage.

## 6. Bed blocks (pedestals)
- Cast monolithic or doweled into cap under each bearing using high-strength concrete (M30/M35 minimum).
- Thickness 250 mm to 400 mm; horizontal edge distance from bearing base plate to bed block edge >= 150 mm on all 4 sides (SUB-BLK-001).

## 7. Construction sequence from primitives
1. datum: Pier/abutment center line, top of pier cap level line, bed level line, ground line.
2. primary: Pier/abutment shaft outline as closed loop from batter relations (derive corner points via point_at_slope); cap outline as loop with cantilevers; ballast wall rect on abutment.
3. detail: Bed blocks on cap; bearings (rects); weep holes (circles or dashed lines in section); 600 mm boulder backing band (loop) behind earth face.
4. context: Embankment slope ending at abutment/wings; stone pitching on wings.
5. annotation: Levels (cap, bed block, bed, ground), batter ratio text ("1:24"), member thicknesses, weep hole notes.`;

const FOUNDATIONS_WELL_PILE_OPEN = `# Foundations — open footings, well foundations (caissons) and pile groups

Drafting railway bridge substructure foundations from geometric primitives, scour depths and Indian Railways standards (IRBM Paras 316, 409, 417-432, IRS Foundation Code). Load draftsman-method first. Formula ids: bridge_reference id=FDN-OPN-001 etc.

## 1. Controlling axes and datums (stage datum)
- Foundation center line (aligned with pier/abutment axis).
- Level lines: Natural Ground Level (NGL), Bed Level, Low Water Level (LWL), Maximum Scour Level (MSL), Founding Level (bottom of foundation), Top of Well Cap / Pile Cap.

## 2. Open foundations (spread footings)
- Founding Depth: Must be taken >= 1.75 m below maximum scour level in erodible soil (FDN-OPN-001; IRBM Para 316(2)). In solid rock, founding depth >= 0.3 m into sound hard rock, or >= 1.5 m in soft/fissured rock.
- Footing Steps: Stepped concrete spread footing; offset between successive steps <= 1.5 * step thickness (typical 45° load spread). Sized to ensure base pressure <= Safe Bearing Capacity (SBC).
- Bed Protection: Where scour is prevented by flooring, drop/curtain walls provided upstream and downstream to depth = 1.25 * D_Lacey below bed (FDN-SHL-001).

## 3. Well foundations (caissons)
- Shapes: Circular (single dredge hole), Double-D (two dredge holes with intermediate web), or dumb-bell (FDN-WEL-001).
- Cutting Edge & Curb: Steel cutting edge angle (150x150x16 mm) anchored to RCC well curb. Curb inner angle 30° to 45° with vertical (FDN-WEL-002).
- Steining: Concrete shaft wall thickness t >= 1000 mm for railway bridges; empirical relation t = k * D_outer * sqrt(H) (FDN-WEL-003). Outer face vertical; inner face stepped or vertical.
- Bottom Plug: Mass concrete (M15) poured underwater via tremie pipe; thickness 0.5 to 0.75 * inner well diameter (FDN-WEL-004).
- Sand Hearting & Top Plug: Clean sand filled above bottom plug; top plug 300 mm to 500 mm thick M15 concrete at top of steining.
- Well Cap: Heavy RCC slab (thickness >= 1000 mm to 1500 mm) spanning across steining; bottom placed >= 300 mm above LWL (FDN-WEL-005). Sinking tolerances: tilt <= 1:100 (1%), shift <= D/40 or 150 mm.

## 4. Pile foundations
- Piles: Bored cast-in-situ RCC piles (standard diameters 1000 mm, 1200 mm, 1500 mm; FDN-PIL-001).
- Spacing (IRBM Para 409): Minimum center-to-center spacing 2.5 * d for end-bearing piles, 3.0 * d for friction piles, 2.0 * d for driven piles in loose soil (FDN-PIL-002). Maximum spacing <= 4.0 * d.
- Pile Cap: Monolithic RCC block connecting pile tops; minimum thickness >= 1.5 * d or governed by shear/punching calculations. Clear overhang from outer pile face to cap edge >= 150 mm to 250 mm. Pile embedment into cap >= 75 mm to 100 mm.

## 5. Construction sequence from primitives
1. datum: Structure vertical center line, founding level line, scour level line, ground/bed line.
2. primary: Footing or well/pile cap outline as closed rectangle or stepped loop; piles as vertical paired lines (shafts) with semi-circular tips; well steining as vertical outer and inner boundaries with triangular curb.
3. detail: Well plugs (bottom plug, sand hearting stipple, top plug); pile cap reinforcement embedment; drop walls and apron flooring.
4. context: Ground and bed hatching, scour line (dashed), boulder backing / riprap.
5. annotation: Founding level RL, scour level RL, pile diameter & spacing dimension chains, steining thickness callouts, title.`;

const SEISMIC_DETAILING_BEARINGS = `# Seismic detailing, elastomeric/POT bearings and restrainers (RDSO BS-118)

Seismic analysis parameters, minimum seating shelf widths, bearing details, and unseating prevention rules in accordance with RDSO Comprehensive Guidelines for Seismic Design of Railway Bridges (BS-118). Load draftsman-method and bridge-levels first. Formula ids: bridge_reference id=SEI-COE-001 etc.

## 1. Seismic parameters & zone factors (RDSO BS-118)
- Design Horizontal Seismic Coefficient: A_h = (Z / 2) * I * (Sa_g) (SEI-COE-001).
- Seismic Zone Factor Z: Zone II = 0.10, Zone III = 0.16, Zone IV = 0.24, Zone V = 0.36.
- Importance Factor I: 1.5 for Category I (Important / Major bridges); 1.25 for Category II; 1.0 for others.
- Exemption: Under RDSO BS-118 Clause 4.4, buried culverts and pipe culverts are completely soil-embedded and exempt from seismic force calculations (SEI-COE-002).

## 2. Minimum bridge seat width (unseating prevention)
To prevent span dislodgement during strong earthquake ground motion, pier and abutment caps must provide minimum seating shelf width W_seat measured normal to face of support (RDSO BS-118 Clause 14.3; SEI-SEAT-001):
- Zones II and III: W_seat >= 300 + 1.5 * L + 6.0 * H_p (mm)
- Zones IV and V:   W_seat >= 500 + 2.5 * L + 10.0 * H_p (mm)
where:
  L = span length in meters (average of adjacent spans for continuous/skew bridges)
  H_p = height of pier in meters from base of column/stem to cap top (H_p = 0 for abutments).

## 3. Bearings and pedestals
- Types: Elastomeric bearings (shore hardness 60 IRHD) for spans up to 25-30 m; POT-PTFE / spherical bearings for longer spans or high seismic rotations (SEI-BEAR-001).
- Bed Block / Pedestal Clearance: Pedestal plan size must extend at least 150 mm beyond outer edge of bearing base plate in all directions (SUB-BLK-001).
- Jacking Clearances: Clear gap >= 150 mm to 200 mm maintained between bearing pedestal and edge of cap to permit placement of hydraulic lifting jacks during maintenance (SUB-BAT-003).

## 4. Seismic restrainers & shear keys
- Lateral Restrainers (Shear Keys): Concrete upstands or structural steel shear keys cast on the cap between girders (gap 20 mm to 25 mm with rubber bumper pads) to prevent transverse walk-off under cross-track seismic acceleration. Design force: F_restrainer = 1.5 * A_h * W_trib (SEI-REST-001).
- Separation Clearance: Expansion joint clearance clearance_joint >= sqrt(Delta_1^2 + Delta_2^2) to prevent pounding (SEI-SEP-001).

## 5. Construction and drafting sequence
1. datum: Pier/abutment axis, cap top level line, bearing center lines.
2. primary: Pier cap outline with extended seating shelf meeting minimum W_seat requirement; bed block pedestals on cap.
3. detail: Bearings drawn as layered rectangular pads (steel plates + elastomer); shear keys / stoppers on cap; jacking pedestal positions.
4. annotation: Seating width dimension W_seat, bearing center-to-edge clearances, seismic zone notation ("SEISMIC ZONE IV, Z=0.24, I=1.5"), restrainer details.`;

const RIVER_TRAINING_PROTECTION = `# River training and protection works — guide bunds, aprons, spurs and pitching (IRBM Chapter VIII)

Drafting river training, guide bunds, launching aprons, boulder pitching, and scour protection works in accordance with IRBM-2024 Chapter VIII and IRS Substructure Code. Load draftsman-method and geometric-reasoning first. Formula ids: bridge_reference id=RTW-GB-001 etc.

## 1. Controlling axes and datums (stage datum)
- River flow direction arrow, bridge center line, high flood level (HFL), low water level (LWL), bed level, maximum scour level (MSL).
- Guide bund setting-out lines: bridge axis, straight shank alignment, curved mole head centers and radii.

## 2. Guide bunds (Bell's bunds)
- Geometry (IRBM Para 810; RTW-GB-001):
  * Upstream shank length: L_u = 1.0 * L to 1.5 * L (where L is the linear waterway between abutments).
  * Downstream shank length: L_d = 0.20 * L to 0.40 * L.
  * Upstream curved mole head: Radius R_u = 0.40 * L to 0.50 * L (typical 0.45 * L); sweep angle 120° to 145° (RTW-GB-002).
  * Downstream curved mole head: Radius R_d = 0.20 * L to 0.30 * L; sweep angle 60° to 90°.
- Embankment Cross-Section (RTW-GB-003):
  * Top width >= 6.0 m to allow vehicular/inspection access.
  * Freeboard >= 1.5 m to 2.0 m above design HFL including afflux and wave wash.
  * Water-side slope 2:1 (H:V); rear-side slope 2:1 to 1.5:1.

## 3. Launching aprons
- Design Principle: Horizontal bed of stone boulders laid at low water level along the toe of the bund or abutment. When scour deepens during high floods, the apron launches down the scour hole to form a continuous pitched protective crust at slope 2:1 to 1.5:1 (RTW-APR-001).
- Dimensions:
  * Apron width: W_apron = 1.5 * D_scour (where D_scour = MSL scour depth below low water level/bed).
  * Thickness: Trapeze or rectangular section; laid thickness t_apron = 1.5 * T_pitched to 2.25 * T_pitched (typical 0.9 m to 1.5 m at toe, tapering inward).
  * Toe trench: Excavated 0.5 m to 1.0 m below bed level at outer end to prevent stone displacement.

## 4. Stone pitching and filter media
- Pitching Thickness: Quarry stone or precast concrete blocks, thickness 300 mm to 600 mm on slope face (RTW-FLR-001).
- Filter Layer: Graded gravel/sand filter or non-woven geotextile membrane placed under stone pitching (thickness 150 mm to 200 mm) to prevent soil suction by wave wash.
- Boulder Crates: Wire netting crates (galvanized iron wire 4.0 mm dia, mesh 100x100 mm) filled with boulders where flow velocity V > 3.0 m/s (RTW-CRT-001, RTW-CRT-002).

## 5. Spurs and groynes
- Orientation: Repelling spurs (inclined upstream 60° to 70° to flow), deflecting spurs (perpendicular 90°), or attracting spurs (inclined downstream 60°); RTW-SPUR-001.
- Spacing: Longitudinal spacing along bank = 2.0 to 2.5 times spur length.

## 6. Construction and drafting sequence
1. datum: Center line, HFL line, bed level line, guide bund alignment.
2. primary: Guide bund embankment trapezoid; curved mole head arcs (derive centers from sweep angle and radius).
3. detail: Launching apron rectangle at toe; filter layer band; stone pitching layer along slope.
4. annotation: Flow direction arrow, HFL/LWL/bed level callouts, apron width and thickness dimensions, mole head radii notes.`;

const SKEW_BRIDGE_DRAFTING = `# Skew bridge drafting — composite girders, diaphragms, square vs skew geometry (RDSO/B-11778/14 & 15)

Drafting skew railway bridges and composite girder Road Over Bridges (ROBs) from geometry, RDSO standard drawings (RDSO/B-11778/14 & 15), and Indian Railways specifications. Load draftsman-method and geometric-reasoning first. Formula ids: bridge_reference id=SKW-GEO-001 etc.

## 1. Controlling axes and datums (stage datum)
- Alignment Axis: Railway track center line (for underbridges) or road center line (for ROBs).
- Support Line: Pier / abutment center line inclined at skew angle SkewAngle (theta) relative to square normal.
- Skew Angle Convention: Skew angle theta is the deviation from square (0° = square bridge, 30° = 30° skew). IRBM limits skew to 30° generally; angles > 30° require special RDSO sanction (SKW-GEO-001).

## 2. Square vs. skew span relationships
- Longitudinal Span: L_skew = L_square / cos(theta) (SKW-GEO-001).
- Girder Longitudinal Shift (Stagger): Adjacent girders spaced at distance W_spacing are shifted longitudinally by S_shift = W_spacing * tan(theta) (SKW-SFT-001).
- Total End Stagger: Across n girders, total longitudinal stagger between first and last girder is (n - 1) * W_spacing * tan(theta).

## 3. RDSO/B-11778 Diaphragm & cross-frame orientation rule
- Intermediate Diaphragms:
  * When skew angle theta > 20°: Intermediate diaphragms and cross-frames MUST be oriented strictly PERPENDICULAR (90°) to the main girder webs (SKW-DPH-001; RDSO/B-11778/14 Note 4). This eliminates destructive out-of-plane torsional warping and transverse slab bending.
  * When theta <= 20°: Intermediate diaphragms may follow the skew alignment or be perpendicular.
- End Diaphragms: End diaphragms / cross frames at supports MUST be placed along the skew support line directly above bearings to transfer lateral earthquake and wind reactions into the bed blocks (SKW-DPH-001).

## 4. Lateral bracing & deck detailing
- Bottom Lateral Bracing: Triangulated K-bracing or X-bracing between bottom flanges of girders, placed perpendicular to girders in bays between intermediate diaphragms (SKW-BRC-001).
- Acute Corner Detailing: At acute corners of skew slabs, high negative moments and upward bearing lift occur. The slab corner is stiffened with heavy edge beam kerbs and fan-shaped reinforcement (SKW-STF-001).
- Skew Slab Detailing: Transverse reinforcement placed parallel to skew support lines or perpendicular to girders (SKW-SLB-001).
- Girder Numbering: Girders numbered G1, G2, ... Gn from left to right looking in the direction of increasing chainage (GAD-GRD-001).

## 5. Construction and drafting sequence
1. datum: Road/track center line, skew support lines (derive via rotate_point or point_at_angle with SkewAngle).
2. primary: Main girders drawn as parallel lines at spacing W_spacing, each shifted by S_shift along its axis; pier and abutment caps aligned with skew support lines.
3. detail: End diaphragms along skew lines; intermediate cross-frames strictly square (90°) to girder webs; bottom bracing triangulation; elastomeric/POT bearings at girder-support intersections.
4. context: Skew deck slab outline with cantilever overhanging outer girders; acute corner chamfers/kerbs.
5. annotation: Skew angle dimension (arc), square span dimension, skew span dimension, girder spacing chain, girder stagger dimensions, and RDSO B-11778 notes.`;

const GAD_ASSEMBLY_WORKFLOW = `# GAD assembly workflow — multi-view arrangement, sheet composition, checklists & approval (IRBM / RDSO)

Assembling complete Indian Railways General Arrangement Drawings (GADs) with multi-view layout, standard numbering, levels, plaques, notes and codal compliance checks. Load draftsman-method and gad-drafting-style first. Formula ids: bridge_reference id=GAD-NUM-001 etc.

## 1. Standard sheet composition and views (IRBM Para 402, RDSO Checklist)
A complete railway bridge GAD sheet (standard A0 or A1, 20 mm binding margin on left, 10 mm on other edges) organizes views coherently:
1. Elevation / Longitudinal Section (top left to center): Overall elevation showing all spans, piers, abutments, ground line, HFL, rail level, formation level, and clearance dimensions (V.C., F.B.; GAD-VCL-001, GAD-FBD-001).
2. General Plan (bottom left to center): Alignment, span lengths, skew angle, pier/abutment shapes, wing walls, river flow direction, north arrow, and track center lines.
3. Cross Section(s) (top or middle right): Transverse section through deck, girders, bearings, pier cap, ballast, and track structure.
4. Foundation Details & Soil Bore Log (bottom center to right): Subsurface strata profiles, standard penetration test (SPT) values, founding levels, and scour levels.
5. Technical Data Table & General Notes (above title block): Hydraulic data, loading standards, materials, seismic zone, allowable bearing pressures.
6. Title Block (bottom right corner, 185 mm x 65 mm min per IS:962): Railway zone, division, bridge number, chainage, sanctioned work name, drawing number, signature blocks.

## 2. Numbering convention (increasing kilometrage)
- Numbering follows the direction of increasing chainage (kilometrage; GAD-NUM-001):
  * Abutments: A1 at starting (lower) km; A2 at ending (higher) km.
  * Piers: Numbered sequentially P1, P2, P3 ... from A1 towards A2.
  * Spans: Span 1 (between A1 and P1), Span 2 (between P1 and P2), etc.
  * Girders: Numbered G1, G2, ... Gn from left to right looking in the direction of increasing km (GAD-GRD-001).
  * Tracks: Up Line / Down Line designated per railway timetable convention with direction arrows.

## 3. Essential markings, levels and inscription plaques
- High Flood Level (HFL): Marked on pier/abutment water face by a 50 mm wide white band with "H.F.L." and RL inscribed.
- Danger Level (DL): Marked on pier face with a 50 mm wide red band on a 100 mm white background, 600 mm long, with "D.L." inscribed in red (IRBM Para 703; GAD-HFL-001).
- Inscription Plaques (IRBM Para 704; GAD-PLQ-001):
  * Name Plaque: Bridge No., Year of Construction, Span Configuration (e.g. "BR. NO. 42 / 2 x 18.3m + 1 x 30.5m / 2026").
  * Foundation Plaque: Placed on each pier/abutment showing Founding RL, Scour RL, and Date of sinking/founding.

## 4. Codal checklists & approval gates (RDSO GAD Checklist B-12 / C-11)
- Hydraulic Verification: Linear waterway >= Lacey's Regime Waterway (W = 4.8 * sqrt(Q)); vertical clearance meets IRBM Table 312 for design discharge Q (GAD-VCL-001); freeboard >= 1000 mm (IRBM Para 313; GAD-FBD-001).
- Seismic Verification: Minimum seating shelf width verified against RDSO BS-118 Clause 14.3 (SEI-SEAT-001).
- Approval Authorities (IRBM Para 317):
  * Open Line: Approved by Chief Bridge Engineer (CBE) of the Zonal Railway.
  * Construction / Doubling: Approved by CE/Construction; where vertical clearance is inadequate or existing waterways are affected, CBE approval is mandatory.
- Drawing Status: DRAFT -> PENDING_CONFIRMATION -> APPROVED. Unsigned signature boxes or open blocker findings prevent issue.`;

export const DRAFTING_SKILLS: DraftingSkill[] = [
  { name: "draftsman-method", title: "The draftsman's method — geometry first, annotation last (any structure)", when: "always, before planning any drawing: what to build, how a draftsman builds it, which tools, what not to invent", body: DRAFTSMAN_METHOD },
  { name: "geometric-reasoning", title: "Geometric reasoning — slopes, ratios, angles, rotations and the relationships between them", when: "anything sloped, splayed, skewed, rotated, tangent or set out at an angle: wing and return walls, batters, aprons, bracing, girder profiles — and whenever a position follows from a relationship rather than from a written coordinate", body: GEOMETRIC_REASONING },
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
  { name: "substructure-piers-abutments", title: "Substructure — piers, abutments, wing walls, return walls and bed blocks", when: "piers, abutments, wing walls, return walls, bed blocks, weep holes, boulder backing, or substructure drafting", body: SUBSTRUCTURE_PIERS_ABUTMENTS },
  { name: "foundations-well-pile-open", title: "Foundations — open footings, well foundations (caissons) and pile groups", when: "open foundations, footings, well foundations, caissons, bored cast-in-situ piles, driven piles, pile caps, drop walls, or bed protection", body: FOUNDATIONS_WELL_PILE_OPEN },
  { name: "seismic-detailing-bearings", title: "Seismic detailing, elastomeric/POT bearings and restrainers (RDSO BS-118)", when: "seismic design, earthquake analysis, elastomeric bearings, POT-PTFE bearings, seismic restrainers, unseating prevention, Zone II/III/IV/V, or RDSO BS-118", body: SEISMIC_DETAILING_BEARINGS },
  { name: "river-training-protection", title: "River training and protection works — guide bunds, aprons, spurs and pitching (IRBM Chapter VIII)", when: "river training, guide bunds, launching aprons, boulder pitching, spurs, groynes, scour protection, or slope pitching", body: RIVER_TRAINING_PROTECTION },
  { name: "skew-bridge-drafting", title: "Skew bridge drafting — composite girders, diaphragms, square vs skew geometry (RDSO/B-11778/14 & 15)", when: "skew bridge, skew angle, composite girder ROB, intermediate diaphragms, cross frames, end diaphragms, RDSO B-11778, or skew layout", body: SKEW_BRIDGE_DRAFTING },
  { name: "gad-assembly-workflow", title: "GAD assembly workflow — multi-view arrangement, sheet composition, checklists & approval (IRBM / RDSO)", when: "assembling a full General Arrangement Drawing (GAD), multi-view sheet, title block, indexing, numbering convention, RDSO GAD checklist, or drawing submission", body: GAD_ASSEMBLY_WORKFLOW },
];

export function findSkill(name: string): DraftingSkill | undefined {
  const n = name.trim().toLowerCase();
  return DRAFTING_SKILLS.find((s) => s.name === n) ?? DRAFTING_SKILLS.find((s) => s.name.includes(n) || s.title.toLowerCase().includes(n));
}

/** One line per skill, for the system prompt. */
export function skillsIndex(): string {
  return DRAFTING_SKILLS.map((s) => `- ${s.name}: ${s.title} — load when ${s.when}.`).join("\n");
}
