/**
 * The four acceptance gates of UPCE-ADDENDUM-2.0 §8.
 *
 * Each one is a scenario from the notebook pages, written as the thing that has
 * to be TRUE afterwards rather than as a call that has to return. Where the
 * expander produces geometry that is already consistent, the test perturbs it
 * first and makes the solver put it back — a gate that only checks the
 * constructor's arithmetic would pass just as happily with no solver at all.
 */

import { describe, it, expect } from "vitest";
import { expandMultiCell } from "../../lib/parametric/component/repeatExpander";
import {
  planHomotopy,
  measureHaunch,
  haunchesIntact,
  evaluateChiralityBarrier,
  HOMOTOPY_MAX_STEP_MM,
} from "../../lib/parametric/component/haunchPreserver";
import { solveLevenbergMarquardt } from "../../lib/solver/levenbergMarquardt";
import {
  RigidCondensation,
  createRigidComponent,
  condenseSystemModel,
} from "../../lib/geometry/lcs/componentFrame";
import {
  evaluateCentroidDistanceConstraint,
  measureCentroidDistance,
  centroidOf,
} from "../../lib/parametric/constraints/centroidConstraint";
import { evaluateCentroid } from "../../lib/geometry/predicates/centroidPredicates";
import {
  evaluateRelativeOffsetX,
  evaluateDirectedNormalOffset,
  measureNormalOffset,
} from "../../lib/parametric/constraints/relativeLineConstraint";
import {
  createBoxCellRegion,
  executeTopologicalFusion,
} from "../../lib/topology/booleanFusion";
import { takeOffFromFusion } from "../../lib/topology/quantities";
import { buildAddendumSystemModel, ownsConstraint } from "../../lib/parametric/solver/systemModel";

/** The engine's own working accuracy, not a tighter invention. */
const MM = 3; // toBeCloseTo digits => 5e-4 mm

/** Shakes the geometry so the solver has something real to do. */
function perturb(state: number[], amplitude: number): number[] {
  // Deterministic, so a failure is reproducible rather than a flaky rerun.
  let seed = 1337;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  return state.map((v) => v + next() * amplitude);
}

