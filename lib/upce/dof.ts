/**
 * Degrees of freedom — structural and numerical.
 *
 * UPCE-MASTER-1.0 §30.1 is explicit that a global scalar count is the wrong
 * answer. What a draftsman needs is: how much freedom is left, WHERE it is, and
 * whether an extra constraint is harmlessly redundant or actually contradictory.
 * §7.3 fixes the test for that last question — it is the residual, not a count:
 *
 *     dependent row + zero residual   -> redundant
 *     dependent row + nonzero residual -> conflicting
 *
 * Everything here is computed from the assembled Jacobian. Nothing is estimated
 * from the number of shapes on the sheet.
 */

import { svd } from "../solver/matrix/svd";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { AuthoringSketch, SketchConstraint } from "./types";
import {
  buildSystem,
  evaluateSystem,
  evaluateConstraint,
  rowCount,
  CompiledSystem,
} from "./residuals";

export interface FreeMotion {
  /** One sentence a draftsman can act on. */
  description: string;
  /** Shapes that move under this motion. */
  shapeIds: string[];
  /** rigid-body motions are listed first because anchoring removes them all. */
  kind: "translation" | "rotation" | "local";
}

export interface ConstraintDiagnosis {
  constraintId: string;
  label: string;
  status: "active" | "redundant" | "conflicting";
  /** Worst residual contributed by this constraint, in mm or rad. */
  residual: number;
  note?: string;
}

export interface DofBlock {
  /** Shapes whose geometry is coupled by constraints. */
  shapeIds: string[];
  variables: number;
  rank: number;
  dof: number;
  status: "under" | "well" | "over";
}

export interface DofReport {
  variables: number;
  rows: number;
  rank: number;
  /** Global remaining freedom. */
  dof: number;
  status: "under" | "well" | "over";
  motions: FreeMotion[];
  diagnoses: ConstraintDiagnosis[];
  blocks: DofBlock[];
  /** True when at least one point is pinned. Without it three DOF are spurious. */
  anchored: boolean;
  maxResidual: number;
}

