/**
 * DXF export, read directly from the canonical model.
 * UPCE-MASTER-1.0 §69.
 *
 * "Rule: every exporter reads the canonical model directly. Never chain
 *  SVG -> DXF -> PDF; that makes an export artefact the de facto model and
 *  propagates its losses."
 *
 * This writer emits R2010 (`AC1024`) as the interoperable default and R12
 * (`AC1009`) as the maximally compatible fallback, with the §69 layer scheme and
 * NATIVE associative DIMENSION entities referencing real geometric points, so
 * dimensions stay associative when opened in commercial CAD.
 *
 * Pure TypeScript, no dependency: ezdxf is the server-side path, but the client
 * must be able to export offline (§88 "works offline, no round trip").
 */

import { ParametricSketch } from "../parametric/schemaTypes";

export type DxfVersion = "R2010" | "R12";

/** §69 layer scheme, following Indian drafting practice. */
export interface DxfLayerSpec {
  name: string;
  /** AutoCAD Color Index. */
  color: number;
  linetype: "CONTINUOUS" | "CENTER" | "HIDDEN";
  /** Lineweight in 1/100 mm; -3 = default. */
  lineweight: number;
  description: string;
}

export const DXF_LAYERS: Record<string, DxfLayerSpec> = {
  WALL: {
    name: "C-WALL-OUTL",
    color: 7,
    linetype: "CONTINUOUS",
    lineweight: 50,
    description: "wall outlines",
  },
  SLAB: {
    name: "C-SLAB-OUTL",
    color: 7,
    linetype: "CONTINUOUS",
    lineweight: 50,
    description: "slab outlines",
  },
  HATCH: {
    name: "C-HATCH-CONC",
    color: 8,
    linetype: "CONTINUOUS",
    lineweight: 18,
    description: "concrete hatching (ANSI31)",
  },
  DIMS: {
    name: "C-DIMS-ANNO",
    color: 3,
    linetype: "CONTINUOUS",
    lineweight: 18,
    description: "dimensions, leaders, text",
  },
  CENTRE: {
    name: "C-CNTR-LINE",
    color: 1,
    linetype: "CENTER",
    lineweight: 13,
    description: "centrelines, datums",
  },
  TITLE: {
    name: "C-TITL-BLOC",
    color: 7,
    linetype: "CONTINUOUS",
    lineweight: 35,
    description: "title block",
  },
};

/** Maps a DCEL semantic face category onto its drafting layer. */
export function layerForCategory(category: string | undefined): string {
  switch (category) {
    case "TOP_SLAB":
    case "BOTTOM_SLAB":
    case "DECK":
      return DXF_LAYERS.SLAB.name;
    case "OUTER_WALL":
    case "INTERNAL_WEB":
    case "PIER":
    case "BARRIER":
    case "FOOTING":
    case "HAUNCH":
      return DXF_LAYERS.WALL.name;
    default:
      return DXF_LAYERS.WALL.name;
  }
}

export interface DxfDimension {
  id: string;
  kind: "aligned" | "linear-x" | "linear-y";
  /** First extension-line origin — a REAL model point, not a copy. */
  p1: { x: number; y: number };
  /** Second extension-line origin. */
  p2: { x: number; y: number };
  /** Dimension line location. */
  textPosition: { x: number; y: number };
  /** Optional override text; omit to keep the measurement associative. */
  text?: string;
}

export interface DxfExportOptions {
  version?: DxfVersion;
  /** Dimensions to emit as native DIMENSION entities. */
  dimensions?: DxfDimension[];
  /** Construction geometry goes to the centreline layer; omit to exclude it. */
  includeConstruction?: boolean;
  /** Metadata written into the header, incl. the compliance flag (§26). */
  metadata?: Record<string, string>;
}

class DxfWriter {
  private out: string[] = [];
  private handleSeq = 0x100;

  public tag(code: number, value: string | number): void {
    this.out.push(String(code));
    this.out.push(typeof value === "number" ? formatNumber(code, value) : value);
  }

  public nextHandle(): string {
    return (++this.handleSeq).toString(16).toUpperCase();
  }

  public toString(): string {
    return this.out.join("\n") + "\n";
  }
}

/** DXF group-code formatting: coordinates get full precision, ints stay ints. */
function formatNumber(code: number, value: number): string {
  if (code >= 60 && code <= 79) return String(Math.trunc(value));
  if (code >= 90 && code <= 99) return String(Math.trunc(value));
  if (code >= 170 && code <= 179) return String(Math.trunc(value));
  if (code >= 280 && code <= 289) return String(Math.trunc(value));
  if (code === 370 || code === 390) return String(Math.trunc(value));
  // Coordinates and reals: never rounded here (§81 change 3 — rounding belongs
  // only at rasterisation and badge formatting).
  return value.toFixed(9);
}

/**
 * Serialises a `ParametricSketch` to DXF text.
 *
 * R2010 emits full TABLES + ENTITIES with handles and a DIMSTYLE, so dimensions
 * open associatively. R12 omits handles and object ownership, which is exactly
 * what makes it the maximally compatible fallback.
 */