describe("Gate 1 — multi-cell pitch and haunch preservation (notebook pages 1 & 2)", () => {
  const spec = {
    count: 3,
    clearSpan: 2000,
    clearHeight: 1500,
    wallThickness: 300,
    slabThickness: 250,
    haunchSize: 150,
  };

  it("expands one cell into three with the pitch the structure implies", () => {
    const one = expandMultiCell({ ...spec, count: 1 });
    expect(one.cells).toHaveLength(1);
    expect(one.totalWidth).toBeCloseTo(2000 + 2 * 300, MM);

    const three = expandMultiCell(spec);
    expect(three.cells).toHaveLength(3);
    // P_cell = S_clear + t_mid, with t_mid defaulting to the exterior wall.
    expect(three.pitch).toBeCloseTo(2300, MM);
    // W_total = N*S + (N-1)*t_mid + 2*t_ext = 6000 + 600 + 600
    expect(three.totalWidth).toBeCloseTo(7200, MM);
    expect(three.intermediateWebs).toHaveLength(2);
  });

  it("holds every web, wall, slab and haunch after the solver is made to work for it", () => {
    const m = expandMultiCell(spec);

    // Knock the whole array out of shape, then require the solver to restore it.
    const shaken = perturb(m.state, 40);
    const result = solveLevenbergMarquardt(m.systemModel, shaken, { maxIterations: 300 });

    expect(result.converged).toBe(true);
    expect(result.maxResidual).toBeLessThan(1e-8);

    for (let i = 0; i < m.state.length; i++) m.state[i] = result.solution[i];

    // Three voids.
    expect(m.cells).toHaveLength(3);

    // Both intermediate webs and both external walls are exactly 300.
    expect(m.getIntermediateWebThickness(0)).toBeCloseTo(300, MM);
    expect(m.getIntermediateWebThickness(1)).toBeCloseTo(300, MM);
    expect(m.getExternalWallThickness("left")).toBeCloseTo(300, MM);
    expect(m.getExternalWallThickness("right")).toBeCloseTo(300, MM);
    expect(m.getSlabThickness("top")).toBeCloseTo(250, MM);
    expect(m.getSlabThickness("bottom")).toBeCloseTo(250, MM);

    // All twelve haunches: 150 mm legs at 45 degrees.
    const haunches = m.getAllHaunches();
    expect(haunches).toHaveLength(12);
    for (const h of haunches) {
      expect(h.legHorizontal).toBeCloseTo(150, 2);
      expect(h.legVertical).toBeCloseTo(150, 2);
      expect(h.angleDeg).toBeCloseTo(45, 1);
    }

    // Total width 3*2000 + 4*300.
    expect(m.calculateTotalWidth()).toBeCloseTo(7200, 2);

    // And not one of them folded into the opening on the way.
    expect(haunchesIntact(m.state, m.cells.flatMap((c) => c.haunches))).toBe(true);
  });

  it("keeps the webs at the intermediate thickness when it differs from the wall", () => {
    // The default is t_mid = t_ext; an author who states otherwise must be obeyed,
    // and the total width has to follow the stated value rather than the default.
    const m = expandMultiCell({ ...spec, midWallThickness: 450 });
    expect(m.pitch).toBeCloseTo(2450, MM);
    expect(m.totalWidth).toBeCloseTo(3 * 2000 + 2 * 450 + 2 * 300, MM);

    const r = solveLevenbergMarquardt(m.systemModel, perturb(m.state, 25), { maxIterations: 300 });
    expect(r.converged).toBe(true);
    for (let i = 0; i < m.state.length; i++) m.state[i] = r.solution[i];

    expect(m.getIntermediateWebThickness(0)).toBeCloseTo(450, MM);
    expect(m.getExternalWallThickness("left")).toBeCloseTo(300, MM);
  });

  it("sub-steps a large span change instead of jumping it in one bound", () => {
    // Inside the trigger: one step, because splitting a small change costs
    // solves and buys nothing.
    expect(planHomotopy(2000, 2300)).toEqual([2300]);

    const steps = planHomotopy(2000, 4000);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[steps.length - 1]).toBe(4000);
    let previous = 2000;
    for (const s of steps) {
      expect(Math.abs(s - previous)).toBeLessThanOrEqual(HOMOTOPY_MAX_STEP_MM + 1e-9);
      previous = s;
    }
  });

  it("walks a 2 m span increase without inverting a single haunch", () => {
    let current = expandMultiCell(spec);
    const before = current.getAllHaunches().length;

    for (const span of planHomotopy(spec.clearSpan, spec.clearSpan + 2000)) {
      const next = expandMultiCell({ ...spec, clearSpan: span });
      const r = solveLevenbergMarquardt(next.systemModel, next.state, { maxIterations: 300 });
      expect(r.converged).toBe(true);
      for (let i = 0; i < next.state.length; i++) next.state[i] = r.solution[i];
      expect(haunchesIntact(next.state, next.cells.flatMap((c) => c.haunches))).toBe(true);
      current = next;
    }

    expect(current.getAllHaunches()).toHaveLength(before);
    for (const h of current.getAllHaunches()) {
      expect(h.legHorizontal).toBeCloseTo(150, 2);
      expect(h.angleDeg).toBeCloseTo(45, 1);
    }
  });

  it("pushes back through the chirality barrier as a corner approaches inversion", () => {
    const m = expandMultiCell({ ...spec, count: 1 });
    const corner = m.cells[0].haunches[0];

    const healthy = evaluateChiralityBarrier(m.state, corner);
    expect(Number.isFinite(healthy.residuals[0])).toBe(true);

    // Squeeze the corner until its triangle is nearly degenerate. The barrier has
    // to climb, which is what makes the folded branch unreachable rather than
    // merely unattractive.
    const squeezed = [...m.state];
    squeezed[2 * corner.wall] = squeezed[2 * corner.corner] + 0.01;
    squeezed[2 * corner.wall + 1] = squeezed[2 * corner.corner + 1] + 0.01;
    const tight = evaluateChiralityBarrier(squeezed, corner);

    expect(tight.residuals[0]).toBeGreaterThan(healthy.residuals[0]);
    expect(tight.jacobian[0].some((v) => v !== 0)).toBe(true);
  });
});

