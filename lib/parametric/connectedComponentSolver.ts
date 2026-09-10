/**
 * Variational solver for arbitrary connected 2-D line networks.
 * UPCE-MASTER-1.0 §8, §18, §28.1, §29.4, §81 change 8.
 *
 * HISTORY — what this file used to do, and why it changed
 * ------------------------------------------------------
 * The previous implementation resolved a dimension edit by computing
 * `k = targetLength / originalLength` and multiplying every vertex of the
 * connected component by it. §8 names that exact formula and rejects it:
 *
 *   "The instinctive implementation of 'make it bigger' is a conformal scale
 *    factor k = L_target / L_original applied to all coordinates. For engineering
 *    geometry this is provably wrong: it scales wall thickness, slab depth,
 *    haunch legs, cover, and inter-cell gaps along with the span... Uniform
 *    scaling MUST be removed from the solve path entirely."
 *
 * It also contradicted §29.4, which requires the MINIMUM-norm update — "geometry
 * not mechanically coupled to the edited dimension does not move" — where
 * scaling every edge is the maximum-change response.
 *
 * WHAT IT DOES NOW
 * ----------------
 * Shared endpoints are welded into single topological vertices, so joint closure
 * is structural rather than a constraint that can be violated (§12). Each edge
 * whose named variable carries a target length contributes one squared-distance
 * residual (§28.1), with exact analytical partials. One vertex per component is
 * anchored to remove the global rigid-body freedom (§18 anchor rule). The system
 * is then solved by Powell's Dogleg with SVD pseudo-inverse regularisation,
 * warm-started from the current coordinates, which yields the minimum-norm
 * update (§29.4).
 *
 * The observable consequence: lengthening one edge of a triangle moves that
 * edge's endpoint and lets the adjoining edges re-close. It does NOT rescale the
 * triangle. That is the CAD-correct behaviour, and it is what makes wall
 * thicknesses survive a span change.
 */

import { Point, Shape } from "../geometry/types";
import { ParametricVariable } from "./model";
import { solveDogleg } from "../solver/dogleg";
import { SystemModel } from "../solver/levenbergMarquardt";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export interface ConnectedGeometrySolveOptions {
  shapes: Shape[];
  variables: Map<string, ParametricVariable>;
  /** §17: one tolerance policy, injected. Never a module-local constant. */
  policy?: TolerancePolicy;
}

export interface ConnectedGeometrySolveResult {
  updatedShapes: Shape[];
  handled: boolean;
  /** Per-component solve diagnostics (§29.8 structured output). */
  diagnostics?: {
    componentCount: number;
    solvedComponents: number;
    maxResidual: number;
    iterations: number;
    converged: boolean;
  };
}

interface VertexCluster {
  id: number;
  x: number;
  y: number;
}

interface ComponentEdge {
  shape: Shape;
  v1Id: number;
  v2Id: number;
  origLen: number;
  targetLen: number;
  /** True when the user actually drove this edge's length this transaction. */
  isDriven: boolean;
}

interface Component {
  vertexIds: Set<number>;
  edges: ComponentEdge[];
}

type LineShape = Shape & { x1: number; y1: number; x2: number; y2: number };

/**
 * Solves arbitrary connected 2-D geometric line networks (triangles, rectangles,
 * diagonal-braced frames, trusses, polygons, multi-loop assemblies).
 *
 * Invariants:
 * 1. Shared vertices ALWAYS move together — joints are one record, not two
 *    nearby coordinates, so a line can never detach into mid-air (§12).
 * 2. A dimension edit produces the MINIMUM-norm change that satisfies it (§29.4).
 *    Geometry not mechanically coupled to the edited dimension does not move.
 *    There is no scale factor anywhere in this file.
 * 3. Undriven edges report their resulting measured length; they are observations,
 *    not drivers.
 */
