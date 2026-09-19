/**
 * Constructive parametric components (UPCE-MASTER-1.0 §23, blueprint §10–11).
 *
 * WHY THIS EXISTS — the degrees-of-freedom problem at bridge scale.
 *
 * A free-hand sketch is made rigid by constraints, and its degrees of freedom
 * are counted and removed one by one (§30). That is the right tool for a single
 * profile a draftsman drew. It does not scale to a whole bridge: a GAD with
 * abutments, piers, a deck, bearings, wing walls, foundations and levels has
 * thousands of coordinates, and asking anyone — a person or an agent — to pin
 * every one of them with a rule, then prove the count is zero, is the "hectic"
 * part the user rejected.
 *
 * A component takes the other route to the same guarantee. Every coordinate is
 * WRITTEN as an expression of named parameters, in the component's own frame:
 *
 *     inner-left wall face  x = SideWallThickness
 *     cell i left face      x = SideWallThickness + i * (ClearSpan + InteriorWallThickness)
 *
 * so the geometry is fully determined by construction — there is no free
 * coordinate left to count — and a change to any parameter regenerates exactly
 * what depends on it and nothing else. In the vocabulary of §30.3 this is a
 * well-constrained system already in block-triangular form with 1×1 blocks,
 * solved in closed form in dependency order; no iterative solve, no drift, no
 * DOF bookkeeping, at any size.
 *
 * What replaces the DOF gate is what the DOF gate was a proxy for: explicit
 * INVARIANTS (walls stay positive, openings stay inside the concrete, haunches
 * do not meet) checked on every regeneration, and refused when they fail.
 *
 * Rules kept from the master plan:
 *   - One definition format for every component and assembly (§23.1). The
 *     engine contains no bridge vocabulary; culverts, piers and railing posts
 *     are all data.
 *   - Counts are topology (§23.4): a repeat regenerates primitives with
 *     index-stable ids; the count is never a solver variable.
 *   - Composition is by placement/attachment in a parent frame (§23.2, §37),
 *     resolved in dependency order.
 *   - No conformal scaling (§8): nothing is ever scaled; each coordinate is
 *     re-evaluated from the values that define it.
 *
 * Coordinates in a definition are LOCAL, millimetres, Y UP (engineering
 * convention). The engine converts to canvas coordinates at the very end.
 */

import type { HatchMaterial, LayerCategory } from "@/lib/cad/types";

/** An expression over parameters, formulas, repeat indices and constants. */
export type Expr = string | number;
export type XY = [Expr, Expr];

export type ParameterKind = "length" | "level" | "angle" | "count" | "ratio" | "choice";

export interface ComponentParameter {
  name: string;
  label?: string;
  kind: ParameterKind;
  /** mm for lengths, m for levels (reduced levels), deg, "-" for counts/ratios. */
  unit: "mm" | "m" | "deg" | "-";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  /** Groups the Run form: Opening, Structure, Levels, Foundation, ... */
  group?: string;
  description?: string;
  /** For `choice`: value → label. */
  options?: { value: number; label: string }[];
  /**
   * Where a value like this should come from before a drawing may be issued.
   * Template defaults are drafting aids only (railway guide §1.3).
   */
  sourceRequired?: boolean;
  /**
   * Where the value came from, when a drawing was constructed from a brief or
   * a reference: given (written there), scaled (measured off an image),
   * drafting (a layout choice), required (not provided — a placeholder until
   * someone enters the approved value).
   */
  provenance?: "given" | "scaled" | "drafting" | "required";
  /**
   * An "auto" value: until someone types a number, the parameter follows this
   * expression (e.g. rail level = formation level + 0.762). Typing a value
   * takes it over; clearing the value hands it back to the expression.
   */
  defaultExpr?: Expr;
}

export interface ComponentFormula {
  name: string;
  expr: Expr;
  label?: string;
  unit?: "mm" | "m" | "deg" | "-" | "m2";
  description?: string;
  group?: string;
  /** Shown in the Run form as a read-only derived value. */
  report?: boolean;
  /** Formula ids in the bridge knowledge base this implements (e.g. "RCR-LVL-002"). */
  cites?: string[];
}

/**
 * Repeats a primitive or child: the index variable is visible to every
 * expression inside. A table repeat runs once per row, and each row's columns
 * are visible as `<Table>_<column>` (plus `<Table>_before_<column>`, the sum
 * over the rows above — a stack of layers is placed with it).
 */
export type RepeatSpec = { count: Expr; index: string; table?: undefined } | { table: string; index: string; count?: undefined };

/** A column of a table value. */
export interface TableColumn {
  name: string;
  label?: string;
  kind: "number" | "text" | "choice";
  unit?: "mm" | "m" | "-";
  default: number | string;
  options?: { value: number; label: string }[];
}

export type TableRow = Record<string, number | string>;