describe("Gate 2 — rigid grouping and relative move (notebook pages 3, 4 & 5)", () => {
  /**
   * A triangle made of loose lines, plus a vertical datum line. Points:
   *   0,1,2 triangle; 3,4 the datum.
   */
  function buildScene() {
    const X = [
      0, 0, // 0: triangle A
      500, 0, // 1: triangle B
      250, 400, // 2: triangle C
      -200, -100, // 3: datum bottom
      -200, 500, // 4: datum top
    ];
    return X;
  }

  it("moves the whole component when an external line pulls one of its edges", () => {
    const X = buildScene();
    const component = createRigidComponent("tri", X, [0, 1, 2]);
    const condensation = new RigidCondensation(5, [component]);

    // The offset is whatever the author drew — read it off the geometry rather
    // than asserting a sign convention the constraint is free to define. What
    // the gate is really about is that the offset is HELD while the datum moves.
    const heldOffset = measureNormalOffset(X, { p1: 3, p2: 4, p3: 0, p4: 1, target: 0 });
    const targetDatumX = -500; // was -200, so the datum travels -300
    const model = {
      evaluateResiduals(state: number[]): number[] {
        const out: number[] = [];
        out.push(state[6] - targetDatumX); // datum bottom x
        out.push(state[7] - -100);
        out.push(state[8] - targetDatumX); // datum top x
        out.push(state[9] - 500);
        const offset = evaluateDirectedNormalOffset(state, { p1: 3, p2: 4, p3: 0, p4: 1, target: heldOffset });
        out.push(offset.residuals[0]);
        out.push(state[1] - 0); // triangle A stays on its original y
        return out;
      },
      evaluateJacobian(state: number[]): number[][] {
        const n = state.length;
        const rows: number[][] = [];
        const unit = (i: number) => {
          const r = new Array<number>(n).fill(0);
          r[i] = 1;
          return r;
        };
        rows.push(unit(6), unit(7), unit(8), unit(9));
        rows.push(evaluateDirectedNormalOffset(state, { p1: 3, p2: 4, p3: 0, p4: 1, target: heldOffset }).jacobian[0]);
        rows.push(unit(1));
        return rows;
      },
    };

    const reduced = condenseSystemModel(model, condensation);
    const q0 = condensation.reduce(X);
    const result = solveLevenbergMarquardt(reduced, q0, { maxIterations: 200 });

    expect(result.converged).toBe(true);
    const solved = condensation.expand(result.solution);

    // The datum moved by -300; the triangle followed it exactly.
    expect(solved[6]).toBeCloseTo(-500, MM);
    expect(solved[0]).toBeCloseTo(-300, MM);

    // And nothing inside the triangle changed: a rigid body cannot deform,
    // because the reduced state has no coordinate that would express it.
    const edge = (a: number, b: number) =>
      Math.hypot(solved[2 * b] - solved[2 * a], solved[2 * b + 1] - solved[2 * a + 1]);
    expect(edge(0, 1)).toBeCloseTo(500, MM);
    expect(edge(1, 2)).toBeCloseTo(Math.hypot(250, 400), MM);
    expect(edge(2, 0)).toBeCloseTo(Math.hypot(250, 400), MM);
  });

  it("condenses 2k coordinates into three degrees of freedom", () => {
    const X = buildScene();
    const component = createRigidComponent("tri", X, [0, 1, 2]);
    const condensation = new RigidCondensation(5, [component]);
    // Two loose points keep four slots; the triangle's six collapse to three.
    expect(condensation.fullSize).toBe(10);
    expect(condensation.reducedSize).toBe(7);
    // Round-tripping must not move anything.
    const back = condensation.expand(condensation.reduce(X));
    for (let i = 0; i < X.length; i++) expect(back[i]).toBeCloseTo(X[i], 6);
  });

  it("rotates rigidly about its own frame without stretching an edge", () => {
    const X = buildScene();
    const component = createRigidComponent("tri", X, [0, 1, 2]);
    const condensation = new RigidCondensation(5, [component]);
    const q = condensation.reduce(X);
    const base = condensation.componentSlot("tri")!;
    q[base + 2] = Math.PI / 5; // turn it

    const turned = condensation.expand(q);
    const edge = (s: number[], a: number, b: number) =>
      Math.hypot(s[2 * b] - s[2 * a], s[2 * b + 1] - s[2 * a + 1]);
    expect(edge(turned, 0, 1)).toBeCloseTo(edge(X, 0, 1), 6);
    expect(edge(turned, 1, 2)).toBeCloseTo(edge(X, 1, 2), 6);
  });

  it("refuses to let two frames claim the same point", () => {
    const X = buildScene();
    const a = createRigidComponent("a", X, [0, 1]);
    const b = createRigidComponent("b", X, [1, 2]);
    expect(() => new RigidCondensation(5, [a, b])).toThrow(/one frame/);
  });
});

