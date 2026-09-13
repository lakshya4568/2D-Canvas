/**
 * Procedural Repeat Rules Engine (UPCE-MASTER-1.0 §86, §5.6, §43, §44, Gate G5 §76)
 *
 * Implements linear_array, polar_array, mirror, and path_array.
 * Invariant: Repeat count is a TOPOLOGICAL MUTATION (creating/deleting child instances
 * and wiring port attachments), NOT a continuous solver variable (§5.6, §44).
 *
 * Evaluates parameter overrides with index variable substitution (e.g. i).
 */

import { Point2D } from "../../geometry/topology/types";
import { TemplateDefinition } from "../schemaTypes";
import { evaluateFormula } from "../expression";
import { TemplateRegistry, templateRegistry } from "../templates/templateRegistry";

export interface ExpandedRepeatInstance {
  instanceId: string;
  templateId: string;
  index: number;
  parameterOverrides: Record<string, string>;
  attachedVia?: {
    parentInstanceId: string;
    parentPortId: string;
    ownPortId: string;
    offsetExpr?: {
      along?: string;
      normal?: string;
      rotate?: string;
      mate?: string;
    };
  };
  placement?: {
    origin: Point2D;
    angleDeg: number;
  };
}

export class RepeatExpander {
  /**
   * Evaluates a mathematical expression or numeric string against a parameter dictionary.
   */
  public static evaluateNumeric(
    expr: string | number | undefined,
    symbols: Record<string, number>,
    fallback: number = 0
  ): number {
    if (expr === undefined || expr === null) return fallback;
    if (typeof expr === "number") return expr;
    const trimmed = expr.trim();
    if (!trimmed) return fallback;

    const num = Number(trimmed);
    if (!isNaN(num)) return num;

    const res = evaluateFormula(trimmed, symbols);
    if (res.error || isNaN(res.value)) {
      return fallback;
    }
    return res.value;
  }

  /**
   * Expands a procedural repeat rule into concrete component instances.
   */
  public static expandRepeatRule(
    rule: NonNullable<TemplateDefinition["repeats"]>[number],
    parameters: Record<string, number>,
    pathPoints?: Point2D[],
    registry?: TemplateRegistry
  ): ExpandedRepeatInstance[] {
    const fallbackCount = rule.type === "mirror" ? 2 : 1;
    const rawCount = this.evaluateNumeric(rule.countParamRef, parameters, fallbackCount);
    const count = Math.max(1, Math.round(rawCount));
    const indexVar = rule.indexVariable || "i";
    const instances: ExpandedRepeatInstance[] = [];

    const buildOverrides = (i: number): Record<string, string> => {
      const currentSymbols = { ...parameters, [indexVar]: i };
      const overrides: Record<string, string> = {
        [indexVar]: String(i),
      };
      if (rule.parameterOverrides) {
        for (const [key, expr] of Object.entries(rule.parameterOverrides)) {
          overrides[key] = String(this.evaluateNumeric(expr, currentSymbols, 0));
        }
      }
      return overrides;
    };

    switch (rule.type) {
      case "linear_array": {
        const dx = rule.direction[0] ?? 1;
        const dy = rule.direction[1] ?? 0;
        const mag = Math.hypot(dx, dy) || 1;
        const ux = dx / mag;
        const uy = dy / mag;

        // Obtain anchor port angle from source template if available
        let portAngleRad = 0;
        const sourceTmpl = (registry || templateRegistry).getTemplate(rule.sourceComponent);
        if (sourceTmpl) {
          const anchorPortDef = sourceTmpl.ports?.find((p) => p.id === rule.anchorPortId);
          if (anchorPortDef) {
            const portAngleDeg = this.evaluateNumeric(anchorPortDef.localFrame.angle, parameters, 0);
            portAngleRad = (portAngleDeg * Math.PI) / 180;
          }
        }

        for (let i = 0; i < count; i++) {
          const instanceId = `${rule.id}_${i}`;
          const currentSymbols = { ...parameters, [indexVar]: i };
          const spacing = this.evaluateNumeric(rule.spacingExpr, currentSymbols, 0);

          const totalDist = i * spacing;
          const origin: Point2D = {
            x: totalDist * ux,
            y: totalDist * uy,
          };

          const instance: ExpandedRepeatInstance = {
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin,
              angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
            },
          };

          // Wire port attachments: if i > 0, wire to previous instance (i - 1)
          if (i > 0) {
            const stepX = spacing * ux;
            const stepY = spacing * uy;
            const along = stepX * Math.cos(portAngleRad) + stepY * Math.sin(portAngleRad);
            const normal = -stepX * Math.sin(portAngleRad) + stepY * Math.cos(portAngleRad);

            instance.attachedVia = {
              parentInstanceId: `${rule.id}_${i - 1}`,
              parentPortId: rule.anchorPortId,
              ownPortId: rule.anchorPortId,
              offsetExpr: {
                along: String(along),
                normal: String(normal),
                rotate: "0",
                mate: "0",
              },
            };
          }

          instances.push(instance);
        }
        break;
      }

      case "polar_array": {
        const cx = rule.direction[0] ?? 0;
        const cy = rule.direction[1] ?? 0;

        for (let i = 0; i < count; i++) {
          const instanceId = `${rule.id}_${i}`;
          const currentSymbols = { ...parameters, [indexVar]: i };
          const stepAngleDeg = this.evaluateNumeric(rule.spacingExpr, currentSymbols, count > 1 ? 360 / count : 0);
          const currentAngleDeg = i * stepAngleDeg;

          instances.push({
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin: { x: cx, y: cy },
              angleDeg: currentAngleDeg,
            },
            attachedVia: i > 0 ? {
              parentInstanceId: `${rule.id}_0`,
              parentPortId: rule.anchorPortId,
              ownPortId: rule.anchorPortId,
              offsetExpr: {
                along: "0",
                normal: "0",
                rotate: String(currentAngleDeg),
                mate: "0",
              },
            } : undefined,
          });
        }
        break;
      }

