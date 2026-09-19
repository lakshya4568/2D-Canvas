/**
 * The CAD document layer — everything a drawing carries besides its geometry.
 *
 * Geometry (shapes, the authoring sketch, component instances) says WHAT the
 * structure is. This file says how a drawing presents it: which layer an entity
 * sits on, how that layer plots, what is written on the sheet, which areas are
 * hatched as concrete or earth, and which levels are called out. A general
 * arrangement drawing is judged on both halves; a canvas that only has the
 * first is not a CAD drawing.
 *
 * Coordinates here are CANVAS coordinates (millimetres, Y down), the same frame
 * the shapes live in, so an annotation and the edge it points at never need a
 * conversion to agree. Heights of text and arrowheads are PAPER millimetres; the
 * document's annotation scale turns them into model millimetres, which is how a
 * 2.5 mm note stays 2.5 mm on an A1 sheet whether the view is at 1:50 or 1:200.
 *
 * Nothing in this file is bridge-specific. Bridge vocabulary lives in
 * `lib/bridge`; this is the drafting layer any 2D drawing needs.
 */

import type { Point } from "@/lib/geometry/types";

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export type LineType = "continuous" | "hidden" | "center" | "phantom" | "dashdot" | "dotted";

/**
 * What a layer is FOR. Standards name layers differently (BRG-OUTLINE,
 * C-WALL-OUTL, S-CONC...), but they all answer the same handful of questions;
 * tools and validators ask by category, never by a literal layer name, so a
 * project can swap its layer standard without breaking either.
 */
export type LayerCategory =
  | "outline"
  | "secondary"
  | "hidden"
  | "centre"
  | "dimension"
  | "text"
  | "leader"
  | "hatch"
  | "rebar"
  | "existing"
  | "proposed"
  | "survey"
  | "reference"
  | "construction"
  | "title"
  | "revision"
  | "level"
  | "water"
  | "ground"
  | "temporary"
  | "safety"
  | "general";

export interface Layer {
  id: string;
  name: string;
  category: LayerCategory;
  /** Screen and plot colour, #rrggbb. */
  color: string;
  lineType: LineType;
  /** Plotted lineweight in mm (0.13, 0.18, 0.25, 0.35, 0.5, 0.7 ...). */
  lineWeight: number;
  visible: boolean;
  /** Frozen layers are neither drawn nor selectable nor snapped to. */
  frozen: boolean;
  /** Locked layers are drawn and snapped to but cannot be edited. */
  locked: boolean;
  /** False for construction/guide layers that must never reach a sheet. */
  plot: boolean;
  description?: string;
}

export interface LayerStandard {
  id: string;
  name: string;
  description: string;
  layers: Layer[];
}

// ---------------------------------------------------------------------------
// Entity metadata — carried by shapes and annotations alike
// ---------------------------------------------------------------------------

export type EntitySource = "user" | "agent" | "template" | "import" | "component";

