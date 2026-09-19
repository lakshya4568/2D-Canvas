/**
 * Make a drawing parametric — the manual route to a component.
 *
 * A person draws a section the ordinary way (lines, polylines, rectangles),
 * dimensions it, marks its levels and writes its callouts. This turns that
 * drawing into a ComponentDefinition — the same data format as the library —
 * whose every coordinate is written from named values. It is general: nothing
 * here knows what a culvert is; bridge words only help NAME things.
 *
 * How (the "datum" method — levels and offsets, the way a GAD is set out):
 *
 *   1. Every distinct X and every distinct Y the drawing uses is a DATUM line
 *      (within the shared weld tolerance, §17).
 *   2. Datums that a person pinned down are PRINCIPAL: a dimension's two ends,
 *      a level marker, the centre line, and the two faces a callout like
 *      "150TH. WEARING COURSE" points between.
 *   3. Site levels (bed, HFL, formation, rail…) are inputs in metres. Every
 *      dimension joins two datums; taken shortest-chain first (Kruskal), a
 *      dimension that reaches a new datum DRIVES it, and one that closes a loop
 *      — earth cushion between formation and top of slab — is a RESULT,
 *      reported but not typed. A width symmetric about the centre line is split
 *      half each side.
 *   4. Every other datum follows its nearest principal datum at a fixed offset
 *      (or a named one: a callout's value is shared by the other corners of the
 *      same shape — all four legs of a haunch follow "Haunch").
 *   5. Numbers written in notes are linked to the value they state, so a note
 *      follows its value ("150TH. WEARING COURSE" → "{WearingCourse}TH. …").
 *
 * The result is block-triangular by construction (§30.3): every datum is one
 * expression of values and earlier datums, so there is nothing to count and
 * nothing to solve. Before anything is replaced the definition is evaluated
 * and every vertex must land where it was drawn; otherwise the conversion is
 * refused with the list of what moved.
 */

import type { Point, Shape, LineShape } from "@/lib/geometry/types";
import { DEFAULT_TOLERANCE_POLICY, type TolerancePolicy } from "@/lib/geometry/tolerance";
import type {
  Annotation,
  DimensionAnnotation,
  DrawingSettings,
  HatchAnnotation,
  Layer,
  LayerCategory,
  LevelAnnotation,
} from "@/lib/cad/types";
import { resolveAnchor, shapeVertices, indexShapes, traceRing } from "@/lib/cad/geometry";
import { chainGroup } from "@/lib/cad/modify";
import { findLayer } from "@/lib/cad/layers";
import { termFor, termFromText } from "@/lib/bridge/glossary";
import { evaluateComponent } from "./evaluate";
import type { ComponentRegistry } from "./evaluate";
import type {
  ComponentDefinition,
  ComponentFormula,
  ComponentParameter,
  ComponentPrimitive,
  DimensionDef,
  FactDef,
  HatchDef,
  InvariantDef,
  LeaderDef,
  LevelDef,
  Relationship,
  CustomValue,
  TextDef,
  XY,
} from "./types";

export type Axis = "x" | "y";

/** Levels a site gives (inputs, in metres); structural levels follow from sizes. */
export const SITE_LEVEL_ROLES = new Set(["bed_level", "HFL", "LWL", "danger_level", "formation_level", "rail_level", "scour_level", "ground_level"]);

const LEVEL_NAME: Record<string, string> = {
  bed_level: "BedLevel",
  HFL: "HFL",
  LWL: "LWL",
  danger_level: "DangerLevel",
  formation_level: "FormationLevel",
  rail_level: "RailLevel",
  scour_level: "ScourLevel",
  ground_level: "GroundLevel",
  soffit_level: "SoffitLevel",
  foundation_level: "FoundationLevel",
  bed_block_level: "BedBlockLevel",
};

/** Dimensions that are checks of a clearance rather than sizes of a member. */
const CHECK_WORDS = /(^|[^A-Z])(V\s?\.?\s?C|F\s?\.?\s?B|CUSHION|CLEARANCE|FREE\s?BOARD)([^A-Z]|$)/i;

const STOP_WORDS = new Set(["MM", "M", "THK", "TH", "THICK", "X", "DIA", "C", "CC", "NO", "NOS", "PROP", "EX", "EXG", "PROPOSED", "EXISTING", "AND", "THE", "A"]);
const SMALL_WORDS = new Set(["OF", "ON", "TO", "AT", "IN", "BY"]);