describe("Gate 3 — centroid-to-centroid driving (notebook page 8)", () => {
  /** Two rectangles, 4 points each: 0-3 is A, 4-7 is B. */
  function twoRectangles(): number[] {
    return [
      0, 0, 400, 0, 400, 300, 0, 300, // A, centroid (200, 150)
      1000, 0, 1400, 0, 1400, 300, 1000, 300, // B, centroid (1200, 150)
    ];
  }
  const loopA = [0, 1, 2, 3];
  const loopB = [4, 5, 6, 7];

  it("computes a centroid gradient that matches a central difference", () => {
    // Finite differences are not allowed in the solve path. They are exactly the
    // right tool for proving the analytical derivative is the real one.
    const pts = [
      { x: 10, y: 5 },
      { x: 430, y: 22 },
      { x: 390, y: 260 },
      { x: 40, y: 300 },
      { x: -20, y: 130 },
    ];
    const base = evaluateCentroid(pts);
    const h = 1e-4;
    for (let j = 0; j < pts.length; j++) {
      for (const axis of ["x", "y"] as const) {
        const up = pts.map((p, i) => (i === j ? { ...p, [axis]: p[axis] + h } : p));
        const dn = pts.map((p, i) => (i === j ? { ...p, [axis]: p[axis] - h } : p));
        const cUp = evaluateCentroid(up).center;
        const cDn = evaluateCentroid(dn).center;
        const slot = 2 * j + (axis === "x" ? 0 : 1);
        expect(base.jacobian[slot]).toBeCloseTo((cUp.x - cDn.x) / (2 * h), 6);
        expect(base.jacobian[2 * pts.length + slot]).toBeCloseTo((cUp.y - cDn.y) / (2 * h), 6);
      }
    }
  });

  it("pulls two shapes together when the target distance drops from 1000 to 600", () => {
    const X = twoRectangles();
    expect(measureCentroidDistance(X, loopA, loopB)).toBeCloseTo(1000, MM);

    const target = 600;
    const model = {
      evaluateResiduals(state: number[]): number[] {
        const rows: number[] = [];
        rows.push(
          evaluateCentroidDistanceConstraint(state, { loopA, loopB, targetDistance: target }).residuals[0]
        );
        // Each rectangle keeps its own size and squareness; only the pair's
        // separation is up for negotiation.
        rows.push(...rigidRectangleResiduals(state, loopA, 400, 300));
        rows.push(...rigidRectangleResiduals(state, loopB, 400, 300));
        // Hold the pair's midpoint and their common y, so "closer" is
        // unambiguous and the answer is symmetric rather than arbitrary.
        rows.push((state[0] + state[8]) / 2 - 500);
        rows.push(state[1] - 0);
        rows.push(state[9] - 0);
        return rows;
      },
      evaluateJacobian(state: number[]): number[][] {
        const n = state.length;
        const rows: number[][] = [];
        rows.push(
          evaluateCentroidDistanceConstraint(state, { loopA, loopB, targetDistance: target }).jacobian[0]
        );
        rows.push(...rigidRectangleJacobian(state, loopA));
        rows.push(...rigidRectangleJacobian(state, loopB));
        const mid = new Array<number>(n).fill(0);
        mid[0] = 0.5;
        mid[8] = 0.5;
        rows.push(mid);
        const y0 = new Array<number>(n).fill(0);
        y0[1] = 1;
        rows.push(y0);
        const y4 = new Array<number>(n).fill(0);
        y4[9] = 1;
        rows.push(y4);
        return rows;
      },
    };

    const result = solveLevenbergMarquardt(model, X, { maxIterations: 400 });
    expect(result.converged).toBe(true);

    const solved = result.solution;
    expect(measureCentroidDistance(solved, loopA, loopB)).toBeCloseTo(600, MM);

    // Symmetric: both moved, by the same amount, towards each other.
    const cA = centroidOf(solved, loopA);
    const cB = centroidOf(solved, loopB);
    expect(cA.x).toBeCloseTo(400, 1);
    expect(cB.x).toBeCloseTo(1000, 1);

    // The gap between the facing edges closed from 600 to 200.
    expect(solved[8] - solved[2]).toBeCloseTo(200, 1);

    // Neither rectangle was distorted to get there.
    expect(solved[2] - solved[0]).toBeCloseTo(400, MM);
    expect(solved[3] - solved[1]).toBeCloseTo(0, MM); // bottom edge still level
  });

  it("pushes them apart just as readily when the target grows", () => {
    const X = twoRectangles();
    const model = distanceOnlyModel(loopA, loopB, 1600);
    const result = solveLevenbergMarquardt(model, X, { maxIterations: 400 });
    expect(result.converged).toBe(true);
    expect(measureCentroidDistance(result.solution, loopA, loopB)).toBeCloseTo(1600, 1);
  });
});