      case "mirror": {
        // Mirror produces 2 instances: index 0 (original) and index 1 (mirrored)
        const mirrorCount = Math.min(count, 2);
        for (let i = 0; i < mirrorCount; i++) {
          const instanceId = `${rule.id}_${i}`;
          instances.push({
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin: { x: 0, y: 0 },
              angleDeg: i === 1 ? 180 : 0,
            },
            attachedVia: i === 1 ? {
              parentInstanceId: `${rule.id}_0`,
              parentPortId: rule.anchorPortId,
              ownPortId: rule.anchorPortId,
              offsetExpr: {
                along: "0",
                normal: "0",
                rotate: "180",
                mate: "180",
              },
            } : undefined,
          });
        }
        break;
      }

      case "path_array": {
        const pts = pathPoints && pathPoints.length >= 2 ? pathPoints : [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
        ];

        // Compute cumulative arc length along path
        const cumulativeLengths: number[] = [0];
        let totalPathLength = 0;
        for (let j = 0; j < pts.length - 1; j++) {
          const segLen = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
          totalPathLength += segLen;
          cumulativeLengths.push(totalPathLength);
        }

        for (let i = 0; i < count; i++) {
          const instanceId = `${rule.id}_${i}`;
          const currentSymbols = { ...parameters, [indexVar]: i };
          const defaultSpacing = count > 1 ? totalPathLength / (count - 1) : 0;
          const spacing = this.evaluateNumeric(rule.spacingExpr, currentSymbols, defaultSpacing);
          const targetDist = Math.min(i * spacing, totalPathLength);

          // Locate segment along path
          let segIdx = 0;
          for (let j = 0; j < cumulativeLengths.length - 1; j++) {
            if (targetDist >= cumulativeLengths[j] && targetDist <= cumulativeLengths[j + 1]) {
              segIdx = j;
              break;
            }
          }

          const segStartDist = cumulativeLengths[segIdx];
          const segLen = cumulativeLengths[segIdx + 1] - segStartDist;
          const t = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

          const pStart = pts[segIdx];
          const pEnd = pts[segIdx + 1];
          const ptOnPath: Point2D = {
            x: pStart.x + t * (pEnd.x - pStart.x),
            y: pStart.y + t * (pEnd.y - pStart.y),
          };

          const tangentAngleRad = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
          const tangentAngleDeg = (tangentAngleRad * 180) / Math.PI;

          instances.push({
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin: ptOnPath,
              angleDeg: tangentAngleDeg,
            },
          });
        }
        break;
      }
    }

    return instances;
  }
}

