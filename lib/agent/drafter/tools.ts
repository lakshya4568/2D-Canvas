/**
 * The agent's tools: what the model can call, and what each call does.
 *
 * Every tool returns a short paragraph the model reads next turn. They are
 * written to be ACTED ON — a refusal says what would have worked, a check says
 * what to fix — because the loop only improves the drawing if the model can
 * tell from the text alone what to do next.
 *
 * Tools fall into the stages of the job, and the loop reports them that way:
 *
 *     observe    look, view, check, flex_test, suggestions, calculate, research
 *     draw       draw_*, chamfer, offset, trim, split, move, copy, mirror,
 *                rotate, delete, explode, rename
 *     constrain  rule, auto_rules, remove_rule, unit, repeat, accept_suggestion
 *     parametrize dimension, formula, set_value, describe_value, rename_value
 *     meta       define_tool, finish
 */

import type { FunctionDeclaration } from "../../ai/geminiChat";
import { DraftingWorkspace, ToolError, fmt, MacroDefinition, Pt, signedArea } from "./workspace";
import { renderScene, RenderScene } from "./render";
import type { IntentAction } from "../../upce/completion";
import type { AuthoringSketch } from "../../upce/types";
import { regenerate } from "../../upce/document";
import { findProfiles, profileLoopIds, containment, closedLoops, overlappingCircles } from "../../upce/profile";
import { findOffsets } from "../../upce/completion";
import { dependentsOf } from "../../upce/parameters";
import { CAD_TOOLS, CAD_TOOL_NAMES, componentsSummary, dispatchCadTool } from "./cadTools";
import {
  PRIMITIVE_LAYERS,
  annotateConstruction,
  booleanOp,
  construct,
  constructionEvaluation,
  describeConstruction,
  measure,
  planScope,
  recordPlan,
  removeEntities,
  transform,
  verifyConstruction,
  evalPointArg,
  currentDefinition,
} from "./construction";
import { decodePng, deviations, distanceMap, inkMask, refineRegistration, registrationFromPairs, samplePolyline, toImage, type Registration } from "./reference";
import { renderOverlay } from "./render";
import { annotationPrims } from "../../cad/annotationPrims";
import { indexShapes } from "../../cad/geometry";
import { evaluateInstance } from "../../cad/document";
import { runAudit } from "../../bridge/audit";

function runAuditFor(ws: DraftingWorkspace): string {
  const r = runAudit(ws.allShapes(), ws.cad);
  return `${r.counts.blocker} blocker, ${r.counts.error} error, ${r.counts.warning} warning — ${r.issueBlocked ? "not ready to issue (report these to the author)" : "no blocking findings"}.`;
}

export type ToolStage = "observe" | "draw" | "constrain" | "parametrize" | "meta";

export interface ToolOutcome {
  ok: boolean;
  text: string;
  stage: ToolStage;
  /** The drawing changed; the UI should redraw. */
  mutated: boolean;
  image?: { mimeType: string; data: string };
  /** Further images after `image` (several zoomed regions at once). */
  images?: { mimeType: string; data: string }[];
  finished?: boolean;
  sources?: { title: string; uri: string }[];
}

/** What the tools need from the loop that is not the drawing itself. */
export interface ToolContext {
  ws: DraftingWorkspace;
  /** Set when the author attached a reference; `finish` then insists on a look. */
  hasReference: boolean;
  viewedRevision: number;
  suggestions: { revision: number; byId: Map<string, IntentAction> };
  research?: (question: string) => Promise<{ text: string; sources: { title: string; uri: string }[] }>;
  macroDepth: number;
  /** The reference images the author attached (compare_reference reads them). */
  references?: { data: string; mimeType: string }[];
  /** Decoded reference and its distance map, built once. */
  referenceCache?: { index: number; width: number; height: number; rgba: Uint8Array; dist: Float32Array };
  /** The last fitted registration (model → reference pixels), reused when no pairs are given. */
  lastFit?: { index: number; reg: Registration };
  /** The last comparison with the reference: when, how much agreed, and what did not. */
  lastCompare?: { revision: number; onShare: number; parts?: Record<string, { onShare: number; samples: number }>; off: { id: string; onInk: number; mean: number }[] };
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });
const B = (description: string) => ({ type: "boolean", description });
const XY = (description: string) => ({ type: "array", items: { type: "number" }, description: `${description} [x, y] in mm, Y up.` });
const LIST = (description: string) => ({ type: "array", items: { type: "string" }, description });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

const REF_HELP =
  "Points: Line.start, Line.end, Rect.top_left/top_right/bottom_left/bottom_right, Circle.center, Poly.p3, or an existing point as \"(x, y)\". Edges: a line id, Rect.top/right/bottom/left, Poly.e3 (same as Poly_3).";

const EXPR_XY = (description: string) => ({ type: "array", items: { type: "string" }, description: `${description} [x, y]: numbers or expressions of plan values and entity points, e.g. ["-HalfWidth", "Soffit * 1000"] or ["Box.p2.x", "Box.p2.y + 200"].` });
const EXPR = (description: string) => ({ type: "string", description: `${description} — a number or an expression of plan values.` });

/** Planning, construction and verification: the from-scratch route for a GAD or any reference drawing. */
export const CONSTRUCTION_TOOLS: FunctionDeclaration[] = [
  {
    name: "plan",
    description:
      "MANDATORY FIRST STEP — nothing can be drawn before a plan. Record your analysis of the reference/brief and the mathematics of the drawing: " +
      "values = every number you read (typed, e.g. ClearSpan = 2180, FormationLevel = 59.913 m) and every relation between them (expressions the ENGINE evaluates, e.g. TopOfSlab = FormationLevel - Cushion / 1000, HalfWidth = (2 * ClearSpan + MidWall) / 2 + Wall); " +
      "checks = numbers the reference ALSO writes, recomputed from your values (e.g. label 'F.B.', expr '(FormationLevel - HFL) * 1000', expect 2245) — they expose misread numbers before you draw; " +
      "features = the parts you will construct and how (primitives, order, which values); expect = every dimension number, level and text the reference writes, which verify later measures back from your geometry. " +
      "Revise with update:true, sending ONLY what changes (values/checks/features replace those of the same name; remove drops names; an expect list given replaces that list) — entities already constructed must still evaluate. route construction (default) builds with construct; route sketch only for one small profile to constrain with rules.",
    parameters: obj(
      {
        update: B("Revise the current plan: send only the values, checks, features or expect lists that change"),
        remove: LIST("With update: value names, check labels or feature names to drop"),
        route: { type: "string", enum: ["construction", "sketch"], description: "construction for a GAD / any reference drawing; sketch for one small constrained profile" },
        title: S("Drawing title, e.g. HALF SECTION / HALF ELEVATION AT (A-A)"),
        analysis: S("What the reference shows: every part and what it is, topology (what sits on/inside what), section vs elevation halves, symmetry and centre line, line types (hidden, centre), materials/hatches, and inconsistencies you noticed between written numbers"),
        frame: S("Origin and axes, e.g. 'x = 0 on the bridge centre line, y = RL × 1000 (mm)'"),
        scale: N("Drawing scale 1:n as written on the reference (100 for SCALE 1:100)"),
        values: {
          type: "array",
          description: "Named values in dependency order or any order: read ones as numbers, derived ones as expressions of others",
          items: obj(
            {
              name: S("PascalCase name, e.g. ClearSpan, FormationLevel, HalfWidth, SoffitY"),
              expr: S("A number (read from the reference) or an expression of other values"),
              unit: { type: "string", enum: ["mm", "m", "deg", "-"], description: "mm for sizes and coordinates, m for levels (RL)" },
              note: S("Where it comes from, e.g. 'written: PROP. SOFFIT LEVEL 59.258'"),
            },
            ["name", "expr", "unit"]
          ),
        },
        checks: {
          type: "array",
          description: "Cross-checks: a number the reference writes, recomputed from your values",
          items: obj({ label: S("What it is"), expr: S("Expression of plan values"), expect: N("The number the reference writes"), unit: { type: "string", enum: ["mm", "m", "deg", "-"], description: "Unit of expect" } }, ["label", "expr", "expect"]),
        },
        constraints: {
          type: "array",
          description: "Inequalities the drawing must keep through every later edit (e.g. a span longer than two haunches, a cover at least 75): an edit breaking one is refused whole",
          items: obj({ label: S("What it protects"), expr: S("Expression of plan values"), op: { type: "string", enum: [">", ">=", "<", "<="], description: "Comparison" }, than: S("Number or expression") }, ["label", "expr", "op", "than"]),
        },
        features: {
          type: "array",
          description: "The construction plan: logical parts in build order",
          items: obj({ name: S("Feature name, e.g. BoxSection, Levels, ReturnWall, Foundation, Annotation"), description: S("What it is on the reference"), construction: S("How: which primitives/tools from which values") }, ["name", "description"]),
        },
        expect: obj({
          dimensions: { type: "array", items: { type: "number" }, description: "Every dimension number written on the reference, in mm, repeats included (e.g. 2180 twice for two cells)" },
          levels: { type: "array", items: obj({ label: S("Level text without the number, e.g. PROP. FORMATION LEVEL"), rl: N("Its RL in m") }, ["label", "rl"]), description: "Every level callout" },
          texts: { type: "array", items: { type: "string" }, description: "Callouts, notes and titles that must appear (their words)" },
          disputed: {
            type: "array",
            items: obj({ what: S("The number/text as written, e.g. 'dimension 225 over the box, right half'"), reason: S("Which other written numbers it contradicts and what they give") }, ["what", "reason"]),
            description: "Only for numbers the reference writes that CONTRADICT its other numbers (never to hide your own error). Not drawn; reported to the author.",
          },
        }),
      },
      []
    ),
  },
  {
    name: "construct",
    description:
      "Construct entities of one planned feature. Every coordinate is a number or an EXPRESSION of plan values (the engine evaluates it — do not do arithmetic yourself) and may use points of entities already built: Box.p3.x, Box.start.y, Box.e2.mid.x, Pipe.center.y, Pipe.r. " +
      "kinds: line (from, to) | polyline (points, open) | loop (points, closed outline) | rect (x, y = bottom-left, w, h) | circle (center, r) | arc (center, r, start, end in degrees CCW from +x). " +
      "layer: outline (visible edges, default), hidden (dashed: below ground in elevation, behind), centre (dash-dot centre lines), water (HFL line), ground (ground/bed line), level (level lines), secondary (thin), construction (not plotted). draw:false = a loop that only bounds a hatch. The same id again replaces that entity. The result lists each entity's evaluated points — check them.",
    parameters: obj(
      {
        feature: S("The planned feature these belong to"),
        entities: {
          type: "array",
          items: obj(
            {
              id: S("Unique id, e.g. BoxOuter, LeftCell, RailLevelLine"),
              kind: { type: "string", enum: ["line", "polyline", "loop", "rect", "circle", "arc"], description: "Entity kind" },
              points: { type: "array", items: { type: "array", items: { type: "string" } }, description: "polyline / loop: [[x, y], …], numbers or expressions" },
              from: EXPR_XY("line start"),
              to: EXPR_XY("line end"),
              x: EXPR("rect left x"),
              y: EXPR("rect bottom y"),
              w: EXPR("rect width"),
              h: EXPR("rect height"),
              center: EXPR_XY("circle / arc centre"),
              r: EXPR("radius"),
              start: EXPR("arc start angle, degrees"),
              end: EXPR("arc end angle, degrees"),
              layer: { type: "string", enum: PRIMITIVE_LAYERS, description: "Line type / layer" },
              draw: B("false: a hatch boundary only, not drawn"),
              role: S("Optional bridge role (bed_level, HFL, formation_level, clear_opening, earth_cushion, …)"),
            },
            ["id", "kind"]
          ),
          description: "What to construct",
        },
      },
      ["feature", "entities"]
    ),
  },
  {
    name: "transform",
    description:
      "Derive entities from constructed ones, symbolically (the results stay expressions of your values): mirror (axis_x = a vertical line x = …, axis_y, or axis_from/axis_to; copies unless keep:false), copy (dx, dy, count — an array), move (dx, dy), rotate (center, angle degrees CCW; keep:true copies), offset (distance; side inside/outside for loops, left/right for open paths — exact parallel bands, mitred corners).",
    parameters: obj(
      {
        op: { type: "string", enum: ["mirror", "copy", "move", "rotate", "offset"], description: "Operation" },
        targets: LIST("Entity ids"),
        ids: LIST("Ids for the new entities (optional)"),
        feature: S("Planned feature of the new entities (default: the source's)"),
        axis_x: EXPR("Mirror about the vertical line x = this"),
        axis_y: EXPR("Mirror about the horizontal line y = this"),
        axis_from: EXPR_XY("Mirror axis point"),
        axis_to: EXPR_XY("Mirror axis point"),
        dx: EXPR("Shift in x"),
        dy: EXPR("Shift in y"),
        count: N("copy: number of copies"),
        angle: EXPR("rotate: degrees counter-clockwise"),
        center: EXPR_XY("rotate: pivot"),
        distance: EXPR("offset distance"),
        side: { type: "string", enum: ["inside", "outside", "left", "right"], description: "offset side" },
        keep: B("mirror: keep the original (default true); rotate: rotate a copy"),
        layer: { type: "string", enum: PRIMITIVE_LAYERS, description: "Layer of the result" },
      },
      ["op", "targets"]
    ),
  },
  {
    name: "boolean",
    description: "Union, difference (a minus b) or intersection of closed loops. The result's vertices are the sources' own expressions or the crossings of their edges, so it follows your values. Sources are replaced unless keep_sources. Holes in the result are reported (use them as hatch holes).",
    parameters: obj(
      {
        op: { type: "string", enum: ["union", "difference", "intersection"], description: "Operation" },
        a: LIST("Loop ids (base)"),
        b: LIST("Loop ids (added / cut away / intersected)"),
        id: S("Id of the result"),
        feature: S("Planned feature"),
        layer: { type: "string", enum: PRIMITIVE_LAYERS, description: "Layer of the result" },
        keep_sources: B("Keep a and b as well"),
      },
      ["op", "a", "b"]
    ),
  },
  {
    name: "remove",
    description: "Remove constructed entities or annotations by id (to rebuild them correctly).",
    parameters: obj({ ids: LIST("Entity or annotation ids") }, ["ids"]),
  },
  {
    name: "measure",
    description:
      "Measure the constructed geometry exactly. a (and b): a point (Box.p3, Box.e2.mid, \"(x, y)\"), an edge (Box.e2: length, direction, slope H:V), an entity (Box: bbox, perimeter, area), a dimension id (its measured value) or an expression. With b: distance point–point (dx, dy), point–edge (perpendicular), edge–edge (angle, gap if parallel).",
    parameters: obj({ a: S("First reference or expression"), b: S("Second reference (optional)") }, ["a"]),
  },
  {
    name: "verify",
    description:
      "Deterministic verification of the construction against your plan and the reference: plan checks, the engine's geometry checks (collapsed, crossed, inverted outlines), every planned feature constructed, every expected dimension MEASURED by your geometry, every expected level called out at its RL, every expected text present, plus drafting hygiene (leaders pointing at nothing, overlapping texts, duplicates). finish refuses until verify passes. Fix each problem at its cause.",
    parameters: obj({}),
  },
  {
    name: "zoom_reference",
    description:
      "Look closely at part of the reference image, magnified (up to 4×): read small numbers and texts exactly, see which band a callout's arrow points into, where a line starts and ends, whether a line is dashed. region is [left, top, right, bottom] in thousandths of the image width/height (0–1000). With overlay:true (after compare_reference has fitted your drawing) your construction is drawn over it. Use it BEFORE planning on every dense area, and on every deviation before you decide what is right.",
    parameters: obj(
      {
        region: { type: "array", items: { type: "number" }, description: "[left, top, right, bottom], 0–1000 of the image" },
        regions: { type: "array", items: { type: "array", items: { type: "number" } }, description: "Several regions at once (up to 6) — one image each, in one call" },
        overlay: B("Draw your construction over it (needs a fit from compare_reference)"),
        image: N("Which attached image (default 1)"),
      },
      []
    ),
  },
  {
    name: "compare_reference",
    description:
      "Lay your construction over the attached reference image and measure how far each constructed line runs from the reference's lines. Give two pairs pinning your drawing to the image — a point you can recognise on both (e.g. the outer bottom-left corner of the structure, the top of the centre line): img_x / img_y are its position in the image in thousandths of the width (from the left) and height (from the top), model is the same point in your coordinates. The fit is then refined automatically. Returns the overlay (reference faded, yours in blue, red dots where your lines leave the reference) and each entity's deviation in mm.",
    parameters: obj({
      pairs: {
        type: "array",
        items: obj({ img_x: N("0–1000 across the image from the left"), img_y: N("0–1000 down the image from the top"), model: EXPR_XY("The same point in your drawing") }, ["img_x", "img_y", "model"]),
        description: "Two correspondences. Omit them to reuse the previous fit.",
      },
      image: N("Which attached image (default 1)"),
      focus: S("An entity id: return the overlay magnified around where that entity leaves the reference"),
      entities: LIST("Fit and score only these entities or planned features — for a reference whose parts are to scale but not their spacing (a span shortened by a break line): compare each part on its own, with pairs on that part"),
      locate: {
        type: "array",
        items: obj({ img_x: N("0–1000 from the left"), img_y: N("0–1000 from the top"), label: S("What it is") }, ["img_x", "img_y"]),
        description: "Reference image points to convert to your coordinates with the fitted scale — for sizes the reference does not write (where a wall ends, a kink, a line's extent)",
      },
    }),
  },
];