/**
 * A list-valued parameter: rows of named columns (foundation layers, span
 * arrangement, strata). Numeric columns are summed into `<Table>_sum_<column>`
 * and the row count is `<Table>_count`; a repeat with `table` walks the rows.
 */
export interface TableDef {
  name: string;
  label?: string;
  group?: string;
  description?: string;
  columns: TableColumn[];
  /** Default rows. */
  rows: TableRow[];
  minRows?: number;
  maxRows?: number;
}

interface PrimitiveBase {
  id: string;
  /** Semantic role (lib/bridge/roles.ts vocabulary or a project extension). */
  role: string;
  /** Layer category the entity lands on. */
  layer: LayerCategory;
  repeat?: RepeatSpec;
  /** Emitted only when this evaluates > 0. */
  when?: Expr;
  /** Human label, shown in the inspector and used for naming edges. */
  label?: string;
  /**
   * `false`: the loop exists only as a hatch boundary or hole (e.g. the void a
   * fill wraps around, which a child component already draws). Not emitted.
   */
  draw?: boolean;
}

/** Closed polyline. Consecutive duplicate vertices collapse (a haunch of size 0 is simply absent). */
export interface LoopPrimitive extends PrimitiveBase {
  kind: "loop";
  points: XY[];
}

/** Open polyline. */
export interface PathPrimitive extends PrimitiveBase {
  kind: "path";
  points: XY[];
}

export interface CirclePrimitive extends PrimitiveBase {
  kind: "circle";
  center: XY;
  r: Expr;
}

export type ComponentPrimitive = LoopPrimitive | PathPrimitive | CirclePrimitive;

/** A named point in the component frame — a port (§23.2) other components attach to. */
export interface AnchorDef {
  id: string;
  at: XY;
  label?: string;
  repeat?: RepeatSpec;
}

export interface DimensionDef {
  id: string;
  kind: "horizontal" | "vertical" | "aligned" | "radius" | "diameter";
  /** Text before / after the measured number, e.g. "V.C. " (the number is still measured). */
  prefix?: string;
  suffix?: string;
  /** Draw the line without the number (the value is written in a note beside it). */
  hideValue?: boolean;
  /** Layer category; default "dimension". */
  layer?: LayerCategory;
  from: XY;
  to: XY;
  /**
   * Distance of the dimension line from the measured points, local mm. For
   * horizontal: positive places it ABOVE the higher point; negative BELOW the
   * lower. For vertical: positive to the RIGHT, negative to the LEFT.
   */
  offset: Expr;
  /** The driving parameter this dimension controls when its value is edited. */
  drives?: string;
  repeat?: RepeatSpec;
  when?: Expr;
}

export interface LevelDef {
  id: string;
  /** The marked point; its Y is the level (reduced level = Y/1000 + datum). */
  at: XY;
  /** Words of the callout; `{Name}` placeholders are filled from values. */
  label: string;
  side?: "left" | "right";
  /** `marker` (triangle) or `gad` (text written on the level line). */
  style?: "marker" | "gad";
  /** `{label}`, `{rl}`, `{rl+}` — see LevelAnnotation.format. */
  format?: string;
  symbol?: "none" | "water" | "ground";
  /** Layer category; default "level". */
  layer?: LayerCategory;
  repeat?: RepeatSpec;
  when?: Expr;
}

export interface HatchDef {
  id: string;
  /** Loop primitive id. Every repeat instance of it is filled. */
  boundary: string;
  /** Loop primitive ids cut out of the fill (every instance). */
  holes?: string[];
  /**
   * The material, or a pick from a list by an expression evaluated for each
   * boundary instance (e.g. a table row's hatch column); `null` = not hatched.
   */
  material: HatchMaterial | { pick: Expr; from: (HatchMaterial | null)[] };
  /** Pattern angle in degrees (paper, counter-clockwise), e.g. along a slope. */
  angle?: Expr;
  /** Pattern spacing multiplier. */
  scale?: Expr;
  /** Evaluated for each boundary instance, with that instance's repeat index. */
  when?: Expr;
}

export interface TextDef {
  id: string;
  at: XY;
  /**
   * `{Name}` is replaced by the value; `{Name:m}` shows mm as metres,
   * `{Name:rl}` a signed level, `{Name:3}` fixed decimals, `{Name:label}` a
   * choice's label. `\n` starts a new line.
   */
  text: string;
  /** Paper millimetres. */
  height?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  bold?: boolean;
  /** Degrees, counter-clockwise, in the component frame. */
  rotate?: Expr;
  /** Write along this direction (reading angle of from→to); overrides `rotate`. */
  along?: [XY, XY];
  repeat?: RepeatSpec;
  when?: Expr;
  layer?: LayerCategory;
}

/** A callout: arrow at the first point, elbows, text at (or on) the last segment. */
export interface LeaderDef {
  id: string;
  points: XY[];
  text: string;
  /** Paper millimetres. */
  height?: number;
  placement?: "end" | "above";
  arrow?: "arrow" | "dot" | "none";
  /** Layer category; default "leader". */
  layer?: LayerCategory;
  repeat?: RepeatSpec;
  when?: Expr;
}