/** Pads a wide matrix with zero rows so the SVD returns the full n x n V. */
function fullRightSingular(J: number[][], n: number): { q: number[]; V: number[][] } {
  if (J.length === 0) {
    // No constraints: every direction is free. V is the identity.
    const V: number[][] = [];
    for (let i = 0; i < n; i++) {
      V.push(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    }
    return { q: new Array(n).fill(0), V };
  }
  const rows = J.length >= n ? J : [...J, ...Array.from({ length: n - J.length }, () => new Array(n).fill(0))];
  const res = svd(rows);
  return { q: res.q, V: res.V };
}

function rankOf(J: number[][], n: number, eps: number): number {
  if (J.length === 0) return 0;
  const { q } = fullRightSingular(J, n);
  const scale = Math.max(...q, 1);
  return q.filter((s) => s > eps * scale).length;
}

/**
 * Turns the null space into sentences.
 *
 * The raw right singular vectors are an arbitrary orthonormal basis of the free
 * space: mathematically correct, but they mix motions together and two of them
 * routinely describe "the same" freedom in different proportions, which is why
 * a naive listing reads as repetitive nonsense.
 *
 * So instead of describing the basis, this probes it. A fixed catalogue of
 * motions a draftsman already has words for — slide the sheet, spin the sheet,
 * slide this shape, widen this shape — is projected onto the null space. A probe
 * that lies almost entirely inside it IS a real remaining freedom, and probes
 * are then taken greedily while they stay independent of the ones already
 * named. Whatever the catalogue cannot account for is reported honestly as
 * unnamed remaining freedom rather than being given an invented description.
 */
interface Probe {
  vector: number[];
  description: string;
  shapeIds: string[];
  kind: FreeMotion["kind"];
  rank: number;
}

function buildProbes(
  sys: CompiledSystem,
  sketch: AuthoringSketch,
  names: Record<string, string>
): Probe[] {
  const n = sys.ids.length;
  const dim = 2 * n;
  const probes: Probe[] = [];
  const allShapes = [...new Set(sys.ids.flatMap((id) => sketch.points[id].owners))];
  const label = (id: string) => names[id] ?? id;

  const zeros = () => new Array(dim).fill(0);

  const tx = zeros();
  const ty = zeros();
  for (let i = 0; i < n; i++) {
    tx[2 * i] = 1;
    ty[2 * i + 1] = 1;
  }
  probes.push({
    vector: tx,
    description: "The whole drawing can slide left and right — nothing pins it to the sheet.",
    shapeIds: allShapes,
    kind: "translation",
    rank: 0,
  });
  probes.push({
    vector: ty,
    description: "The whole drawing can slide up and down — nothing pins it to the sheet.",
    shapeIds: allShapes,
    kind: "translation",
    rank: 0,
  });

  // Anchoring changes which pivot the remaining motions turn about: once a
  // corner is pinned, the drawing rotates and grows about THAT corner, not about
  // its centroid. Probing only centroid-based motions after an anchor is added
  // makes real, nameable freedoms look like unexplained leftovers, so every
  // plausible pivot is probed and the greedy pass keeps whichever fits.
  const anchorIds = sketch.constraints
    .filter((c) => c.kind === "fix" && c.state !== "suppressed")
    .map((c) => c.points[0])
    .filter((id) => sys.index[id] !== undefined);

  const pivots: { x: number; y: number }[] = [centroidOf(sys, sys.ids)];
  for (const id of anchorIds) {
    const i = sys.index[id];
    pivots.push({ x: sys.X[2 * i], y: sys.X[2 * i + 1] });
  }

  for (const pv of pivots) {
    const rot = zeros();
    for (let i = 0; i < n; i++) {
      rot[2 * i] = -(sys.X[2 * i + 1] - pv.y);
      rot[2 * i + 1] = sys.X[2 * i] - pv.x;
    }
    probes.push({
      vector: rot,
      description: "The whole drawing can rotate — no edge is held to an axis.",
      shapeIds: allShapes,
      kind: "rotation",
      rank: 1,
    });
  }

  for (const shapeId of allShapes) {
    const ids = sys.ids.filter((id) => sketch.points[id].owners.includes(shapeId));
    if (ids.length === 0) continue;
    const name = label(shapeId);

    const localPivots: { x: number; y: number }[] = [centroidOf(sys, ids)];
    for (const id of ids) {
      if (anchorIds.includes(id)) {
        const i = sys.index[id];
        localPivots.push({ x: sys.X[2 * i], y: sys.X[2 * i + 1] });
      }
    }
    // A shape is just as often grown from one corner as about its middle.
    const first = ids[0];
    if (first) {
      const i = sys.index[first];
      localPivots.push({ x: sys.X[2 * i], y: sys.X[2 * i + 1] });
    }

    const mk = (
      pv: { x: number; y: number },
      fn: (x: number, y: number) => [number, number],
      description: string
    ) => {
      const v = zeros();
      let mag = 0;
      for (const id of ids) {
        const i = sys.index[id];
        const [a, b] = fn(sys.X[2 * i] - pv.x, sys.X[2 * i + 1] - pv.y);
        v[2 * i] = a;
        v[2 * i + 1] = b;
        mag += a * a + b * b;
      }
      if (mag < 1e-12) return;
      probes.push({ vector: v, description, shapeIds: [shapeId], kind: "local", rank: 2 });
    };

    mk(localPivots[0], () => [1, 0], `${name} can still slide left and right on its own.`);
    mk(localPivots[0], () => [0, 1], `${name} can still slide up and down on its own.`);
    for (const pv of localPivots) {
      mk(pv, (x) => [x, 0], `${name} can still change width.`);
      mk(pv, (_, y) => [0, y], `${name} can still change height.`);
      mk(pv, (x, y) => [-y, x], `${name} can still rotate on its own.`);
    }
  }

  return probes;
}

function centroidOf(sys: CompiledSystem, ids: string[]): { x: number; y: number } {
  let cx = 0;
  let cy = 0;
  for (const id of ids) {
    const i = sys.index[id];
    cx += sys.X[2 * i];
    cy += sys.X[2 * i + 1];
  }
  return { x: cx / ids.length, y: cy / ids.length };
}

function normalise(v: number[]): number[] {
  const m = Math.hypot(...v);
  return m < 1e-15 ? v : v.map((x) => x / m);
}

function projectOntoNull(v: number[], nullBasis: number[][]): number[] {
  const out = new Array(v.length).fill(0);
  for (const b of nullBasis) {
    let d = 0;
    for (let i = 0; i < v.length; i++) d += b[i] * v[i];
    for (let i = 0; i < v.length; i++) out[i] += d * b[i];
  }
  return out;
}

function describeFreedom(
  nullBasis: number[][],
  sys: CompiledSystem,
  sketch: AuthoringSketch,
  names: Record<string, string>,
  dof: number
): FreeMotion[] {
  if (dof === 0 || nullBasis.length === 0) return [];
  const probes = buildProbes(sys, sketch, names).sort((a, b) => a.rank - b.rank);

  const chosen: FreeMotion[] = [];
  const taken: number[][] = []; // orthonormal, inside the null space

  for (const probe of probes) {
    if (chosen.length >= dof) break;
    const p = projectOntoNull(normalise(probe.vector), nullBasis);
    const inside = Math.hypot(...p);
    // Only accept a probe that is almost entirely a free motion. A probe that is
    // half-free would describe something the geometry cannot actually do.
    if (inside < 0.97) continue;

    let residual = normalise(p);
    for (const t of taken) {
      let d = 0;
      for (let i = 0; i < residual.length; i++) d += t[i] * residual[i];
      for (let i = 0; i < residual.length; i++) residual[i] -= d * t[i];
    }
    if (Math.hypot(...residual) < 0.2) continue; // already covered by a named motion
    residual = normalise(residual);
    taken.push(residual);
    chosen.push({ description: probe.description, shapeIds: probe.shapeIds, kind: probe.kind });
  }

  const unnamed = dof - chosen.length;
  if (unnamed > 0) {
    const movers = new Set<string>();
    for (const b of nullBasis) {
      for (let i = 0; i < sys.ids.length; i++) {
        if (Math.hypot(b[2 * i], b[2 * i + 1]) > 0.05) {
          for (const o of sketch.points[sys.ids[i]].owners) movers.add(names[o] ?? o);
        }
      }
    }
    const who = [...movers];
    chosen.push({
      description:
        unnamed === 1
          ? `One more freedom remains, involving ${who.slice(0, 3).join(", ") || "the sketch"} — it is a combination of movements rather than a single simple one.`
          : `${unnamed} more freedoms remain, involving ${who.slice(0, 3).join(", ") || "the sketch"} — they are combinations of movements rather than single simple ones.`,
      shapeIds: [],
      kind: "local",
    });
  }

  return chosen;
}

/**
 * Full analysis. `shapeNames` lets the caller supply human labels; without it,
 * shape ids are used and the wording still works.
 */
export function analyseDof(
  sketch: AuthoringSketch,
  shapeNames: Record<string, string> = {},
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): DofReport {
  const sys = buildSystem(sketch);
  const n = sys.X.length;

  if (n === 0) {
    return {
      variables: 0,
      rows: 0,
      rank: 0,
      dof: 0,
      status: "well",
      motions: [],
      diagnoses: [],
      blocks: [],
      anchored: false,
      maxResidual: 0,
    };
  }

  const { residuals, jacobian } = evaluateSystem(sketch, sys, sys.X);
  const eps = policy.singular_value_eps;
  const { q, V } = fullRightSingular(jacobian, n);
  const scale = Math.max(...q, 1);
  const rank = jacobian.length === 0 ? 0 : q.filter((s) => s > eps * scale).length;
  const dof = n - rank;

  // Null-space vectors are the columns of V past the rank.
  const nullVectors: number[][] = [];
  for (let col = rank; col < n; col++) {
    const v: number[] = [];
    for (let row = 0; row < n; row++) v.push(V[row][col]);
    nullVectors.push(v);
  }

  const motions = describeFreedom(nullVectors, sys, sketch, shapeNames, dof);

  const maxResidual = residuals.reduce((m, r) => Math.max(m, Math.abs(r)), 0);
  const diagnoses = diagnose(sketch, sys, jacobian, residuals, rank, n, eps, policy);

  const over = diagnoses.some((d) => d.status === "conflicting");
  const status: DofReport["status"] = over ? "over" : dof > 0 ? "under" : "well";

  return {
    variables: n,
    rows: jacobian.length,
    rank,
    dof,
    status,
    motions,
    diagnoses,
    blocks: partitionBlocks(sketch, sys, shapeNames, eps),
    anchored: sketch.constraints.some((c) => c.kind === "fix" && c.state !== "suppressed"),
    maxResidual,
  };
}


/**
 * Per-constraint dependency test. A row set is dependent when dropping the
 * constraint leaves the rank unchanged; the residual then separates a harmless
 * duplicate from a real contradiction (§7.3).
 */
function diagnose(
  sketch: AuthoringSketch,
  sys: CompiledSystem,
  jacobian: number[][],
  residuals: number[],
  rank: number,
  n: number,
  eps: number,
  policy: TolerancePolicy
): ConstraintDiagnosis[] {
  const out: ConstraintDiagnosis[] = [];
  const rows = jacobian.length;

  // Row offsets per constraint.
  const offsets: Record<string, [number, number]> = {};
  let cursor = 0;
  for (const c of sys.active) {
    const k = rowCount(c);
    offsets[c.id] = [cursor, cursor + k];
    cursor += k;
  }

  const anyDependent = rows > rank;

  for (const c of sys.active) {
    const [start, end] = offsets[c.id];
    let res = 0;
    for (let i = start; i < end; i++) res = Math.max(res, Math.abs(residuals[i]));

    if (!anyDependent) {
      out.push({ constraintId: c.id, label: c.label, status: "active", residual: res });
      continue;
    }

    const reduced = jacobian.filter((_, i) => i < start || i >= end);
    const reducedRank = rankOf(reduced, n, eps);
    const dependent = reducedRank === rank;

    if (!dependent) {
      out.push({ constraintId: c.id, label: c.label, status: "active", residual: res });
    } else if (res <= Math.max(policy.geometry_mm, 1e-6)) {
      out.push({
        constraintId: c.id,
        label: c.label,
        status: "redundant",
        residual: res,
        note: "Already guaranteed by the other requirements. Harmless, but it will never be the thing that moves the geometry.",
      });
    } else {
      out.push({
        constraintId: c.id,
        label: c.label,
        status: "conflicting",
        residual: res,
        note: `Cannot be satisfied together with the others — it is off by ${res.toFixed(2)}.`,
      });
    }
  }

  void sketch;
  return out;
}

/** Connected components of the constraint graph, each analysed on its own. */
function partitionBlocks(
  sketch: AuthoringSketch,
  sys: CompiledSystem,
  shapeNames: Record<string, string>,
  eps: number
): DofBlock[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of sys.ids) parent.set(id, id);

  for (const c of sys.active) {
    const touched: string[] = [...c.points];
    for (const s of c.segments) {
      const seg = sketch.segments[s];
      if (seg) touched.push(seg.p1, seg.p2);
    }
    for (let i = 1; i < touched.length; i++) union(touched[0], touched[i]);
  }
  // Points of one shape belong together even without a constraint between them.
  const byShape = new Map<string, string[]>();
  for (const id of sys.ids) {
    for (const owner of sketch.points[id].owners) {
      const arr = byShape.get(owner) ?? [];
      arr.push(id);
      byShape.set(owner, arr);
    }
  }
  for (const arr of byShape.values()) {
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
  }

  const groups = new Map<string, string[]>();
  for (const id of sys.ids) {
    const root = find(id);
    const arr = groups.get(root) ?? [];
    arr.push(id);
    groups.set(root, arr);
  }

  const blocks: DofBlock[] = [];
  for (const memberIds of groups.values()) {
    const localIndex = new Map<string, number>();
    memberIds.forEach((id, i) => localIndex.set(id, i));
    const nLocal = memberIds.length * 2;

    const localRows: number[][] = [];
    for (const c of sys.active) {
      const pts: string[] = [...c.points];
      for (const s of c.segments) {
        const seg = sketch.segments[s];
        if (seg) pts.push(seg.p1, seg.p2);
      }
      if (!pts.every((p) => localIndex.has(p))) continue;
      const full = evaluateLocal(sketch, c, sys, memberIds, localIndex);
      localRows.push(...full);
    }

    const rank = rankOf(localRows, nLocal, eps);
    const dof = nLocal - rank;
    const shapeIds = [
      ...new Set(memberIds.flatMap((id) => sketch.points[id].owners)),
    ].map((id) => shapeNames[id] ?? id);

    blocks.push({
      shapeIds,
      variables: nLocal,
      rank,
      dof,
      status: dof > 0 ? "under" : localRows.length > rank ? "over" : "well",
    });
  }

  return blocks.sort((a, b) => b.variables - a.variables);
}

function evaluateLocal(
  sketch: AuthoringSketch,
  c: SketchConstraint,
  sys: CompiledSystem,
  memberIds: string[],
  localIndex: Map<string, number>
): number[][] {
  // Evaluate against a compact local state vector so the rank is meaningful for
  // the block alone rather than for the whole sheet.
  const Xl: number[] = [];
  for (const id of memberIds) {
    const gi = sys.index[id];
    Xl.push(sys.X[2 * gi], sys.X[2 * gi + 1]);
  }
  const I: Record<string, number> = {};
  localIndex.forEach((v, k) => (I[k] = v));
  return evaluateConstraint(sketch, c, Xl, I).jacobian;
}