export const BASE_TOOLS: FunctionDeclaration[] = [
  ...CONSTRUCTION_TOOLS,
  ...CAD_TOOLS,
  {
    name: "look",
    description:
      "Read the drawing as text: shapes with ids and coordinates, closed profiles and what is inside what, named values, rules, remaining freedom. Use it before editing anything you did not just draw.",
    parameters: obj({
      detail: { type: "string", enum: ["summary", "shapes", "rules", "values", "all"], description: "What to list. Default summary + shapes." },
      filter: S("Only shapes whose id starts with this."),
    }),
  },
  {
    name: "view",
    description:
      "Render the drawing as an image and look at it: ids beside edges, named dimensions in blue (derived in purple). Use it after drawing to check proportions, and to compare against the reference image when one was given.",
    parameters: obj({
      labels: B("Show shape ids. Default true."),
      region: { type: "array", items: { type: "number" }, description: "Zoom to this window [minX, minY, maxX, maxY] in mm, Y up" },
      focus: LIST("Zoom to these entities or planned features"),
    }),
  },
  {
    name: "draw_line",
    description: "Draw one straight line. Coordinates in mm, Y up. Use construction for centrelines, datums and level lines (they can be referred to but are not structure).",
    parameters: obj({ name: S("Id for the line, e.g. Centreline, DeckTop."), from: XY("Start"), to: XY("End"), construction: B("Centreline / datum / level line.") }, ["name", "from", "to"]),
  },
  {
    name: "draw_polyline",
    description:
      "Draw connected lines through points; closed joins the last point to the first. Creates lines Name_1..Name_n whose ends are shared, so the outline is one profile. Vertices are Name.p1..pn (pk is the start of edge k).",
    parameters: obj(
      {
        name: S("Group id, e.g. Opening."),
        points: { type: "array", items: { type: "array", items: { type: "number" } }, description: "[[x, y], ...] in mm, Y up." },
        closed: B("Close the outline. Default true."),
        construction: B("Construction geometry."),
      },
      ["name", "points"]
    ),
  },
  {
    name: "draw_rectangle",
    description: "Draw an axis-aligned rectangle from its bottom-left corner. It stays a rectangle (right angles are built in). Use a polyline instead if its corners will be cut.",
    parameters: obj({ name: S("Id, e.g. Cushion."), x: N("Left x"), y: N("Bottom y"), width: N("Width"), height: N("Height") }, ["name", "x", "y", "width", "height"]),
  },
  {
    name: "draw_circle",
    description: "Draw a circle.",
    parameters: obj({ name: S("Id"), center: XY("Centre"), radius: N("Radius in mm") }, ["name", "center", "radius"]),
  },
  {
    name: "chamfer",
    description: "Cut the corner where exactly two lines meet (a haunch or bevel): both lines are shortened along themselves and joined by a new edge. Rectangle corners must be exploded first.",
    parameters: obj({ corner: S(`The corner point. ${REF_HELP}`), leg: N("Length cut from each line, mm."), leg2: N("Different length for the second line (optional)."), name: S("Id for the new edge.") }, ["corner", "leg"]),
  },
  {
    name: "offset",
    description: "Parallel copy. A line moves left/right of its direction; a closed polyline or rectangle grows (outside) or shrinks (inside) with mitred corners.",
    parameters: obj({ target: S("Line id, polyline group, or rectangle."), distance: N("mm"), side: { type: "string", enum: ["left", "right", "inside", "outside"], description: "Side" }, name: S("Id for the copy") }, ["target", "distance", "side"]),
  },
  {
    name: "trim",
    description: "Move one end of a line onto another line (trim or extend to meet it).",
    parameters: obj({ line: S("Line to change"), to: S("Edge to meet"), end: { type: "string", enum: ["start", "end"], description: "Which end; default the nearer one." } }, ["line", "to"]),
  },
  {
    name: "split",
    description: "Split a line in two at a point on it.",
    parameters: obj({ line: S("Line id"), at: XY("Split point") }, ["line", "at"]),
  },
  {
    name: "move",
    description: "Move shapes (or whole polyline groups) by an offset. Rules still apply: the solver may hold things back.",
    parameters: obj({ targets: LIST("Shape ids or group ids"), dx: N("mm"), dy: N("mm, Y up") }, ["targets", "dx", "dy"]),
  },
  {
    name: "copy",
    description: "Copy shapes by an offset, count times (a plain array; use repeat for a parametric one).",
    parameters: obj({ targets: LIST("Shape or group ids"), dx: N("mm"), dy: N("mm"), count: N("Copies, default 1") }, ["targets", "dx", "dy"]),
  },
  {
    name: "mirror",
    description: "Mirror shapes about the line through two points. Copies by default (keep_original true).",
    parameters: obj({ targets: LIST("Shape or group ids"), axis_from: XY("Axis point"), axis_to: XY("Axis point"), keep_original: B("Default true") }, ["targets", "axis_from", "axis_to"]),
  },
  {
    name: "rotate",
    description: "Rotate shapes about a point, counter-clockwise in degrees.",
    parameters: obj({ targets: LIST("Shape or group ids"), angle: N("Degrees CCW"), center: XY("Pivot"), copy: B("Rotate a copy instead") }, ["targets", "angle", "center"]),
  },
  {
    name: "delete",
    description: "Delete shapes or groups. Rules that referred to them are removed and reported.",
    parameters: obj({ targets: LIST("Shape or group ids") }, ["targets"]),
  },
  {
    name: "explode",
    description: "Turn a rectangle into four lines (group) so its corners can be chamfered or edited.",
    parameters: obj({ target: S("Rectangle id") }, ["target"]),
  },
  {
    name: "rename",
    description: "Change a shape's display name (its id stays).",
    parameters: obj({ target: S("Shape id"), name: S("New name") }, ["target", "name"]),
  },
  {
    name: "rule",
    description:
      `Add a geometric relationship. The kernel admits it only if it removes freedom; otherwise it says it is already implied. anchor pins a point AND holds the orientation (3 freedoms) — every drawing needs exactly one. ${REF_HELP}`,
    parameters: obj(
      {
        kind: {
          type: "string",
          enum: ["horizontal", "vertical", "parallel", "perpendicular", "equal", "coincident", "on_line", "midpoint", "symmetric", "anchor"],
          description: "horizontal/vertical: a=edge. parallel/perpendicular/equal: a,b=edges. coincident: a,b=points. on_line/midpoint: a=point, b=edge. symmetric: a,b=points, about=axis edge. anchor: a=point, about=edge whose direction to hold (optional).",
        },
        a: S("First reference"),
        b: S("Second reference"),
        about: S("Axis edge (symmetric) or orientation edge (anchor)"),
      },
      ["kind", "a"]
    ),
  },
  {
    name: "auto_rules",
    description:
      "Ask the kernel's detectors which relationships the geometry already shows and accept those of the kinds you list (each still passes the admissibility gate). Draw accurately first. Typical: [\"horizontal\",\"vertical\"] for orthogonal structure; add \"parallel\",\"perpendicular\" for sloped faces. Use \"equal\" and \"symmetric\" only when that is the design intent.",
    parameters: obj({ kinds: LIST("horizontal, vertical, parallel, perpendicular, equal, symmetric, on_line, concentric"), targets: LIST("Limit to these shapes/groups (optional)") }, ["kinds"]),
  },
  {
    name: "remove_rule",
    description: "Remove a rule by id (ids are listed by look detail=rules). A named value that no longer drives anything is removed with it.",
    parameters: obj({ id: S("Rule id") }, ["id"]),
  },
  {
    name: "dimension",
    description:
      "Name a measurement; the named value then DRIVES that geometry and appears on the drawing and in Run Mode. Reusing an existing name shares the value (e.g. both walls follow WallThickness). " +
      "what: length (a=edge) | horizontal (a,b=points) | vertical (a,b=points) | distance (a,b=points) | offset (a=edge, b=point or parallel edge: perpendicular thickness/clearance) | x / y (a=point: absolute position, y is a level) | angle (a,b=edges, degrees) | radius (a=circle). " +
      "The dimension names what the drawing already measures; it will not move geometry unless resize is true. Use reference:true to only report a number.",
    parameters: obj(
      {
        name: S("PascalCase engineering name, e.g. ClearSpan, WallThickness, TopSlabThickness, HaunchSize."),
        what: { type: "string", enum: ["length", "horizontal", "vertical", "distance", "offset", "x", "y", "angle", "radius"], description: "Kind of measurement" },
        a: S(REF_HELP),
        b: S("Second reference when needed"),
        value: N("Optional: the value you expect it to measure (checked). To change the geometry to a new size, also pass resize: true."),
        resize: B("Move the geometry so this dimension becomes value."),
        reference: B("Report only; holds nothing"),
        group: S("Run Mode group, e.g. Opening, Structure, Cover"),
        description: S("One line for the engineer who will change it"),
      },
      ["name", "what", "a"]
    ),
  },
  {
    name: "formula",
    description:
      "name = expression over other named values (+ - * / ^, parentheses, sqrt, sin, cos, tan, min, max, abs, round, floor, ceil). If name exists and drives geometry, the expression must reproduce what the drawing measures (checked) and the value becomes derived. If name is new, it becomes a reported derived value (dimension something with it to make it drive geometry).",
    parameters: obj({ name: S("Value name"), expression: S("e.g. ClearSpan + 2 * WallThickness"), description: S("One line") }, ["name", "expression"]),
  },
  {
    name: "set_value",
    description: "Change a driving value and re-solve — to size the drawing, or to test that it responds sensibly.",
    parameters: obj({ name: S("Value name"), value: N("New value") }, ["name", "value"]),
  },
  {
    name: "describe_value",
    description: "Set how a value appears in Run Mode: description, group, valid range, and whether it is shown at all.",
    parameters: obj({ name: S("Value"), description: S("One line"), group: S("Group"), min: N("Minimum"), max: N("Maximum"), publish: B("Show in Run Mode") }, ["name"]),
  },
  {
    name: "rename_value",
    description: "Rename a named value everywhere (rules, formulas, repeats).",
    parameters: obj({ from: S("Current name"), to: S("New name") }, ["from", "to"]),
  },
  {
    name: "suggestions",
    description: "The kernel's own list of what is still free and the ways to hold it (clearances, spans, positions, orientation). Each option has an id and proposed value names you can rename when accepting.",
    parameters: obj({}),
  },
  {
    name: "accept_suggestion",
    description: "Accept one option from suggestions, optionally renaming the values it creates.",
    parameters: obj(
      {
        id: S("Option id from suggestions"),
        names: { type: "array", items: obj({ from: S("Proposed name"), to: S("Your name") }, ["from", "to"]), description: "Renames" },
      },
      ["id"]
    ),
  },
  {
    name: "unit",
    description: "Group shapes into a named unit (optionally rigid: moves as one body). Needed before repeat.",
    parameters: obj({ name: S("Unit name, e.g. Cell"), targets: LIST("Shapes or groups"), rigid: B("Move as one piece") }, ["name", "targets"]),
  },
  {
    name: "repeat",
    description: "Repeat a unit parametrically (multi-cell). gap mode keeps the material between copies fixed and re-measures the pitch; pitch mode fixes the centre spacing.",
    parameters: obj(
      {
        unit: S("Unit name"),
        count: N("Number of copies including the original"),
        direction: { type: "string", enum: ["right", "left", "up", "down"], description: "Direction" },
        mode: { type: "string", enum: ["gap", "pitch"], description: "Spacing mode" },
        spacing: N("Gap or pitch in mm (gap defaults to the unit's own wall)"),
        count_name: S("Name for the count value"),
        spacing_name: S("Name for the spacing value"),
      },
      ["unit", "count", "direction", "mode"]
    ),
  },
  {
    name: "check",
    description:
      "Verify the drawing: does it solve, what freedom is left, conflicts, open ends and near-misses (disconnected geometry), closed profiles, overlaps, nearly-axis-aligned lines, and the publish checklist. Call after constraining and fix everything it reports.",
    parameters: obj({}),
  },
  {
    name: "flex_test",
    description:
      "Stress-test design intent: change each driving value (or the one named) to other sizes on a scratch copy, re-solve, and report what broke and which edges changed length. Edges that should keep their size (walls, haunches) must not appear as changed.",
    parameters: obj({ name: S("Only this value"), values: { type: "array", items: { type: "number" }, description: "Values to try" } }),
  },
  {
    name: "calculate",
    description: "Evaluate arithmetic exactly (named values are available as variables). Use instead of mental arithmetic for coordinates.",
    parameters: obj({ expression: S("e.g. 350 + 10700 - 600") }, ["expression"]),
  },
  {
    name: "research",
    description: "Search the web for engineering or geometry knowledge (standard proportions, code clauses, formulas). Returns a short grounded answer with sources. Never use it for numbers the drawing or the author already gave.",
    parameters: obj({ question: S("A specific question") }, ["question"]),
  },
  {
    name: "define_tool",
    description:
      "Create a new tool from a sequence of existing tool calls, for anything you will do more than once (e.g. a haunched opening). Parameters are referenced in step arguments as \"{{p}}\" (whole value) or inside text; a string starting with \"=\" is evaluated as arithmetic over the parameters and named values, e.g. \"=x + w\". The tool is then callable as macro_<name>.",
    parameters: obj(
      {
        name: S("snake_case name"),
        description: S("What it draws"),
        parameters: { type: "array", items: obj({ name: S("Parameter"), description: S("Meaning"), type: { type: "string", enum: ["number", "string"], description: "Type" } }, ["name", "type"]), description: "Parameters" },
        steps: { type: "array", items: obj({ tool: S("Existing tool name"), args_json: S("Arguments as a JSON object string") }, ["tool", "args_json"]), description: "Calls in order" },
      },
      ["name", "description", "parameters", "steps"]
    ),
  },
  {
    name: "finish",
    description:
      "Declare the drawing complete. Runs the full verification and the Run Mode sweep; refused (with reasons) if anything fails. On success the drawing is published so its named values can be changed in Run Mode.",
    parameters: obj(
      {
        title: S("Drawing title"),
        summary: S("What was drawn, the named values and formulas, and how it responds to change — for the author."),
        freedom_note: S("Only if some freedom is deliberately left: which and why."),
        off_reference: {
          type: "array",
          items: obj({ id: S("Entity id compare_reference lists as off"), reason: S("Why the reference is not followed there") }, ["id", "reason"]),
          description: "Construction route with a reference: every entity the last compare_reference still lists as off, with the reason you kept it (fix it instead whenever you can)",
        },
      },
      ["title", "summary"]
    ),
  },
];

