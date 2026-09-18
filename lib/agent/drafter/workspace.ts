/**
 * The drafting agent's workspace: a pen that draws INTO the parametric kernel.
 *
 * The previous agent kept its own drawing — a scene graph of symbolic nodes that
 * it rendered to shapes at the end — and bolted parameters onto the result
 * afterwards. Those parameters drove nothing. Nothing in the kernel read them,
 * so Run Mode showed a list of numbers that changed no geometry, and no
 * dimension appeared on the sheet, because a dimension on the sheet IS a
 * constraint that reads a parameter (§61) and there were none.
 *
 * Here there is one drawing and it is the kernel's own:
 *
 *     shapes        what is on the canvas, in canvas coordinates
 *     sketch        the AuthoringSketch Author Mode and Run Mode read
 *
 * Every tool the model calls ends in `regenerate`, the same single pipeline the
 * panels use (§29), so a rule the agent adds passes the same admissibility gate
 * (§32), a value it names drives the same residual rows, and a drawing it
 * finishes is already the template a project engineer opens. There is no
 * conversion step at the end in which intent could be lost.
 *
 *
 * COORDINATES
 *
 * The canvas is Y-DOWN, like the screen. Engineers think Y-UP — levels rise,
 * the top slab is above the bottom one — and a model asked to draw a section
 * reasons the same way. So the model speaks Y-up throughout and this file
 * converts at the boundary: every coordinate in or out of a tool is `-y` of the
 * canvas value. Visually nothing changes: what the model calls "top" is the top
 * of the screen.
 *
 *
 * WHAT THE MODEL MAY AND MAY NOT DO
 *
 * It holds the pen, so it decides where geometry starts. It does not decide
 * what the geometry MEANS without the kernel agreeing: a rule is admitted only
 * if it removes freedom (§32), a named value is created only if the drawing
 * currently measures what the name claims, and a formula is accepted only if it
 * reproduces the drawing in front of it (see `formulaCheck`). Every refusal
 * comes back as a sentence the model can act on.
 */

import type { CircleShape, LineShape, RectangleShape, Shape } from "../../geometry/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../../geometry/tolerance";
import {
  AuthoringSketch,
  SketchConstraint,
  SketchParameter,
  ConstraintKind,
  emptySketch,
} from "../../upce/types";
import { regenerate, namesOf, removeConstraint, authoredOnly, RegenerateResult } from "../../upce/document";
import { resolveAlias } from "../../upce/lower";
import { applyAction, IntentAction, suggestCompletion } from "../../upce/completion";
import { detectCandidates } from "../../upce/detect";
import { analyseDof, DofReport, structuralDof } from "../../upce/dof";
import { findProfiles, profileLoop, pointInLoop, Profile } from "../../upce/profile";
import {
  dependenciesOf,
  evaluateParameters,
  makeProvenance,
  renameParameters,
  validateExpression,
} from "../../upce/parameters";
import { verifyProposedFormula } from "../../upce/formulaCheck";
import { inversionOptions } from "../../upce/inverse";
import { assessReadiness, buildManifest, ReadinessReport, TemplateManifest } from "../../upce/template";
import { createComponent, createRepeat } from "../../upce/repeat";
import { setComponentRigid } from "../../upce/rigid";
import { evaluateFormula } from "../../parametric/expression";
import { emptyCadDoc, type CadDocState } from "../../cad/document";
import { applyCadAction, type CadAction } from "../../state/cadActions";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A tool the model composed out of other tools (see `tools.ts`). */
export interface MacroDefinition {
  name: string;
  description: string;
  parameters: { name: string; description: string; type?: "number" | "string" }[];
  steps: { tool: string; args: Record<string, unknown> }[];
}

/** Everything needed to resume work on a drawing. Plain JSON. */
export interface DrafterState {
  /** Canvas coordinates (Y down). Repeat copies are regenerated, never stored. */
  shapes: Shape[];
  sketch: AuthoringSketch;
  title?: string;
  macros?: MacroDefinition[];
  /**
   * The CAD document — layers, annotations, component instances, project and
   * sheets — and the geometry its components generated. Kept apart from
   * `shapes` because component geometry is regenerated from values and never
   * enters the authoring sketch.
   */
  cad?: CadDocState;
  cadShapes?: Shape[];
}

export interface CommitResult {
  ok: boolean;
  /** Why the whole change was refused. The drawing is then exactly as before. */
  rejection?: string;
  /** Rules removed because the geometry they referred to is gone. */
  dropped: string[];
  /** Shapes the rules would not let stay where the change put them. */
  held: string[];
}

export type Pt = { x: number; y: number };

const r1 = (v: number) => Math.round(v * 10) / 10;
export const fmt = (v: number) => {
  const r = r1(v);
  return Object.is(r, -0) ? "0" : String(r);
};
const fmtPt = (p: Pt) => `(${fmt(p.x)}, ${fmt(p.y)})`;

/** Canvas <-> model. The only place the axis flips. */
const up = (canvasY: number) => (canvasY === 0 ? 0 : -canvasY);
const down = (modelY: number) => (modelY === 0 ? 0 : -modelY);

/** Rectangle corners and edges in the order the kernel lowers them. */
const RECT_CORNERS = ["top_left", "top_right", "bottom_right", "bottom_left"] as const;
const RECT_EDGES = ["top", "right", "bottom", "left"] as const;

export class ToolError extends Error {}