export type InvariantOp = ">" | ">=" | "<" | "<=";

/**
 * A condition the component must keep. `error` refuses the edit; `warning`
 * accepts it and reports it (standards bounds, §26: "Violations become
 * validation metadata, not solver logic").
 */
export interface InvariantDef {
  id: string;
  expr: Expr;
  op: InvariantOp;
  than: Expr;
  message: string;
  severity: "error" | "warning";
  /** Source record id (lib/bridge/sources.ts) for rule-derived bounds. */
  source?: string;
}

export interface Placement {
  /** Origin of the child frame, in the parent frame. */
  at: XY;
  /** Degrees, counter-clockwise. */
  rotate?: Expr;
  /** Mirror the child about its own Y axis (left/right hand). */
  mirror?: boolean;
}

/**
 * Put a child so its own anchor `self` lands on a sibling's anchor (plus an
 * offset). This is the port attachment of §23.2; siblings are resolved in
 * dependency order.
 */
export interface Attachment {
  to: string;
  anchor: string;
  self: string;
  offset?: XY;
  mirror?: boolean;
}

export interface ChildDef {
  id: string;
  component: string;
  /** Child parameter name → expression in the PARENT scope. */
  values?: Record<string, Expr>;
  /** Child table name → the parent table whose rows it takes. */
  tables?: Record<string, string>;
  place?: Placement;
  attach?: Attachment;
  repeat?: RepeatSpec;
  when?: Expr;
}

/** Engineering facts a component reports for the domain rules (lib/bridge/rules.ts). */
export interface FactDef {
  /** Fact key, e.g. "clear_opening_mm", "soffit_level_m", "pile_spacing_mm". */
  key: string;
  expr: Expr;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: "component" | "assembly";
  /** What it is: box_culvert, pier, abutment, pile_group, ... */
  semanticType: string;
  /** Which drawing view the geometry belongs to. */
  view: "section" | "elevation" | "plan" | "detail";
  /**
   * The scale this view is conventionally drawn at (100 = 1:100). The first
   * assembly placed on an empty drawing sets the annotation scale from it, so
   * text and arrows come out the size the drawing was designed for.
   */
  drawingScale?: number;
  description: string;
  version: string;
  tags?: string[];
  /** Source records the definition draws on. */
  sources?: string[];
  parameters: ComponentParameter[];
  formulas?: ComponentFormula[];
  primitives?: ComponentPrimitive[];
  anchors?: AnchorDef[];
  dimensions?: DimensionDef[];
  levels?: LevelDef[];
  hatches?: HatchDef[];
  texts?: TextDef[];
  leaders?: LeaderDef[];
  tables?: TableDef[];
  invariants?: InvariantDef[];
  children?: ChildDef[];
  facts?: FactDef[];
  /**
   * Where a drawing's own component came from. `drawn`: made parametric from
   * free geometry; the relationships written on its last instance are kept
   * here when it is turned back into geometry, so re-making it keeps them.
   */
  origin?: {
    kind: "drawn";
    relations?: Relationship[];
    customValues?: CustomValue[];
    /**
     * How the drawing was constructed, when an agent built it: its plan (the
     * analysis, values, checks and features) and which part each entity
     * belongs to. Travels with the drawing so the construction can be taken
     * up again later. Opaque to the engine.
     */
    construction?: { plan: unknown; tags: Record<string, string> };
  };
}

export type ValueUnit = "mm" | "m" | "deg" | "-" | "m2";

/** A value someone added to a placed component: a new input their relationships can use. */
export interface CustomValue {
  name: string;
  value: number;
  unit: ValueUnit;
  label?: string;
}

/**
 * A relationship someone wrote: `name = expr`. If `name` is one of the
 * component's values, that value stops being typed and follows the expression;
 * otherwise it is a new worked-out value, reported beside the others.
 */
export interface Relationship {
  name: string;
  expr: string;
  unit?: ValueUnit;
  label?: string;
}

/** A component placed in a drawing. */
export interface ComponentInstance {
  id: string;
  definitionId: string;
  name: string;
  /** Driving parameter values; anything missing uses the definition default. */
  values: Record<string, number>;
  /** Canvas position of the local origin, mm. */
  x: number;
  y: number;
  rotation?: number;
  mirror?: boolean;
  /**
   * Local Y is an absolute elevation (mm above datum) — the assembly places
   * geometry at true reduced levels so level markers read correctly. The
   * instance is then positioned by x only.
   */
  absoluteElevation?: boolean;
  locked?: boolean;
  /** Relationships added to this instance (Author mode). */
  relations?: Relationship[];
  /** Inputs added to this instance for its relationships. */
  customValues?: CustomValue[];
  /** Rows of the definition's tables; a table not listed uses its default rows. */
  tables?: Record<string, TableRow[]>;
}