const STAGE: Record<string, ToolStage> = {
  plan: "meta", construct: "draw", transform: "draw", boolean: "draw", remove: "draw", measure: "observe", verify: "observe", compare_reference: "observe", zoom_reference: "observe",
  look: "observe", view: "observe", check: "observe", flex_test: "observe", suggestions: "observe", calculate: "observe", research: "observe",
  draw_line: "draw", draw_polyline: "draw", draw_rectangle: "draw", draw_circle: "draw", chamfer: "draw", offset: "draw", trim: "draw",
  split: "draw", move: "draw", copy: "draw", mirror: "draw", rotate: "draw", delete: "draw", explode: "draw", rename: "draw",
  rule: "constrain", auto_rules: "constrain", remove_rule: "constrain", unit: "constrain", repeat: "constrain", accept_suggestion: "constrain",
  dimension: "parametrize", formula: "parametrize", set_value: "parametrize", describe_value: "parametrize", rename_value: "parametrize",
  define_tool: "meta", finish: "meta",
};

export function stageOf(tool: string): ToolStage {
  if (CAD_TOOL_NAMES.has(tool)) {
    if (["describe_component", "audit", "recognize", "bridge_reference", "use_skill"].includes(tool)) return "observe";
    if (["delete_component", "annotate", "layer", "classify", "edit_geometry"].includes(tool)) return "draw";
    return "parametrize";
  }
  return STAGE[tool] ?? (tool.startsWith("macro_") ? "draw" : "meta");
}

export function macroDeclarations(macros: MacroDefinition[]): FunctionDeclaration[] {
  return macros.map((m) => ({
    name: `macro_${m.name}`,
    description: `${m.description} (a tool you defined: ${m.steps.map((s) => s.tool).join(" -> ")})`,
    parameters: obj(
      Object.fromEntries(m.parameters.map((p) => [p.name, { type: p.type === "string" ? "string" : "number", description: p.description }])),
      m.parameters.map((p) => p.name)
    ),
  }));
}

// ---------------------------------------------------------------------------
// Argument readers
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