describe("Gate 4 — spatial overlap and boolean wall collapse (notebook page 7)", () => {
  it("fuses two overlapping cells into one solid while keeping both voids", () => {
    const cell1 = createBoxCellRegion({ id: "cell1", originX: 0, width: 2000, height: 1500, wall: 300 });
    const cell2 = createBoxCellRegion({ id: "cell2", originX: 2200, width: 2000, height: 1500, wall: 300 });

    const fused = executeTopologicalFusion(cell1, cell2, { targetOverlap: 200 });

    // The gap was 200 and the requested overlap another 200.
    expect(fused.appliedTranslation.x).toBeCloseTo(-400, MM);
    expect(fused.interfered).toBe(true);
    expect(fused.intersections.length).toBeGreaterThan(0);

    // One merged envelope, two preserved voids, no non-manifold crossings.
    expect(fused.externalFaces).toHaveLength(1);
    expect(fused.voidFaces).toHaveLength(2);
    expect(fused.hasSelfIntersections()).toBe(false);

    // The overlap is counted once, not twice: two 2000x1500 cells overlapping by
    // 200 occupy 2000*1500 * 2 - 200*1500 of plan area.
    expect(fused.externalFaces[0].area).toBeCloseTo(2 * 2000 * 1500 - 200 * 1500, 0);
    expect(fused.externalFaces[0].outer.length).toBeGreaterThan(3);
  });

  it("reports the shared web that the merge synthesised", () => {
    const cell1 = createBoxCellRegion({ id: "cell1", originX: 0, width: 2000, height: 1500, wall: 300 });
    const cell2 = createBoxCellRegion({ id: "cell2", originX: 2200, width: 2000, height: 1500, wall: 300 });
    const fused = executeTopologicalFusion(cell1, cell2, { targetOverlap: 200 });

    expect(fused.collapsedWebs).toHaveLength(1);
    // t_mid = t1 + t2 - overlap = 300 + 300 - 200
    expect(fused.collapsedWebs[0].thickness).toBeCloseTo(400, MM);
  });

  it("leaves two separated cells alone", () => {
    const cell1 = createBoxCellRegion({ id: "cell1", originX: 0, width: 2000, height: 1500, wall: 300 });
    const cell2 = createBoxCellRegion({ id: "cell2", originX: 3000, width: 2000, height: 1500, wall: 300 });
    const fused = executeTopologicalFusion(cell1, cell2, { targetOverlap: -500 });

    // Still two separate solids, still two voids, and nothing crossed.
    expect(fused.externalFaces).toHaveLength(2);
    expect(fused.voidFaces).toHaveLength(2);
    expect(fused.hasSelfIntersections()).toBe(false);
    expect(fused.collapsedWebs).toHaveLength(0);
  });
});