export interface EntityMeta {
  layerId?: string;
  /** Controlled vocabulary first (lib/bridge/roles.ts), project extensions allowed. */
  semanticRole?: string;
  source?: EntitySource;
  /** Set when a component instance generated this entity. */
  componentInstanceId?: string;
  printable?: boolean;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

/**
 * Where an annotation attaches.
 *
 * `point` is a fixed location. `shape` follows a shape's handle, so a leader
 * pointing at a wall keeps pointing at it when the wall moves — the difference
 * between an associative note and a loose one (§9 of the tooling blueprint).
 */
export type AnchorRef =
  | { kind: "point"; x: number; y: number }
  | { kind: "shape"; shapeId: string; handle: ShapeHandle };

export type ShapeHandle = "start" | "end" | "mid" | "center" | `v${number}`;

export type AnnotationKind =
  | "text"
  | "leader"
  | "dimension"
  | "level"
  | "hatch"
  | "marker"
  | "table"
  | "revcloud";

export interface AnnotationBase extends EntityMeta {
  id: string;
  type: AnnotationKind;
  isVisible?: boolean;
  isLocked?: boolean;
}

export type TextAlign = "left" | "center" | "right";

export interface TextAnnotation extends AnnotationBase {
  type: "text";
  at: AnchorRef;
  /** One or more lines; `\n` separates lines (MTEXT behaviour). */
  text: string;
  /** Paper millimetres. */
  height: number;
  rotation?: number;
  align?: TextAlign;
  /** Paper millimetres; wraps words when set. */
  wrapWidth?: number;
  bold?: boolean;
  /** Where `at` sits vertically on the text block. Default `top`. */
  valign?: "top" | "middle" | "bottom";
}

export interface LeaderAnnotation extends AnnotationBase {
  type: "leader";
  /** Arrow tip first, then the elbow(s); text sits at the last point. */
  points: AnchorRef[];
  text: string;
  height: number;
  /**
   * `end` (default): a short landing, then the text beside it.
   * `above`: the last segment is the shelf and the text sits on it — the usual
   * GAD callout ("HAUNCH 600 X 600mm" written over its leader line).
   */
  placement?: "end" | "above";
  /** Arrowhead at the tip (default), a dot (pointing into an area), or nothing. */
  arrow?: "arrow" | "dot" | "none";
}

export type DimensionKind = "linear" | "aligned" | "angular" | "radius" | "diameter" | "ordinate";

export interface DimensionAnnotation extends AnnotationBase {
  type: "dimension";
  kind: DimensionKind;
  p1: AnchorRef;
  p2: AnchorRef;
  /** Angular: the vertex. Radius/diameter: unused. */
  p3?: AnchorRef;
  /** Linear only: measure along x or y. Omitted: whichever is larger. */
  axis?: "x" | "y";
  /**
   * Distance of the dimension line from the measured points, model mm, signed:
   * positive is to the left of p1→p2 in canvas coordinates.
   */
  offset: number;
  /**
   * `reference` shows what the geometry measures. `driving` additionally names
   * the parameter that controls it, so editing the number changes the design.
   */
  mode: "reference" | "driving";
  /** Parameter this dimension drives (component instance parameter name). */
  drives?: string;
  /** Never silently contradicts the geometry: shown with a marker if it differs. */
  textOverride?: string;
  prefix?: string;
  suffix?: string;
  /**
   * Draw the dimension line without its number — used when the value is
   * written beside it in a note that reads from the same geometry (e.g.
   * "4000 mm EARTH CUSHION"). Not an override: nothing contradicts the geometry.
   */
  hideValue?: boolean;
  /** Paper millimetres. */
  height?: number;
  /** Decimal places shown. */
  precision?: number;
}

/**
 * A reduced-level callout. The value is READ from the geometry — the point's
 * elevation in the document's datum — so a level marker cannot disagree with
 * the line it marks. A declared value that differs is reported by the audit.
 */
export interface LevelAnnotation extends AnnotationBase {
  type: "level";
  at: AnchorRef;
  /** "RL", "HFL", "BED LEVEL", "F.L." ... */
  label: string;
  /** Which way the triangle points and the text runs. */
  side?: "left" | "right";
  /** The value the author SAYS this level is (m); checked against geometry. */
  declaredValue?: number;
  height?: number;
  /**
   * `marker` (default): triangle standing on the level with "LABEL +RL".
   * `gad`: the Indian Railways GAD callout — the text sits on the level line at
   * its start, e.g. "PROP. FORMATION LEVEL = 105.000M." The line itself is
   * drawn geometry; this only writes on it.
   */
  style?: "marker" | "gad";
  /** Text template: `{label}`, `{rl}` (3 decimals), `{rl+}` (signed). */
  format?: string;
  /** Extra symbol after the text: water (HFL/LWL) or ground (bed). */
  symbol?: "none" | "water" | "ground";
}

export type HatchMaterial =
  | "concrete"
  | "rcc"
  | "pcc"
  | "earth"
  | "backfill"
  | "masonry"
  | "brick"
  | "water"
  | "steel"
  | "rock"
  | "sand"
  | "ballast"
  | "boulder"
  | "gravel"
  | "pitching"
  | "granular"
  | "solid";

export type HatchBoundary =
  /** Associative: re-traced from these shapes' current geometry every render. */
  | { kind: "shapes"; shapeIds: string[]; holeShapeIds?: string[] }
  /** Fixed outline (component output is regenerated, so this stays in step). */
  | { kind: "polygon"; outer: Point[]; holes?: Point[][] };

export interface HatchAnnotation extends AnnotationBase {
  type: "hatch";
  boundary: HatchBoundary;
  material: HatchMaterial;
  /** Pattern spacing multiplier; 1 = the material's default at annotation scale. */
  scale?: number;
  angle?: number;
}

export type MarkerKind = "section" | "detail" | "north" | "kilometrage" | "flow" | "centreline";

export interface MarkerAnnotation extends AnnotationBase {
  type: "marker";
  kind: MarkerKind;
  at: AnchorRef;
  /** Section/detail: the cut line's second point. Flow/kilometrage: direction. */
  to?: AnchorRef;
  /** "A", "1", "TO KM 1245", ... */
  label?: string;
  height?: number;
}

export interface TableAnnotation extends AnnotationBase {
  type: "table";
  at: AnchorRef;
  title?: string;
  rows: string[][];
  /** Paper millimetres per column. */
  columnWidths?: number[];
  height?: number;
}

export interface RevisionCloudAnnotation extends AnnotationBase {
  type: "revcloud";
  points: Point[];
  label?: string;
}

export type Annotation =
  | TextAnnotation
  | LeaderAnnotation
  | DimensionAnnotation
  | LevelAnnotation
  | HatchAnnotation
  | MarkerAnnotation
  | TableAnnotation
  | RevisionCloudAnnotation;

// ---------------------------------------------------------------------------
// The drawing's own settings
// ---------------------------------------------------------------------------

export interface DrawingSettings {
  units: "mm";
  /** 100 means annotation is sized for a 1:100 sheet. */
  annotationScale: number;
  /**
   * Reduced level (m) of canvas y = 0. Canvas y runs DOWN, so a point at
   * canvas y = -105500 sits at RL datum + 105.500 m.
   */
  datumRL: number;
  /** Default paper text height, mm. */
  textHeight: number;
  /** Dimension text height, paper mm (default: the text height). */
  dimTextHeight?: number;
  /** Arrowhead length for dimensions and callouts, paper mm (default 2.5). */
  arrowSize?: number;
  /** Default dimension decimal places. */
  dimensionPrecision: number;
  layerStandardId: string;
}

export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = {
  units: "mm",
  annotationScale: 50,
  datumRL: 0,
  textHeight: 2.5,
  dimensionPrecision: 0,
  layerStandardId: "ir-bridge-gad",
};

/** Paper mm → model mm at the drawing's annotation scale. */
export function paperToModel(paperMm: number, settings: Pick<DrawingSettings, "annotationScale">): number {
  return paperMm * settings.annotationScale;
}

/** The reduced level (m) at a canvas y. */
export function levelAt(canvasY: number, settings: Pick<DrawingSettings, "datumRL">): number {
  return settings.datumRL - canvasY / 1000;
}

/** The canvas y of a reduced level (m). */
export function canvasYOfLevel(rl: number, settings: Pick<DrawingSettings, "datumRL">): number {
  return -(rl - settings.datumRL) * 1000;
}