const str = (a: Args, k: string, required = true): string => {
  const v = a[k];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  if (required) throw new ToolError(`Missing "${k}".`);
  return "";
};
const optStr = (a: Args, k: string) => (a[k] === undefined || a[k] === null || a[k] === "" ? undefined : str(a, k));
const num = (a: Args, k: string, fallback?: number): number => {
  const v = a[k];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (Number.isFinite(n)) return n;
  if (fallback !== undefined) return fallback;
  throw new ToolError(`"${k}" must be a number.`);
};
const optNum = (a: Args, k: string) => (a[k] === undefined || a[k] === null ? undefined : num(a, k));
const pt = (a: Args, k: string): Pt => {
  const v = a[k];
  if (Array.isArray(v) && v.length >= 2) {
    const x = Number(v[0]);
    const y = Number(v[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  if (v && typeof v === "object" && "x" in (v as object)) {
    const o = v as { x: unknown; y: unknown };
    return { x: Number(o.x), y: Number(o.y) };
  }
  throw new ToolError(`"${k}" must be [x, y].`);
};
const list = (a: Args, k: string): string[] => {
  const v = a[k];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(/[,\s]+/).filter(Boolean);
  throw new ToolError(`"${k}" must be a list of ids.`);
};

function commitNote(c: { ok: boolean; rejection?: string; dropped: string[]; held: string[] }): string {
  if (!c.ok) throw new ToolError(`Refused — the drawing would not solve: ${c.rejection}`);
  const parts: string[] = [];
  if (c.dropped.length) parts.push(`${c.dropped.length} rule(s) referring to removed geometry were dropped`);
  if (c.held.length) parts.push(`held back by rules: ${c.held.slice(0, 5).join(", ")}`);
  return parts.length ? ` (${parts.join("; ")})` : "";
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function lookReport(ws: DraftingWorkspace, detail = "summary+shapes", filter?: string): string {
  const out: string[] = [];
  const sk = ws.sketch;
  const dof = ws.dof();
  const want = (k: string) => detail === "all" || detail.includes(k);
  const lines = ws.shapes.filter((s) => s.type === "line").length;
  out.push(
    `"${ws.title}": ${ws.shapes.length} shapes (${lines} lines), ${Object.keys(sk.parameters).length} named values, ${sk.constraints.filter((c) => c.state !== "suppressed").length} rules. Units mm, Y up.`
  );
  const comps = componentsSummary(ws);
  if (comps) out.push(comps);
  if (ws.shapes.length === 0 && ws.cad.components.length > 0) {
    out.push("No free-drawn geometry; everything on the sheet comes from components (fully defined by their values).");
    return out.join("\n");
  }
  out.push(
    dof.dof === 0
      ? "Freedom: none left — fully defined."
      : `Freedom: ${dof.dof} left${dof.anchored ? "" : " (NOT anchored)"}: ${dof.motions.slice(0, 5).map((m) => m.description).join(" ")}`
  );

  if (want("summary") || detail === "all") {
    const nesting = ws.nesting();
    const profiles = ws.profiles();
    if (profiles.length) {
      out.push(
        "Profiles: " +
          profiles
            .slice(0, 20)
            .map((p) => {
              const pts = p.pointIds.map((id) => ws.modelPoint(id));
              const w = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
              const h = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
              const inside = nesting.get(p.label);
              return `${p.label} [${p.closed ? "closed" : "open"}, ${p.segmentIds.length} edges, ${fmt(w)}x${fmt(h)}${inside ? `, inside ${inside}` : ""}]`;
            })
            .join("; ")
      );
    }
  }

  if (want("shapes")) {
    const shown = ws.shapes.filter((s) => !filter || s.id.startsWith(filter));
    const rows = shown.slice(0, 80).map((s) => {
      const tag = s.isReference ? " (construction)" : "";
      if (s.type === "line") {
        const a = { x: s.x1, y: -s.y1 };
        const b = { x: s.x2, y: -s.y2 };
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        return `  ${s.id}: line (${fmt(a.x)}, ${fmt(a.y)}) -> (${fmt(b.x)}, ${fmt(b.y)}) len ${fmt(len)}${tag}`;
      }
      if (s.type === "rectangle") {
        const bottom = -(s.y + s.height);
        return `  ${s.id}: rectangle x ${fmt(s.x)}..${fmt(s.x + s.width)}, y ${fmt(bottom)}..${fmt(bottom + s.height)} (${fmt(s.width)} x ${fmt(s.height)})${s.rotation ? ` rotated ${fmt(s.rotation)}°` : ""}`;
      }
      if (s.type === "circle") return `  ${s.id}: circle centre (${fmt(s.cx)}, ${fmt(-s.cy)}) r ${fmt(s.r)}`;
      return `  ${s.id}: ${s.type} (not editable by rules)`;
    });
    out.push(`Shapes${filter ? ` starting "${filter}"` : ""}:`);
    out.push(...rows);
    const groups = [...new Set(shown.map((x) => (x.type === "line" ? x.groupId : undefined)).filter(Boolean))] as string[];
    for (const g of groups) out.push(`  ${g} vertices: ${ws.vertexList(g)}`);
    if (shown.length > 80) out.push(`  ... ${shown.length - 80} more (use filter)`);
  }

  if (want("values") || want("summary")) {
    const values = Object.values(sk.parameters);
    if (values.length) {
      out.push("Named values:");
      for (const p of values) {
        const drives = p.boundConstraints.length;
        const readers = dependentsOf(p.name, sk.parameters);
        out.push(
          `  ${p.name} = ${fmt(p.value)} ${p.unit} [${p.role.toLowerCase()}${p.expr ? ` = ${p.expr}` : ""}${p.published ? ", in Run Mode" : ""}]` +
            `${drives ? ` drives ${drives} rule(s)` : " drives no geometry"}${readers.length ? `; read by ${readers.join(", ")}` : ""}`
        );
      }
    }
  }

  if (want("rules")) {
    const rules = sk.constraints.filter((c) => c.state !== "suppressed" && c.strength !== "fact");
    out.push(`Rules (${rules.length}, built-in shape facts not listed):`);
    for (const c of rules.slice(0, 120)) out.push(`  ${c.id}: ${c.label}`);
    if (rules.length > 120) out.push(`  ... ${rules.length - 120} more`);
  }

  return out.join("\n");
}

export function buildScene(ws: DraftingWorkspace): RenderScene {
  const sk = ws.last?.sketch ?? ws.sketch;
  const shapes = ws.displayShapes();
  const scene: RenderScene = { lines: [], circles: [], dims: [], title: ws.title.toUpperCase().slice(0, 30) };
  for (const s of shapes) {
    if (s.isVisible === false) continue;
    if (s.type === "line" || s.type === "arrow") {
      scene.lines.push({ a: { x: s.x1, y: -s.y1 }, b: { x: s.x2, y: -s.y2 }, construction: s.isReference, label: s.id.includes("#") ? undefined : s.id });
    } else if (s.type === "rectangle") {
      const c = [
        { x: s.x, y: -s.y },
        { x: s.x + s.width, y: -s.y },
        { x: s.x + s.width, y: -(s.y + s.height) },
        { x: s.x, y: -(s.y + s.height) },
      ];
      const rot = ((s.rotation ?? 0) * Math.PI) / 180;
      const cx = s.x + s.width / 2;
      const cy = -(s.y + s.height / 2);
      const turned = c.map((p) =>
        rot === 0
          ? p
          : {
              x: cx + (p.x - cx) * Math.cos(-rot) - (p.y - cy) * Math.sin(-rot),
              y: cy + (p.x - cx) * Math.sin(-rot) + (p.y - cy) * Math.cos(-rot),
            }
      );
      ["top", "right", "bottom", "left"].forEach((side, i) =>
        scene.lines.push({ a: turned[i], b: turned[(i + 1) % 4], label: side === "top" && !s.id.includes("#") ? s.id : undefined })
      );
    } else if (s.type === "circle") {
      scene.circles.push({ c: { x: s.cx, y: -s.cy }, r: s.r, label: s.id });
    }
  }
  // Component geometry and its dimensions, so the model sees what it placed.
  const dashed = new Set(ws.cad.layers.filter((l) => l.lineType !== "continuous").map((l) => l.id));
  const own = ws.construction.instanceId;
  for (const s of ws.cadShapes) {
    // The agent's own entities carry their ids (on their first edge), so it can refer to them.
    const label = own && s.componentInstanceId === own && s.name?.endsWith(".e1") ? s.name.slice(0, -3) : undefined;
    if (s.type === "line") scene.lines.push({ a: { x: s.x1, y: -s.y1 }, b: { x: s.x2, y: -s.y2 }, construction: s.isReference || dashed.has(s.layerId ?? ""), label });
    else if (s.type === "circle") scene.circles.push({ c: { x: s.cx, y: -s.cy }, r: s.r });
  }
  // Every annotation as it will print — hatches, leaders, level callouts, notes,
  // dimension values — so the model sees the drawing, not just its outline.
  const ctx = { shapes: indexShapes(ws.allShapes()), settings: ws.cad.settings };
  const thin: { a: Pt; b: Pt }[] = [];
  const notes: { at: Pt; text: string; align?: "left" | "center" | "right"; height?: number }[] = [];
  const specks: Pt[] = [];
  const flip = (x: number, y: number): Pt => ({ x, y: -y });
  const MAX_THIN = 9000;
  for (const ann of ws.cad.annotations) {
    for (const p of annotationPrims(ann, ctx)) {
      if (thin.length > MAX_THIN && p.k !== "text") continue;
      switch (p.k) {
        case "line":
          thin.push({ a: flip(p.x1, p.y1), b: flip(p.x2, p.y2) });
          break;
        case "polyline":
        case "fill":
          for (let i = 0; i + 1 < p.points.length + (p.k === "fill" || p.closed ? 1 : 0); i++) {
            const a = p.points[i];
            const b = p.points[(i + 1) % p.points.length];
            thin.push({ a: flip(a.x, a.y), b: flip(b.x, b.y) });
          }
          break;
        case "segments":
          for (let i = 0; i + 3 < p.segs.length; i += 4) thin.push({ a: flip(p.segs[i], p.segs[i + 1]), b: flip(p.segs[i + 2], p.segs[i + 3]) });
          break;
        case "circle":
          scene.circles.push({ c: flip(p.cx, p.cy), r: p.r });
          break;
        case "dots":
          for (const d of p.points) if (specks.length < 20000) specks.push(flip(d.x, d.y));
          break;
        case "text": {
          const lines = p.text.split("\n");
          const lh = p.height * 1.3;
          // Baseline: the rasteriser writes from the top of a line.
          const top = p.baseline === "top" ? p.y : p.baseline === "middle" ? p.y - ((lines.length - 1) * lh) / 2 - p.height / 2 : p.y - (lines.length - 1) * lh - p.height;
          lines.forEach((t, i) => notes.push({ at: flip(p.x, top + i * lh + p.height), text: t, align: p.align, height: p.height }));
          break;
        }
      }
    }
  }
  scene.thin = thin;
  scene.notes = notes;
  scene.specks = specks;
  const seen = new Set<string>();
  for (const c of sk.constraints) {
    if (!c.paramRef || c.state === "suppressed" || seen.has(c.paramRef)) continue;
    const p = sk.parameters[c.paramRef];
    if (!p) continue;
    const at = (id: string) => sk.points[id] && { x: sk.points[id].x, y: -sk.points[id].y };
    let a: Pt | undefined;
    let b: Pt | undefined;
    if (["distance", "distance_x", "distance_y"].includes(c.kind)) {
      a = at(c.points[0]);
      b = at(c.points[1]);
    } else if (c.kind === "point_line_distance") {
      const seg = sk.segments[c.segments[0]];
      const q = at(c.points[0]);
      const e1 = seg && at(seg.p1);
      const e2 = seg && at(seg.p2);
      if (q && e1 && e2) {
        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const t = ((q.x - e1.x) * dx + (q.y - e1.y) * dy) / (dx * dx + dy * dy);
        a = q;
        b = { x: e1.x + dx * t, y: e1.y + dy * t };
      }
    } else if (c.kind === "position_x" || c.kind === "position_y") {
      a = at(c.points[0]);
      b = a;
    } else if (c.kind === "angle") {
      const seg = sk.segments[c.segments[0]];
      a = seg && at(seg.p1);
      b = seg && at(seg.p2);
    }
    if (!a || !b) continue;
    seen.add(c.paramRef);
    scene.dims.push({ a, b, text: `${p.name}=${fmt(p.value)}`, derived: p.role === "DERIVED" });
  }
  return scene;
}

function annotateOne(ctx: ToolContext, a: Args): { text: string } {
  const kind = String(a.kind ?? "");
  if (ctx.ws.construction.plan?.route === "construction" && ["dimension", "level", "leader", "text", "hatch"].includes(kind)) {
    return { text: annotateConstruction(ctx.ws, a) };
  }
  const cad = dispatchCadTool(ctx.ws, "annotate", a);
  if (!cad) throw new ToolError(`Unknown annotation kind "${kind}".`);
  return cad;
}

/** The window `view` zooms to: an explicit region, or the extents of the named entities / features. */
function viewWindow(ws: DraftingWorkspace, a: Args): [number, number, number, number] | undefined {
  if (Array.isArray(a.region) && a.region.length === 4) {
    const r = (a.region as unknown[]).map(Number);
    if (r.every(Number.isFinite) && r[2] > r[0] && r[3] > r[1]) return r as [number, number, number, number];
    throw new ToolError("region is [minX, minY, maxX, maxY] with max > min.");
  }
  if (!Array.isArray(a.focus) || !a.focus.length) return undefined;
  const want = new Set((a.focus as unknown[]).map(String));
  const ids = new Set(Object.entries(ws.construction.tags).filter(([id, f]) => want.has(id) || want.has(f)).map(([id]) => id));
  for (const w of want) ids.add(w);
  const ev = constructionEvaluation(ws);
  const pts = [
    ...(ev?.loops ?? []).filter((l) => ids.has(l.primitiveId)).flatMap((l) => l.points),
    ...(ev?.circles ?? []).filter((c) => ids.has(c.primitiveId)).flatMap((c) => [{ x: c.center.x - c.r, y: c.center.y - c.r }, { x: c.center.x + c.r, y: c.center.y + c.r }]),
  ];
  if (!pts.length) throw new ToolError(`Nothing constructed matches ${[...want].join(", ")}.`);
  const datum = ws.cad.settings.datumRL * 1000;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y - datum);
  const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.15 + 500;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

/** The verification report, and whether it found anything that must be fixed. */
/**
 * Components are fully defined by construction, so their check is their
 * invariants: any error-level issue is a blocker, warnings are reported.
 */
function componentCheck(ws: DraftingWorkspace): { lines: string[]; blockers: string[] } {
  const lines: string[] = [];
  const blockers: string[] = [];
  for (const inst of ws.cad.components) {
    const out = evaluateInstance(inst, ws.cad);
    if (!out) {
      blockers.push(`${inst.id}: unknown component ${inst.definitionId}.`);
      continue;
    }
    const errs = out.evaluation.issues.filter((i) => i.severity === "error");
    const warns = out.evaluation.issues.filter((i) => i.severity === "warning");
    lines.push(`${inst.id} (${inst.name}): ${errs.length ? `${errs.length} error(s)` : "holds all its invariants"}${warns.length ? `, ${warns.length} warning(s)` : ""}.`);
    for (const e of errs) blockers.push(`${inst.id}: ${e.message}`);
    for (const w of warns.slice(0, 4)) lines.push(`  warning: ${w.message}`);
  }
  return { lines, blockers };
}

export function checkReport(ws: DraftingWorkspace): { text: string; blockers: string[] } {
  const lines: string[] = [];
  const blockers: string[] = [];
  const last = ws.last;
  const comp = componentCheck(ws);

  if (ws.shapes.length === 0) {
    if (ws.cad.components.length === 0) return { text: "Nothing is drawn yet.", blockers: ["nothing drawn"] };
    return {
      text: ["Only components on the sheet — each fully defined by its values; nothing to anchor or constrain.", ...comp.lines].join("\n"),
      blockers: comp.blockers,
    };
  }
  const dof = ws.dof();
  lines.push(...comp.lines);
  blockers.push(...comp.blockers);

  if (!last) {
    return { text: "Nothing is drawn yet.", blockers: ["nothing drawn"] };
  }
  lines.push(
    last.converged
      ? `Solve: converged (worst residual ${last.maxResidual.toExponential(1)}).`
      : `Solve: did not fully settle (worst residual ${last.maxResidual.toExponential(1)}) — two rules may be pulling against each other.`
  );
  if (!dof.anchored) blockers.push("Nothing anchors the drawing: add rule anchor on a meaningful point (e.g. the outer bottom-left corner or the centreline base).");
  if (dof.dof > 0) {
    const structural = ws.structuralFreedom();
    lines.push(`Freedom: ${dof.dof} left${structural < dof.dof ? ` (${dof.dof - structural} of it only slides or stretches construction lines, which is fine)` : ""}.`);
    for (const m of dof.motions.slice(0, 8)) lines.push(`  - ${m.description}`);
    if (structural > 0 && !ws.sketch.meta.freedomIsIntentional) {
      blockers.push(`${structural} degree(s) of freedom still move the structure (see above). Hold them with dimensions/rules, or explain them in finish.freedom_note.`);
    }
  } else {
    lines.push("Freedom: none — fully defined.");
  }
  const conflicting = dof.diagnoses.filter((d) => d.status === "conflicting");
  const redundant = dof.diagnoses.filter((d) => d.status === "redundant");
  if (conflicting.length) {
    blockers.push(`Conflicting rules: ${conflicting.map((c) => `${c.constraintId} (${c.label})`).join("; ")}`);
  }
  if (redundant.length) {
    lines.push(`Redundant (harmless while they agree, first to remove if a value refuses to change): ${redundant.slice(0, 6).map((c) => `${c.constraintId}`).join(", ")}`);
  }

  const conn = ws.connectivity();
  if (conn.nearMisses.length) blockers.push(`Disconnected geometry: ${conn.nearMisses.slice(0, 6).join("; ")}. Redraw so the ends meet exactly (or add rule coincident).`);
  if (conn.tJunctions.length) blockers.push(`Unheld junctions: ${conn.tJunctions.slice(0, 6).join("; ")}. Add rule on_line.`);
  if (conn.openEnds.length) lines.push(`Open ends (fine for single lines, a mistake in an outline): ${conn.openEnds.slice(0, 8).join("; ")}`);

  const profiles = ws.profiles();
  const nesting = ws.nesting();
  lines.push(
    `Profiles: ${profiles.filter((p) => p.closed).length} closed, ${profiles.filter((p) => !p.closed).length} open.` +
      (nesting.size ? ` Nesting: ${[...nesting.entries()].map(([i, o]) => `${i} in ${o}`).join(", ")}.` : "")
  );
  if (last.topology.overlaps.length) {
    lines.push(`Overlaps: ${last.topology.overlaps.map((o) => `${o.labelA} and ${o.labelB} by ${fmt(o.depthMm)} mm`).join("; ")} — intended only if they are one monolithic pour.`);
  }
  const skewed = ws.nearlyAxisAligned();
  if (skewed.length) blockers.push(`Almost-straight lines not held: ${skewed.slice(0, 6).join("; ")}. Fix the coordinates or add horizontal/vertical rules.`);

  const values = Object.values(ws.sketch.parameters);
  const driving = values.filter((p) => p.role === "DRIVING");
  const orphans = values.filter((p) => p.role !== "MEASURED" && p.boundConstraints.length === 0 && dependentsOf(p.name, ws.sketch.parameters).length === 0 && p.role !== "DERIVED" && !ws.sketch.repeats.some((r) => r.countParam === p.name || r.spacingParam === p.name));
  lines.push(`Named values: ${driving.length} driving (${driving.filter((p) => p.published).length} in Run Mode), ${values.filter((p) => p.role === "DERIVED").length} derived.`);
  if (driving.length === 0) blockers.push("No named driving values: name the key dimensions with dimension so the drawing can be changed in Run Mode.");
  if (orphans.length) lines.push(`Values driving nothing: ${orphans.map((p) => p.name).join(", ")}.`);
  const failing = last.invariants.filter((i) => !i.ok);
  if (failing.length) blockers.push(`Rules not satisfied: ${failing.slice(0, 5).map((f) => f.label).join("; ")}`);

  lines.push(blockers.length ? `NOT READY:\n${blockers.map((b) => `  * ${b}`).join("\n")}` : "No problems found. Next: flex_test, then view, then finish.");
  return { text: ws.relabel(lines.join("\n")), blockers: blockers.map((b) => ws.relabel(b)) };
}

/** Signed area of each closed profile, keyed by profile id, on a given sketch. */
function profileAreas(sketch: AuthoringSketch): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of findProfiles(sketch)) {
    const ids = profileLoopIds(sketch, p);
    if (!ids) continue;
    out.set(p.id, signedArea(ids.map((id) => sketch.points[id])));
  }
  return out;
}

export function flexReport(ws: DraftingWorkspace, only?: string, explicit?: number[]): { text: string; failures: number } {
  const params = Object.values(ws.sketch.parameters).filter(
    (p) => p.role === "DRIVING" && (!only || p.name === only)
  );
  if (only && params.length === 0) throw new ToolError(`${only} is not a driving value.`);
  if (params.length === 0) return { text: "There are no driving values to test.", failures: 0 };

  const names = ws.names();
  const lengths = (sk: AuthoringSketch) => {
    const m = new Map<string, number>();
    for (const seg of Object.values(sk.segments)) {
      if (sk.circles[`${seg.shapeId}:c`] || seg.shapeId.includes("#")) continue;
      const a = sk.points[seg.p1];
      const b = sk.points[seg.p2];
      if (a && b) m.set(seg.id, Math.hypot(b.x - a.x, b.y - a.y));
    }
    return m;
  };
  const base = lengths(ws.sketch);
  const baseAreas = profileAreas(ws.sketch);
  const baseNesting = containment(ws.sketch, names);
  const baseDiscs = overlappingCircles(ws.sketch, ws.policy.geometry_mm);
  const loopsNow = closedLoops(ws.sketch, names);
  const plabel = (id: string) => ws.relabel(loopsNow.find((q) => q.id === id)?.label ?? id);
  // Clearances between nested profiles, face by face — wall and slab
  // thicknesses whether or not anyone named them.
  // Only THIN bands are reported: a clearance under a quarter of the
  // container's own size across that face is material — a wall, a slab, a
  // cover — and should not drift. The fill around a pipe sitting in an
  // embankment is meant to change when the pipe does.
  const clearances = (sk: AuthoringSketch) => {
    const m = new Map<string, { d: number; label: string; thin: boolean }>();
    for (const f of findOffsets(sk, ws.policy, names)) {
      const a = sk.points[sk.segments[f.outerEdgeId]?.p1];
      const b = sk.points[sk.segments[f.outerEdgeId]?.p2];
      const q = sk.points[f.innerPointIds[0]];
      if (!a || !b || !q) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const signed = ((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / len;
      // The container's depth perpendicular to this face.
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const proj = f.outer.pointIds.map((id) => sk.points[id]).filter(Boolean).map((p) => p.x * nx + p.y * ny);
      const depth = proj.length ? Math.max(...proj) - Math.min(...proj) : Infinity;
      m.set(`${f.outer.id}|${f.outerEdgeId}|${f.inner.id}`, {
        d: signed * f.sign,
        label: `${ws.describeSegment(f.outerEdgeId)} to ${plabel(f.inner.id)}`,
        thin: Math.abs(signed) < 0.25 * depth,
      });
    }
    return m;
  };
  const baseClear = clearances(ws.sketch);
  // Faces a value drives directly, including a face lying on the one the rule
  // names (a fill's bottom edge on the slab's top edge is the same face).
  const pairOf = (segId: string) => {
    const seg = ws.sketch.segments[segId];
    return seg ? [seg.p1, seg.p2].sort().join("|") : segId;
  };
  const boundTo = (name: string) => new Set(
    ws.sketch.constraints
      .filter((c) => c.paramRef === name && c.kind === "point_line_distance")
      .map((c) => pairOf(c.segments[0]))
  );
  const out: string[] = [];
  let failures = 0;

  for (const p of params) {
    const values =
      explicit && explicit.length
        ? explicit
        : p.type === "COUNT"
          ? [Math.max(1, p.value - 1), p.value + 1]
          : [p.value * 0.8, p.value * 1.25].map((v) => Math.round(v));
    for (const v of values) {
      const probe: AuthoringSketch = {
        ...ws.sketch,
        parameters: { ...ws.sketch.parameters, [p.name]: { ...p, value: v } },
      };
      const r = regenerate(ws.shapes, probe, { shapeNames: names });
      if (r.rejection || r.parameterErrors.length) {
        failures++;
        out.push(`${p.name} ${fmt(p.value)} -> ${fmt(v)}: FAILED — ${r.rejection ?? r.parameterErrors.map((e) => e.message).join(" ")}`);
        continue;
      }
      const broken = r.invariants.filter((i) => !i.ok);
      const areas = profileAreas(r.sketch);
      const flipped = [...areas.entries()].filter(([id, a]) => {
        const b = baseAreas.get(id);
        return b !== undefined && Math.sign(a) !== Math.sign(b) && Math.abs(a) > 1 && Math.abs(b) > 1;
      });
      const after = lengths(r.sketch);
      const changed: string[] = [];
      let kept = 0;
      for (const [id, len] of base) {
        const now = after.get(id);
        if (now === undefined) continue;
        if (Math.abs(now - len) > 0.5) changed.push(`${ws.describeSegment(id)} ${fmt(len)}->${fmt(now)}`);
        else kept++;
      }
      const derived = Object.values(r.sketch.parameters)
        .filter((q) => q.role === "DERIVED")
        .map((q) => `${q.name}=${fmt(q.value)}`);
      const afterNesting = containment(r.sketch, names);
      const escaped = [...baseNesting].filter(([inner, outer]) => afterNesting.get(inner) !== outer);
      const collided = [...overlappingCircles(r.sketch, ws.policy.geometry_mm)].filter((pair) => !baseDiscs.has(pair));
      const afterClear = clearances(r.sketch);
      const driven = boundTo(p.name);
      const shifted: string[] = [];
      for (const [key, before] of baseClear) {
        const now = afterClear.get(key);
        if (!now || !before.thin || Math.abs(now.d - before.d) <= 0.5) continue;
        if (driven.has(pairOf(key.split("|")[1]))) continue;
        shifted.push(`${before.label} ${fmt(before.d)}->${fmt(now.d)}`);
      }
      const bad = broken.length > 0 || flipped.length > 0 || !r.converged || escaped.length > 0 || collided.length > 0;
      if (bad) failures++;
      out.push(
        `${p.name} ${fmt(p.value)} -> ${fmt(v)}: ${bad ? "PROBLEM" : shifted.length ? "REVIEW" : "ok"}` +
          (broken.length ? `; rules broken: ${broken.slice(0, 3).map((b) => b.label).join("; ")}` : "") +
          (flipped.length ? `; profile turned inside out: ${flipped.map(([id]) => names[id] ?? id).join(", ")}` : "") +
          (escaped.length ? `; ${escaped.map(([i, o]) => `${plabel(i)} is no longer inside ${plabel(o)}`).join(", ")}` : "") +
          (collided.length ? `; ${collided.map((pair) => pair.split("|").join(" and ")).join(", ")} run into each other` : "") +
          (shifted.length ? `; clearances that changed without being named: ${shifted.slice(0, 6).join(", ")}` : "") +
          (!r.converged ? "; did not settle" : "") +
          `; changed length: ${changed.length ? changed.slice(0, 10).join(", ") + (changed.length > 10 ? `, +${changed.length - 10} more` : "") : "none"}` +
          `; ${kept} edges kept their length` +
          (derived.length ? `; derived: ${derived.join(", ")}` : "")
      );
    }
  }
  out.push(
    failures === 0
      ? out.some((l) => l.includes(": REVIEW"))
        ? "All tested values re-solved, but some clearances between an outline and what is inside it changed without a rule saying so (marked REVIEW). If one of them is a wall, slab or cover thickness, hold it: dimension it with the thickness name, or make the overall size a formula."
        : "All tested values re-solved. Read the changed-length lists: anything that should keep its size (thicknesses, haunches) must not be there."
      : `${failures} tested value(s) failed — fix before finishing.`
  );
  return { text: out.join("\n"), failures };
}

function suggestionsReport(ctx: ToolContext): string {
  const report = ctx.ws.completion();
  const byId = new Map<string, IntentAction>();
  const out: string[] = [`Freedom left: ${report.dof}${report.anchored ? "" : " (not anchored)"}.`];
  for (const q of report.quickFixes) {
    byId.set(q.id, q);
    out.push(`[${q.id}] ${q.title} — removes ${q.dofRemoved}`);
  }
  for (const g of report.groups) {
    out.push(`${g.motion} — ${g.question}${g.blockedBy ? ` (blocked: ${g.blockedBy})` : ""}`);
    for (const o of g.options) {
      if (o.isDeliberateFreedom) continue;
      byId.set(o.id, o);
      const names = o.createsParameters.map((p) => `${p.name}=${fmt(p.value)}`).join(", ");
      out.push(`  [${o.id}] ${o.title}${names ? ` (creates ${names})` : ""} — removes ${o.dofRemoved}`);
    }
  }
  ctx.suggestions = { revision: ctx.ws.revision, byId };
  if (byId.size === 0) out.push("No suggestions: nothing the kernel can see is left to hold.");
  return ctx.ws.relabel(out.join("\n"));
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

function substitute(value: unknown, args: Args, ws: DraftingWorkspace): unknown {
  if (Array.isArray(value)) return value.map((v) => substitute(v, args, ws));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, args, ws)]));
  }
  if (typeof value !== "string") return value;
  const whole = value.match(/^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/);
  if (whole) {
    if (!(whole[1] in args)) throw new ToolError(`Macro argument ${whole[1]} was not given.`);
    return args[whole[1]];
  }
  const text = value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, k) => String(args[k] ?? ""));
  if (text.startsWith("=")) {
    let expr = text.slice(1);
    for (const [k, v] of Object.entries(args)) {
      if (typeof v === "number") expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), `(${v})`);
    }
    return ws.calculate(expr);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function runTool(ctx: ToolContext, name: string, args: Args): Promise<ToolOutcome> {
  const stage = stageOf(name);
  const before = ctx.ws.revision;
  try {
    const result = await dispatch(ctx, name, args);
    return { ok: true, stage, mutated: ctx.ws.revision !== before, ...result };
  } catch (err) {
    const text = err instanceof ToolError ? err.message : `Tool failed: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, stage, mutated: ctx.ws.revision !== before, text };
  }
}

/** Tools that put free sketch geometry on the drawing (the sketch route). */
const SKETCH_GEOMETRY = new Set(["draw_line", "draw_polyline", "draw_rectangle", "draw_circle", "chamfer", "offset", "trim", "split", "move", "copy", "mirror", "rotate", "explode", "classify", "make_parametric", "auto_rules", "rule", "dimension"]);

/**
 * Nothing is drawn before a plan. The plan also fixes the route: a sketch
 * (one small profile held by rules) or a construction (everything else).
 */
function gate(ctx: ToolContext, name: string): void {
  const plan = ctx.ws.construction.plan;
  const draws = SKETCH_GEOMETRY.has(name) || name.startsWith("draw_") || name.startsWith("macro_") || name === "annotate";
  if (!draws) return;
  if (!plan) {
    throw new ToolError(
      "Plan first. Before any geometry, call plan: your analysis of the reference (parts, topology, symmetry, line types, materials), the values you read and the relations between them (the engine evaluates them), cross-checks against numbers the reference also writes, the features in build order, and everything the reference writes (dimensions, levels, texts) for verify."
    );
  }
  if (plan.route === "construction" && name !== "annotate") {
    const hasFree = ctx.ws.shapes.length > 0;
    if (!hasFree || name.startsWith("draw_")) {
      throw new ToolError(
        name === "dimension"
          ? "In the construction route a dimension is annotation: annotate kind=dimension from/to (the value is measured from your geometry)."
          : `${name} belongs to the sketch route, and you planned the construction route. Use construct (coordinates as expressions of your plan values), transform (mirror, copy, offset, rotate, move), boolean, remove and annotate.`
      );
    }
  }
}

async function dispatch(ctx: ToolContext, name: string, a: Args): Promise<Omit<ToolOutcome, "ok" | "stage" | "mutated">> {
  const ws = ctx.ws;
  gate(ctx, name);
  switch (name) {
    case "plan":
      return { text: recordPlan(ws, a) };

    case "construct":
      return { text: construct(ws, a) };

    case "transform":
      return { text: transform(ws, a) };

    case "boolean":
      return { text: booleanOp(ws, a) };

    case "remove":
      return { text: removeEntities(ws, a) };

    case "measure":
      return { text: measure(ws, a) };

    case "verify":
      return { text: verifyConstruction(ws).text };

    case "compare_reference":
      return compareReference(ctx, a);

    case "zoom_reference":
      return zoomReference(ctx, a);

    case "annotate": {
      // Many at once: each item is one annotation; each is added or refused on its own.
      if (Array.isArray(a.items) && a.items.length) {
        const lines: string[] = [];
        let failed = 0;
        for (const [i, item] of (a.items as Args[]).entries()) {
          try {
            lines.push(`${i + 1}. ${annotateOne(ctx, { feature: a.feature, ...item }).text}`);
          } catch (e) {
            failed++;
            lines.push(`${i + 1}. REFUSED: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (failed === a.items.length) throw new ToolError(lines.join("\n"));
        return { text: `${a.items.length - failed} of ${a.items.length} added.\n${lines.join("\n")}` };
      }
      return annotateOne(ctx, a);
    }

    case "look": {
      const detail = optStr(a, "detail") ?? "summary+shapes";
      const built = ws.construction.plan ? describeConstruction(ws, detail) : "";
      const free = ws.shapes.length || !built ? lookReport(ws, detail, optStr(a, "filter")) : "";
      return { text: [built, free].filter(Boolean).join("\n\n") };
    }

    case "view": {
      const built = ws.construction.plan?.route === "construction";
      const window = viewWindow(ws, a);
      const img = renderScene(buildScene(ws), { labels: a.labels !== false, window, ...(built ? { width: 1600, height: 1000 } : {}) });
      ctx.viewedRevision = ws.revision;
      return {
        text: `Rendered ${fmt(img.width)}x${fmt(img.height)} px at ${img.mmPerPixel.toFixed(1)} mm per pixel. The image is attached — compare it with the intent${ctx.hasReference ? " and the reference image" : ""}.`,
        image: { mimeType: "image/png", data: img.data },
      };
    }

    case "draw_line": {
      const r = ws.drawLine(optStr(a, "name"), pt(a, "from"), pt(a, "to"), a.construction === true);
      return { text: `Drew ${r.id}${commitNote(r.commit)}.` };
    }

    case "draw_polyline": {
      const raw = a.points;
      if (!Array.isArray(raw)) throw new ToolError(`"points" must be [[x, y], ...].`);
      const pts = raw.map((p, i) => {
        try {
          return pt({ p } as Args, "p");
        } catch {
          throw new ToolError(`Point ${i + 1} of "points" is not [x, y].`);
        }
      });
      const r = ws.drawPolyline(optStr(a, "name"), pts, a.closed !== false, a.construction === true);
      return {
        text:
          `Drew ${r.group}: edges ${r.group}_1..${r.group}_${r.ids.length} (edge k runs from pk to the next vertex; its ends are ${r.group}_k.start / ${r.group}_k.end)` +
          `${commitNote(r.commit)}. Vertices: ${ws.vertexList(r.group)}.`,
      };
    }

    case "draw_rect_or_poly_or_circle":
    case "draw_rect": {
      if (a.width !== undefined && a.height !== undefined && (a.x !== undefined || a.y !== undefined)) {
        return dispatch(ctx, "draw_rectangle", a);
      }
      if (a.center !== undefined && (a.radius !== undefined || (a as any).r !== undefined)) {
        return dispatch(ctx, "draw_circle", {
          name: a.name,
          center: a.center,
          radius: a.radius ?? (a as any).r,
        });
      }
      if (Array.isArray(a.points)) {
        return dispatch(ctx, "draw_polyline", a);
      }
      throw new ToolError('Use specific tool: "draw_rectangle" (name, x, y, width, height), "draw_circle" (name, center, radius), or "draw_polyline" (name, points).');
    }

    case "draw_rectangle": {
      const r = ws.drawRectangle(optStr(a, "name"), num(a, "x"), num(a, "y"), num(a, "width"), num(a, "height"));
      return { text: `Drew ${r.id}${commitNote(r.commit)}. Corners ${r.id}.bottom_left etc.; edges ${r.id}.top etc.` };
    }

    case "draw_circle": {
      const r = ws.drawCircle(optStr(a, "name"), pt(a, "center"), num(a, "radius"));
      return { text: `Drew ${r.id}${commitNote(r.commit)}.` };
    }

    case "chamfer": {
      const leg = num(a, "leg");
      const r = ws.chamfer(str(a, "corner"), leg, optNum(a, "leg2") ?? leg, optStr(a, "name"));
      const edge = ws.shapes.find((x) => x.id === r.id);
      const ends = edge && edge.type === "line" ? ` from (${fmt(edge.x1)}, ${fmt(-edge.y1)}) to (${fmt(edge.x2)}, ${fmt(-edge.y2)})` : "";
      return { text: `Cut the corner; new edge ${r.id}${ends}${commitNote(r.commit)}. Its ends are ${r.id}.start / ${r.id}.end.` };
    }

    case "offset": {
      const r = ws.offset(str(a, "target"), num(a, "distance"), str(a, "side"), optStr(a, "name"));
      const group = r.ids[0]?.replace(/_\d+$/, "");
      const verts = group && ws.groupMembers(group).length ? ` Vertices: ${ws.vertexList(group)}.` : "";
      return { text: `Offset created: ${r.ids.join(", ")}${commitNote(r.commit)}.${verts}` };
    }

    case "trim":
      return { text: `Trimmed${commitNote(ws.trimTo(str(a, "line"), str(a, "to"), optStr(a, "end") as "start" | "end" | undefined))}.` };

    case "split": {
      const r = ws.splitLine(str(a, "line"), pt(a, "at"));
      return { text: `Split into ${r.ids.join(" and ")}${commitNote(r.commit)}.` };
    }

    case "move": {
      const dx = num(a, "dx");
      const dy = num(a, "dy");
      const r = ws.transform(list(a, "targets"), (p) => ({ x: p.x + dx, y: p.y + dy }), "move");
      return { text: `Moved ${r.ids.length} shape(s)${commitNote(r.commit)}.` };
    }

    case "copy": {
      const dx = num(a, "dx");
      const dy = num(a, "dy");
      const count = Math.max(1, Math.min(50, Math.round(num(a, "count", 1))));
      const made: string[] = [];
      for (let i = 1; i <= count; i++) {
        const r = ws.transform(list(a, "targets"), (p) => ({ x: p.x + dx * i, y: p.y + dy * i }), "copy", `c${i}`);
        commitNote(r.commit);
        made.push(...r.ids);
      }
      return { text: `Copied: ${made.slice(0, 20).join(", ")}${made.length > 20 ? "…" : ""}.` };
    }

    case "mirror": {
      const p1 = pt(a, "axis_from");
      const p2 = pt(a, "axis_to");
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const L2 = dx * dx + dy * dy;
      if (L2 < 1e-9) throw new ToolError("The mirror axis needs two different points.");
      const f = (p: Pt) => {
        const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / L2;
        return { x: 2 * (p1.x + t * dx) - p.x, y: 2 * (p1.y + t * dy) - p.y };
      };
      const r = ws.transform(list(a, "targets"), f, a.keep_original === false ? "move" : "copy", "m");
      return { text: `${a.keep_original === false ? "Mirrored" : "Mirrored copies"}: ${r.ids.slice(0, 20).join(", ")}${commitNote(r.commit)}.` };
    }

    case "rotate": {
      const c = pt(a, "center");
      const t = (num(a, "angle") * Math.PI) / 180;
      const f = (p: Pt) => ({
        x: c.x + (p.x - c.x) * Math.cos(t) - (p.y - c.y) * Math.sin(t),
        y: c.y + (p.x - c.x) * Math.sin(t) + (p.y - c.y) * Math.cos(t),
      });
      const r = ws.transform(list(a, "targets"), f, a.copy === true ? "copy" : "move", "r");
      return { text: `Rotated: ${r.ids.slice(0, 20).join(", ")}${commitNote(r.commit)}.` };
    }

    case "delete":
      // In a construction, entities are removed from it (the model reaches for either name).
      if (ws.construction.plan?.route === "construction" && !list(a, "targets").some((id) => ws.shapes.some((s) => s.id === id))) {
        return { text: removeEntities(ws, { ids: list(a, "targets") }) };
      }
      return { text: `Deleted${commitNote(ws.deleteShapes(list(a, "targets")))}.` };

    case "explode": {
      const r = ws.explode(str(a, "target"));
      return { text: `Exploded into ${r.group}_1..${r.group}_4 (top, right, bottom, left)${commitNote(r.commit)}. Vertices: ${ws.vertexList(r.group)}.` };
    }

    case "rename":
      ws.rename(str(a, "target"), str(a, "name"));
      return { text: "Renamed." };

    case "rule": {
      const r = ws.addRule(str(a, "kind"), optStr(a, "a"), optStr(a, "b"), optStr(a, "about"));
      if (r.status === "refused") throw new ToolError(`Rule refused: ${r.message}`);
      return { text: r.status === "added" ? `Rule added (${r.id}): ${r.message}. Freedom left: ${ws.dof().dof}.` : `Not added — ${r.message.replace(/\.$/, "")}.` };
    }

    case "auto_rules": {
      const kinds = list(a, "kinds");
      const targets = a.targets ? list(a, "targets") : undefined;
      const r = ws.autoConstrain(kinds, targets);
      return {
        text: `Accepted ${r.added.length} detected rule(s)${r.added.length ? `: ${r.added.slice(0, 12).join("; ")}${r.added.length > 12 ? "; …" : ""}` : ""}. ${r.skipped} already implied. Freedom left: ${ws.dof().dof}.`,
      };
    }

    case "remove_rule": {
      const r = ws.removeRule(str(a, "id"));
      return { text: `Removed.${r.removedValues.length ? ` Also removed values: ${r.removedValues.join(", ")}.` : ""} Freedom left: ${ws.dof().dof}.` };
    }

    case "dimension": {
      const text = ws.dimension({
        name: str(a, "name"),
        what: str(a, "what"),
        a: str(a, "a"),
        b: optStr(a, "b"),
        value: optNum(a, "value"),
        resize: a.resize === true,
        reference: a.reference === true,
        group: optStr(a, "group"),
        description: optStr(a, "description"),
      });
      return { text: `${text} Freedom left: ${ws.dof().dof}.` };
    }

    case "formula":
      return { text: ws.formula(str(a, "name"), str(a, "expression"), optStr(a, "description")) };

    case "set_value":
      return { text: ws.setValue(str(a, "name"), num(a, "value")) };

    case "describe_value":
      return {
        text: ws.describeValue(str(a, "name"), {
          description: optStr(a, "description"),
          group: optStr(a, "group"),
          min: optNum(a, "min"),
          max: optNum(a, "max"),
          publish: typeof a.publish === "boolean" ? a.publish : undefined,
        }),
      };

    case "rename_value":
      return { text: ws.renameValue(str(a, "from"), str(a, "to")) };

    case "suggestions":
      return { text: suggestionsReport(ctx) };

    case "accept_suggestion": {
      const id = str(a, "id");
      if (ctx.suggestions.revision !== ws.revision || !ctx.suggestions.byId.has(id)) {
        suggestionsReport(ctx);
      }
      const action = ctx.suggestions.byId.get(id);
      if (!action) throw new ToolError(`No current suggestion "${id}". Call suggestions again — the list changes after every edit.`);
      const renames: Record<string, string> = {};
      // Names were shown relabelled; accept either spelling.
      for (const p of action.createsParameters) {
        const shown = ws.relabel(p.name);
        if (shown !== p.name) renames[p.name] = shown.replace(/[^A-Za-z0-9_]/g, "");
      }
      if (Array.isArray(a.names)) {
        for (const n of a.names as { from?: string; to?: string }[]) {
          if (!n?.from || !n?.to) continue;
          const original = action.createsParameters.find((p) => p.name === n.from || renames[p.name] === n.from)?.name ?? n.from;
          renames[original] = n.to.replace(/[^A-Za-z0-9_]/g, "");
        }
      }
      const c = ws.applySuggestion(action, renames);
      if (!c.ok) throw new ToolError(`Not applied: ${c.rejection}`);
      return { text: `Applied "${action.title}". Freedom left: ${ws.dof().dof}.` };
    }

    case "unit": {
      const id = ws.makeUnit(str(a, "name"), list(a, "targets"), a.rigid === true);
      return { text: `Unit ${str(a, "name")} created (${id})${a.rigid === true ? ", rigid" : ""}.` };
    }

    case "repeat":
      return {
        text: ws.repeat({
          unit: str(a, "unit"),
          count: Math.max(1, Math.round(num(a, "count"))),
          direction: (optStr(a, "direction") ?? "right") as "right",
          mode: (optStr(a, "mode") ?? "gap") as "gap",
          spacing: optNum(a, "spacing"),
          countName: optStr(a, "count_name"),
          spacingName: optStr(a, "spacing_name"),
        }),
      };

    case "check":
      return { text: checkReport(ws).text };

    case "flex_test": {
      const values = Array.isArray(a.values) ? (a.values as unknown[]).map(Number).filter(Number.isFinite) : undefined;
      return { text: flexReport(ws, optStr(a, "name"), values).text };
    }

    case "calculate": {
      const expr = str(a, "expression");
      return { text: `${expr} = ${ws.calculate(expr)}` };
    }

    case "research": {
      if (!ctx.research) throw new ToolError("Web research is not available in this session.");
      const r = await ctx.research(str(a, "question"));
      return {
        text: `${r.text}${r.sources.length ? `\nSources: ${r.sources.slice(0, 5).map((s) => s.title || s.uri).join("; ")}` : ""}`,
        sources: r.sources,
      };
    }

    case "define_tool": {
      const toolName = str(a, "name").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
      if (BASE_TOOLS.some((t) => t.name === toolName)) throw new ToolError(`${toolName} already exists.`);
      const params = Array.isArray(a.parameters) ? (a.parameters as { name: string; description?: string; type?: string }[]) : [];
      const steps = Array.isArray(a.steps) ? (a.steps as { tool: string; args_json?: string; args?: Args }[]) : [];
      if (steps.length === 0) throw new ToolError("A tool needs at least one step.");
      const parsed = steps.map((s, i) => {
        if (!s.tool || s.tool === "define_tool" || s.tool === "finish") throw new ToolError(`Step ${i + 1} cannot call ${s.tool}.`);
        if (!BASE_TOOLS.some((t) => t.name === s.tool) && !s.tool.startsWith("macro_")) throw new ToolError(`Step ${i + 1}: unknown tool ${s.tool}.`);
        let args: Args = s.args ?? {};
        if (s.args_json) {
          try {
            args = JSON.parse(s.args_json);
          } catch {
            throw new ToolError(`Step ${i + 1}: args_json is not valid JSON.`);
          }
        }
        return { tool: s.tool, args };
      });
      const def: MacroDefinition = {
        name: toolName,
        description: str(a, "description"),
        parameters: params.map((p) => ({ name: p.name, description: p.description ?? p.name, type: p.type === "string" ? "string" : "number" })),
        steps: parsed,
      };
      ws.macros = [...ws.macros.filter((m) => m.name !== toolName), def];
      return { text: `Tool macro_${toolName} is now available (${parsed.length} steps).` };
    }

    case "finish":
      return finish(ctx, a);

    default: {
      const cad = dispatchCadTool(ws, name, a);
      if (cad) return cad;
      if (name.startsWith("macro_")) {
        const macro = ws.macros.find((m) => `macro_${m.name}` === name);
        if (!macro) throw new ToolError(`Unknown tool ${name}.`);
        if (ctx.macroDepth > 3) throw new ToolError("Tools nested too deeply.");
        ctx.macroDepth++;
        const log: string[] = [];
        try {
          for (const [i, step] of macro.steps.entries()) {
            const resolved = substitute(step.args, a, ws) as Args;
            const r = await runTool(ctx, step.tool, resolved);
            log.push(`${i + 1}. ${step.tool}: ${r.text.split("\n")[0]}`);
            if (!r.ok) throw new ToolError(`${name} stopped at step ${i + 1}:\n${log.join("\n")}`);
          }
        } finally {
          ctx.macroDepth--;
        }
        return { text: log.join("\n") };
      }
      throw new ToolError(`Unknown tool "${name}".`);
    }
  }
}