let counter = 0;
const uid = (prefix: string) =>
  `${prefix}_${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class DraftingWorkspace {
  shapes: Shape[];
  sketch: AuthoringSketch;
  title: string;
  macros: MacroDefinition[];
  readonly policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY;
  /** Bumped on every accepted change; lets the loop know a view is stale. */
  revision = 0;
  last: RegenerateResult | null = null;

  cad: CadDocState;
  /** Geometry generated by component instances (regenerated, never edited). */
  cadShapes: Shape[];

  constructor(state?: Partial<DrafterState>) {
    const incoming = state?.shapes ?? [];
    this.cad = state?.cad ?? emptyCadDoc();
    this.cadShapes = state?.cadShapes ?? incoming.filter((s) => s.componentInstanceId);
    this.shapes = authoredOnly(incoming);
    this.sketch = state?.sketch ?? emptySketch();
    this.title = state?.title ?? state?.sketch?.meta?.name ?? "Untitled drawing";
    this.macros = state?.macros ?? [];
    if (this.shapes.length > 0) {
      // Bring the sketch level with the shapes it was handed. A canvas that was
      // never analysed arrives with an empty sketch; this is its first lowering.
      const result = regenerate(this.shapes, this.sketch, {
        shapeNames: this.names(),
        source: "geometry",
      });
      if (!result.rejection) {
        this.shapes = authoredOnly(result.shapes);
        this.sketch = result.sketch;
        this.last = result;
      }
    }
  }

  toState(): DrafterState {
    return {
      shapes: this.shapes,
      sketch: this.sketch,
      title: this.title,
      macros: this.macros,
      cad: this.cad,
      cadShapes: this.cadShapes,
    };
  }

  /**
   * One CAD-document operation, through exactly the reducer logic the editor
   * runs — so a component the agent inserts, or a value it changes, is refused
   * or accepted by the same invariants a person's edit is.
   */
  applyCad(action: CadAction): { ok: boolean; message: string } {
    const before = this.cad.componentNotice;
    const r = applyCadAction(this.cadShapes, this.cad, action);
    if (!r) return { ok: false, message: "Nothing to change." };
    const fresh = r.cad.componentNotice && r.cad.componentNotice !== before ? r.cad.componentNotice : null;
    const refused = Boolean(fresh && !fresh.ok);
    this.cadShapes = r.shapes;
    this.cad = r.cad;
    if (!refused) this.revision++;
    return { ok: !refused, message: fresh?.message ?? r.history ?? "Done." };
  }

  /**
   * Say what free-drawn geometry IS. Roles change layers and mark level lines
   * as construction geometry, so the change goes through the geometry commit
   * and the rules get their say; the annotations it adds (level markers,
   * hatches) land in the CAD document.
   */
  classify(ids: string[], role: string): CommitResult {
    const r = applyCadAction(this.shapes, this.cad, { type: "CAD_CLASSIFY", ids, role });
    if (!r) return { ok: false, rejection: "None of those are free-drawn shapes.", dropped: [], held: [] };
    const commit = this.commitGeometry(r.shapes);
    if (commit.ok) this.cad = r.cad;
    return commit;
  }

  /** Free geometry and component geometry together — what the sheet shows. */
  allShapes(): Shape[] {
    return [...this.displayShapes(), ...this.cadShapes];
  }

  names(): Record<string, string> {
    return namesOf(this.shapes);
  }

  /** Every shape including repeat copies — what the canvas will show. */
  displayShapes(): Shape[] {
    return this.last?.shapes ?? this.shapes;
  }

  // -------------------------------------------------------------------------
  // The two commit paths. Nothing else assigns `shapes` or `sketch`.
  // -------------------------------------------------------------------------

  /** The geometry changed; the rules get their say. */
  commitGeometry(next: Shape[]): CommitResult {
    const result = regenerate(next, this.sketch, { shapeNames: namesOf(next), source: "geometry" });
    return this.accept(result, next, true);
  }

  /** The intent changed; the geometry follows. */
  commitIntent(next: AuthoringSketch): CommitResult {
    const result = regenerate(this.shapes, next, { shapeNames: this.names() });
    return this.accept(result, this.shapes, false);
  }

  /**
   * `held` only means something when geometry was placed by hand: in the intent
   * direction every shape that moved did so because a value asked it to.
   */
  private accept(result: RegenerateResult, handed: Shape[], placed: boolean): CommitResult {
    if (result.rejection) {
      return { ok: false, rejection: result.rejection, dropped: [], held: [] };
    }
    const errors = result.parameterErrors.map((e) => `${e.parameter}: ${e.message}`);
    if (errors.length > 0) {
      return { ok: false, rejection: errors.join(" "), dropped: [], held: [] };
    }
    this.shapes = authoredOnly(result.shapes);
    this.sketch = result.sketch;
    this.last = result;
    this.revision++;
    const names = namesOf(handed);
    return {
      ok: true,
      dropped: result.droppedConstraintIds,
      held: placed ? result.heldShapeIds.filter((id) => !id.includes("#")).map((id) => names[id] ?? id) : [],
    };
  }

  // -------------------------------------------------------------------------
  // Naming things
  // -------------------------------------------------------------------------

  /** A readable, unique shape id. Ids are what the model refers to. */
  freshId(requested: string | undefined, fallback: string): string {
    const base =
      (requested ?? "")
        .trim()
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "") || fallback;
    const clean = /^[A-Za-z]/.test(base) ? base : `${fallback}_${base}`;
    const taken = new Set(this.shapes.map((s) => s.id));
    if (!taken.has(clean)) return clean;
    for (let i = 2; ; i++) if (!taken.has(`${clean}_${i}`)) return `${clean}_${i}`;
  }

  shape(id: string): Shape {
    const s = this.shapes.find((x) => x.id === id) ?? this.shapes.find((x) => x.name === id);
    if (!s) {
      const known = this.shapes.slice(0, 30).map((x) => x.id).join(", ");
      throw new ToolError(`There is no shape "${id}". Shapes: ${known || "none yet"}.`);
    }
    return s;
  }

  /** "p1 (x, y), p2 (x, y), ..." for a polyline group, as it now stands. */
  vertexList(group: string): string {
    return this.groupMembers(group)
      .map((l, i) => `p${i + 1} (${fmt(l.x1)}, ${fmt(up(l.y1))})`)
      .join(", ");
  }

  /** Lines drawn together by one polyline call, in drawing order. */
  groupMembers(group: string): LineShape[] {
    return this.shapes
      .filter((s): s is LineShape => s.type === "line" && s.groupId === group)
      .sort((a, b) => memberIndex(a.id) - memberIndex(b.id));
  }

  // -------------------------------------------------------------------------
  // References: how the model points at a point or an edge.
  //
  //   points  Line.start  Line.end  Rect.top_left  Circle.center
  //           Group.p3 (vertex 3 of a polyline)   (x, y) an existing point
  //   edges   Line   Rect.top   Group.e3   Group_3
  // -------------------------------------------------------------------------

  pointId(ref: string): string {
    const r = ref.trim();
    const coord = r.match(/^@?\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
    if (coord) return this.pointAt({ x: Number(coord[1]), y: Number(coord[2]) });

    const dot = r.lastIndexOf(".");
    if (dot < 0) {
      throw new ToolError(
        `"${r}" is not a point. Use Line.start / Line.end, Rect.top_left, Circle.center, Group.p1, or a coordinate like (1200, 800).`
      );
    }
    const owner = r.slice(0, dot);
    const part = r.slice(dot + 1).toLowerCase();

    const group = this.groupMembers(owner);
    if (group.length > 0 && /^p\d+$/.test(part)) {
      const k = Number(part.slice(1));
      if (k < 1 || k > group.length) {
        throw new ToolError(`${owner} has vertices p1 to p${group.length}.`);
      }
      return resolveAlias(this.sketch, `${group[k - 1].id}:v0`);
    }

    const s = this.shape(owner);
    let raw: string | null = null;
    if (s.type === "line" || s.type === "arrow") {
      if (part === "start") raw = `${s.id}:v0`;
      if (part === "end") raw = `${s.id}:v1`;
      if (part === "mid" || part === "midpoint") {
        throw new ToolError(`A line's midpoint is not a vertex. Use rule kind "midpoint" to hold a point there.`);
      }
    } else if (s.type === "rectangle") {
      const i = (RECT_CORNERS as readonly string[]).indexOf(part);
      if (i >= 0) raw = `${s.id}:v${i}`;
    } else if (s.type === "circle") {
      if (part === "center" || part === "centre") raw = `${s.id}:v0`;
    }
    if (!raw) {
      const valid =
        s.type === "rectangle"
          ? RECT_CORNERS.join(", ")
          : s.type === "circle"
            ? "center"
            : "start, end";
      throw new ToolError(`${s.id} has no point "${part}". Valid: ${valid}.`);
    }
    const id = resolveAlias(this.sketch, raw);
    if (!this.sketch.points[id]) throw new ToolError(`${r} is not part of the solved drawing yet.`);
    return id;
  }

  /** The existing point nearest a coordinate, if one is close enough to mean it. */
  pointAt(p: Pt): string {
    const target = { x: p.x, y: down(p.y) };
    let best: string | null = null;
    let bestD = Infinity;
    for (const pt of Object.values(this.sketch.points)) {
      const d = Math.hypot(pt.x - target.x, pt.y - target.y);
      if (d < bestD) {
        bestD = d;
        best = pt.id;
      }
    }
    if (!best || bestD > Math.max(1, this.policy.weld_mm * 2)) {
      const near = best ? ` The nearest point is ${fmtPt(this.modelPoint(best))}, ${fmt(bestD)} mm away.` : "";
      throw new ToolError(`No point sits at ${fmtPt(p)}.${near}`);
    }
    return best;
  }

  segmentId(ref: string): string {
    const r = ref.trim();
    const dot = r.lastIndexOf(".");
    if (dot >= 0) {
      const owner = r.slice(0, dot);
      const part = r.slice(dot + 1).toLowerCase();
      const group = this.groupMembers(owner);
      if (group.length > 0 && /^e\d+$/.test(part)) {
        const k = Number(part.slice(1));
        if (k < 1 || k > group.length) throw new ToolError(`${owner} has edges e1 to e${group.length}.`);
        return `${group[k - 1].id}:e0`;
      }
      const s = this.shape(owner);
      if (s.type === "rectangle") {
        const i = (RECT_EDGES as readonly string[]).indexOf(part);
        if (i >= 0) return `${s.id}:e${i}`;
      }
      throw new ToolError(`"${r}" is not an edge. Rectangles have .top .right .bottom .left; polylines have .e1, .e2, ...`);
    }
    if (this.groupMembers(r).length > 0) {
      throw new ToolError(`${r} is a polyline of ${this.groupMembers(r).length} edges — name one: ${r}.e1 or ${r}_1.`);
    }
    const s = this.shape(r);
    if (s.type === "line" || s.type === "arrow") return `${s.id}:e0`;
    if (s.type === "rectangle") throw new ToolError(`${s.id} is a rectangle — name an edge: ${s.id}.top, .right, .bottom or .left.`);
    throw new ToolError(`${s.id} is a ${s.type}, not an edge.`);
  }

  modelPoint(pointId: string): Pt {
    const p = this.sketch.points[pointId];
    return { x: p.x, y: up(p.y) };
  }

  /** How the model should refer to a kernel point, for messages. */
  describePoint(pointId: string): string {
    const p = this.sketch.points[pointId];
    if (!p) return pointId;
    for (const owner of p.owners) {
      const s = this.shapes.find((x) => x.id === owner);
      if (!s) continue;
      const raws = Object.entries(this.sketch.pointAliases)
        .filter(([raw, host]) => host === pointId && raw.startsWith(`${owner}:`))
        .map(([raw]) => raw);
      for (const raw of raws) {
        const v = Number(raw.split(":v")[1]);
        if (s.type === "line") {
          if (s.groupId && v === 0) return `${s.groupId}.p${memberIndex(s.id)}`;
          return `${s.id}.${v === 0 ? "start" : "end"}`;
        }
        if (s.type === "rectangle") return `${s.id}.${RECT_CORNERS[v]}`;
        if (s.type === "circle" && v === 0) return `${s.id}.center`;
      }
    }
    return fmtPt(this.modelPoint(pointId));
  }

  describeSegment(segId: string): string {
    const seg = this.sketch.segments[segId];
    if (!seg) return segId;
    const s = this.shapes.find((x) => x.id === seg.shapeId);
    if (s?.type === "rectangle") return `${s.id}.${RECT_EDGES[seg.edgeIndex]}`;
    return seg.shapeId;
  }

  // -------------------------------------------------------------------------
  // The pen
  // -------------------------------------------------------------------------

  private lineShape(id: string, name: string, a: Pt, b: Pt, extra: Partial<LineShape> = {}): LineShape {
    return {
      id,
      type: "line",
      name,
      x1: a.x,
      y1: down(a.y),
      x2: b.x,
      y2: down(b.y),
      isVisible: true,
      ...extra,
    };
  }

  private construction(extra: Partial<LineShape>, flag?: boolean): Partial<LineShape> {
    return flag
      ? { ...extra, isReference: true, strokeDasharray: "12 6", strokeColor: "#94a3b8" }
      : extra;
  }

  drawLine(name: string | undefined, a: Pt, b: Pt, construction = false): { id: string; commit: CommitResult } {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) throw new ToolError("A line needs two different ends.");
    const id = this.freshId(name, "L");
    const shape = this.lineShape(id, name ?? id, a, b, this.construction({}, construction));
    return { id, commit: this.commitGeometry([...this.shapes, shape]) };
  }

  drawPolyline(
    name: string | undefined,
    points: Pt[],
    closed: boolean,
    construction = false
  ): { group: string; ids: string[]; commit: CommitResult } {
    const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) >= 1);
    if (closed && pts.length > 2) {
      const f = pts[0];
      const l = pts[pts.length - 1];
      if (Math.hypot(f.x - l.x, f.y - l.y) < 1) pts.pop();
    }
    if (pts.length < 2 || (closed && pts.length < 3)) {
      throw new ToolError("A polyline needs at least two distinct points (three if closed).");
    }
    const group = this.freshId(name, "P");
    const edges = closed ? pts.length : pts.length - 1;
    const made: LineShape[] = [];
    for (let i = 0; i < edges; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      made.push(
        this.lineShape(`${group}_${i + 1}`, `${name ?? group} ${i + 1}`, a, b, this.construction({ groupId: group, groupName: name ?? group }, construction))
      );
    }
    return { group, ids: made.map((m) => m.id), commit: this.commitGeometry([...this.shapes, ...made]) };
  }

  drawRectangle(name: string | undefined, x: number, y: number, w: number, h: number): { id: string; commit: CommitResult } {
    if (w <= 0 || h <= 0) throw new ToolError("A rectangle needs a positive width and height.");
    const id = this.freshId(name, "R");
    const rect: RectangleShape = {
      id,
      type: "rectangle",
      name: name ?? id,
      x,
      y: down(y + h),
      width: w,
      height: h,
      isVisible: true,
    };
    return { id, commit: this.commitGeometry([...this.shapes, rect]) };
  }

  drawCircle(name: string | undefined, c: Pt, r: number): { id: string; commit: CommitResult } {
    if (r <= 0) throw new ToolError("A circle needs a positive radius.");
    const id = this.freshId(name, "C");
    const circle: CircleShape = { id, type: "circle", name: name ?? id, cx: c.x, cy: down(c.y), r, isVisible: true };
    return { id, commit: this.commitGeometry([...this.shapes, circle]) };
  }

  // -------------------------------------------------------------------------
  // Editing
  // -------------------------------------------------------------------------

  /** Expands group names to their member lines. */
  expandIds(ids: string[]): string[] {
    const out: string[] = [];
    for (const id of ids) {
      const group = this.groupMembers(id);
      if (group.length > 0) out.push(...group.map((g) => g.id));
      else out.push(this.shape(id).id);
    }
    return [...new Set(out)];
  }

  transform(ids: string[], f: (p: Pt) => Pt, mode: "move" | "copy", suffix = "copy"): { ids: string[]; commit: CommitResult } {
    const targets = this.expandIds(ids);
    const map = (s: Shape): Shape => transformShape(s, f);
    if (mode === "move") {
      const next = this.shapes.map((s) => (targets.includes(s.id) ? map(s) : s));
      return { ids: targets, commit: this.commitGeometry(next) };
    }
    const groupRename = new Map<string, string>();
    const made: Shape[] = [];
    const taken = new Set(this.shapes.map((s) => s.id));
    const fresh = (base: string) => {
      let id = `${base}_${suffix}`;
      for (let i = 2; taken.has(id); i++) id = `${base}_${suffix}${i}`;
      taken.add(id);
      return id;
    };
    for (const id of targets) {
      const src = this.shapes.find((s) => s.id === id)!;
      const copy = map(src);
      if (src.type === "line" && src.groupId) {
        const g = groupRename.get(src.groupId) ?? fresh(src.groupId);
        groupRename.set(src.groupId, g);
        made.push({ ...copy, id: `${g}_${memberIndex(src.id)}`, groupId: g, groupName: g, name: `${g} ${memberIndex(src.id)}` } as Shape);
      } else {
        const nid = fresh(src.id);
        made.push({ ...copy, id: nid, name: nid } as Shape);
      }
    }
    return { ids: made.map((m) => m.id), commit: this.commitGeometry([...this.shapes, ...made]) };
  }

  deleteShapes(ids: string[]): CommitResult {
    const targets = new Set(this.expandIds(ids));
    return this.commitGeometry(this.shapes.filter((s) => !targets.has(s.id)));
  }

  rename(id: string, name: string): void {
    const s = this.shape(id);
    this.shapes = this.shapes.map((x) => (x.id === s.id ? { ...x, name } : x));
  }

  /** A rectangle becomes four loose lines in one group, so corners can be cut. */
  explode(id: string): { group: string; commit: CommitResult } {
    const s = this.shape(id);
    if (s.type !== "rectangle") throw new ToolError(`${id} is a ${s.type}; only rectangles explode.`);
    const corners = RECT_CORNERS.map((c) => this.modelPoint(this.pointId(`${s.id}.${c}`)));
    // The rectangle's own name carries over to the group, so the model can keep
    // calling it what it called it. Only if its edge ids are taken is a new
    // group name made up.
    const taken = new Set(this.shapes.filter((x) => x.id !== s.id).map((x) => x.id));
    const group = [1, 2, 3, 4].some((i) => taken.has(`${s.id}_${i}`)) ? this.freshId(`${s.id}_edges`, "P") : s.id;
    const lines = corners.map((a, i) =>
      this.lineShape(`${group}_${i + 1}`, `${s.name ?? s.id} ${RECT_EDGES[i]}`, a, corners[(i + 1) % 4], {
        groupId: group,
        groupName: s.name ?? s.id,
      })
    );
    const next = [...this.shapes.filter((x) => x.id !== s.id), ...lines];
    return { group, commit: this.commitGeometry(next) };
  }

  /**
   * Cuts a corner where exactly two lines meet — a haunch, a chamfer.
   *
   * Each line is shortened along itself, so the cut stays true to the two faces
   * whatever angle they meet at; the new edge joins the two new ends.
   */
  chamfer(cornerRef: string, leg1: number, leg2: number, name?: string): { id: string; commit: CommitResult } {
    if (leg1 <= 0 || leg2 <= 0) throw new ToolError("Chamfer legs must be positive.");
    const corner = this.pointId(cornerRef);
    const incident = Object.values(this.sketch.segments).filter(
      (seg) => (seg.p1 === corner || seg.p2 === corner) && !this.sketch.circles[`${seg.shapeId}:c`]
    );
    if (incident.length !== 2) {
      throw new ToolError(
        `${cornerRef} is where ${incident.length} edges meet; a chamfer needs exactly two lines.`
      );
    }
    const legs = [leg1, leg2];
    const c = this.sketch.points[corner];
    const ends: Pt[] = [];
    const updates = new Map<string, Shape>();
    // Order the two edges the same way every time: counter-clockwise from +x in
    // model space, so `leg1` is the edge that comes first going round.
    const ordered = incident
      .map((seg) => {
        const other = this.sketch.points[seg.p1 === corner ? seg.p2 : seg.p1];
        return { seg, angle: Math.atan2(up(other.y) - up(c.y), other.x - c.x) };
      })
      .sort((a, b) => a.angle - b.angle);

    ordered.forEach(({ seg }, i) => {
      const shape = this.shapes.find((s) => s.id === seg.shapeId);
      if (!shape || shape.type !== "line") {
        throw new ToolError(`${cornerRef} is a corner of a ${shape?.type ?? "shape"}. Explode it into lines first.`);
      }
      const atStart = resolveAlias(this.sketch, `${shape.id}:v0`) === corner;
      const far = atStart ? { x: shape.x2, y: shape.y2 } : { x: shape.x1, y: shape.y1 };
      const len = Math.hypot(far.x - c.x, far.y - c.y);
      if (legs[i] >= len - 1) {
        throw new ToolError(`${shape.id} is only ${fmt(len)} mm long; a ${fmt(legs[i])} mm leg does not fit.`);
      }
      const t = legs[i] / len;
      const cut = { x: c.x + (far.x - c.x) * t, y: c.y + (far.y - c.y) * t };
      ends.push({ x: cut.x, y: up(cut.y) });
      updates.set(
        shape.id,
        atStart ? { ...shape, x1: cut.x, y1: cut.y } : { ...shape, x2: cut.x, y2: cut.y }
      );
    });

    const first = this.shapes.find((s) => s.id === ordered[0].seg.shapeId) as LineShape;
    const id = this.freshId(name ?? `${first.groupId ?? first.id}_chamfer`, "H");
    const edge = this.lineShape(id, name ?? id, ends[0], ends[1], first.groupId ? { groupName: undefined } : {});
    const next = [...this.shapes.map((s) => updates.get(s.id) ?? s), edge];
    return { id, commit: this.commitGeometry(next) };
  }

  /** Moves one end of a line onto another line's carrier — trim or extend. */
  trimTo(lineRef: string, targetRef: string, end?: "start" | "end"): CommitResult {
    const s = this.shape(lineRef);
    if (s.type !== "line") throw new ToolError(`${lineRef} is not a line.`);
    const tSeg = this.sketch.segments[this.segmentId(targetRef)];
    const a = this.sketch.points[tSeg.p1];
    const b = this.sketch.points[tSeg.p2];
    const hit = carrierIntersection({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, a, b);
    if (!hit) throw new ToolError(`${lineRef} is parallel to ${targetRef}; they never meet.`);
    const which =
      end ??
      (Math.hypot(hit.x - s.x1, hit.y - s.y1) < Math.hypot(hit.x - s.x2, hit.y - s.y2) ? "start" : "end");
    const next = this.shapes.map((x) =>
      x.id !== s.id ? x : which === "start" ? { ...s, x1: hit.x, y1: hit.y } : { ...s, x2: hit.x, y2: hit.y }
    );
    return this.commitGeometry(next);
  }

  splitLine(lineRef: string, at: Pt): { ids: [string, string]; commit: CommitResult } {
    const s = this.shape(lineRef);
    if (s.type !== "line") throw new ToolError(`${lineRef} is not a line.`);
    const p = { x: at.x, y: down(at.y) };
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const L2 = dx * dx + dy * dy;
    const t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / L2;
    if (t <= 0.001 || t >= 0.999) throw new ToolError(`${fmtPt(at)} is not inside ${s.id}.`);
    const foot = { x: s.x1 + dx * t, y: s.y1 + dy * t };
    const idB = this.freshId(`${s.id}_b`, "L");
    const a: LineShape = { ...s, x2: foot.x, y2: foot.y };
    const b: LineShape = { ...s, id: idB, name: idB, groupId: undefined, groupName: undefined, x1: foot.x, y1: foot.y };
    const next = [...this.shapes.map((x) => (x.id === s.id ? a : x)), b];
    return { ids: [s.id, idB], commit: this.commitGeometry(next) };
  }

  /**
   * A parallel copy. A single line moves sideways; a closed polyline grows or
   * shrinks with mitred corners, so an outline offset inward keeps its shape.
   */
  offset(ref: string, distance: number, side: string, name?: string): { ids: string[]; commit: CommitResult } {
    const group = this.groupMembers(ref);
    if (group.length > 0) {
      const pts = group.map((l) => ({ x: l.x1, y: up(l.y1) }));
      const last = group[group.length - 1];
      const closed = Math.hypot(last.x2 - group[0].x1, last.y2 - group[0].y1) < this.policy.weld_mm;
      if (!closed) pts.push({ x: last.x2, y: up(last.y2) });
      const area = closed ? signedArea(pts) : 0;
      let sign: number;
      if (side === "inside" || side === "outside") {
        if (!closed) throw new ToolError(`${ref} is open; use side "left" or "right".`);
        // Left of travel is inside for a counter-clockwise loop.
        sign = (side === "inside") === area > 0 ? 1 : -1;
      } else {
        sign = side === "left" ? 1 : -1;
      }
      const moved = offsetPolyline(pts, distance * sign, closed);
      const made = this.drawPolyline(name ?? `${ref}_offset`, moved, closed);
      return { ids: made.ids, commit: made.commit };
    }
    const s = this.shape(ref);
    if (s.type === "rectangle") {
      const grow = side === "outside" ? distance : side === "inside" ? -distance : NaN;
      if (Number.isNaN(grow)) throw new ToolError(`Offset a rectangle "inside" or "outside".`);
      const x = s.x - grow;
      const w = s.width + 2 * grow;
      const h = s.height + 2 * grow;
      const yBottom = up(s.y + s.height) - grow;
      const made = this.drawRectangle(name ?? `${s.id}_offset`, x, yBottom, w, h);
      return { ids: [made.id], commit: made.commit };
    }
    if (s.type !== "line") throw new ToolError(`Cannot offset a ${s.type}.`);
    const a = { x: s.x1, y: up(s.y1) };
    const b = { x: s.x2, y: up(s.y2) };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const sign = side === "left" ? 1 : side === "right" ? -1 : NaN;
    if (Number.isNaN(sign)) throw new ToolError(`Offset a line to the "left" or "right" of its direction.`);
    const n = { x: (-(b.y - a.y) / len) * distance * sign, y: ((b.x - a.x) / len) * distance * sign };
    const made = this.drawLine(name ?? `${s.id}_offset`, { x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, s.isReference);
    return { ids: [made.id], commit: made.commit };
  }

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  /**
   * Admits one constraint through the kernel's gate, then solves.
   *
   * Returns what happened in words: added, already implied, or contradicts.
   */
  admit(
    draft: Omit<SketchConstraint, "id">,
    newParameter?: { name: string; value: number; unit: SketchParameter["unit"]; group?: string; description?: string; role?: SketchParameter["role"] }
  ): { status: "added" | "implied" | "refused"; message: string; constraintId?: string } {
    const action: IntentAction = {
      id: uid("agent"),
      title: draft.label,
      rationale: "",
      createsParameters: newParameter
        ? [
            {
              name: newParameter.name,
              value: newParameter.value,
              role: newParameter.role ?? "DRIVING",
              unit: newParameter.unit,
              uiGroup: newParameter.group ?? "Dimensions",
              description: newParameter.description ?? draft.label,
            },
          ]
        : [],
      createsConstraints: [draft],
      evidence: [],
      dofRemoved: 0,
    };
    const before = this.sketch.constraints.length;
    const next = applyAction(this.sketch, action);
    if (next === this.sketch || next.constraints.length === before) {
      return { status: "implied", message: "already decided by the rules in force" };
    }
    const added = next.constraints[next.constraints.length - 1];
    // `applyAction` stamps a generic provenance; say who actually decided this.
    const stamped: AuthoringSketch = {
      ...next,
      constraints: next.constraints.map((c) =>
        c.id === added.id
          ? { ...c, provenance: makeProvenance("completion-assistant", `Added by the drafting agent: ${c.label}.`) }
          : c
      ),
    };
    const commit = this.commitIntent(stamped);
    if (!commit.ok) {
      return { status: "refused", message: commit.rejection ?? "the drawing would not solve" };
    }
    return { status: "added", message: "added", constraintId: added.id };
  }

  /** What a would-be constraint measures on the current geometry, in model units. */
  measure(kind: ConstraintKind, points: string[], segments: string[], sign = 1, scale = 1): number {
    const P = (id: string) => this.sketch.points[id];
    const segPts = (id: string) => {
      const s = this.sketch.segments[id];
      return [P(s.p1), P(s.p2)] as const;
    };
    let canvas: number;
    switch (kind) {
      case "distance": {
        const [a, b] = [P(points[0]), P(points[1])];
        canvas = Math.hypot(b.x - a.x, b.y - a.y);
        break;
      }
      case "distance_x":
        canvas = P(points[1]).x - P(points[0]).x;
        break;
      case "distance_y":
        canvas = P(points[1]).y - P(points[0]).y;
        break;
      case "position_x":
        canvas = P(points[0]).x;
        break;
      case "position_y":
        canvas = P(points[0]).y;
        break;
      case "point_line_distance": {
        const [a, b] = segPts(segments[0]);
        const p = P(points[0]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        canvas = ((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.hypot(dx, dy);
        break;
      }
      case "angle": {
        const [a, b] = segPts(segments[0]);
        const [c, d] = segPts(segments[1]);
        const u = { x: b.x - a.x, y: b.y - a.y };
        const v = { x: d.x - c.x, y: d.y - c.y };
        canvas = Math.acos(
          Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))
        );
        break;
      }
      default:
        throw new ToolError(`Cannot measure a ${kind}.`);
    }
    return canvas / (sign * scale);
  }

  /** A geometric relationship with no number attached. */
  addRule(kind: string, a?: string, b?: string, about?: string): { status: string; message: string; id?: string } {
    const need = (v: string | undefined, what: string) => {
      if (!v) throw new ToolError(`Rule "${kind}" needs ${what}.`);
      return v;
    };
    let draft: Omit<SketchConstraint, "id">;
    const base = {
      strength: "hard" as const,
      driving: true,
      state: "active" as const,
      provenance: makeProvenance("completion-assistant", "Added by the drafting agent."),
    };
    switch (kind) {
      case "horizontal":
      case "vertical": {
        const s = this.segmentId(need(a, "a line (a)"));
        draft = { ...base, kind, points: [], segments: [s], label: `${this.describeSegment(s)} stays ${kind}` };
        break;
      }
      case "parallel":
      case "perpendicular":
      case "equal": {
        const s1 = this.segmentId(need(a, "two lines (a, b)"));
        const s2 = this.segmentId(need(b, "two lines (a, b)"));
        const k: ConstraintKind = kind === "equal" ? "equal_length" : kind;
        const phrase = kind === "equal" ? "stay the same length" : `stay ${kind}`;
        draft = { ...base, kind: k, points: [], segments: [s1, s2], label: `${this.describeSegment(s1)} and ${this.describeSegment(s2)} ${phrase}` };
        break;
      }
      case "coincident": {
        const p1 = this.pointId(need(a, "two points (a, b)"));
        const p2 = this.pointId(need(b, "two points (a, b)"));
        if (p1 === p2) return { status: "implied", message: `${a} and ${b} are already the same point` };
        draft = { ...base, kind, points: [p1, p2], segments: [], label: `${a} and ${b} meet` };
        break;
      }
      case "on_line":
      case "midpoint": {
        const p = this.pointId(need(a, "a point (a)"));
        const s = this.segmentId(need(b, "a line (b)"));
        draft = {
          ...base,
          kind: kind === "on_line" ? "point_on_line" : "midpoint",
          points: [p],
          segments: [s],
          label: kind === "on_line" ? `${a} stays on ${this.describeSegment(s)}` : `${a} stays at the middle of ${this.describeSegment(s)}`,
        };
        break;
      }
      case "symmetric": {
        const p1 = this.pointId(need(a, "two points (a, b)"));
        const p2 = this.pointId(need(b, "two points (a, b)"));
        const s = this.segmentId(need(about, "an axis line (about)"));
        draft = { ...base, kind, points: [p1, p2], segments: [s], label: `${a} and ${b} mirror about ${this.describeSegment(s)}` };
        break;
      }
      case "anchor": {
        const p = this.pointId(need(a, "a point (a)"));
        const at = this.sketch.points[p];
        draft = {
          ...base,
          kind: "fix",
          points: [p],
          segments: [],
          value: at.x,
          valueY: at.y,
          label: `${this.describePoint(p)} is pinned to the sheet`,
        };
        const pinned = this.admit(draft);
        // §18: a pin holds two freedoms; the third is the turn about it. Hold the
        // turn with the line the author named, or the longest line through the pin.
        const orientRef = about ?? this.longestLineThrough(p);
        if (!orientRef) {
          return { status: pinned.status, message: `${pinned.message}; nothing through that point can hold the orientation — add a horizontal or vertical rule.`, id: pinned.constraintId };
        }
        const seg = this.segmentId(orientRef);
        const [e1, e2] = [this.sketch.points[this.sketch.segments[seg].p1], this.sketch.points[this.sketch.segments[seg].p2]];
        const k = Math.abs(e2.x - e1.x) >= Math.abs(e2.y - e1.y) ? "horizontal" : "vertical";
        const turned = this.addRule(k, orientRef);
        return {
          status: pinned.status,
          message: `pin ${pinned.message}; orientation (${orientRef} ${k}) ${turned.status === "added" ? "added" : "already held"}`,
          id: pinned.constraintId,
        };
      }
      default:
        throw new ToolError(
          `Unknown rule "${kind}". Use horizontal, vertical, parallel, perpendicular, equal, coincident, on_line, midpoint, symmetric or anchor.`
        );
    }
    const result = this.admit(draft);
    return { status: result.status, message: result.message, id: result.constraintId };
  }

  private longestLineThrough(pointId: string): string | null {
    let best: string | null = null;
    let bestLen = -1;
    for (const seg of Object.values(this.sketch.segments)) {
      if (seg.p1 !== pointId && seg.p2 !== pointId) continue;
      if (this.sketch.circles[`${seg.shapeId}:c`]) continue;
      const a = this.sketch.points[seg.p1];
      const b = this.sketch.points[seg.p2];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > bestLen) {
        bestLen = len;
        best = this.describeSegment(seg.id);
      }
    }
    return best;
  }

  /**
   * Accepts what the kernel's own detectors find in the geometry.
   *
   * Zero geometric authority (§56): the model does not assert that two edges
   * are parallel, it asks the detector which ones are and chooses which KINDS of
   * finding to accept. Each is admitted one at a time so an earlier acceptance
   * can make a later one redundant, which is exactly what the gate is for.
   */
  autoConstrain(kinds: string[], shapeIds?: string[]): { added: string[]; skipped: number } {
    const known = new Set(["horizontal", "vertical", "parallel", "perpendicular", "equal_length", "symmetric", "point_on_line", "concentric"]);
    const wanted = kinds
      .map((k) => (k === "equal" ? "equal_length" : k === "on_line" ? "point_on_line" : k))
      .filter((k): k is ConstraintKind => known.has(k));
    if (wanted.length === 0) {
      throw new ToolError(`No detectable kinds in ${JSON.stringify(kinds)}. Use horizontal, vertical, parallel, perpendicular, equal, symmetric, on_line or concentric.`);
    }
    const scope = shapeIds && shapeIds.length > 0 ? this.expandIds(shapeIds) : undefined;
    const candidates = detectCandidates(this.sketch, { shapeNames: this.names(), shapeIds: scope, limit: 400, kinds: wanted })
      .filter((c) => c.admissible)
      .sort((a, b) => b.confidence - a.confidence);
    const added: string[] = [];
    let skipped = 0;
    for (const c of candidates) {
      const result = this.admit({ ...c.constraint, strength: "hard" });
      if (result.status === "added") added.push(c.constraint.label);
      else skipped++;
    }
    return { added, skipped };
  }

  removeRule(id: string): { removedValues: string[] } {
    const out = removeConstraint(this.sketch, id);
    if (out.refused) throw new ToolError(out.refused);
    if (out.sketch === this.sketch) throw new ToolError(`There is no rule "${id}".`);
    const commit = this.commitIntent(out.sketch);
    if (!commit.ok) throw new ToolError(commit.rejection ?? "the drawing would not solve without it");
    return { removedValues: out.removedParameters ?? [] };
  }

  // -------------------------------------------------------------------------
  // Dimensions and named values
  // -------------------------------------------------------------------------

  /**
   * Names a measurement, and the named value then drives it.
   *
   * If the name already exists the new dimension SHARES it: "one wall
   * thickness, two walls" is one value bound to two rules. A shared name must
   * describe the geometry it is being attached to — unless the caller also
   * passes `value`, which says "make it so".
   */
  dimension(spec: {
    name: string;
    what: string;
    a: string;
    b?: string;
    value?: number;
    /** Only with this does a dimension MOVE geometry to a different size. */
    resize?: boolean;
    reference?: boolean;
    group?: string;
    description?: string;
  }): string {
    const name = spec.name.replace(/[^A-Za-z0-9_]/g, "");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new ToolError(`"${spec.name}" is not a usable name. Use letters and digits, starting with a letter (e.g. ClearSpan).`);
    }
    const built = this.dimensionDraft(spec.what, spec.a, spec.b);
    // Stored to a tenth of a micrometre. The solve settles to about 1e-10, and
    // keeping that noise made Run Mode show "50.000000000155" in its fields.
    const measured =
      Math.round(this.measure(built.kind, built.points, built.segments, built.sign, built.scale) * 1e4) / 1e4;
    const unit: SketchParameter["unit"] = spec.what === "angle" ? "deg" : "mm";
    const existing = this.sketch.parameters[name];
    const tol = Math.max(this.policy.geometry_mm, Math.abs(measured) * 1e-6);
    const reference = spec.reference === true;

    // A dimension names what is THERE. A model that passes a value different
    // from the measurement has usually picked the wrong edge — "clear span" on
    // the flat between two haunches — and letting that silently resize correct
    // geometry is how a right drawing becomes a wrong one. Moving geometry has to
    // be asked for.
    if (spec.value !== undefined && !spec.resize && Math.abs(spec.value - measured) > tol) {
      throw new ToolError(
        `${built.label} measures ${fmt(measured)} ${unit}, not ${fmt(spec.value)}. ` +
          `If the drawing is right, this is probably the wrong thing to dimension — check which points or edges carry ${name} ` +
          `(a clear span or thickness is an offset between two parallel faces, not the length of one edge). ` +
          `If you really want to change the geometry to ${fmt(spec.value)}, call again with resize: true.`
      );
    }

    const draft: Omit<SketchConstraint, "id"> = {
      kind: built.kind,
      points: built.points,
      segments: built.segments,
      sign: built.sign === -1 ? -1 : undefined,
      paramScale: built.scale !== 1 ? built.scale : undefined,
      paramRef: name,
      strength: reference ? "reference" : "hard",
      driving: !reference,
      state: "active",
      label: `${built.label} = ${name}`,
      provenance: makeProvenance(
        "completion-assistant",
        reference
          ? `The drafting agent measured ${built.label} for reference.`
          : `The drafting agent named ${built.label} ${name} so it can be changed.`
      ),
    };

    if (reference) {
      if (existing && existing.role !== "MEASURED") {
        throw new ToolError(`${name} already exists as a ${existing.role.toLowerCase()} value; pick another name for a reference measurement.`);
      }
      const id = uid("c_ref");
      const parameter: SketchParameter = {
        name,
        role: "MEASURED",
        type: unit === "deg" ? "ANGLE" : "LENGTH",
        unit,
        value: measured,
        provenance: makeProvenance("completion-assistant", `${built.label}, measured for reference.`),
        boundConstraints: [id],
        published: false,
        uiGroup: "Measured",
        description: spec.description ?? built.label,
      };
      const commit = this.commitIntent({
        ...this.sketch,
        parameters: { ...this.sketch.parameters, [name]: parameter },
        constraints: [...this.sketch.constraints, { ...draft, id }],
      });
      if (!commit.ok) throw new ToolError(commit.rejection ?? "could not record the measurement");
      return `${name} = ${fmt(measured)} ${unit} (reference: it reports ${built.label} and holds nothing).`;
    }

    if (existing) {
      if (existing.role === "MEASURED") {
        throw new ToolError(`${name} is a reference measurement and cannot drive geometry. Use another name.`);
      }
      const target = spec.value ?? existing.value;
      if (spec.value !== undefined && existing.role === "DERIVED") {
        throw new ToolError(`${name} is worked out by a formula (${existing.expr}); it cannot be set here. Omit "value".`);
      }
      if (spec.value === undefined && Math.abs(measured - existing.value) > tol) {
        throw new ToolError(
          `${name} is ${fmt(existing.value)} ${unit}, but ${built.label} measures ${fmt(measured)}. ` +
            `If they really are the same quantity pass value to move the geometry; otherwise use a different name.`
        );
      }
      // Binding first and moving second: the new rule has to be admitted
      // against the geometry as it stands, and only then asked to move.
      const result = this.admit(draft);
      if (result.status !== "added") {
        return this.explainRefusal(name, built.label, measured, target, unit, result);
      }
      if (spec.value !== undefined && Math.abs(spec.value - existing.value) > tol) {
        const moved = this.setValue(name, spec.value);
        return `${built.label} now follows ${name}; ${moved}`;
      }
      return `${built.label} now follows ${name} (${fmt(target)} ${unit}), shared with ${existing.boundConstraints.length} other rule(s).`;
    }

    const value = spec.value ?? measured;
    if (value <= 0 && built.kind !== "position_x" && built.kind !== "position_y") {
      throw new ToolError(`${built.label} measures ${fmt(measured)}; a dimension needs a positive value.`);
    }
    const result = this.admit(draft, {
      name,
      value: measured,
      unit,
      group: spec.group,
      description: spec.description ?? built.label,
    });
    if (result.status !== "added") {
      return this.explainRefusal(name, built.label, measured, value, unit, result);
    }
    if (spec.value !== undefined && Math.abs(spec.value - measured) > tol) {
      const moved = this.setValue(name, spec.value);
      return `${name} created on ${built.label}; ${moved}`;
    }
    return `${name} = ${fmt(value)} ${unit} now drives ${built.label}.`;
  }

  private explainRefusal(
    name: string,
    label: string,
    measured: number,
    wanted: number,
    unit: string,
    result: { status: string; message: string }
  ): never {
    if (result.status === "refused") {
      throw new ToolError(`${name} was not added: ${result.message}`);
    }
    const agrees = Math.abs(measured - wanted) <= Math.max(this.policy.geometry_mm, Math.abs(wanted) * 1e-6);
    throw new ToolError(
      agrees
        ? `${label} is already fixed at ${fmt(measured)} ${unit} by other rules, so ${name} would be a second answer to the same question. ` +
            `If it should be a named value, use formula to define it from the values that already decide it, or pass reference: true to only report it.`
        : `Other rules already fix ${label} at ${fmt(measured)} ${unit}; it cannot also be ${fmt(wanted)}. Change the value that decides it instead.`
    );
  }

  private dimensionDraft(
    what: string,
    aRef: string,
    bRef?: string
  ): { kind: ConstraintKind; points: string[]; segments: string[]; sign: number; scale: number; label: string } {
    const need = (v: string | undefined, role: string) => {
      if (!v) throw new ToolError(`A "${what}" dimension needs ${role}.`);
      return v;
    };
    switch (what) {
      case "length": {
        const seg = this.sketch.segments[this.segmentId(aRef)];
        return { kind: "distance", points: [seg.p1, seg.p2], segments: [], sign: 1, scale: 1, label: `length of ${this.describeSegment(seg.id)}` };
      }
      case "radius": {
        const s = this.shape(aRef);
        const circle = this.sketch.circles[`${s.id}:c`];
        if (!circle) throw new ToolError(`${aRef} is not a circle.`);
        return { kind: "distance", points: [circle.center, circle.rim], segments: [], sign: 1, scale: 1, label: `radius of ${s.id}` };
      }
      case "distance": {
        const p = this.pointId(aRef);
        const q = this.pointId(need(bRef, "two points (a, b)"));
        return { kind: "distance", points: [p, q], segments: [], sign: 1, scale: 1, label: `distance ${aRef} to ${bRef}` };
      }
      case "horizontal":
      case "vertical": {
        const p = this.pointId(aRef);
        const q = this.pointId(need(bRef, "two points (a, b)"));
        const axis = what === "horizontal" ? "x" : "y";
        const [lo, hi] =
          this.sketch.points[p][axis] <= this.sketch.points[q][axis] ? [p, q] : [q, p];
        return {
          kind: what === "horizontal" ? "distance_x" : "distance_y",
          points: [lo, hi],
          segments: [],
          sign: 1,
          scale: 1,
          label: `${what} distance ${aRef} to ${bRef}`,
        };
      }
      case "offset": {
        const seg = this.segmentId(aRef);
        const other = need(bRef, "a line (a) and a point or parallel line (b)");
        let p: string;
        try {
          p = this.pointId(other);
        } catch {
          const s2 = this.sketch.segments[this.segmentId(other)];
          p = s2.p1;
        }
        const signed = this.measure("point_line_distance", [p], [seg]);
        return {
          kind: "point_line_distance",
          points: [p],
          segments: [seg],
          sign: signed < 0 ? -1 : 1,
          scale: 1,
          label: `offset of ${other} from ${this.describeSegment(seg)}`,
        };
      }
      case "x":
        return { kind: "position_x", points: [this.pointId(aRef)], segments: [], sign: 1, scale: 1, label: `x of ${aRef}` };
      case "y":
        // Model Y is up; the canvas stores it down. The sign lets a positive
        // level mean "above the origin", as a draftsman reads it.
        return { kind: "position_y", points: [this.pointId(aRef)], segments: [], sign: -1, scale: 1, label: `level of ${aRef}` };
      case "angle": {
        const s1 = this.segmentId(aRef);
        const s2 = this.segmentId(need(bRef, "two lines (a, b)"));
        return {
          kind: "angle",
          points: [],
          segments: [s1, s2],
          sign: 1,
          scale: Math.PI / 180,
          label: `angle between ${this.describeSegment(s1)} and ${this.describeSegment(s2)}`,
        };
      }
      default:
        throw new ToolError(
          `Unknown dimension "${what}". Use length, horizontal, vertical, distance, offset, x, y, angle or radius.`
        );
    }
  }

  /** Changes a driving value and lets the drawing follow. */
  setValue(name: string, value: number): string {
    const p = this.sketch.parameters[name];
    if (!p) throw new ToolError(`There is no value called ${name}. Values: ${Object.keys(this.sketch.parameters).join(", ") || "none"}.`);
    if (p.role === "DERIVED") {
      const report = inversionOptions(this.sketch, name, value);
      if (report.refused) throw new ToolError(report.refused);
      throw new ToolError(
        `${name} is worked out from its formula. To make it ${fmt(value)}, change ${report.options
          .slice(0, 3)
          .map((o) => `${o.parameter} to ${fmt(o.to)}`)
          .join(", or ")}.`
      );
    }
    if (p.role === "MEASURED") throw new ToolError(`${name} only reports a measurement.`);
    const before = p.value;
    const commit = this.commitIntent({
      ...this.sketch,
      parameters: { ...this.sketch.parameters, [name]: { ...p, value } },
    });
    if (!commit.ok) {
      throw new ToolError(`${name} cannot be ${fmt(value)}: ${commit.rejection}`);
    }
    const derived = Object.values(this.sketch.parameters)
      .filter((q) => q.role === "DERIVED")
      .map((q) => `${q.name} = ${fmt(q.value)}`);
    return `${name} ${fmt(before)} -> ${fmt(value)}; the drawing re-solved.${derived.length ? ` Derived now: ${derived.join(", ")}.` : ""}${
      commit.held.length ? ` Held by rules: ${commit.held.join(", ")}.` : ""
    }`;
  }

  /**
   * `name = expression`.
   *
   * An existing driving value becomes derived only if the expression reproduces
   * what the drawing measures — the model's arithmetic is checked, not trusted.
   * A new name becomes a derived value that reports the result.
   */
  formula(name: string, expression: string, description?: string): string {
    const clean = name.replace(/[^A-Za-z0-9_]/g, "");
    const existing = this.sketch.parameters[clean];
    if (existing) {
      if (existing.role === "MEASURED") {
        throw new ToolError(`${clean} is a reference measurement; formulas can read it but not define it.`);
      }
      const check = verifyProposedFormula(this.sketch, clean, expression, { shapes: this.shapes, shapeNames: this.names() });
      if (!check.ok) throw new ToolError(`Formula refused: ${check.reason}`);
      const commit = this.commitIntent({
        ...this.sketch,
        parameters: {
          ...this.sketch.parameters,
          [clean]: {
            ...existing,
            role: "DERIVED",
            expr: expression,
            dependencies: check.dependencies,
            published: false,
            provenance: makeProvenance("completion-assistant", `The drafting agent tied ${clean} to ${expression}.`),
            description: description ?? existing.description,
          },
        },
      });
      if (!commit.ok) throw new ToolError(`Formula refused: ${commit.rejection}`);
      return `${clean} = ${expression} (${check.agreement}). It now follows ${check.dependencies.join(", ")}.`;
    }

    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(clean)) throw new ToolError(`"${name}" is not a usable name.`);
    const probe = { ...this.sketch.parameters };
    const deps = dependenciesOf(expression);
    const unknown = deps.filter((d) => !probe[d]);
    if (unknown.length) throw new ToolError(`The formula reads ${unknown.join(", ")}, which do not exist.`);
    const syntax = validateExpression(expression, clean, probe);
    if (!syntax.ok) throw new ToolError(syntax.message ?? "That expression is not valid.");
    probe[clean] = {
      name: clean,
      role: "DERIVED",
      type: "LENGTH",
      unit: "mm",
      value: 0,
      expr: expression,
      dependencies: deps,
      provenance: makeProvenance("completion-assistant", `The drafting agent defined ${clean} = ${expression}.`),
      boundConstraints: [],
      published: false,
      uiGroup: "Worked out",
      description: description ?? `${clean} = ${expression}`,
    };
    const evaluated = evaluateParameters(probe);
    const err = evaluated.errors.find((e) => e.parameter === clean);
    if (err) throw new ToolError(err.message);
    probe[clean] = { ...probe[clean], value: evaluated.values[clean] };
    const commit = this.commitIntent({ ...this.sketch, parameters: probe });
    if (!commit.ok) throw new ToolError(commit.rejection ?? "the drawing would not solve");
    return `${clean} = ${expression} = ${fmt(evaluated.values[clean])}. It is reported, and drives geometry only if you dimension something with it.`;
  }

  describeValue(name: string, patch: { description?: string; group?: string; min?: number; max?: number; publish?: boolean }): string {
    const p = this.sketch.parameters[name];
    if (!p) throw new ToolError(`There is no value called ${name}.`);
    if (patch.min !== undefined && patch.max !== undefined && patch.min > patch.max) {
      throw new ToolError("min is larger than max.");
    }
    const next: SketchParameter = {
      ...p,
      description: patch.description ?? p.description,
      uiGroup: patch.group ?? p.uiGroup,
      min: patch.min ?? p.min,
      max: patch.max ?? p.max,
      published: patch.publish === undefined ? p.published : patch.publish && p.role === "DRIVING",
    };
    this.sketch = { ...this.sketch, parameters: { ...this.sketch.parameters, [name]: next } };
    this.revision++;
    const shown =
      p.role === "DERIVED"
        ? "shown in Run Mode as a worked-out value (read-only; change its inputs instead)"
        : next.published
          ? "shown in Run Mode"
          : "hidden from Run Mode";
    return `${name}: ${shown}, group "${next.uiGroup ?? "Dimensions"}"${
      next.min !== undefined || next.max !== undefined ? `, range ${fmt(next.min ?? -Infinity)}..${fmt(next.max ?? Infinity)}` : ""
    }.`;
  }

  renameValue(from: string, to: string): string {
    const out = renameParameters(this.sketch, { [from]: to });
    if (out.applied.length === 0) throw new ToolError(`Could not rename ${from}.`);
    const commit = this.commitIntent(out.sketch);
    if (!commit.ok) throw new ToolError(commit.rejection ?? "rename failed");
    return `${from} is now ${out.applied[0].to}.`;
  }

  calculate(expression: string): number {
    const symbols: Record<string, number> = {};
    for (const p of Object.values(this.sketch.parameters)) symbols[p.name] = p.value;
    symbols.pi = Math.PI;
    symbols.PI = Math.PI;
    const res = evaluateFormula(expression, symbols);
    if (res.error) throw new ToolError(res.error);
    return res.value;
  }

  // -------------------------------------------------------------------------
  // Units and repeats
  // -------------------------------------------------------------------------

  makeUnit(name: string, ids: string[], rigid: boolean): string {
    const members = this.expandIds(ids);
    const { sketch, component } = createComponent(this.sketch, this.shapes, members, name);
    const next = rigid ? setComponentRigid(sketch, component.id, true) : sketch;
    const commit = this.commitIntent(next);
    if (!commit.ok) throw new ToolError(commit.rejection ?? "could not group");
    return component.id;
  }

  repeat(spec: {
    unit: string;
    count: number;
    direction: "right" | "left" | "up" | "down";
    mode: "gap" | "pitch";
    spacing?: number;
    countName?: string;
    spacingName?: string;
  }): string {
    const component = this.sketch.components.find((c) => c.name === spec.unit || c.id === spec.unit);
    if (!component) throw new ToolError(`There is no unit "${spec.unit}". Make one with unit first.`);
    const dir =
      spec.direction === "right" ? { x: 1, y: 0 } : spec.direction === "left" ? { x: -1, y: 0 } : spec.direction === "up" ? { x: 0, y: -1 } : { x: 0, y: 1 };
    const { sketch, rule } = createRepeat(this.sketch, {
      componentId: component.id,
      count: spec.count,
      pitch: spec.spacing ?? 0,
      gap: spec.mode === "gap" ? spec.spacing : undefined,
      spacingMode: spec.mode === "gap" ? "gap" : "driven",
      direction: dir,
      countParamName: spec.countName,
      spacingParamName: spec.spacingName,
    });
    const commit = this.commitIntent(sketch);
    if (!commit.ok) throw new ToolError(commit.rejection ?? "the repeat would not solve");
    return `${spec.unit} repeats ${spec.count} times ${spec.direction}; count is ${rule.countParam}, spacing is ${rule.spacingParam}.`;
  }

  // -------------------------------------------------------------------------
  // Seeing the drawing
  // -------------------------------------------------------------------------

  dof(): DofReport {
    return this.last?.dof ?? analyseDof(this.sketch, this.names(), this.policy);
  }

  /** Freedom that moves structure, not just construction lines. */
  structuralFreedom(): number {
    const dof = this.dof().dof;
    return dof === 0 ? 0 : structuralDof(this.sketch);
  }

  profiles(): Profile[] {
    const labels = this.profileLabels();
    return findProfiles(this.sketch, this.names()).map((p) => ({ ...p, label: labels.get(p.label) ?? p.label }));
  }

  /**
   * The kernel calls a multi-shape profile "Profile A" until it is made a unit.
   * A profile drawn as one polyline already has a name — its group — so reports
   * the model reads use that instead; "Profile B" meant nothing to it.
   */
  profileLabels(): Map<string, string> {
    const out = new Map<string, string>();
    for (const p of findProfiles(this.sketch, this.names())) {
      if (!/^Profile [A-Z]\d*$/.test(p.label)) continue;
      const groups = new Set(
        p.shapeIds.map((id) => {
          const shape = this.shapes.find((x) => x.id === id);
          return shape?.groupId ?? shape?.id ?? id;
        })
      );
      out.set(p.label, groups.size === 1 ? [...groups][0] : `${[...groups].slice(0, 3).join("+")}${groups.size > 3 ? "+…" : ""}`);
    }
    return out;
  }

  /** Replaces kernel profile letters with the model's own names in a sentence. */
  relabel(text: string): string {
    let out = text;
    for (const [from, to] of this.profileLabels()) {
      const compact = from.replace(/\s+/g, "");
      out = out.split(from).join(to).split(compact).join(to.replace(/[^A-Za-z0-9]/g, ""));
    }
    return out;
  }

  /** Where the open ends and near-misses are: disconnected geometry. */
  connectivity(): { openEnds: string[]; nearMisses: string[]; tJunctions: string[] } {
    const degree = new Map<string, number>();
    for (const seg of Object.values(this.sketch.segments)) {
      if (seg.construction || this.sketch.circles[`${seg.shapeId}:c`]) continue;
      degree.set(seg.p1, (degree.get(seg.p1) ?? 0) + 1);
      degree.set(seg.p2, (degree.get(seg.p2) ?? 0) + 1);
    }
    const ends = [...degree.entries()].filter(([, d]) => d === 1).map(([id]) => id);
    const nearMisses: string[] = [];
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const a = this.sketch.points[ends[i]];
        const b = this.sketch.points[ends[j]];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= 25) nearMisses.push(`${this.describePoint(a.id)} and ${this.describePoint(b.id)} are ${fmt(d)} mm apart but not joined`);
      }
    }
    const tJunctions: string[] = [];
    const covered = new Set(
      this.sketch.constraints.filter((c) => c.kind === "point_on_line" && c.state !== "suppressed").map((c) => `${c.points[0]}|${c.segments[0]}`)
    );
    for (const id of ends) {
      const p = this.sketch.points[id];
      for (const seg of Object.values(this.sketch.segments)) {
        if (seg.p1 === id || seg.p2 === id || this.sketch.circles[`${seg.shapeId}:c`]) continue;
        const a = this.sketch.points[seg.p1];
        const b = this.sketch.points[seg.p2];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L);
        if (t <= 0.001 || t >= 0.999) continue;
        const off = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
        if (off <= 1 && !covered.has(`${id}|${seg.id}`)) {
          tJunctions.push(`${this.describePoint(id)} ends on ${this.describeSegment(seg.id)} with no on_line rule holding it there`);
        }
      }
    }
    const openEnds = ends
      .filter((id) => !tJunctions.some((t) => t.startsWith(this.describePoint(id))))
      .map((id) => `${this.describePoint(id)} at ${fmtPt(this.modelPoint(id))}`);
    return { openEnds, nearMisses, tJunctions };
  }

  /** Lines within a couple of degrees of an axis that nothing holds to it. */
  nearlyAxisAligned(): string[] {
    const held = new Set(
      this.sketch.constraints
        .filter((c) => (c.kind === "horizontal" || c.kind === "vertical") && c.state !== "suppressed")
        .map((c) => c.segments[0])
    );
    const out: string[] = [];
    for (const seg of Object.values(this.sketch.segments)) {
      if (held.has(seg.id) || this.sketch.circles[`${seg.shapeId}:c`]) continue;
      const shape = this.shapes.find((s) => s.id === seg.shapeId);
      if (shape?.type === "rectangle") continue;
      const a = this.sketch.points[seg.p1];
      const b = this.sketch.points[seg.p2];
      const deg = (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
      const off = Math.min(deg, 90 - deg);
      if (off > 1e-6 && off < 3) {
        out.push(`${this.describeSegment(seg.id)} is ${off < 0.01 ? off.toExponential(1) : off.toFixed(2)}° off the axis`);
      }
    }
    return out;
  }

  /** Nesting for the summary: which closed profile sits inside which. */
  nesting(): Map<string, string> {
    const profiles = this.profiles().filter((p) => p.closed);
    const loops = new Map(profiles.map((p) => [p.id, profileLoop(this.sketch, p)] as const));
    const out = new Map<string, string>();
    for (const inner of profiles) {
      let best: { id: string; area: number } | null = null;
      for (const outer of profiles) {
        if (outer.id === inner.id) continue;
        const loop = loops.get(outer.id);
        if (!loop) continue;
        const inside = inner.pointIds.every((pid) => pointInLoop(loop, this.sketch.points[pid]));
        if (!inside) continue;
        const area = Math.abs(signedArea(loop));
        if (!best || area < best.area) best = { id: outer.label, area };
      }
      if (best) out.set(inner.label, best.id);
    }
    return out;
  }

  readiness(): ReadinessReport {
    return assessReadiness(this.sketch, this.shapes, { shapeNames: this.names() });
  }

  manifest(): TemplateManifest {
    return buildManifest(this.sketch, this.names());
  }

  completion() {
    return suggestCompletion(this.sketch, this.names(), this.policy);
  }

  applySuggestion(action: IntentAction, renames: Record<string, string>): CommitResult {
    const renamed: IntentAction = {
      ...action,
      id: uid(action.id),
      createsParameters: action.createsParameters.map((p) => ({ ...p, name: renames[p.name] ?? p.name })),
      createsConstraints: action.createsConstraints.map((c) => ({
        ...c,
        paramRef: c.paramRef ? renames[c.paramRef] ?? c.paramRef : undefined,
        label: Object.entries(renames).reduce((l, [from, to]) => l.split(from).join(to), c.label),
      })),
    };
    const next = applyAction(this.sketch, renamed);
    if (next === this.sketch) return { ok: false, rejection: "nothing changed: the rules already decide that", dropped: [], held: [] };
    return this.commitIntent(next);
  }

  publish(title: string, freedomNote?: string): void {
    this.title = title;
    this.sketch = {
      ...this.sketch,
      meta: {
        ...this.sketch.meta,
        name: title,
        author: "drafting-agent",
        freedomIsIntentional: Boolean(freedomNote) || this.sketch.meta.freedomIsIntentional,
        publishedAt: Date.now(),
        version: this.sketch.meta.version + 1,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Plane geometry helpers
// ---------------------------------------------------------------------------

export function memberIndex(id: string): number {
  const m = id.match(/_(\d+)$/);
  return m ? Number(m[1]) : 0;
}

export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function carrierIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/** Offsets a polyline to the left of travel by `d` (negative: right), mitred. */
export function offsetPolyline(pts: Pt[], d: number, closed: boolean): Pt[] {
  const n = pts.length;
  const edges: { a: Pt; b: Pt }[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / L) * d;
    const ny = ((b.x - a.x) / L) * d;
    edges.push({ a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } });
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? edges[(i - 1 + count) % count] : edges[i - 1];
    const next = closed ? edges[i % count] : edges[i];
    if (!prev) {
      out.push(next.a);
      continue;
    }
    if (!next) {
      out.push(prev.b);
      continue;
    }
    out.push(carrierIntersection(prev.a, prev.b, next.a, next.b) ?? next.a);
  }
  return out;
}

/** Applies a model-space point map to a canvas shape. */
function transformShape(s: Shape, f: (p: Pt) => Pt): Shape {
  const map = (x: number, y: number) => {
    const q = f({ x, y: up(y) });
    return { x: q.x, y: down(q.y) };
  };
  switch (s.type) {
    case "line":
    case "arrow": {
      const a = map(s.x1, s.y1);
      const b = map(s.x2, s.y2);
      return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "circle": {
      const c = map(s.cx, s.cy);
      return { ...s, cx: c.x, cy: c.y };
    }
    case "rectangle": {
      const corners = [
        map(s.x, s.y),
        map(s.x + s.width, s.y),
        map(s.x + s.width, s.y + s.height),
        map(s.x, s.y + s.height),
      ];
      const e1 = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
      const e3 = { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y };
      const cross = e1.x * e3.y - e1.y * e3.x;
      const width = Math.hypot(e1.x, e1.y);
      const height = Math.hypot(e3.x, e3.y);
      const cx = (corners[0].x + corners[2].x) / 2;
      const cy = (corners[0].y + corners[2].y) / 2;
      // A reflection turns the corner order round; rebuild the rectangle from its
      // centre and the direction of its (new) first edge.
      const rot = cross > 0 ? Math.atan2(e1.y, e1.x) : Math.atan2(-e1.y, -e1.x);
      const deg = (rot * 180) / Math.PI;
      const snapped = Math.abs(deg) < 1e-9 || Math.abs(Math.abs(deg) - 180) < 1e-9 ? 0 : deg;
      return { ...s, x: cx - width / 2, y: cy - height / 2, width, height, rotation: snapped };
    }
    default:
      return s;
  }
}