// ---------------------------------------------------------------------------
// Procedural multi-cell expansion (UPCE-ADDENDUM-2.0 §3)
// ---------------------------------------------------------------------------

/**
 * The pitch engine.
 *
 * Multi-cell boxes distorted because nothing in the model ever said how far one
 * cell sits from the next. Each void was dimensioned against the outer envelope
 * instead, so adding a cell changed the envelope, and every void then re-solved
 * against the new envelope and drifted — webs came out irregular and haunches
 * folded. The missing quantity is the PITCH, and once it exists the arithmetic
 * is forced rather than fitted:
 *
 *     P_cell  = S_clear + t_mid
 *     W_total = N * S_clear + (N - 1) * t_mid + 2 * t_ext
 *
 * If the author never says what the intermediate web should be, it takes the
 * exterior wall thickness. That is the structural default for a monolithic box
 * and, more to the point, it is a stated default rather than an accident of
 * whatever the envelope happened to be.
 *
 * A count is topology, never a solver variable (UPCE-MASTER-1.0 §5.6, §44).
 * Everything below runs procedurally and hands finished geometry to the solver.
 */

import {
  HaunchCorner,
  detectOrientation,
  measureHaunch,
  HaunchMeasurement,
} from "./haunchPreserver";

export interface RepeatSpecification {
  sourceCellId?: string;
  count: number;
  clearSpan: number;
  /**
   * Per-cell clear spans, when the bays are not all the same.
   *
   * Real multi-bay structures are routinely unequal — a navigation bay wider
   * than its neighbours, an end bay trimmed to fit the abutment. Length must
   * match `count`; anything shorter falls back to `clearSpan` for the rest, so
   * the uniform case stays a single number.
   */
  clearSpans?: number[];
  clearHeight: number;
  wallThickness: number;
  slabThickness: number;
  haunchSize: number;
  /** Intermediate web. Defaults to the exterior wall thickness. */
  midWallThickness?: number;
  /** Explicit override; otherwise S_clear + t_mid. */
  cellPitch?: number;
  /** Where cell 0's inner bottom-left corner sits. */
  origin?: Point2D;
  /** Array direction. Normalised internally; defaults to +x. */
  direction?: Point2D;
}

export interface CellInstance {
  cellId: string;
  index: number;
  /** Inner void boundary, counter-clockwise, 8 vertices with the haunches cut. */
  loop: Point2D[];
  /** State-vector point indices of `loop`, parallel array. */
  pointIndices: number[];
  haunches: HaunchCorner[];
}

export interface WebSegment {
  id: string;
  leftCellIndex: number;
  rightCellIndex: number;
  nominalThickness: number;
  /** x (or along-axis) coordinate of each face. */
  leftFace: number;
  rightFace: number;
}

export interface MultiCellExpansion {
  cells: CellInstance[];
  intermediateWebs: WebSegment[];
  /** Outer envelope loop, counter-clockwise. */
  outerEnvelope: Point2D[];
  outerPointIndices: number[];
  /** Flat solver state: point i occupies X[2i], X[2i+1]. */
  state: number[];
  pitch: number;
  totalWidth: number;
  totalHeight: number;

  getIntermediateWebThickness(index: number): number;
  getExternalWallThickness(side: "left" | "right"): number;
  getSlabThickness(side: "top" | "bottom"): number;
  getAllHaunches(): HaunchMeasurement[];
  calculateTotalWidth(): number;
  systemModel: { evaluateResiduals(X: number[]): number[]; evaluateJacobian(X: number[]): number[][] };
}