function finish(ctx: ToolContext, a: Args): Omit<ToolOutcome, "ok" | "stage" | "mutated"> {
  const ws = ctx.ws;
  if (!ws.construction.plan) throw new ToolError("Not finished — there is no plan. Plan, construct, verify, compare, then finish.");
  if (ws.construction.plan.route === "construction") return finishConstruction(ctx, a);
  const note = optStr(a, "freedom_note");
  // Freedom that only moves construction lines is not a design question.
  if (note || (ws.dof().dof > 0 && ws.structuralFreedom() === 0)) {
    ws.sketch = { ...ws.sketch, meta: { ...ws.sketch.meta, freedomIsIntentional: true } };
  }
  const problems: string[] = [];
  const check = checkReport(ws);
  problems.push(...check.blockers);
  if (ctx.hasReference && ctx.viewedRevision !== ws.revision) {
    problems.push("The drawing changed since you last looked at it. Call view and compare it with the reference image first.");
  }
  if (problems.length === 0 && ws.shapes.length > 0) {
    const readiness = ws.readiness();
    for (const c of readiness.checks) if (c.status === "fail") problems.push(`${c.label}: ${c.detail}`);
  }
  if (problems.length) {
    throw new ToolError(`Not finished — fix these first:\n${problems.map((p) => `  * ${p}`).join("\n")}`);
  }
  ws.publish(str(a, "title"), note);
  if (!ws.cad.project.identity.drawingTitle || ws.cad.project.identity.drawingTitle === "General Arrangement Drawing") {
    ws.applyCad({ type: "CAD_SET_PROJECT", project: { ...ws.cad.project, identity: { ...ws.cad.project.identity, drawingTitle: str(a, "title") } } });
  }
  const manifest = ws.manifest();
  const parts: string[] = [];
  if (manifest.driving.length) parts.push(`sketch values ${manifest.driving.map((d) => `${d.name}=${fmt(d.value)}`).join(", ")}${manifest.derived.length ? `; worked out: ${manifest.derived.map((d) => d.name).join(", ")}` : ""}`);
  if (ws.cad.components.length) parts.push(`every value of ${ws.cad.components.map((c) => c.id).join(", ")}`);
  const audit = ws.cad.components.length ? runAuditFor(ws) : null;
  return {
    text: `Finished and published "${ws.title}". Run Mode shows: ${parts.join("; ") || "no values"}.${audit ? `\nAudit at finish: ${audit}` : ""}`,
    finished: true,
  };
}