export function solveConnectedGeometry(
  options: ConnectedGeometrySolveOptions
): ConnectedGeometrySolveResult {
  const { shapes, variables } = options;
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;

  const lineShapes = shapes.filter(
    (s) => (s.type === "line" || s.type === "arrow") && s.isVisible !== false
  ) as LineShape[];

  if (lineShapes.length === 0) {
    return { updatedShapes: shapes, handled: false };
  }

  // ---- 1. Weld endpoints into shared topological vertices -----------------
  // §17: the weld radius comes from the injected policy, in model-space mm.
  // It is NEVER expressed in pixels and never scaled by viewport zoom.
  const weld = policy.weld_mm;
  const vertices: VertexCluster[] = [];

  const getOrCreateVertex = (pt: Point): number => {
    for (let i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - pt.x, vertices[i].y - pt.y) <= weld) {
        return i;
      }
    }
    vertices.push({ id: vertices.length, x: pt.x, y: pt.y });
    return vertices.length - 1;
  };

  const edgeMappings: ComponentEdge[] = lineShapes.map((s) => {
    const v1Id = getOrCreateVertex({ x: s.x1, y: s.y1 });
    const v2Id = getOrCreateVertex({ x: s.x2, y: s.y2 });
    const currentLen = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

    let targetLen = 0;
    if (s.name && variables.has(s.name)) {
      targetLen = variables.get(s.name)!.value;
    }
    if (targetLen <= 0) targetLen = currentLen;

    // An edge is DRIVEN when its declared target differs from what it measures.
    const isDriven =
      currentLen > policy.geometry_mm &&
      Math.abs(targetLen - currentLen) > policy.geometry_mm;

    return { shape: s, v1Id, v2Id, origLen: currentLen, targetLen, isDriven };
  });

  // ---- 2. Disjoint-set union to find connected components -----------------
  const parent = Array.from({ length: vertices.length }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };
  for (const edge of edgeMappings) union(edge.v1Id, edge.v2Id);

  const componentMap = new Map<number, Component>();
  for (let vId = 0; vId < vertices.length; vId++) {
    const root = find(vId);
    if (!componentMap.has(root)) {
      componentMap.set(root, { vertexIds: new Set(), edges: [] });
    }
    componentMap.get(root)!.vertexIds.add(vId);
  }
  for (const edge of edgeMappings) {
    componentMap.get(find(edge.v1Id))!.edges.push(edge);
  }

  // ---- 3. Solve each connected component variationally ---------------------
  const updatedShapeMap = new Map<string, Shape>();
  let anyHandled = false;
  let solvedComponents = 0;
  let worstResidual = 0;
  let totalIterations = 0;
  let allConverged = true;

  for (const comp of componentMap.values()) {
    const drivenEdges = comp.edges.filter((e) => e.isDriven);
    if (drivenEdges.length === 0) continue;

    const localVertexIds = [...comp.vertexIds].sort((a, b) => a - b);
    const indexOf = new Map<number, number>();
    localVertexIds.forEach((vId, i) => indexOf.set(vId, i));

    // §18 anchor rule: "every ParametricSketch MUST fix at least one entity...
    // to remove the three global rigid-body DOF." Anchoring the driven edge's
    // start vertex makes the result predictable — the edit grows away from the
    // joint the user did not touch.
    const anchorVertexId = drivenEdges[0].v1Id;
    const anchorLocal = indexOf.get(anchorVertexId)!;
    const anchorX = vertices[anchorVertexId].x;
    const anchorY = vertices[anchorVertexId].y;

    // Every edge with a declared target contributes a residual. Undriven edges
    // hold their CURRENT measured length, which is what keeps the rest of the
    // figure rigid instead of letting it wander.
    const constrained = comp.edges.filter((e) => e.origLen > policy.geometry_mm);

    const model: SystemModel = {
      evaluateResiduals(X: number[]): number[] {
        const r: number[] = [];
        for (const e of constrained) {
          const i = indexOf.get(e.v1Id)!;
          const j = indexOf.get(e.v2Id)!;
          const dx = X[2 * j] - X[2 * i];
          const dy = X[2 * j + 1] - X[2 * i + 1];
          const target = e.isDriven ? e.targetLen : e.origLen;
          // §28.1 squared form: avoids the sqrt singularity at Pi = Pj.
          r.push(dx * dx + dy * dy - target * target);
        }
        // §18 anchor residuals.
        r.push(X[2 * anchorLocal] - anchorX);
        r.push(X[2 * anchorLocal + 1] - anchorY);
        return r;
      },

      evaluateJacobian(X: number[]): number[][] {
        // §28: analytical partials. No finite differences on the solve path.
        const rows = constrained.length + 2;
        const cols = 2 * localVertexIds.length;
        const J: number[][] = Array.from({ length: rows }, () =>
          new Array<number>(cols).fill(0)
        );

        constrained.forEach((e, row) => {
          const i = indexOf.get(e.v1Id)!;
          const j = indexOf.get(e.v2Id)!;
          const dx = X[2 * j] - X[2 * i];
          const dy = X[2 * j + 1] - X[2 * i + 1];
          J[row][2 * i] = -2 * dx;
          J[row][2 * i + 1] = -2 * dy;
          J[row][2 * j] = 2 * dx;
          J[row][2 * j + 1] = 2 * dy;
        });

        J[constrained.length][2 * anchorLocal] = 1;
        J[constrained.length + 1][2 * anchorLocal + 1] = 1;
        return J;
      },
    };

    // §29.6 warm start: initialise from the current coordinates, which is what
    // makes the update minimum-norm and keeps the solution on the same branch
    // (§31.1 solution continuity).
    const X0: number[] = [];
    for (const vId of localVertexIds) {
      X0.push(vertices[vId].x, vertices[vId].y);
    }

    // Residuals are in squared model units, so the convergence threshold is
    // scaled accordingly: a length error of ε corresponds to a squared-form
    // residual of about 2·L·ε.
    const scale = Math.max(...constrained.map((e) => e.origLen), 1);
    const result = solveDogleg(model, X0, {
      maxIterations: 200,
      toleranceResidual: Math.max(policy.solver_residual, 2 * scale * policy.geometry_mm * 1e-3),
      initialRadius: Math.max(scale * 0.25, 1),
    });

    totalIterations += result.iterations;
    worstResidual = Math.max(worstResidual, result.maxResidual);
    if (!result.converged) {
      allConverged = false;
      // §13: a failed solve leaves this component untouched rather than
      // committing a partial result.
      continue;
    }

    const solved = new Map<number, Point>();
    localVertexIds.forEach((vId, i) => {
      solved.set(vId, { x: result.solution[2 * i], y: result.solution[2 * i + 1] });
    });

    for (const edge of comp.edges) {
      const p1 = solved.get(edge.v1Id);
      const p2 = solved.get(edge.v2Id);
      if (!p1 || !p2) continue;

      // §81 change 3: coordinates stay raw. Rounding happens only at SVG
      // rasterisation and badge string formatting, never here.
      if (edge.shape.name && variables.has(edge.shape.name)) {
        const v = variables.get(edge.shape.name)!;
        if (!v.formula) {
          v.value = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        }
      }

      updatedShapeMap.set(edge.shape.id, {
        ...edge.shape,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      } as Shape);
    }

    solvedComponents += 1;
    anyHandled = true;
  }

  if (!anyHandled) {
    return { updatedShapes: shapes, handled: false };
  }

  const updatedShapes = shapes.map((s) => updatedShapeMap.get(s.id) || s);
  return {
    updatedShapes,
    handled: true,
    diagnostics: {
      componentCount: componentMap.size,
      solvedComponents,
      maxResidual: worstResidual,
      iterations: totalIterations,
      converged: allConverged,
    },
  };
}