/**
 * One cell's inner void as an eight-vertex loop with the corners cut back.
 *
 * Counter-clockwise from the bottom-left haunch's lower end. The haunch faces
 * are the odd-to-even hops, and because each is cut by the same `haunch` on both
 * legs they come out at 45 degrees without anything having to assert an angle.
 */
function createHaunchedCellLoop(originX: number, originY: number, span: number, height: number, haunch: number): Point2D[] {
  const x0 = originX;
  const y0 = originY;
  const x1 = originX + span;
  const y1 = originY + height;
  return [
    { x: x0 + haunch, y: y0 },
    { x: x1 - haunch, y: y0 },
    { x: x1, y: y0 + haunch },
    { x: x1, y: y1 - haunch },
    { x: x1 - haunch, y: y1 },
    { x: x0 + haunch, y: y1 },
    { x: x0, y: y1 - haunch },
    { x: x0, y: y0 + haunch },
  ];
}

/**
 * Expands one authored cell into N, with the webs and envelope that implies.
 *
 * Nothing here knows it is looking at a culvert. It is given a clear span, a
 * height, two thicknesses and a corner cut, and it lays out that unit N times —
 * the same code arrays a precast box, a building bay, or a shape someone drew
 * this morning.
 */
export function expandMultiCell(spec: RepeatSpecification): MultiCellExpansion {
  const count = Math.max(1, Math.round(spec.count));
  const tExt = spec.wallThickness;
  const tMid = spec.midWallThickness ?? tExt;
  const haunch = spec.haunchSize;
  const origin = spec.origin ?? { x: 0, y: 0 };

  const spans: number[] = [];
  for (let i = 0; i < count; i++) spans.push(spec.clearSpans?.[i] ?? spec.clearSpan);

  // Pitch is uniform only when the bays are. With unequal bays each gap has its
  // own pitch, and the reported one is the first — it is what a uniform array
  // means and what an author reads off a repeat rule.
  const pitch = spec.cellPitch ?? spans[0] + tMid;
  const originOf = (i: number): number => {
    let x = 0;
    for (let j = 0; j < i; j++) x += (spec.cellPitch ?? spans[j] + tMid);
    return x;
  };

  // Inner voids start one wall in and one slab up from the envelope corner.
  const innerX0 = origin.x + tExt;
  const innerY0 = origin.y + spec.slabThickness;

  const state: number[] = [];
  const push = (p: Point2D): number => {
    const index = state.length / 2;
    state.push(p.x, p.y);
    return index;
  };

  const cells: CellInstance[] = [];
  for (let i = 0; i < count; i++) {
    const cellId = `cell[${i}]`;
    const loop = createHaunchedCellLoop(innerX0 + originOf(i), innerY0, spans[i], spec.clearHeight, haunch);
    const pointIndices = loop.map(push);

    // Four corners, each a (wall vertex, virtual datum, slab vertex) triple. The
    // datum is where the two faces would have met had the corner not been cut,
    // so it is a real position in the state vector that the legs measure from.
    const cellX = innerX0 + originOf(i);
    const corners: Array<[number, number, Point2D]> = [
      [7, 0, { x: cellX, y: innerY0 }],
      [1, 2, { x: cellX + spans[i], y: innerY0 }],
      [3, 4, { x: cellX + spans[i], y: innerY0 + spec.clearHeight }],
      [5, 6, { x: cellX, y: innerY0 + spec.clearHeight }],
    ];

    const haunches: HaunchCorner[] = corners.map(([wallSlot, slabSlot, datum]) => {
      const datumIndex = push(datum);
      const wall = pointIndices[wallSlot];
      const slab = pointIndices[slabSlot];
      return {
        wall,
        corner: datumIndex,
        slab,
        legWall: haunch,
        legSlab: haunch,
        orientation: detectOrientation(state, wall, datumIndex, slab),
      };
    });

    cells.push({ cellId, index: i, loop, pointIndices, haunches });
  }

  const intermediateWebs: WebSegment[] = [];
  for (let i = 0; i < count - 1; i++) {
    const leftFace = innerX0 + originOf(i) + spans[i];
    const rightFace = innerX0 + originOf(i + 1);
    intermediateWebs.push({
      id: `web[${i}_${i + 1}]`,
      leftCellIndex: i,
      rightCellIndex: i + 1,
      nominalThickness: rightFace - leftFace,
      leftFace,
      rightFace,
    });
  }

  const totalWidth = spans.reduce((a, b) => a + b, 0) + (count - 1) * tMid + 2 * tExt;
  const totalHeight = spec.clearHeight + 2 * spec.slabThickness;

  const outerEnvelope: Point2D[] = [
    { x: origin.x, y: origin.y },
    { x: origin.x + totalWidth, y: origin.y },
    { x: origin.x + totalWidth, y: origin.y + totalHeight },
    { x: origin.x, y: origin.y + totalHeight },
  ];
  const outerPointIndices = outerEnvelope.map(push);

  const systemModel = buildMultiCellSystemModel(cells, outerPointIndices, spec, spans, tExt, tMid, totalWidth, totalHeight, origin);

  return {
    cells,
    intermediateWebs,
    outerEnvelope,
    outerPointIndices,
    state,
    pitch,
    totalWidth,
    totalHeight,

    getIntermediateWebThickness(index: number): number {
      const web = intermediateWebs[index];
      if (!web) return NaN;
      const right = cells[web.rightCellIndex];
      const left = cells[web.leftCellIndex];
      // Measured off the solved geometry, not read back from the spec: the test
      // is meant to catch the solver moving something, and a number echoed from
      // the input could never do that.
      const leftFaceX = state[2 * left.pointIndices[2]];
      const rightFaceX = state[2 * right.pointIndices[7]];
      return rightFaceX - leftFaceX;
    },

    getExternalWallThickness(side: "left" | "right"): number {
      if (side === "left") {
        const inner = state[2 * cells[0].pointIndices[7]];
        return inner - state[2 * outerPointIndices[0]];
      }
      const inner = state[2 * cells[cells.length - 1].pointIndices[2]];
      return state[2 * outerPointIndices[1]] - inner;
    },

    getSlabThickness(side: "top" | "bottom"): number {
      if (side === "bottom") {
        return state[2 * cells[0].pointIndices[0] + 1] - state[2 * outerPointIndices[0] + 1];
      }
      return state[2 * outerPointIndices[3] + 1] - state[2 * cells[0].pointIndices[5] + 1];
    },

    getAllHaunches(): HaunchMeasurement[] {
      return cells.flatMap((c) => c.haunches.map((h) => measureHaunch(state, h)));
    },

    calculateTotalWidth(): number {
      return state[2 * outerPointIndices[1]] - state[2 * outerPointIndices[0]];
    },

    systemModel,
  };
}