/**
 * The construction route is done when verify passes on the drawing as it is
 * now and the agent has looked at it against the reference since the last
 * change. The component invariants still hold (checkReport).
 */
function finishConstruction(ctx: ToolContext, a: Args): Omit<ToolOutcome, "ok" | "stage" | "mutated"> {
  const ws = ctx.ws;
  const problems: string[] = [];
  const report = verifyConstruction(ws);
  if (!report.ok) problems.push(...report.problems);
  problems.push(...checkReport(ws).blockers.filter((b) => b !== "nothing drawn"));
  const explained = new Map<string, string>();
  for (const o of (Array.isArray(a.off_reference) ? a.off_reference : []) as Args[]) {
    const id = typeof o?.id === "string" ? o.id.trim() : "";
    const why = typeof o?.reason === "string" ? o.reason.trim() : "";
    if (id && why.length >= 15) explained.set(id, why);
  }
  const cmp = ctx.lastCompare;
  if (ctx.hasReference) {
    if (!cmp || cmp.revision !== ws.revision) {
      problems.push("The drawing changed since you last compared it with the reference. Call compare_reference and read what is off.");
    } else {
      for (const o of cmp.off) {
        if (!explained.has(o.id)) problems.push(`${o.id} is off the reference (${Math.round(o.onInk * 100)}% on its lines): fix it, or say in off_reference why the reference is not followed there (e.g. it draws that part out of scale and a written number governs).`);
      }
    }
  }
  if (problems.length) throw new ToolError(`Not finished — fix these first:\n${problems.map((p) => `  * ${p}`).join("\n")}`);
  ws.publish(str(a, "title"));
  if (!ws.cad.project.identity.drawingTitle || ws.cad.project.identity.drawingTitle === "General Arrangement Drawing") {
    ws.applyCad({ type: "CAD_SET_PROJECT", project: { ...ws.cad.project, identity: { ...ws.cad.project.identity, drawingTitle: str(a, "title") } } });
  }
  const plan = ws.construction.plan!;
  const typed = plan.values.filter((v) => /^-?\d+(\.\d+)?$/.test(v.expr.trim())).map((v) => v.name);
  const derived = plan.values.filter((v) => !typed.includes(v.name)).map((v) => v.name);
  const driving = (currentDefinition(ws)?.dimensions ?? []).filter((d) => d.drives).map((d) => `${d.id}→${d.drives}`);
  return {
    text: `Finished "${ws.title}" — constructed from scratch and verified.${cmp && ctx.hasReference ? ` Against the reference: ${Math.round(cmp.onShare * 100)}% of the linework lies on its lines${cmp.off.length ? `; kept off it, with reasons: ${cmp.off.map((o) => `${o.id} (${explained.get(o.id)})`).join("; ")}` : ""}.` : ""}${plan.expect.disputed.length ? ` Reported as contradictions on the reference: ${plan.expect.disputed.map((d) => `${d.what} (${d.reason})`).join("; ")}.` : ""} Run Mode shows the values you read (${typed.slice(0, 20).join(", ")}${typed.length > 20 ? "…" : ""}); ${derived.length} worked-out values follow them${plan.constraints.length ? `; ${plan.constraints.length} constraint(s) guard every edit` : ""}. Dimensions that drive a value when edited: ${driving.join(", ") || "none"}. Each value regenerates the drawing cleanly ±5% (verify).\nAudit at finish: ${runAuditFor(ws)}`,
    finished: true,
  };
}