describe("Relative line residuals (notebook page 6)", () => {
  it("holds a directed offset with the sign that keeps the wall the right way out", () => {
    // Line 1 vertical at x = 0, point P3 at x = 300 to its right.
    const X = [0, 0, 0, 1000, 300, 500, 300, 600];
    const drawn = measureNormalOffset(X, { p1: 0, p2: 1, p3: 2, p4: 3, target: 0 });
    expect(Math.abs(drawn)).toBeCloseTo(300, 6);

    const spec = { p1: 0, p2: 1, p3: 2, p4: 3, target: drawn };
    expect(evaluateDirectedNormalOffset(X, spec).residuals[0]).toBeCloseTo(0, 6);

    // Mirror P3 to the other side of line 1. A plain distance constraint would
    // still read 300 and call it satisfied; the signed offset is out by twice
    // the gap, so the flipped wall is not a solution the solver can settle on.
    const mirrored = [...X];
    mirrored[4] = -300;
    mirrored[6] = -300;
    expect(evaluateDirectedNormalOffset(mirrored, spec).residuals[0]).toBeCloseTo(-2 * drawn, 6);
  });

  it("gives an exact gradient for the perpendicular offset", () => {
    const X = [10, 20, 400, 700, 260, 90, 300, 140];
    const spec = { p1: 0, p2: 1, p3: 2, p4: 3, target: 120 };
    const analytic = evaluateDirectedNormalOffset(X, spec).jacobian[0];
    const h = 1e-5;
    for (let j = 0; j < X.length; j++) {
      const up = [...X];
      const dn = [...X];
      up[j] += h;
      dn[j] -= h;
      const fd =
        (evaluateDirectedNormalOffset(up, spec).residuals[0] -
          evaluateDirectedNormalOffset(dn, spec).residuals[0]) /
        (2 * h);
      expect(analytic[j]).toBeCloseTo(fd, 5);
    }
  });

  it("separates the axes so a horizontal gap is independent of a vertical one", () => {
    const X = [0, 0, 100, 0, 0, 400, 100, 400];
    const dx = evaluateRelativeOffsetX(X, { p1: 0, p2: 1, p3: 2, p4: 3, target: 0 });
    expect(dx.residuals[0]).toBeCloseTo(0, 6);
    // Moving line 2 up changes nothing about the x separation.
    const raised = [...X];
    raised[5] += 250;
    raised[7] += 250;
    expect(evaluateRelativeOffsetX(raised, { p1: 0, p2: 1, p3: 2, p4: 3, target: 0 }).residuals[0]).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Rows that keep a 4-point loop a rectangle of a stated size. */
function rigidRectangleResiduals(X: number[], loop: number[], w: number, h: number): number[] {
  const [a, b, c, d] = loop;
  return [
    X[2 * b] - X[2 * a] - w,
    X[2 * b + 1] - X[2 * a + 1],
    X[2 * c] - X[2 * b],
    X[2 * c + 1] - X[2 * b + 1] - h,
    X[2 * d] - X[2 * a],
    X[2 * d + 1] - X[2 * a + 1] - h,
  ];
}

function rigidRectangleJacobian(X: number[], loop: number[]): number[][] {
  const n = X.length;
  const [a, b, c, d] = loop;
  const row = () => new Array<number>(n).fill(0);
  const r: number[][] = [];
  let t = row();
  t[2 * b] = 1;
  t[2 * a] = -1;
  r.push(t);
  t = row();
  t[2 * b + 1] = 1;
  t[2 * a + 1] = -1;
  r.push(t);
  t = row();
  t[2 * c] = 1;
  t[2 * b] = -1;
  r.push(t);
  t = row();
  t[2 * c + 1] = 1;
  t[2 * b + 1] = -1;
  r.push(t);
  t = row();
  t[2 * d] = 1;
  t[2 * a] = -1;
  r.push(t);
  t = row();
  t[2 * d + 1] = 1;
  t[2 * a + 1] = -1;
  r.push(t);
  return r;
}

function distanceOnlyModel(loopA: number[], loopB: number[], target: number) {
  return {
    evaluateResiduals(state: number[]): number[] {
      return [
        evaluateCentroidDistanceConstraint(state, { loopA, loopB, targetDistance: target }).residuals[0],
        ...rigidRectangleResiduals(state, loopA, 400, 300),
        ...rigidRectangleResiduals(state, loopB, 400, 300),
        (state[0] + state[8]) / 2 - 500,
        state[1],
        state[9],
      ];
    },
    evaluateJacobian(state: number[]): number[][] {
      const n = state.length;
      const rows: number[][] = [
        evaluateCentroidDistanceConstraint(state, { loopA, loopB, targetDistance: target }).jacobian[0],
        ...rigidRectangleJacobian(state, loopA),
        ...rigidRectangleJacobian(state, loopB),
      ];
      const mid = new Array<number>(n).fill(0);
      mid[0] = 0.5;
      mid[8] = 0.5;
      rows.push(mid);
      const y0 = new Array<number>(n).fill(0);
      y0[1] = 1;
      rows.push(y0);
      const y4 = new Array<number>(n).fill(0);
      y4[9] = 1;
      rows.push(y4);
      return rows;
    },
  };
}

/** Kept so the haunch measurement helper is exercised directly, not only via the gate. */
describe("Haunch measurement", () => {
  it("reads 45 degrees off an equal-legged corner", () => {
    const X = [0, 150, 0, 0, 150, 0];
    const m = measureHaunch(X, {
      wall: 0,
      corner: 1,
      slab: 2,
      legWall: 150,
      legSlab: 150,
      orientation: 1,
    });
    expect(m.legHorizontal).toBeCloseTo(150, 6);
    expect(m.legVertical).toBeCloseTo(150, 6);
    expect(m.angleDeg).toBeCloseTo(45, 6);
  });
});

describe("Downstream metrics and the constraint registry", () => {
  it("derives volumes from the solved faces rather than from the parameters", () => {
    const cell1 = createBoxCellRegion({ id: "cell1", originX: 0, width: 2000, height: 1500, wall: 300 });
    const cell2 = createBoxCellRegion({ id: "cell2", originX: 3000, width: 2000, height: 1500, wall: 300 });
    const fused = executeTopologicalFusion(cell1, cell2, { targetOverlap: -500 });

    const barrelLength = 9150; // the GAD's clear span along the flow
    const take = takeOffFromFusion(fused, barrelLength);

    // Two solids and two voids, each volume = plan area x barrel length.
    expect(take.lines.filter((l) => l.kind === "solid")).toHaveLength(2);
    expect(take.lines.filter((l) => l.kind === "void")).toHaveLength(2);

    // A 2000x1500 cell with a 300 wall: solid = 3.0e6 - 1.4e3*900 = 1.74e6 mm^2.
    const solid = take.lines.find((l) => l.kind === "solid")!;
    expect(solid.areaMm2).toBeCloseTo(2000 * 1500 - 1400 * 900, 0);
    expect(solid.volumeM3).toBeCloseTo((solid.areaMm2 * barrelLength) / 1e9, 6);
    expect(take.totalSolidM3).toBeCloseTo(2 * solid.volumeM3, 6);
  });

  it("routes every new constraint through one dispatcher", () => {
    for (const type of [
      "CENTROID_DISTANCE",
      "RELATIVE_OFFSET_X",
      "RELATIVE_OFFSET_Y",
      "DIRECTED_NORMAL_OFFSET",
      "HAUNCH_LEG",
      "CHIRALITY_BARRIER",
    ] as const) {
      expect(ownsConstraint(type)).toBe(true);
    }
    // And leaves the existing ones to the existing evaluator.
    expect(ownsConstraint("PARALLEL")).toBe(false);

    const X = [0, 0, 0, 1000, 300, 500, 300, 600];
    const system = buildAddendumSystemModel([
      { id: "c1", type: "DIRECTED_NORMAL_OFFSET", pointIndices: [0, 1, 2, 3], targetValue: -300 },
      { id: "c2", type: "RELATIVE_OFFSET_X", pointIndices: [0, 1, 2, 3], targetValue: 300 },
      { id: "off", type: "RELATIVE_OFFSET_Y", pointIndices: [0, 1, 2, 3], targetValue: 0, isActive: false },
    ]);

    expect(system.evaluateResiduals(X)).toHaveLength(2);
    expect(system.evaluateJacobian(X)).toHaveLength(2);
    // Row ownership survives assembly, so a diagnostic can name the constraint.
    expect(system.rowOwners(X)).toEqual(["c1", "c2"]);
  });
});