/**
 * The constraint system that holds an expanded array together.
 *
 * Every row is a statement about a named engineering quantity — a leg, a web, a
 * wall, a slab — so the invariant report afterwards reads as a list of things
 * that are or are not true, rather than a residual norm nobody can act on.
 */
function buildMultiCellSystemModel(
  cells: CellInstance[],
  outerPointIndices: number[],
  spec: RepeatSpecification,
  spans: number[],
  tExt: number,
  tMid: number,
  totalWidth: number,
  totalHeight: number,
  origin: Point2D
): { evaluateResiduals(X: number[]): number[]; evaluateJacobian(X: number[]): number[][] } {
  interface Row {
    residual(X: number[]): number;
    grad(X: number[], row: Float64Array): void;
  }

  const rows: Row[] = [];

  const dx = (a: number, b: number, target: number): Row => ({
    residual: (X) => X[2 * b] - X[2 * a] - target,
    grad: (_X, row) => {
      row[2 * b] += 1;
      row[2 * a] -= 1;
    },
  });
  const dy = (a: number, b: number, target: number): Row => ({
    residual: (X) => X[2 * b + 1] - X[2 * a + 1] - target,
    grad: (_X, row) => {
      row[2 * b + 1] += 1;
      row[2 * a + 1] -= 1;
    },
  });
  const pinX = (i: number, value: number): Row => ({
    residual: (X) => X[2 * i] - value,
    grad: (_X, row) => {
      row[2 * i] += 1;
    },
  });
  const pinY = (i: number, value: number): Row => ({
    residual: (X) => X[2 * i + 1] - value,
    grad: (_X, row) => {
      row[2 * i + 1] += 1;
    },
  });

  // The envelope is a rectangle anchored at its own corner: two pins remove the
  // rigid-body motions (§18) and the rest is shape.
  const [bl, br, tr, tl] = outerPointIndices;
  rows.push(pinX(bl, origin.x), pinY(bl, origin.y));
  rows.push(dx(bl, br, totalWidth), dy(bl, br, 0));
  rows.push(dx(bl, tl, 0), dy(bl, tl, totalHeight));
  rows.push(dx(br, tr, 0), dy(br, tr, totalHeight));

  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c];
    const P = cell.pointIndices;

    // Each void is a haunched rectangle: the four faces stay straight, the
    // corners stay cut by the haunch on both legs. Stated as offsets between
    // this cell's own points, so a cell holds its shape whatever happens
    // outside it.
    rows.push(dy(P[0], P[1], 0)); // bottom face level
    rows.push(dy(P[4], P[5], 0)); // top face level
    rows.push(dx(P[2], P[3], 0)); // right face plumb
    rows.push(dx(P[6], P[7], 0)); // left face plumb

    rows.push(dx(P[0], P[1], spans[c] - 2 * spec.haunchSize));
    rows.push(dy(P[7], P[6], spec.clearHeight - 2 * spec.haunchSize));

    // Corner cuts: equal legs on both sides, which is what makes them 45 deg.
    rows.push(dx(P[7], P[0], spec.haunchSize), dy(P[7], P[0], -spec.haunchSize));
    rows.push(dx(P[1], P[2], spec.haunchSize), dy(P[1], P[2], spec.haunchSize));
    rows.push(dx(P[4], P[3], spec.haunchSize), dy(P[3], P[4], spec.haunchSize));
    rows.push(dx(P[6], P[5], spec.haunchSize), dy(P[5], P[6], -spec.haunchSize));

    // The virtual datums sit at the un-cut corner, one per haunch.
    const datums = cell.haunches.map((h) => h.corner);
    rows.push(dx(P[7], datums[0], 0), dy(P[0], datums[0], 0));
    rows.push(dx(P[2], datums[1], 0), dy(P[1], datums[1], 0));
    rows.push(dx(P[3], datums[2], 0), dy(P[4], datums[2], 0));
    rows.push(dx(P[6], datums[3], 0), dy(P[5], datums[3], 0));

    // Slabs tie every cell to the envelope, so raising the slab raises them all.
    rows.push(dy(bl, P[0], spec.slabThickness));
    rows.push(dy(P[5], tl, spec.slabThickness));

    if (c === 0) {
      rows.push(dx(bl, P[7], tExt)); // left external wall
    } else {
      // The web: this cell's left face sits t_mid from the previous cell's
      // right face. This is the row that was missing, and its absence is why
      // intermediate webs used to come out irregular.
      rows.push(dx(cells[c - 1].pointIndices[2], P[7], tMid));
    }
    if (c === cells.length - 1) {
      rows.push(dx(P[2], br, tExt)); // right external wall
    }
  }

  return {
    evaluateResiduals(X: number[]): number[] {
      return rows.map((r) => r.residual(X));
    },
    evaluateJacobian(X: number[]): number[][] {
      return rows.map((r) => {
        const row = new Float64Array(X.length);
        r.grad(X, row);
        return Array.from(row);
      });
    },
  };
}