// ---------------------------------------------------------------------------
// Reference comparison
// ---------------------------------------------------------------------------

async function compareReference(ctx: ToolContext, a: Args): Promise<Omit<ToolOutcome, "ok" | "stage" | "mutated">> {
  const ws = ctx.ws;
  const refs = ctx.references ?? [];
  if (!refs.length) throw new ToolError("No reference image was attached to this job; use view.");
  const index = Math.max(0, Math.min(refs.length - 1, Math.round(Number(a.image ?? 1)) - 1));
  const ev = constructionEvaluation(ws);
  if (!ev || !ev.loops.length) throw new ToolError("Nothing constructed yet to compare.");
  planScope(ws);
  const R = loadReference(ctx, index);
  // Construction frame → model (canvas Y flipped back): only the datum differs.
  const datum = ws.cad.settings.datumRL * 1000;
  const toModel = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - datum });

  const only = Array.isArray(a.entities) && a.entities.length ? new Set((a.entities as unknown[]).map(String)) : null;
  const part = only ? new Set(Object.entries(ws.construction.tags).filter(([id, f]) => only.has(id) || only.has(f)).map(([id]) => id).concat([...only])) : null;
  const lines = ev.loops.filter((l) => l.draw && l.layer !== "construction" && (!part || part.has(l.primitiveId)));
  if (!lines.length) throw new ToolError("None of those entities is a drawn outline.");
  const modelPts = lines.flatMap((l) => l.points.map(toModel));
  let start: Registration;
  const pairs = Array.isArray(a.pairs) ? (a.pairs as Args[]) : [];
  if (pairs.length >= 2) {
    try {
      start = registrationFromPairs(
        pairs.slice(0, 2).map((p, i) => ({
          model: toModel(evalPointArg(ws, p.model, `pair ${i + 1} model`)),
          px: { x: (Number(p.img_x) / 1000) * R.width, y: (Number(p.img_y) / 1000) * R.height },
        }))
      );
    } catch (e) {
      throw new ToolError(`Pairs: ${(e as Error).message}.`);
    }
  } else if (ctx.lastFit && ctx.lastFit.index === index) {
    start = ctx.lastFit.reg;
  } else {
    // From the extents: the construction's outline box onto the ink's box.
    const xs = modelPts.map((p) => p.x);
    const ys = modelPts.map((p) => p.y);
    let x0 = R.width;
    let x1 = 0;
    let y0 = R.height;
    let y1 = 0;
    for (let y = 0; y < R.height; y++) for (let x = 0; x < R.width; x++) if (R.dist[y * R.width + x] === 0) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
    const s = Math.min((x1 - x0) / Math.max(1, Math.max(...xs) - Math.min(...xs)), (y1 - y0) / Math.max(1, Math.max(...ys) - Math.min(...ys)));
    start = { s, ox: (x0 + x1) / 2 - s * ((Math.min(...xs) + Math.max(...xs)) / 2), oy: (y0 + y1) / 2 + s * ((Math.min(...ys) + Math.max(...ys)) / 2) };
  }
  // Sample every ~1.5 px of the reference, refine, then score each entity.
  const step = 1.5 / start.s;
  const entities = lines.map((l) => ({ id: l.primitiveId, samples: samplePolyline(l.points.map(toModel), l.closed, step) }));
  const all = entities.flatMap((e) => e.samples);
  const fit = refineRegistration(start, all.length > 6000 ? all.filter((_, i) => i % Math.ceil(all.length / 6000) === 0) : all, R.dist, R.width, R.height, 12);
  const reg = fit.reg;
  // A part's fit does not replace the whole drawing's.
  if (!part) ctx.lastFit = { index, reg };
  // A reference line is ~2 px wide and the fit is good to about a pixel: 3.5 px
  // separates a line drawn on its face from one drawn on the wrong face.
  const onPx = 3.5;
  // Dash gaps up to ~8 px on the reference still count as its line.
  const devs = deviations(entities, reg, R.dist, R.width, R.height, 40, onPx, 8);
  const px = (mm: number) => mm * reg.s;
  const total = devs.reduce((n, d) => n + d.onInk * (entities.find((e) => e.id === d.id)?.samples.length ?? 0), 0) / Math.max(1, all.length);
  const worst = [...devs].sort((p, q) => q.mean - p.mean);
  const off = worst.filter((d) => d.onInk < 0.85 && d.worst * reg.s > onPx);
  const marks = entities.flatMap((e) =>
    e.samples.filter((_, i) => i % 3 === 0).filter((p) => {
      const q = toImage(reg, p);
      const x = Math.round(q.x);
      const y = Math.round(q.y);
      return x < 0 || y < 0 || x >= R.width || y >= R.height || R.dist[y * R.width + x] > onPx * 1.6;
    })
  );
  const focusId = typeof a.focus === "string" ? a.focus.trim() : "";
  const focus = focusId ? devs.find((d) => d.id === focusId) : undefined;
  if (focusId && !focus) throw new ToolError(`"${focusId}" is not a constructed outline.`);
  let crop: { x: number; y: number; w: number; h: number } | undefined;
  if (focus) {
    // Around the entity's worst point, wide enough to show what the reference has there.
    const c = toImage(reg, focus.worstAt);
    const half = Math.max(90, Math.min(260, focus.worst * reg.s * 4));
    crop = clampCrop({ x: c.x - half * 1.5, y: c.y - half, w: half * 3, h: half * 2 }, R);
  }
  const img = renderOverlay(buildScene(ws), R, (p) => toImage(reg, p), { maxWidth: crop ? 1400 : 1600, maxScale: crop ? 4 : 1, crop, marks: marks.slice(0, 4000) });
  ctx.viewedRevision = ws.revision;
  // Part by part: each part's result replaces what the last comparison said about its entities.
  const kept = part && ctx.lastCompare?.revision === ws.revision ? ctx.lastCompare.off.filter((o) => !part.has(o.id)) : [];
  const scored = part && ctx.lastCompare?.revision === ws.revision ? ctx.lastCompare.parts ?? {} : {};
  const parts = { ...scored, [part ? [...(only ?? [])].join("+") : "*"]: { onShare: total, samples: all.length } };
  const share = Object.values(parts).reduce((n, p) => n + p.onShare * p.samples, 0) / Math.max(1, Object.values(parts).reduce((n, p) => n + p.samples, 0));
  ctx.lastCompare = { revision: ws.revision, onShare: part ? share : total, parts: part ? parts : undefined, off: [...kept, ...off.map((d) => ({ id: d.id, onInk: d.onInk, mean: d.mean }))] };
  const mmPerPx = 1 / reg.s;
  const text = [
    `Overlay: the reference faded, your construction in blue, red dots where your lines are more than ${fmt(onPx * mmPerPx)} mm (${onPx} px) from any reference line.`,
    `Fit: 1 px of the reference = ${fmt(mmPerPx)} mm; after refinement your lines sit on average ${fmt(fit.meanPx * mmPerPx)} mm from the reference's. ${Math.round(total * 100)}% of your linework lies on the reference's lines.`,
    off.length
      ? `Entities off the reference — fix each at its cause (a misread value, a wrong relation, a wrong face, a wrong extent); finish will ask you to explain any you keep, in off_reference:\n${off
          .slice(0, 15)
          .map((d) => `  ${d.id}: ${Math.round(d.onInk * 100)}% on the lines; where it is off, ${fmt(d.mean)} mm on average, worst ${fmt(d.worst)} mm near (${fmt(d.worstAt.x)}, ${fmt(d.worstAt.y + datum)})`)
          .join("\n")}`
      : "Every constructed outline lies on the reference's lines.",
    focus ? `The image is magnified ${fmt(img.scale)}× around ${focus.id}'s worst point.` : "",
    `The reference is a raster: ${fmt(mmPerPx)} mm per pixel is the finest this can see. Written numbers govern — a line off by less than a few pixels is drawn right if verify says its dimension is right. Before you explain a deviation away, look at it: compare_reference focus=<id>, or zoom_reference.`,
    ...located(a, reg, R, datum),
  ]
    .filter(Boolean)
    .join("\n");
  return { text, image: { mimeType: "image/png", data: img.data } };
}