/** A name from the words of a note: "850THK. GRANULAR FILLING" → "GranularFilling". */
export function nameFromWords(text: string): string | undefined {
  const words = text
    .toUpperCase()
    .replace(/\d+(\.\d+)?/g, " ")
    .split(/[^A-Z]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  if (!words.length) return undefined;
  // Acronyms (HFL, PCC, RCC) stay in capitals; words are capitalised.
  const acronym = (w: string) => w.length <= 3 && !SMALL_WORDS.has(w) && !/[AEIOU]/.test(w);
  const name = words.map((w) => (acronym(w) ? w : w[0] + w.slice(1).toLowerCase())).join("");
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? name : undefined;
}

function numbersIn(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
}

// ---------------------------------------------------------------------------
// Datums
// ---------------------------------------------------------------------------

type TagKind = "vertex" | "dim" | "level" | "axis" | "anchor" | "callout";
interface Tag {
  kind: TagKind;
  /** Shape group key (a polyline's group, else the shape id). */
  shape?: string;
  ann?: string;
  role?: string;
  label?: string;
}

export interface Datum {
  key: string;
  axis: Axis;
  value: number;
  tags: Tag[];
  principal: boolean;
  /** Formula name holding its coordinate (mm). */
  name: string;
  /** For levels: the name of the level in metres. */
  levelName?: string;
  absolute: boolean;
  expr: string;
  parent?: string;
  /** Parameter the offset from the parent is, or undefined for a fixed offset. */
  via?: string;
  offset: number;
  /** How it was set, for the report. */
  how: string;
}

export interface EdgePlan {
  /** Stable key for overrides: the dimension annotation id, or `callout:<leader id>:<axis>`. */
  key: string;
  axis: Axis;
  a: string;
  b: string;
  value: number;
  name: string;
  /** drives: sets a datum; symmetric: half each side of the centre; result: reported only. */
  role: "drives" | "symmetric" | "result";
  from: "dimension" | "callout";
  label: string;
}

export interface ParametricPlan {
  definition: ComponentDefinition;
  absoluteElevation: boolean;
  datums: Datum[];
  edges: EdgePlan[];
  /** Level annotations and the names their levels got. */
  levels: { key: string; name: string; value: number; input: boolean }[];
  /** Notes whose numbers now follow a value. */
  linkedTexts: { id: string; before: string; after: string }[];
  /** Consumed entities (replaced by the component). */
  shapeIds: string[];
  annotationIds: string[];
  /** Annotations left as they are (markers, tables…). */
  keptFree: string[];
  warnings: string[];
  /** Vertices that did not come back where they were drawn — the conversion is refused while any exist. */
  mismatches: string[];
  relations?: Relationship[];
  customValues?: CustomValue[];
}

export interface ParametrizeOptions {
  name?: string;
  /** Replace an existing drawing component (keeps its relationships where they still apply). */
  definitionId?: string;
  /** Relationships and inputs to keep (from a component just turned back into geometry). */
  carry?: { relations?: Relationship[]; customValues?: CustomValue[] };
  /** key → name: a dimension (annotation id), a callout edge key, a level annotation id or a datum key. */
  rename?: Record<string, string>;
  /** dimension key → true (drives) / false (result). */
  drive?: Record<string, boolean>;
  policy?: TolerancePolicy;
}

export interface ParametrizeInput {
  /** The free shapes to convert. */
  shapes: Shape[];
  /** Every shape on the drawing, for resolving what annotations point at (defaults to `shapes`). */
  context?: Shape[];
  annotations: Annotation[];
  settings: Pick<DrawingSettings, "datumRL" | "textHeight" | "annotationScale">;
  layers: Layer[];
  /** Names already used by other drawing components (definition ids). */
  existing?: ComponentDefinition[];
  registry?: ComponentRegistry;
}

const PARAM_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

class Names {
  used = new Set<string>();
  reserve(n: string) {
    this.used.add(n);
  }
  unique(base: string): string {
    let n = PARAM_RE.test(base) ? base : `V_${base.replace(/[^A-Za-z0-9_]/g, "")}`;
    if (!this.used.has(n)) {
      this.used.add(n);
      return n;
    }
    let k = 2;
    while (this.used.has(`${n}${k}`)) k++;
    n = `${n}${k}`;
    this.used.add(n);
    return n;
  }
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const num = (v: number) => {
  const x = r6(v);
  return Number.isInteger(x) ? String(x) : String(x);
};

function plusMinus(base: string, v: number): string {
  if (Math.abs(v) < 1e-9) return base;
  return v > 0 ? `${base} + ${num(v)}` : `${base} - ${num(-v)}`;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export function planParametric(input: ParametrizeInput, opts: ParametrizeOptions = {}): ParametricPlan {
  const tol = (opts.policy ?? DEFAULT_TOLERANCE_POLICY).geometry_mm;
  const weld = (opts.policy ?? DEFAULT_TOLERANCE_POLICY).weld_mm;
  const warnings: string[] = [];
  const shapes = input.shapes.filter((s) => !s.componentInstanceId);
  const allIndex = indexShapes(input.context ?? input.shapes);
  const anns = input.annotations.filter((a) => !a.componentInstanceId);
  const txt = input.settings.textHeight * input.settings.annotationScale;

  const levelAnns = anns.filter((a): a is LevelAnnotation => a.type === "level");
  const hasLevels = levelAnns.length > 0 || shapes.some((s) => termFor(s.semanticRole)?.kind === "level");
  const datumMm = input.settings.datumRL * 1000;
  const M = (p: Point): Point => ({ x: p.x, y: hasLevels ? datumMm - p.y : -p.y });

  // ---- 1. register coordinates
  const pool: Record<Axis, { v: number; tag: Tag }[]> = { x: [], y: [] };
  const add = (axis: Axis, v: number, tag: Tag) => pool[axis].push({ v, tag });
  const groupKey = (s: Shape) => s.groupId ?? s.id;
  const lineRoleLevel = (s: Shape) => {
    const t = termFor(s.semanticRole);
    return t?.kind === "level" ? t : undefined;
  };
  for (const s of shapes) {
    const gk = groupKey(s);
    const pts = s.type === "circle" || s.type === "ellipse" ? [{ x: s.cx, y: s.cy }] : shapeVertices(s);
    for (const p of pts.map(M)) {
      add("x", p.x, { kind: "vertex", shape: gk, role: s.semanticRole });
      add("y", p.y, { kind: "vertex", shape: gk, role: s.semanticRole });
    }
    if (s.type === "line") {
      const a = M({ x: s.x1, y: s.y1 });
      const b = M({ x: s.x2, y: s.y2 });
      const cat = findLayer(input.layers, s.layerId)?.category;
      const axisRole = termFor(s.semanticRole)?.kind === "axis";
      if (Math.abs(a.x - b.x) <= tol && (axisRole || cat === "centre")) add("x", a.x, { kind: "axis", shape: gk, role: s.semanticRole });
      const lt = lineRoleLevel(s);
      if (lt && Math.abs(a.y - b.y) <= tol) add("y", a.y, { kind: "level", shape: gk, role: lt.role, label: lt.levelLabel ?? lt.label });
    }
  }
  const dims: { d: DimensionAnnotation; p1: Point; p2: Point; axis?: Axis }[] = [];
  for (const a of anns) {
    if (a.type === "dimension") {
      const p1c = resolveAnchor(a.p1, allIndex);
      const p2c = resolveAnchor(a.p2, allIndex);
      if (!p1c || !p2c) {
        warnings.push(`A dimension (${a.id}) lost its geometry and was left out.`);
        continue;
      }
      const p1 = M(p1c);
      const p2 = M(p2c);
      let axis: Axis | undefined;
      if (a.kind === "linear") axis = a.axis ?? (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? "x" : "y");
      else if (a.kind === "aligned" && Math.abs(p2.y - p1.y) <= tol) axis = "x";
      else if (a.kind === "aligned" && Math.abs(p2.x - p1.x) <= tol) axis = "y";
      dims.push({ d: a, p1, p2, axis });
      for (const p of [p1, p2]) {
        if (axis) {
          add(axis, axis === "x" ? p.x : p.y, { kind: "dim", ann: a.id });
          const other: Axis = axis === "x" ? "y" : "x";
          add(other, other === "x" ? p.x : p.y, { kind: "anchor", ann: a.id });
        } else {
          add("x", p.x, { kind: "anchor", ann: a.id });
          add("y", p.y, { kind: "anchor", ann: a.id });
        }
      }
    } else if (a.type === "level") {
      const p = resolveAnchor(a.at, allIndex);
      if (!p) continue;
      const m = M(p);
      const t = termFromText(a.label);
      add("y", m.y, { kind: "level", ann: a.id, role: t?.kind === "level" ? t.role : undefined, label: a.label });
      add("x", m.x, { kind: "anchor", ann: a.id });
    }
  }

  // ---- 2. cluster into datums
  const datums: Datum[] = [];
  const byAxis: Record<Axis, Datum[]> = { x: [], y: [] };
  for (const axis of ["x", "y"] as Axis[]) {
    const sorted = [...pool[axis]].sort((p, q) => p.v - q.v);
    let cur: { v: number; tag: Tag }[] = [];
    const flush = () => {
      if (!cur.length) return;
      const pref = cur.find((c) => c.tag.kind !== "anchor") ?? cur[0];
      const d: Datum = {
        key: `${axis}:${r6(pref.v).toFixed(3)}`,
        axis,
        value: pref.v,
        tags: cur.map((c) => c.tag),
        principal: cur.some((c) => c.tag.kind === "dim" || c.tag.kind === "level" || c.tag.kind === "axis"),
        name: "",
        absolute: false,
        expr: "",
        offset: 0,
        how: "",
      };
      datums.push(d);
      byAxis[axis].push(d);
      cur = [];
    };
    for (const p of sorted) {
      if (cur.length && p.v - cur[cur.length - 1].v > tol) flush();
      cur.push(p);
    }
    flush();
  }
  const datumAt = (axis: Axis, v: number): Datum => {
    let best = byAxis[axis][0];
    for (const d of byAxis[axis]) if (Math.abs(d.value - v) < Math.abs(best.value - v)) best = d;
    return best;
  };
  const byKey = new Map(datums.map((d) => [d.key, d]));
  const WATER = new Set(["HFL", "LWL", "danger_level", "scour_level"]);
  /** A datum that only water lines use — never a parent for structure. */
  const waterOnly = (d: Datum) => {
    const own = d.tags.filter((t) => t.kind === "level" || t.kind === "vertex" || t.kind === "axis");
    return own.length > 0 && own.every((t) => !!t.role && WATER.has(t.role));
  };

  // ---- 3. names reserved for datums, then levels
  const names = new Names();
  const rename = opts.rename ?? {};
  const levelInfo: ParametricPlan["levels"] = [];
  for (const d of byAxis.y) {
    const lvl = d.tags.find((t) => t.kind === "level");
    if (!lvl) continue;
    const role = d.tags.find((t) => t.kind === "level" && t.role)?.role;
    const label = d.tags.find((t) => t.kind === "level" && t.ann)?.label ?? lvl.label ?? "";
    const annKey = d.tags.find((t) => t.kind === "level" && t.ann)?.ann;
    const base = (annKey && rename[annKey]) || rename[d.key] || (role && LEVEL_NAME[role]) || nameFromWords(label.replace(/\bLEVEL\b/i, " LEVEL ")) || "Level";
    d.levelName = names.unique(base);
    d.name = names.unique(`${d.levelName}Y`);
    d.absolute = hasLevels && !!role && SITE_LEVEL_ROLES.has(role);
    levelInfo.push({ key: annKey ?? d.key, name: d.levelName, value: r6(d.value / 1000), input: d.absolute });
  }
  const axisDatum = byAxis.x.find((d) => d.tags.some((t) => t.kind === "axis" && t.role === "bridge_centreline")) ?? byAxis.x.find((d) => d.tags.some((t) => t.kind === "axis"));
  if (axisDatum) axisDatum.name = names.unique("CL");
  byAxis.x.forEach((d, i) => {
    if (!d.name) d.name = names.unique(`X${i + 1}`);
  });
  byAxis.y.forEach((d, i) => {
    if (!d.name) d.name = names.unique(`Y${i + 1}`);
  });

  // ---- 4. edges: dimensions and callouts
  const edges: EdgePlan[] = [];
  const nearbyWords = (at: Point, value: number): string | undefined => {
    for (const a of anns) {
      if (a.type !== "text" && a.type !== "leader") continue;
      const p = a.type === "text" ? resolveAnchor(a.at, allIndex) : resolveAnchor(a.points[a.points.length - 1], allIndex);
      if (!p) continue;
      const m = M(p);
      if (Math.hypot(m.x - at.x, m.y - at.y) > 10 * txt) continue;
      if (numbersIn(a.text).some((n) => Math.abs(n - value) <= 0.5)) {
        const w = nameFromWords(a.text);
        if (w) return w;
      }
    }
    return undefined;
  };
  const roleName = (d: DimensionAnnotation, axis: Axis): string | undefined => {
    const ids = [d.p1, d.p2].map((r) => (r.kind === "shape" ? allIndex.get(r.shapeId) : undefined));
    const roles = ids.map((s) => s?.semanticRole).filter(Boolean) as string[];
    if (roles.length === 2 && roles[0] === roles[1]) {
      const t = termFor(roles[0]);
      if (!t) return undefined;
      if (t.role === "clear_opening") return axis === "x" ? "ClearSpan" : "ClearHeight";
      const base = nameFromWords(t.label) ?? "Member";
      return `${base}${axis === "x" ? "Width" : "Thickness"}`;
    }
    return undefined;
  };
  let dn = 1;
  for (const { d, p1, p2, axis } of dims) {
    if (!axis) continue;
    const a = datumAt(axis, axis === "x" ? p1.x : p1.y);
    const b = datumAt(axis, axis === "x" ? p2.x : p2.y);
    if (a === b) continue;
    const value = Math.abs(b.value - a.value);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const words = `${d.prefix ?? ""} ${d.suffix ?? ""}`.trim();
    const label = `${words ? words + " " : ""}${Math.round(value)}`;
    const fromWords = !words ? undefined : /^\s*V\s*\.?\s*C\b/i.test(words) ? "VerticalClearance" : /^\s*F\s*\.?\s*B\b/i.test(words) ? "FreeBoard" : nameFromWords(words);
    const base = rename[d.id] || d.drives || fromWords || nearbyWords(mid, value) || roleName(d, axis) || `D${dn++}`;
    edges.push({ key: d.id, axis, a: a.key, b: b.key, value, name: base, role: "drives", from: "dimension", label });
  }
  // Callouts. A leader states a thickness ("150TH. WEARING COURSE", "HAUNCH 600 X 600mm") and
  // points at it: either its arrow sits on an edge that long (a chamfer: both legs), or it
  // points into a band that thick — looking straight up/down (or left/right) from the arrow,
  // the first lines it meets are exactly that far apart.
  const segs: [Point, Point][] = [];
  for (const s of shapes) {
    const v = shapeVertices(s).map(M);
    if (s.type === "line" || s.type === "arrow") segs.push([v[0], v[1]]);
    else for (let i = 0; i < v.length; i++) segs.push([v[i], v[(i + 1) % v.length]]);
  }
  const onSeg = (p: Point, a: Point, b: Point) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < tol) return false;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l * l);
    if (t < 0 || t > 1) return false;
    return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l <= Math.max(tol, 0.02 * l);
  };
  /** The nearest lines each side of p, looking along the other axis. */
  const band = (p: Point, axis: Axis): [number, number] | undefined => {
    let lo = -Infinity;
    let hi = Infinity;
    for (const [a, b] of segs) {
      const u = axis === "y" ? "x" : "y";
      const lo1 = Math.min(a[u], b[u]);
      const hi1 = Math.max(a[u], b[u]);
      if (p[u] < lo1 - tol || p[u] > hi1 + tol || hi1 - lo1 < tol) continue;
      const t = (p[u] - a[u]) / (b[u] - a[u]);
      const c = a[axis] + t * (b[axis] - a[axis]);
      if (c > p[axis] + tol) hi = Math.min(hi, c);
      else if (c < p[axis] - tol) lo = Math.max(lo, c);
    }
    return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : undefined;
  };
  const datumNear = (axis: Axis, v: number) => {
    const d = datumAt(axis, v);
    return d && Math.abs(d.value - v) <= tol ? d : undefined;
  };
  for (const a of anns) {
    if (a.type !== "leader") continue;
    const tipC = resolveAnchor(a.points[0], allIndex);
    if (!tipC) continue;
    const tip = M(tipC);
    const nums = numbersIn(a.text);
    const word = nameFromWords(a.text);
    if (!nums.length || !word) continue;
    const found: { axis: Axis; lo: Datum; hi: Datum; gap: number }[] = [];
    for (const [p, q] of segs) {
      if (!onSeg(tip, p, q)) continue;
      for (const axis of ["x", "y"] as Axis[]) {
        const gap = Math.abs(q[axis] - p[axis]);
        if (!nums.some((n) => Math.abs(n - gap) <= tol)) continue;
        const d1 = datumNear(axis, Math.min(p[axis], q[axis]));
        const d2 = datumNear(axis, Math.max(p[axis], q[axis]));
        if (d1 && d2 && d1 !== d2) found.push({ axis, lo: d1, hi: d2, gap });
      }
      if (found.length) break;
    }
    if (!found.length) {
      for (const axis of ["x", "y"] as Axis[]) {
        const b = band(tip, axis);
        if (!b || !nums.some((n) => Math.abs(n - (b[1] - b[0])) <= tol)) continue;
        const d1 = datumNear(axis, b[0]);
        const d2 = datumNear(axis, b[1]);
        if (d1 && d2 && d1 !== d2) found.push({ axis, lo: d1, hi: d2, gap: b[1] - b[0] });
      }
    }
    for (const f of found) {
      const key = `callout:${a.id}:${f.axis}`;
      edges.push({ key, axis: f.axis, a: f.lo.key, b: f.hi.key, value: f.gap, name: rename[key] || word, role: "drives", from: "callout", label: a.text });
      f.lo.principal = true;
      f.hi.principal = true;
    }
  }

  // ---- 5. which datum is the root of each axis
  const rootOf: Record<Axis, Datum | undefined> = { x: undefined, y: undefined };
  rootOf.x = axisDatum ?? byAxis.x.find((d) => d.principal) ?? byAxis.x[0];
  const absY = byAxis.y.filter((d) => d.absolute);
  if (!absY.length) {
    const firstLevel = byAxis.y.find((d) => d.levelName);
    if (firstLevel && hasLevels) firstLevel.absolute = true;
  }
  rootOf.y = byAxis.y.find((d) => d.absolute) ?? byAxis.y.find((d) => d.principal) ?? byAxis.y[0];
  for (const axis of ["x", "y"] as Axis[]) if (rootOf[axis]) rootOf[axis]!.principal = true;

  // ---- 6. Kruskal: shortest chains first, checks last
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const d of datums) parent.set(d.key, d.key);
  const ROOT = "__root";
  parent.set(ROOT, ROOT);
  for (const d of datums) if (d.absolute || d === rootOf.x || d === rootOf.y) union(d.key, ROOT);

  const centre = axisDatum?.value;
  const mirrored = (e: EdgePlan) => e.axis === "x" && centre !== undefined && Math.abs((byKey.get(e.a)!.value + byKey.get(e.b)!.value) / 2 - centre) <= tol && byKey.get(e.a) !== axisDatum && byKey.get(e.b) !== axisDatum;
  const between = (e: EdgePlan) => {
    const lo = Math.min(byKey.get(e.a)!.value, byKey.get(e.b)!.value);
    const hi = Math.max(byKey.get(e.a)!.value, byKey.get(e.b)!.value);
    return byAxis[e.axis].filter((d) => d.principal && !d.absolute && d.value > lo + tol && d.value < hi - tol).length;
  };
  const isCheck = (e: EdgePlan) => CHECK_WORDS.test(e.label) || CHECK_WORDS.test(e.name.replace(/([a-z])([A-Z])/g, "$1 $2")) || (byKey.get(e.a)!.absolute && byKey.get(e.b)!.absolute);
  // Chain dimensions before overall ones (fewest named lines in between), sizes before
  // clearance checks, a width symmetric about the centre before a one-sided one.
  const prio = (e: EdgePlan) => (opts.drive?.[e.key] === false ? 3 : opts.drive?.[e.key] === true ? -1 : isCheck(e) ? 2 : 1);
  const order = [...edges].sort((p, q) => prio(p) - prio(q) || between(p) - between(q) || Number(!mirrored(p)) - Number(!mirrored(q)) || p.value - q.value);
  const tree: EdgePlan[] = [];
  for (const e of order) {
    if (opts.drive?.[e.key] === false) {
      e.role = "result";
      continue;
    }
    if (mirrored(e) && find(e.a) !== find(ROOT) && find(e.b) !== find(ROOT)) {
      e.role = "symmetric";
      union(e.a, ROOT);
      union(e.b, ROOT);
      tree.push(e);
    } else if (find(e.a) !== find(e.b)) {
      e.role = "drives";
      union(e.a, e.b);
      tree.push(e);
    } else e.role = "result";
  }
  // Mirror-image dimensions of equal size share one value (a wall each side of the centre).
  if (centre !== undefined) {
    for (const e of edges) {
      for (const f of edges) {
        if (e === f || e.axis !== "x" || f.axis !== "x" || Math.abs(e.value - f.value) > tol) continue;
        const ea = [byKey.get(e.a)!.value, byKey.get(e.b)!.value].map((v) => r6(2 * centre - v)).sort();
        const fb = [byKey.get(f.a)!.value, byKey.get(f.b)!.value].map(r6).sort();
        if (Math.abs(ea[0] - fb[0]) <= tol && Math.abs(ea[1] - fb[1]) <= tol && edges.indexOf(e) < edges.indexOf(f) && !rename[f.key]) f.name = e.name;
      }
    }
  }
  // Floating groups of datums (dimensioned among themselves only) hang from the nearest settled datum at a fixed offset.
  const constEdges: { a: string; b: string }[] = [];
  for (const axis of ["x", "y"] as Axis[]) {
    for (;;) {
      const floating = byAxis[axis].filter((d) => d.principal && find(d.key) !== find(ROOT));
      if (!floating.length) break;
      const settled = byAxis[axis].filter((d) => d.principal && find(d.key) === find(ROOT));
      let best: { f: Datum; s: Datum; dist: number } | undefined;
      for (const f of floating) for (const s of settled) {
        const dist = Math.abs(f.value - s.value);
        if (!best || dist < best.dist) best = { f, s, dist };
      }
      if (!best) break;
      constEdges.push({ a: best.s.key, b: best.f.key });
      union(best.f.key, ROOT);
    }
  }

  // ---- 7. expressions: walk out from the roots
  const paramOf = new Map<string, { name: string; value: number; axis: Axis; from: EdgePlan["from"]; label: string }>();
  const assignName = (e: EdgePlan) => {
    const existing = paramOf.get(e.name);
    if (existing && Math.abs(existing.value - e.value) > tol) e.name = names.unique(e.name);
    else if (!existing) {
      if (names.used.has(e.name)) e.name = names.unique(e.name);
      else names.reserve(e.name);
    }
    paramOf.set(e.name, { name: e.name, value: e.value, axis: e.axis, from: e.from, label: e.label });
  };
  for (const e of tree) assignName(e);

  const settle = (d: Datum, expr: string, how: string, parentKey?: string, via?: string, offset = 0) => {
    d.expr = expr;
    d.how = how;
    d.parent = parentKey;
    d.via = via;
    d.offset = offset;
  };
  for (const axis of ["x", "y"] as Axis[]) {
    const root = rootOf[axis];
    if (!root) continue;
    const done = new Set<string>();
    const queue: Datum[] = [];
    for (const d of byAxis[axis]) {
      if (d.absolute) {
        settle(d, `${d.levelName} * 1000`, `input level ${d.levelName}`);
        done.add(d.key);
        queue.push(d);
      }
    }
    if (!done.has(root.key)) {
      settle(root, num(root.value), root === axisDatum ? "centre line (position on the sheet)" : "origin (position on the sheet)");
      done.add(root.key);
      queue.push(root);
    }
    const adj = new Map<string, { e?: EdgePlan; to: string; c?: boolean }[]>();
    const link = (a: string, b: string, e?: EdgePlan, c?: boolean) => {
      adj.set(a, [...(adj.get(a) ?? []), { e, to: b, c }]);
      adj.set(b, [...(adj.get(b) ?? []), { e, to: a, c }]);
    };
    for (const e of tree) if (e.axis === axis && e.role === "drives") link(e.a, e.b, e);
    for (const c of constEdges) if (byKey.get(c.a)!.axis === axis) link(c.a, c.b, undefined, true);
    for (const e of tree) {
      if (e.axis !== axis || e.role !== "symmetric") continue;
      const c = axisDatum!;
      for (const k of [e.a, e.b]) {
        const d = byKey.get(k)!;
        if (done.has(k)) continue;
        settle(d, `${c.name} ${d.value < c.value ? "-" : "+"} ${e.name} / 2`, `half of ${e.name} each side of the centre line`, c.key, e.name);
        done.add(k);
        queue.push(d);
      }
    }
    while (queue.length) {
      const p = queue.shift()!;
      for (const { e, to, c } of adj.get(p.key) ?? []) {
        if (done.has(to)) continue;
        const d = byKey.get(to)!;
        if (c) settle(d, plusMinus(p.name, d.value - p.value), `fixed offset from ${p.levelName ?? p.name}`, p.key, undefined, d.value - p.value);
        else settle(d, `${p.name} ${d.value > p.value ? "+" : "-"} ${e!.name}`, `${e!.name} from ${p.levelName ?? p.name}`, p.key, e!.name, d.value - p.value);
        done.add(to);
        queue.push(d);
      }
    }
    // Everything else follows the nearest settled datum — structure before water lines,
    // so a haunch corner never hangs off the HFL.
    const settled = byAxis[axis].filter((d) => done.has(d.key));
    const dry = settled.filter((d) => !waterOnly(d));
    for (const d of byAxis[axis]) {
      if (done.has(d.key)) continue;
      const pool = dry.length ? dry : settled;
      let p = pool[0];
      for (const s of pool) if (Math.abs(s.value - d.value) < Math.abs(p.value - d.value)) p = s;
      const off = d.value - p.value;
      const own = rename[d.key];
      if (own) {
        const nm = paramOf.has(own) ? own : names.used.has(own) ? names.unique(own) : (names.reserve(own), own);
        paramOf.set(nm, { name: nm, value: Math.abs(off), axis, from: "callout", label: `offset of ${d.name}` });
        settle(d, `${p.name} ${off >= 0 ? "+" : "-"} ${nm}`, `${nm} from ${p.levelName ?? p.name}`, p.key, nm, off);
      } else settle(d, plusMinus(p.name, off), `fixed offset from ${p.levelName ?? p.name}`, p.key, undefined, off);
      done.add(d.key);
    }
  }
  // A named callout value is shared by the other corners of the same shape that
  // sit that far from another corner (all four legs of a haunch follow "Haunch").
  const chainHas = (q: Datum, target: Datum): boolean => {
    let cur: Datum | undefined = q;
    for (let guard = 0; cur && guard < datums.length + 1; guard++) {
      if (cur === target) return true;
      cur = cur.parent ? byKey.get(cur.parent) : undefined;
    }
    return false;
  };
  const callouts = tree.filter((e) => e.from === "callout");
  for (const d of datums) {
    if (d.via || !d.parent || d.principal) continue;
    const shapesOf = new Set(d.tags.map((t) => t.shape).filter(Boolean));
    if (!shapesOf.size) continue;
    let done2 = false;
    for (const e of callouts) {
      if (e.axis !== d.axis || done2) continue;
      for (const q of byAxis[d.axis]) {
        if (q === d || Math.abs(Math.abs(d.value - q.value) - e.value) > tol) continue;
        if (!q.tags.some((t) => t.shape && shapesOf.has(t.shape))) continue;
        if (chainHas(q, d)) continue;
        settle(d, `${q.name} ${d.value >= q.value ? "+" : "-"} ${e.name}`, `${e.name} from ${q.levelName ?? q.name} (as the callout says)`, q.key, e.name, d.value - q.value);
        done2 = true;
        break;
      }
    }
  }

  // ---- 8. the definition
  const parameters: ComponentParameter[] = [];
  const formulas: ComponentFormula[] = [];
  const invariants: InvariantDef[] = [];
  for (const d of byAxis.y) {
    if (!d.absolute || !d.levelName) continue;
    const role = d.tags.find((t) => t.role && SITE_LEVEL_ROLES.has(t.role))?.role;
    parameters.push({ name: d.levelName, label: termFor(role)?.label ?? d.levelName, kind: "level", unit: "m", default: r6(d.value / 1000), group: "Levels", sourceRequired: !!role });
  }
  for (const p of paramOf.values()) {
    parameters.push({ name: p.name, label: p.label && p.from === "callout" ? p.label.replace(/\s+/g, " ").slice(0, 48) : p.name, kind: "length", unit: "mm", default: r6(p.value), group: p.from === "callout" ? "Thicknesses" : p.axis === "x" ? "Widths" : "Heights" });
    invariants.push({ id: `pos_${p.name}`, expr: p.name, op: ">", than: 0, message: `${p.name} must be more than zero.`, severity: "error" });
  }
  // Datum coordinates, in dependency order (they were settled parent-first).
  const settledOrder = [...datums].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
  for (const d of settledOrder) formulas.push({ name: d.name, expr: d.expr || num(d.value) });
  for (const d of byAxis.y) if (d.levelName && !d.absolute) formulas.push({ name: d.levelName, expr: `${d.name} / 1000`, label: d.levelName, unit: "m", report: true, group: "Levels" });
  for (const e of edges) {
    if (e.role !== "result") continue;
    if (paramOf.has(e.name) || formulas.some((f) => f.name === e.name)) continue;
    const nm = names.used.has(e.name) ? names.unique(e.name) : (names.reserve(e.name), e.name);
    e.name = nm;
    formulas.push({ name: nm, expr: `abs(${byKey.get(e.b)!.name} - ${byKey.get(e.a)!.name})`, label: e.label, unit: "mm", report: true, group: "Results" });
  }

  // Coordinates of any point, written from datums.
  const exprOf = (axis: Axis, v: number): string => {
    const d = datumAt(axis, v);
    if (!d) return num(v);
    return Math.abs(d.value - v) <= tol ? d.name : plusMinus(d.name, v - d.value);
  };
  /** An annotation point follows the nearest principal datum. */
  const anchorExpr = (axis: Axis, v: number): string => {
    let best: Datum | undefined;
    const pool = byAxis[axis].filter((d) => d.principal && !waterOnly(d));
    for (const d of pool.length ? pool : byAxis[axis].filter((x) => x.principal)) if (!best || Math.abs(d.value - v) < Math.abs(best.value - v)) best = d;
    best ??= datumAt(axis, v);
    return best ? plusMinus(best.name, v - best.value) : num(v);
  };
  const XYof = (p: Point): XY => [exprOf("x", p.x), exprOf("y", p.y)];
  const anchorXY = (p: Point): XY => [anchorExpr("x", p.x), anchorExpr("y", p.y)];

  const primitives: ComponentPrimitive[] = [];
  const sourcePoints = new Map<string, Point[]>();
  const primOfShape = new Map<string, string>();
  const catOf = (s: Shape): LayerCategory => findLayer(input.layers, s.layerId)?.category ?? "outline";
  const done = new Set<string>();
  let pn = 0;
  for (const s of shapes) {
    if (done.has(s.id)) continue;
    const id = `p${++pn}`;
    const label = s.groupName ?? s.name ?? termFor(s.semanticRole)?.label ?? `${s.type} ${pn}`;
    const base = { id, role: s.semanticRole ?? "drawn", layer: catOf(s), label };
    if (s.type === "line" || s.type === "arrow") {
      const group = s.groupId ? shapes.filter((o): o is LineShape => o.type === "line" && o.groupId === s.groupId) : [];
      const chain = group.length > 1 ? chainGroup(group, weld) : null;
      if (chain) {
        for (const g of group) {
          done.add(g.id);
          primOfShape.set(g.id, id);
        }
        const pts = chain.points.map(M);
        primitives.push({ ...base, kind: chain.closed ? "loop" : "path", points: pts.map(XYof) });
        sourcePoints.set(id, pts);
        continue;
      }
      done.add(s.id);
      primOfShape.set(s.id, id);
      const pts = [M({ x: s.x1, y: s.y1 }), M({ x: s.x2, y: s.y2 })];
      primitives.push({ ...base, kind: "path", points: pts.map(XYof) });
      sourcePoints.set(id, pts);
    } else if (s.type === "circle") {
      done.add(s.id);
      primOfShape.set(s.id, id);
      const c = M({ x: s.cx, y: s.cy });
      primitives.push({ ...base, kind: "circle", center: XYof(c), r: num(s.r) });
    } else if (s.type === "ellipse") {
      done.add(s.id);
      primOfShape.set(s.id, id);
      // Rigid about its centre: sampled outline at fixed offsets from the centre's datums.
      const c = M({ x: s.cx, y: s.cy });
      const raw = shapeVertices(s).map(M);
      const cx = exprOf("x", c.x);
      const cy = exprOf("y", c.y);
      primitives.push({ ...base, kind: "loop", points: raw.map((p) => [plusMinus(cx, p.x - c.x), plusMinus(cy, p.y - c.y)] as XY) });
    } else {
      done.add(s.id);
      primOfShape.set(s.id, id);
      const pts = shapeVertices(s).map(M);
      primitives.push({ ...base, kind: "loop", points: pts.map(XYof) });
      sourcePoints.set(id, pts);
    }
  }

  // ---- 9. annotations
  const hatches: HatchDef[] = [];
  const dimensions: DimensionDef[] = [];
  const levels: LevelDef[] = [];
  const texts: TextDef[] = [];
  const leaders: LeaderDef[] = [];
  const consumed: string[] = [];
  const keptFree: string[] = [];
  const catOfAnn = (a: Annotation, dflt: LayerCategory): LayerCategory => findLayer(input.layers, a.layerId)?.category ?? dflt;

  // Numbers in notes → the value they state. Candidates: parameters, results, levels.
  const valueTable: { name: string; value: number; kind: "mm" | "m"; at?: Point }[] = [];
  for (const p of parameters) valueTable.push({ name: p.name, value: p.default, kind: p.unit === "m" ? "m" : "mm" });
  for (const f of formulas) if (f.report) {
    const e = edges.find((x) => x.name === f.name);
    const lv = byAxis.y.find((d) => d.levelName === f.name);
    valueTable.push({ name: f.name, value: e ? e.value : lv ? r6(lv.value / 1000) : NaN, kind: f.unit === "m" ? "m" : "mm" });
  }
  const linkedTexts: ParametricPlan["linkedTexts"] = [];
  const link = (id: string, text: string, own?: string): string => {
    const out = text.replace(/\d+(?:\.\d+)?/g, (tok) => {
      const v = Number(tok);
      const decimals = tok.includes(".") ? tok.split(".")[1].length : 0;
      const hits = valueTable.filter((c) => Number.isFinite(c.value) && (c.kind === "m" ? decimals >= 2 && Math.abs(c.value - v) < 0.0005 : decimals === 0 && Math.abs(c.value - v) <= 0.5));
      if (!hits.length) return tok;
      const pick = hits.find((h) => h.name === own) ?? (hits.length === 1 ? hits[0] : undefined);
      if (!pick) return tok;
      return pick.kind === "m" ? `{${pick.name}:${decimals}}` : `{${pick.name}}`;
    });
    if (out !== text) linkedTexts.push({ id, before: text, after: out });
    return out;
  };

  /**
   * A fixed-outline hatch (a regenerated component's, an imported one's) is
   * matched to the shape it fills — a circle or a closed outline — so it moves
   * with it; failing that its corners are written from the datums they sit on.
   */
  const polygonBoundary = (ring: Point[], id: string): string => {
    const b = { minX: Math.min(...ring.map((p) => p.x)), maxX: Math.max(...ring.map((p) => p.x)), minY: Math.min(...ring.map((p) => p.y)), maxY: Math.max(...ring.map((p) => p.y)) };
    for (const s of shapes) {
      if (s.type !== "circle") continue;
      const c = M({ x: s.cx, y: s.cy });
      if (Math.abs((b.minX + b.maxX) / 2 - c.x) <= tol && Math.abs((b.minY + b.maxY) / 2 - c.y) <= tol && Math.abs((b.maxX - b.minX) / 2 - s.r) <= Math.max(tol, s.r * 0.02)) {
        const pid = primOfShape.get(s.id);
        if (pid) return pid;
      }
    }
    for (const [pid, pts] of sourcePoints) {
      const prim = primitives.find((p) => p.id === pid);
      if (!prim || prim.kind !== "loop" || pts.length !== ring.length) continue;
      if (ring.every((p) => pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol))) return pid;
    }
    primitives.push({ id: `${id}_poly`, kind: "loop", role: "drawn", layer: "hatch", label: "Hatch boundary", draw: false, points: ring.map(XYof) });
    return `${id}_poly`;
  };

  let an = 0;
  const holeIdsFor = (h: HatchAnnotation) => (h.boundary.kind === "shapes" ? h.boundary.holeShapeIds ?? [] : []);
  for (const a of anns) {
    const aid = `a${++an}`;
    switch (a.type) {
      case "hatch": {
        const makeLoop = (ids: string[]): string | undefined => {
          const prims = new Set(ids.map((i) => primOfShape.get(i)).filter(Boolean));
          const only = prims.size === 1 ? [...prims][0]! : undefined;
          const covered = only && ids.length === [...primOfShape.entries()].filter(([, p]) => p === only).length;
          const prim = only ? primitives.find((p) => p.id === only) : undefined;
          if (covered && prim && (prim.kind === "loop" || prim.kind === "circle")) return only;
          const ring = traceRing(ids.map((i) => allIndex.get(i)).filter((s): s is Shape => !!s), weld);
          if (!ring) return undefined;
          const lid = `${aid}_b${ids.length}_${primitives.length}`;
          primitives.push({ id: lid, kind: "loop", role: a.semanticRole ?? "drawn", layer: "hatch", label: "Hatch boundary", draw: false, points: ring.map(M).map(XYof) });
          return lid;
        };
        let boundary: string | undefined;
        const holes: string[] = [];
        if (a.boundary.kind === "shapes") {
          boundary = makeLoop(a.boundary.shapeIds);
          for (const h of holeIdsFor(a)) {
            const l = makeLoop([h]);
            if (l) holes.push(l);
          }
        } else {
          boundary = polygonBoundary(a.boundary.outer.map(M), aid);
          for (const [k, h] of (a.boundary.holes ?? []).entries()) holes.push(polygonBoundary(h.map(M), `${aid}_h${k}`));
        }
        if (!boundary) {
          warnings.push(`A hatch whose boundary no longer closes was left out.`);
          keptFree.push(a.id);
          continue;
        }
        hatches.push({ id: aid, boundary, holes, material: a.material, angle: a.angle ?? undefined, scale: a.scale ?? undefined });
        consumed.push(a.id);
        break;
      }
      case "dimension": {
        const entry = dims.find((x) => x.d.id === a.id);
        if (!entry) {
          keptFree.push(a.id);
          continue;
        }
        const e = edges.find((x) => x.key === a.id);
        const { p1, p2, axis } = entry;
        const from: XY = axis ? (axis === "x" ? [byKey.get(datumAt("x", p1.x).key)!.name, anchorExpr("y", p1.y)] : [anchorExpr("x", p1.x), byKey.get(datumAt("y", p1.y).key)!.name]) : anchorXY(p1);
        const to: XY = axis ? (axis === "x" ? [byKey.get(datumAt("x", p2.x).key)!.name, anchorExpr("y", p2.y)] : [anchorExpr("x", p2.x), byKey.get(datumAt("y", p2.y).key)!.name]) : anchorXY(p2);
        const kind: DimensionDef["kind"] = axis === "x" ? "horizontal" : axis === "y" ? "vertical" : a.kind === "radius" ? "radius" : a.kind === "diameter" ? "diameter" : "aligned";
        if (a.kind === "angular" || a.kind === "ordinate") {
          keptFree.push(a.id);
          continue;
        }
        const offset = axis === "x" ? -a.offset : axis === "y" ? a.offset : -a.offset;
        if (a.textOverride) warnings.push(`Dimension text "${a.textOverride}" was replaced by the measured value.`);
        dimensions.push({
          id: aid,
          kind,
          from,
          to,
          offset: num(offset),
          drives: e && e.role !== "result" ? e.name : undefined,
          prefix: a.prefix,
          suffix: a.suffix,
          hideValue: a.hideValue,
          layer: catOfAnn(a, "dimension"),
        });
        consumed.push(a.id);
        break;
      }
      case "level": {
        const p = resolveAnchor(a.at, allIndex);
        if (!p) {
          keptFree.push(a.id);
          continue;
        }
        const m = M(p);
        const d = datumAt("y", m.y);
        levels.push({ id: aid, at: [anchorExpr("x", m.x), d.name], label: a.label, side: a.side, style: a.style, format: a.format, symbol: a.symbol, layer: catOfAnn(a, "level") });
        consumed.push(a.id);
        break;
      }
      case "text": {
        const p = resolveAnchor(a.at, allIndex);
        if (!p) {
          keptFree.push(a.id);
          continue;
        }
        const m = M(p);
        texts.push({ id: aid, at: anchorXY(m), text: link(a.id, a.text), height: a.height, align: a.align ?? "left", valign: a.valign ?? "top", bold: a.bold, rotate: a.rotation || undefined, layer: catOfAnn(a, "text") });
        consumed.push(a.id);
        break;
      }
      case "leader": {
        const pts = a.points.map((r) => resolveAnchor(r, allIndex)).filter((p): p is Point => !!p).map(M);
        if (pts.length < 2) {
          keptFree.push(a.id);
          continue;
        }
        const own = edges.find((e) => e.key.startsWith(`callout:${a.id}:`))?.name;
        leaders.push({ id: aid, points: pts.map(anchorXY), text: link(a.id, a.text, own), height: a.height, placement: a.placement, arrow: a.arrow, layer: catOfAnn(a, "leader") });
        consumed.push(a.id);
        break;
      }
      default:
        keptFree.push(a.id);
    }
  }

  // Facts: site levels feed the audit; regions are read from the geometry itself.
  const facts: FactDef[] = [];
  for (const d of byAxis.y) {
    const role = d.tags.find((t) => t.role && termFor(t.role)?.fact)?.role;
    const t = termFor(role);
    if (t?.fact && d.levelName && t.kind === "level") facts.push({ key: t.fact, expr: d.absolute ? d.levelName : `${d.name} / 1000` });
  }

  const name = opts.name?.trim() || "Drawn component";
  const taken = new Set((input.existing ?? []).map((d) => d.id));
  let id = opts.definitionId ?? `drawn.${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "component"}`;
  if (!opts.definitionId && taken.has(id)) {
    let k = 2;
    while (taken.has(`${id}_${k}`)) k++;
    id = `${id}_${k}`;
  }
  const definition: ComponentDefinition = {
    id,
    name,
    category: "assembly",
    semanticType: "drawn",
    view: "section",
    version: "1.0.0",
    description: `Made parametric from a drawing: ${parameters.length} value(s), ${formulas.filter((f) => f.report).length} worked-out result(s).`,
    tags: ["drawn"],
    parameters,
    formulas,
    primitives,
    dimensions,
    levels,
    hatches,
    texts,
    leaders,
    invariants,
    facts,
    origin: { kind: "drawn" },
  };

  // Keep relationships of a component this replaces, where everything they name still exists.
  const previous = opts.definitionId ? (input.existing ?? []).find((d) => d.id === opts.definitionId) : undefined;
  const keptInputs = previous?.origin?.customValues ?? opts.carry?.customValues;
  const known = new Set([...parameters.map((p) => p.name), ...formulas.map((f) => f.name), ...(keptInputs ?? []).map((c) => c.name)]);
  const relations = (previous?.origin?.relations ?? opts.carry?.relations ?? []).filter((r) => [...r.expr.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].every((m) => known.has(m[0]) || /^(min|max|abs|round|floor|ceil|sqrt|hypot|pow|if|gt|ge|lt|le|sin|cos|tan|asin|acos|atan|atan2|sign|PI)$/.test(m[0])));

  // ---- 10. the drawing must come back exactly where it was
  const mismatches: string[] = [];
  const ev = evaluateComponent(definition, {}, input.registry ?? new Map(), undefined, { skipOrientationCheck: true, globals: { DIM: 8 * input.settings.annotationScale, TXT: txt, SCALE: input.settings.annotationScale } });
  for (const i of ev.issues.filter((x) => x.severity === "error")) mismatches.push(i.message);
  for (const loop of ev.loops) {
    const src = sourcePoints.get(loop.primitiveId);
    if (!src) continue;
    for (const p of src) if (!loop.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol)) mismatches.push(`${loop.label}: the vertex at (${num(p.x)}, ${num(p.y)}) would move.`);
  }

  return {
    definition,
    absoluteElevation: hasLevels,
    datums,
    edges,
    levels: levelInfo,
    linkedTexts,
    shapeIds: shapes.map((s) => s.id),
    annotationIds: consumed,
    keptFree,
    warnings,
    mismatches: mismatches.slice(0, 20),
    relations: relations.length ? relations : undefined,
    customValues: keptInputs,
  };
}

