/**
 * Regression pin for a VERIFIED under-constraint defect in the autonomous
 * discovery pipeline, and a correction to DEC-048.
 *
 * WHAT DEC-048 RECORDED
 * ---------------------
 *   "The autonomous discovery pipeline generates constraint systems where
 *    PlaneGCS reports `Sketcher Redundant solving: 1 redundants`. While the
 *    solver converges, the redundant constraint introduces geometric drift of up
 *    to ~1.5%... This is inherent to PlaneGCS's redundant-solving algorithm, not
 *    a logic error."
 *
 * and Gate G8 Criteria 7/8 were relaxed to ±100 mm range checks to accommodate it.
 *
 * WHAT THE EVIDENCE SHOWS
 * -----------------------
 * Measured on a single-cell culvert (ClearSpan 2000 → 3500, wall 300, haunch 150):
 *
 *   before   width 2600.000   height 2100.000
 *   after    width 4161.960   height 2313.054
 *   expected width 4100.000   height 2100.000
 *   error    width   +61.960  height  +213.054   (height must not move at all)
 *   converged = true, maxResidual = 9.09e-13
 *
 * The model's OWN Dulmage–Mendelsohn analysis reports:
 *
 *   status            "under_constrained"
 *   overConstrained   { variables: [], constraints: [], conflictingConstraints: [] }
 *   component         variableCount 24, rank 14, dof 10, isAnchored true
 *
 * To be fair to DEC-048: PlaneGCS DOES print "Sketcher Redundant solving:
 * 1 redundants". That message is real. But §30.6 is explicit that PlaneGCS's own
 * diagnostics are "guidance, not gospel" and that "our own DM + SVD analysis...
 * is the authoritative localisation". By that authority, `overConstrained` is
 * EMPTY: there is no conflicting or redundant block. What actually exists is a
 * system UNDER-constrained by 7 DOF, in which one locally-redundant constraint
 * happens to coexist. The drift is the solver taking an arbitrary point in that
 * 7-dimensional null space — not an artefact of the redundancy. The residual is tiny because every constraint that
 * WAS supplied is satisfied; the ones that would hold the height were never
 * generated. That is the §5 caveat exactly: "A sketch can solve cleanly, report
 * DOF = 0, and still encode the wrong intent."
 *
 * ROOT CAUSES (all three are logic gaps, not solver behaviour)
 *   1. §22/§48 — an `offset` is "not native — compiles to Parallel + equal
 *      perpendicular distance", but only the DISTANCE half is emitted. Each of
 *      the six P3 offsets therefore contributes one equation where it should
 *      contribute two, and the two edges stay free to rotate relative to each
 *      other. This is the primary cause.
 *   2. §29.4 — no minimum-norm projection on this path, so the remaining free
 *      DOF absorb arbitrary motion instead of staying put.
 *
 * FIXED on 2026-09-10
 *   §18 — the anchor rule now reaches the DOF analysis (`isAnchored: true`,
 *   `dAnchor: 0`). Note what this revealed: the DOF count went 7 -> 10, because
 *   the unanchored report had been silently discounting three rigid-body DOF the
 *   sketch did not actually have free. The spec warned about exactly this:
 *   "Without it, DOF analysis mis-reports three spurious degrees of freedom on
 *   every sketch and every diagnosis downstream is wrong." The report is now
 *   honest — and the honest number is worse than the flattering one was.
 *
 * ATTEMPTED AND REVERTED
 *   Both §22-correct compilations were implemented and measured against the
 *   current PlaneGCS client mapping. Both DIVERGE:
 *     - emitting a `parallel` primitive (l1_id/l2_id)  -> residual 1.0,  no convergence
 *     - pinning both endpoints of edge B to line A     -> residual 21,   no convergence
 *   The likely cause is that `p2l_distance` is unsigned in this mapping, so a
 *   second incident constraint admits a sign flip. Reverted rather than shipped:
 *   a non-converging solver is worse than a drifting one. The specific next task
 *   is a SIGNED point-to-line residual (or a native offset primitive) in
 *   `planegcsClient.ts` — then raise `equationCountFor` for P3 to 2 in the same
 *   change.
 *
 *   §31.5 homotopy sub-stepping was also trialled on `applyParameterChange` and
 *   made the drift WORSE (height error 213 mm -> 374 mm), because re-running the
 *   procedural predictor per sub-step re-derives its midline from already-moved
 *   geometry and compounds. Continuation belongs on a solve whose constraint
 *   system is complete.
 *
 * This suite PINS the defect so it stays visible and any improvement is detected,
 * rather than hiding it behind a widened tolerance. Tighten these expectations
 * as the root causes are fixed.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import { synthesizeAutonomousCAD } from "../../lib/inference/autonomousDiscoveryPipeline";
import { DcelSegmentInput } from "../../lib/geometry/topology/dcel";

function singleCellCulvert(
  clearSpan: number,
  clearHeight: number,
  wall: number,
  haunch: number
): DcelSegmentInput[] {
  const ow = clearSpan + 2 * wall;
  const oh = clearHeight + 2 * wall;
  const outer = [
    { x: 0, y: 0 },
    { x: ow, y: 0 },
    { x: ow, y: oh },
    { x: 0, y: oh },
  ];
  const ix0 = wall;
  const iy0 = wall;
  const ix1 = wall + clearSpan;
  const iy1 = wall + clearHeight;
  const inner = [
    { x: ix0 + haunch, y: iy0 },
    { x: ix1 - haunch, y: iy0 },
    { x: ix1, y: iy0 + haunch },
    { x: ix1, y: iy1 - haunch },
    { x: ix1 - haunch, y: iy1 },
    { x: ix0 + haunch, y: iy1 },
    { x: ix0, y: iy1 - haunch },
    { x: ix0, y: iy0 + haunch },
  ];
  const segs: DcelSegmentInput[] = [];
  outer.forEach((p, i) => segs.push({ p1: p, p2: outer[(i + 1) % outer.length] }));
  inner.forEach((p, i) => segs.push({ p1: p, p2: inner[(i + 1) % inner.length] }));
  return segs;
}

const policy = DEFAULT_TOLERANCE_POLICY;

describe("VERIFIED DEFECT — the discovered system is under-constrained, not redundant", () => {
  const model = synthesizeAutonomousCAD({
    segments: singleCellCulvert(2000, 1500, 300, 150),
    policy,
  });

  it("reports under_constrained, correcting DEC-048's 'redundant' diagnosis", () => {
    expect(model.dmResult.status).toBe("under_constrained");
  });

  it("§18 anchor rule IS now applied, so the DOF report is honest", () => {
    const component = model.dmResult.components[0];
    expect(component.isAnchored).toBe(true);
    expect(component.dAnchor).toBe(0);
    expect(model.bipartiteGraph.hasAnchor()).toBe(true);
  });

  it("has NO redundant or conflicting block at all — the DEC-048 premise does not hold", () => {
    expect(model.dmResult.overConstrained.constraints).toEqual([]);
    expect(model.dmResult.overConstrained.variables).toEqual([]);
    expect(model.dmResult.overConstrained.conflictingConstraints ?? []).toEqual([]);
  });

  it("leaves 10 degrees of freedom unconstrained", () => {
    const component = model.dmResult.components[0];
    expect(component.status).toBe("under_constrained");
    expect(component.variableCount).toBe(24);
    expect(component.rank).toBe(14);
    // PIN: tighten toward 0 as the §22 offset compilation is completed.
    // Was reported as 7 while the sketch was unanchored; 10 is the true count.
    expect(component.dof).toBe(10);
  });

  it("generates no constraint that pins the slab thickness, so the height is free", () => {
    const kinds = new Map<string, number>();
    for (const c of model.solverInput.constraints as { kind?: string; type?: string }[]) {
      const k = String(c.kind ?? c.type ?? "?");
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    expect(model.solverInput.constraints.length).toBe(14);
    // PIN: the observed vocabulary. A vertical offset/distance constraint
    // appearing here is the fix, and should break this expectation.
    expect([...kinds.keys()].sort()).toEqual([
      "equal_length",
      "p2l_distance",
      "perpendicular",
    ]);
  });
});

describe("VERIFIED DEFECT — a clean solve still produces wrong geometry (§5)", () => {
  it("drifts the height by ~213 mm on a purely horizontal edit, at residual 1e-13", async () => {
    const model = synthesizeAutonomousCAD({
      segments: singleCellCulvert(2000, 1500, 300, 150),
      policy,
    });

    const before = [...model.dcel.vertices.values()].map((v) => v.point);
    const heightBefore = Math.max(...before.map((p) => p.y)) - Math.min(...before.map((p) => p.y));
    expect(heightBefore).toBeCloseTo(2100, 6);

    const result = await model.applyParameterChange("ClearSpan", 3500);
    const pts = [...result.points.values()];
    const width = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const height = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));

    // The solver is not at fault: it satisfied everything it was given.
    expect(result.converged).toBe(true);
    expect(result.maxResidual).toBeLessThanOrEqual(policy.solver_residual);

    // §4 non-negotiable 2 requires the height to be STRICTLY preserved when only
    // the span changes. It is not. PIN the current error so a fix is detected.
    const heightError = Math.abs(height - 2100);
    const widthError = Math.abs(width - 4100);
    expect(heightError).toBeGreaterThan(100); // currently ~213 mm — this is the bug
    expect(heightError).toBeLessThan(400); // and it must not get worse
    expect(widthError).toBeGreaterThan(10); // currently ~62 mm
    expect(widthError).toBeLessThan(200);
  });

  it("documents the target: both errors should be below ε_geometry once fixed", () => {
    // Executable statement of the acceptance condition this defect fails.
    // Flip these to the real assertion when §48/§18/§29.4 are addressed.
    const targetTolerance = policy.geometry_mm;
    expect(targetTolerance).toBe(0.5);
  });
});
