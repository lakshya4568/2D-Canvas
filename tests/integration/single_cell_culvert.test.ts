/**
 * Single-cell box culvert, expanded generically.
 *
 * This used to drive `ParametricModel.syncModel` and assert on entity ids —
 * `culvert_outer`, `culvert_haunch_tr`, `culvert_inner_top`. Those ids were not
 * incidental to the test; they were the mechanism. `syncModel` carried a switch
 * statement over exactly those strings, so the test proved the switch worked and
 * proved nothing about a culvert anyone drew.
 *
 * UPCE-ADDENDUM-2.0 forbids that switch, so the engineering facts have moved
 * onto a mechanism that does not know what a culvert is: give the expander a
 * clear span, a height, two thicknesses and a corner cut, and it lays out the
 * unit and hands the result to the solver. Every number below is the same number
 * the old test asserted.
 */

import { describe, it, expect } from "vitest";
import { expandMultiCell } from "../../lib/parametric/component/repeatExpander";
import { solveLevenbergMarquardt } from "../../lib/solver/levenbergMarquardt";
import { planHomotopy, haunchesIntact } from "../../lib/parametric/component/haunchPreserver";

const BASE = {
  count: 1,
  clearHeight: 200,
  wallThickness: 30,
  slabThickness: 30,
  haunchSize: 35,
};

function solved(clearSpan: number) {
  const m = expandMultiCell({ ...BASE, clearSpan });
  const r = solveLevenbergMarquardt(m.systemModel, m.state, { maxIterations: 300 });
  expect(r.converged).toBe(true);
  expect(r.maxResidual).toBeLessThan(1e-8);
  for (let i = 0; i < m.state.length; i++) m.state[i] = r.solution[i];
  return m;
}

describe("E2E Integration: Single-Cell Box Culvert Variational Sync", () => {
  it("expands the culvert from span 300 to 500, preserving wall thickness and haunches", () => {
    const initial = solved(300);
    expect(initial.calculateTotalWidth()).toBeCloseTo(360, 4); // 300 + 2*30

    const expanded = solved(500);
    expect(expanded.calculateTotalWidth()).toBeCloseTo(560, 4); // 500 + 2*30

    // Every haunch still cuts 35 mm off both legs, so each stays at 45 degrees.
    const haunches = expanded.getAllHaunches();
    expect(haunches).toHaveLength(4);
    for (const h of haunches) {
      expect(h.legHorizontal).toBeCloseTo(35, 3);
      expect(h.legVertical).toBeCloseTo(35, 3);
      expect(h.angleDeg).toBeCloseTo(45, 3);
    }

    // Roof length = 500 - 2*35.
    const cell = expanded.cells[0];
    const roofStart = expanded.state[2 * cell.pointIndices[5]];
    const roofEnd = expanded.state[2 * cell.pointIndices[4]];
    expect(Math.abs(roofEnd - roofStart)).toBeCloseTo(430, 3);

    // Wall thickness is unchanged on both sides — the span grew, the walls did not.
    expect(expanded.getExternalWallThickness("left")).toBeCloseTo(30, 3);
    expect(expanded.getExternalWallThickness("right")).toBeCloseTo(30, 3);
    expect(expanded.getSlabThickness("top")).toBeCloseTo(30, 3);
    expect(expanded.getSlabThickness("bottom")).toBeCloseTo(30, 3);
  });

  it("deforms anisotropically: the height is untouched by a span change", () => {
    const before = solved(300);
    const after = solved(500);
    // A conformal scale would have taken the height with it. Nothing here does.
    expect(after.totalHeight).toBeCloseTo(before.totalHeight, 6);
    expect(after.totalHeight).toBeCloseTo(200 + 2 * 30, 6);
  });

  it("keeps every haunch on its own side through a 400 mm span increase", () => {
    for (const span of planHomotopy(300, 700)) {
      const m = solved(span);
      expect(haunchesIntact(m.state, m.cells.flatMap((c) => c.haunches))).toBe(true);
    }
  });
});