/** A plain-language account of a plan, for the dialog and the agent. */
export function describePlan(plan: ParametricPlan): string {
  const lines: string[] = [];
  const p = plan.definition.parameters;
  lines.push(`${plan.definition.name}: ${plan.shapeIds.length} shape(s) and ${plan.annotationIds.length} annotation(s) become one component.`);
  const lv = p.filter((x) => x.kind === "level");
  if (lv.length) lines.push(`Input levels (m): ${lv.map((x) => `${x.name} = ${x.default}`).join(", ")}.`);
  const ln = p.filter((x) => x.kind === "length");
  if (ln.length) lines.push(`Values (mm): ${ln.map((x) => `${x.name} = ${x.default}`).join(", ")}.`);
  const res = plan.edges.filter((e) => e.role === "result");
  if (res.length) lines.push(`Results (worked out, not typed): ${res.map((e) => `${e.name} = ${Math.round(e.value)}`).join(", ")}.`);
  const derivedLevels = plan.levels.filter((l) => !l.input);
  if (derivedLevels.length) lines.push(`Levels that follow from the values: ${derivedLevels.map((l) => `${l.name} = ${l.value.toFixed(3)}`).join(", ")}.`);
  const fixed = plan.datums.filter((d) => !d.principal && !d.via).length;
  if (fixed) lines.push(`${fixed} other position(s) follow the nearest named line at a fixed offset — name one to make it a value.`);
  if (plan.linkedTexts.length) lines.push(`Notes that now follow their values: ${plan.linkedTexts.map((t) => `"${t.after}"`).join(", ")}.`);
  if (plan.keptFree.length) lines.push(`${plan.keptFree.length} annotation(s) stay as they are (markers, tables, angular dimensions).`);
  for (const w of plan.warnings) lines.push(`Note: ${w}`);
  if (plan.mismatches.length) lines.push(`Cannot convert yet: ${plan.mismatches.join(" ")}`);
  return lines.join("\n");
}