/** Image points the agent asked for, in its own coordinates (the fitted scale). */
function located(a: Args, reg: Registration, R: { width: number; height: number }, datum: number): string[] {
  const pts = Array.isArray(a.locate) ? (a.locate as Args[]) : [];
  if (!pts.length) return [];
  return [
    "Located (± one pixel of the reference):",
    ...pts.map((p) => {
      const u = (Number(p.img_x) / 1000) * R.width;
      const v = (Number(p.img_y) / 1000) * R.height;
      const x = (u - reg.ox) / reg.s;
      const y = (reg.oy - v) / reg.s + datum;
      return `  ${p.label ? `${p.label}: ` : ""}(${fmt(x)}, ${fmt(y)})${Math.abs(y) > 1000 ? ` — RL ${(y / 1000).toFixed(3)}` : ""}`;
    }),
  ];
}

function loadReference(ctx: ToolContext, index: number) {
  const refs = ctx.references ?? [];
  if (!refs.length) throw new ToolError("No reference image was attached to this job.");
  if (!ctx.referenceCache || ctx.referenceCache.index !== index) {
    const ref = refs[index];
    let bmp;
    try {
      bmp = decodePng(Buffer.from(ref.data.replace(/^data:[^;]+;base64,/, ""), "base64"));
    } catch (e) {
      throw new ToolError(`The reference could not be read (${(e as Error).message}); compare it by eye with view.`);
    }
    ctx.referenceCache = { index, ...bmp, dist: distanceMap(inkMask(bmp), bmp.width, bmp.height) };
  }
  return ctx.referenceCache;
}

function clampCrop(c: { x: number; y: number; w: number; h: number }, R: { width: number; height: number }) {
  const w = Math.min(R.width, Math.max(40, c.w));
  const h = Math.min(R.height, Math.max(30, c.h));
  return { x: Math.max(0, Math.min(R.width - w, c.x)), y: Math.max(0, Math.min(R.height - h, c.y)), w, h };
}

/** A magnified look at parts of the reference, optionally with the construction over them. */
function zoomReference(ctx: ToolContext, a: Args): Omit<ToolOutcome, "ok" | "stage" | "mutated"> {
  const refs = ctx.references ?? [];
  if (!refs.length) throw new ToolError("No reference image was attached to this job.");
  const index = Math.max(0, Math.min(refs.length - 1, Math.round(Number(a.image ?? 1)) - 1));
  const list = (Array.isArray(a.regions) && a.regions.length ? (a.regions as unknown[]) : [a.region]).slice(0, 6);
  const regions = list.map((raw, i) => {
    const r = Array.isArray(raw) ? (raw as unknown[]).map(Number) : [];
    if (r.length !== 4 || !r.every(Number.isFinite) || r[2] <= r[0] || r[3] <= r[1]) throw new ToolError(`Region ${i + 1} must be [left, top, right, bottom] in 0–1000 of the image, right > left, bottom > top.`);
    return r;
  });
  const R = loadReference(ctx, index);
  const withDrawing = a.overlay === true;
  const fit = ctx.lastFit && ctx.lastFit.index === index ? ctx.lastFit.reg : null;
  if (withDrawing && !fit) throw new ToolError("There is no fit yet: call compare_reference once, then zoom with overlay.");
  const scene = withDrawing ? buildScene(ctx.ws) : { lines: [], circles: [], dims: [] };
  const shots = regions.map((r) => {
    const crop = clampCrop({ x: (r[0] / 1000) * R.width, y: (r[1] / 1000) * R.height, w: ((r[2] - r[0]) / 1000) * R.width, h: ((r[3] - r[1]) / 1000) * R.height }, R);
    const img = renderOverlay(scene, R, (p) => (fit ? toImage(fit, p) : p), { maxWidth: 1400, maxScale: 4, crop, fade: withDrawing });
    return { r, img };
  });
  const mm = fit ? ` 1 px of the reference = ${fmt(1 / fit.s)} mm.` : "";
  const text = shots
    .map((s, i) => `Image ${i + 1}: region x ${fmt(s.r[0])}–${fmt(s.r[2])}, y ${fmt(s.r[1])}–${fmt(s.r[3])} (thousandths), magnified ${fmt(s.img.scale)}×`)
    .join("\n");
  const [first, ...rest] = shots.map((s) => ({ mimeType: "image/png", data: s.img.data }));
  return { text: `Reference ${index + 1}${withDrawing ? ", your construction in blue" : ""}.${mm}\n${text}`, image: first, images: rest };
}

/**
 * The reference cut into overlapping tiles, magnified — sent with the brief so
 * the model reads every number and text up close in its first turn instead of
 * zooming region by region. Null when the image cannot be decoded (not PNG).
 */
export function readingTiles(ref: { data: string }): { text: string; images: { mimeType: string; data: string }[] } | null {
  let bmp;
  try {
    bmp = decodePng(Buffer.from(ref.data.replace(/^data:[^;]+;base64,/, ""), "base64"));
  } catch {
    return null;
  }
  const cols = bmp.width >= bmp.height ? 3 : 2;
  const rows = bmp.width >= bmp.height ? 2 : 3;
  const overlap = 0.08;
  const images: { mimeType: string; data: string }[] = [];
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.max(0, c / cols - overlap / 2);
      const x1 = Math.min(1, (c + 1) / cols + overlap / 2);
      const y0 = Math.max(0, r / rows - overlap / 2);
      const y1 = Math.min(1, (r + 1) / rows + overlap / 2);
      const crop = { x: x0 * bmp.width, y: y0 * bmp.height, w: (x1 - x0) * bmp.width, h: (y1 - y0) * bmp.height };
      const img = renderOverlay({ lines: [], circles: [], dims: [] }, bmp, (p) => p, { maxWidth: 1200, maxScale: 3, crop, fade: false });
      images.push({ mimeType: "image/png", data: img.data });
      lines.push(`Tile ${images.length}: x ${Math.round(x0 * 1000)}–${Math.round(x1 * 1000)}, y ${Math.round(y0 * 1000)}–${Math.round(y1 * 1000)} (thousandths of the reference), magnified ${fmt(img.scale)}×`);
    }
  }
  return {
    text: `The reference, magnified in ${images.length} overlapping tiles (in reading order) so every number and text can be read exactly:\n${lines.join("\n")}`,
    images,
  };
}