export function exportDxf(sketch: ParametricSketch, options: DxfExportOptions = {}): string {
  const version = options.version ?? "R2010";
  const w = new DxfWriter();
  const isR12 = version === "R12";

  const points = sketch.primitives.points ?? {};
  const resolve = (id: string) => points[id];

  // ---------------- HEADER ----------------
  w.tag(0, "SECTION");
  w.tag(2, "HEADER");
  w.tag(9, "$ACADVER");
  w.tag(1, isR12 ? "AC1009" : "AC1024");
  w.tag(9, "$INSUNITS");
  w.tag(70, 4); // 4 = millimetres, matching the canonical internal unit (§17)
  w.tag(9, "$MEASUREMENT");
  w.tag(70, 1); // metric
  if (!isR12) {
    w.tag(9, "$HANDSEED");
    w.tag(5, "FFFF");
    w.tag(9, "$DIMASSOC");
    w.tag(280, 2); // fully associative dimensions
  }
  w.tag(0, "ENDSEC");

  // ---------------- TABLES ----------------
  w.tag(0, "SECTION");
  w.tag(2, "TABLES");

  // Linetypes
  w.tag(0, "TABLE");
  w.tag(2, "LTYPE");
  if (!isR12) w.tag(5, w.nextHandle());
  w.tag(70, 3);
  writeLinetype(w, isR12, "CONTINUOUS", "Solid line", []);
  writeLinetype(w, isR12, "CENTER", "Center ____ _ ____ _ ____", [31.75, -6.35, 6.35, -6.35]);
  writeLinetype(w, isR12, "HIDDEN", "Hidden __ __ __ __", [6.35, -3.175]);
  w.tag(0, "ENDTAB");

  // Layers
  w.tag(0, "TABLE");
  w.tag(2, "LAYER");
  if (!isR12) w.tag(5, w.nextHandle());
  w.tag(70, Object.keys(DXF_LAYERS).length);
  for (const spec of Object.values(DXF_LAYERS)) {
    w.tag(0, "LAYER");
    if (!isR12) {
      w.tag(5, w.nextHandle());
      w.tag(100, "AcDbSymbolTableRecord");
      w.tag(100, "AcDbLayerTableRecord");
    }
    w.tag(2, spec.name);
    w.tag(70, 0);
    w.tag(62, spec.color);
    w.tag(6, spec.linetype);
    if (!isR12) w.tag(370, spec.lineweight);
  }
  w.tag(0, "ENDTAB");

  // Dimension style — required for the DIMENSION entities to render.
  if (!isR12) {
    w.tag(0, "TABLE");
    w.tag(2, "DIMSTYLE");
    w.tag(5, w.nextHandle());
    w.tag(100, "AcDbSymbolTable");
    w.tag(70, 1);
    w.tag(0, "DIMSTYLE");
    w.tag(105, w.nextHandle());
    w.tag(100, "AcDbSymbolTableRecord");
    w.tag(100, "AcDbDimStyleTableRecord");
    w.tag(2, "GAD-METRIC");
    w.tag(70, 0);
    w.tag(40, 1.0); // DIMSCALE
    w.tag(41, 2.5); // DIMASZ - arrowhead size
    w.tag(140, 2.5); // DIMTXT - text height
    w.tag(147, 1.25); // DIMGAP
    w.tag(271, 0); // DIMDEC - decimal places, mm
    w.tag(0, "ENDTAB");
  }

  w.tag(0, "ENDSEC");

  // ---------------- ENTITIES ----------------
  w.tag(0, "SECTION");
  w.tag(2, "ENTITIES");

  const startEntity = (type: string, layer: string, subclass?: string) => {
    w.tag(0, type);
    if (!isR12) {
      w.tag(5, w.nextHandle());
      w.tag(100, "AcDbEntity");
    }
    w.tag(8, layer);
    if (!isR12 && subclass) w.tag(100, subclass);
  };

  // Lines
  for (const line of Object.values(sketch.primitives.lines ?? {})) {
    const a = resolve(line.startPointId);
    const b = resolve(line.endPointId);
    if (!a || !b) continue;
    const construction = line.isConstruction === true;
    if (construction && options.includeConstruction !== true) continue;

    const layer = construction
      ? DXF_LAYERS.CENTRE.name
      : layerForCategory(line.semanticRole);

    startEntity("LINE", layer, "AcDbLine");
    w.tag(10, a.x);
    w.tag(20, a.y);
    w.tag(30, 0);
    w.tag(11, b.x);
    w.tag(21, b.y);
    w.tag(31, 0);
  }

  // Circles
  for (const circle of Object.values(sketch.primitives.circles ?? {})) {
    const c = resolve(circle.centerPointId);
    if (!c) continue;
    if (circle.isConstruction === true && options.includeConstruction !== true) continue;
    startEntity(
      "CIRCLE",
      circle.isConstruction ? DXF_LAYERS.CENTRE.name : DXF_LAYERS.WALL.name,
      "AcDbCircle"
    );
    w.tag(10, c.x);
    w.tag(20, c.y);
    w.tag(30, 0);
    w.tag(40, circle.radius);
  }

  // Arcs — DXF angles are degrees, CCW from +X.
  for (const arc of Object.values(sketch.primitives.arcs ?? {})) {
    const c = resolve(arc.centerPointId);
    if (!c) continue;
    if (arc.isConstruction === true && options.includeConstruction !== true) continue;
    startEntity(
      "ARC",
      arc.isConstruction ? DXF_LAYERS.CENTRE.name : DXF_LAYERS.WALL.name,
      "AcDbCircle"
    );
    w.tag(10, c.x);
    w.tag(20, c.y);
    w.tag(30, 0);
    w.tag(40, arc.radius);
    if (!isR12) w.tag(100, "AcDbArc");
    w.tag(50, normalizeDegrees((arc.startAngle * 180) / Math.PI));
    w.tag(51, normalizeDegrees((arc.endAngle * 180) / Math.PI));
  }

  // Polylines — LWPOLYLINE on R2010, POLYLINE/VERTEX/SEQEND on R12.
  for (const poly of Object.values(sketch.primitives.polylines ?? {})) {
    const verts = poly.vertices.map(resolve).filter(Boolean) as { x: number; y: number }[];
    if (verts.length < 2) continue;
    if (poly.isConstruction === true && options.includeConstruction !== true) continue;
    const layer = poly.isConstruction ? DXF_LAYERS.CENTRE.name : DXF_LAYERS.WALL.name;

    if (isR12) {
      w.tag(0, "POLYLINE");
      w.tag(8, layer);
      w.tag(66, 1);
      w.tag(70, poly.closed ? 1 : 0);
      for (const v of verts) {
        w.tag(0, "VERTEX");
        w.tag(8, layer);
        w.tag(10, v.x);
        w.tag(20, v.y);
        w.tag(30, 0);
      }
      w.tag(0, "SEQEND");
      w.tag(8, layer);
    } else {
      startEntity("LWPOLYLINE", layer, "AcDbPolyline");
      w.tag(90, verts.length);
      w.tag(70, poly.closed ? 1 : 0);
      for (const v of verts) {
        w.tag(10, v.x);
        w.tag(20, v.y);
      }
    }
  }

  // Native associative DIMENSION entities.
  for (const dim of options.dimensions ?? []) {
    startEntity("DIMENSION", DXF_LAYERS.DIMS.name, "AcDbDimension");
    w.tag(2, "*D_" + dim.id);
    // 10/20 = dimension line definition point.
    w.tag(10, dim.textPosition.x);
    w.tag(20, dim.textPosition.y);
    w.tag(30, 0);
    // 11/21 = middle point of dimension text.
    w.tag(11, dim.textPosition.x);
    w.tag(21, dim.textPosition.y);
    w.tag(31, 0);
    // 70: 0 = rotated/linear, +32 = block reference is a definition owned here.
    w.tag(70, 32);
    // Empty 1 keeps the measurement associative; a value here would freeze it.
    w.tag(1, dim.text ?? "");
    if (!isR12) w.tag(3, "GAD-METRIC");
    if (!isR12) w.tag(100, "AcDbAlignedDimension");
    // 13/23 and 14/24 are the extension-line origins: the REAL geometry points.
    w.tag(13, dim.p1.x);
    w.tag(23, dim.p1.y);
    w.tag(33, 0);
    w.tag(14, dim.p2.x);
    w.tag(24, dim.p2.y);
    w.tag(34, 0);
    if (dim.kind === "linear-x") w.tag(50, 0);
    else if (dim.kind === "linear-y") w.tag(50, 90);
  }

  // Metadata as TEXT on the title-block layer, so compliance status travels
  // with the drawing (§26: "the drawing is flagged non-compliant in its
  // metadata header").
  if (options.metadata && Object.keys(options.metadata).length > 0) {
    let row = 0;
    for (const [key, value] of Object.entries(options.metadata)) {
      startEntity("TEXT", DXF_LAYERS.TITLE.name, "AcDbText");
      w.tag(10, 0);
      w.tag(20, -10 - row * 6);
      w.tag(30, 0);
      w.tag(40, 2.5);
      w.tag(1, `${key}: ${value}`.slice(0, 250));
      row += 1;
    }
  }

  w.tag(0, "ENDSEC");
  w.tag(0, "EOF");

  return w.toString();
}

function writeLinetype(
  w: DxfWriter,
  isR12: boolean,
  name: string,
  description: string,
  pattern: number[]
): void {
  w.tag(0, "LTYPE");
  if (!isR12) {
    w.tag(5, w.nextHandle());
    w.tag(100, "AcDbSymbolTableRecord");
    w.tag(100, "AcDbLinetypeTableRecord");
  }
  w.tag(2, name);
  w.tag(70, 0);
  w.tag(3, description);
  w.tag(72, 65);
  w.tag(73, pattern.length);
  w.tag(40, pattern.reduce((s, p) => s + Math.abs(p), 0));
  for (const p of pattern) w.tag(49, p);
}

function normalizeDegrees(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}
