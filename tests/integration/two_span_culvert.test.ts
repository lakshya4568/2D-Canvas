/**
 * Two-span box culvert with unequal bays, expanded generically.
 *
 * The previous version drove `ParametricModel.syncModel` and read results back
 * by entity id — `two_span_outer`, `b1_right`, `b2_haunch_tr` — which only ever
 * worked because a switch statement in the model named those exact strings.
 * UPCE-ADDENDUM-2.0 forbids that, so the same engineering facts are asserted
 * through the procedural expander, which has never heard of a culvert.
 *
 * The unequal bays are the interesting part. A repeat rule with one span cannot
 * express them, and real structures have them constantly, so the expander takes
 * a per-cell span list; the pitch is then per-gap rather than a single number.
 */

import { describe, it, expect } from "vitest";
import { expandMultiCell } from "../../lib/parametric/component/repeatExpander";
import { solveLevenbergMarquardt } from "../../lib/solver/levenbergMarquardt";

const BASE = {
  count: 2,
  clearSpan: 250,
  clearHeight: 200,
  wallThickness: 30, // exterior
  midWallThickness: 40, // dividing web
  slabThickness: 30,
  haunchSize: 35,
};

function solved(bay1: number, bay2: number) {
  const m = expandMultiCell({ ...BASE, clearSpans: [bay1, bay2] });
  const r = solveLevenbergMarquardt(m.systemModel, m.state, { maxIterations: 300 });
  expect(r.converged).toBe(true);
  expect(r.maxResidual).toBeLessThan(1e-8);
  for (let i = 0; i < m.state.length; i++) m.state[i] = r.solution[i];
  return m;
}

describe("E2E Integration: Two-Span Box Culvert Anisotropic Expansion", () => {
  it("expands Bay 1 by +150, shifting Bay 2 rigidly and updating total width", () => {
    const initial = solved(250, 250);
    // 30 + 250 + 40 + 250 + 30
    expect(initial.calculateTotalWidth()).toBeCloseTo(600, 4);

    const expanded = solved(400, 250);
    // 30 + 400 + 40 + 250 + 30
    expect(expanded.calculateTotalWidth()).toBeCloseTo(750, 4);

    // The dividing web is still 40: it moved, it did not stretch.
    expect(expanded.getIntermediateWebThickness(0)).toBeCloseTo(40, 3);

    // Bay 2 kept its own span — the change belonged to Bay 1 alone.
    const bay2 = expanded.cells[1];
    const left = expanded.state[2 * bay2.pointIndices[7]];
    const right = expanded.state[2 * bay2.pointIndices[2]];
    expect(right - left).toBeCloseTo(250, 3);

    // And Bay 2's haunches are untouched: 35 mm legs, 45 degrees. They are the
    // second group of four, because the measurements come back cell by cell.
    for (const h of expanded.getAllHaunches().slice(4, 8)) {
      expect(h.legHorizontal).toBeCloseTo(35, 3);
      expect(h.legVertical).toBeCloseTo(35, 3);
      expect(h.angleDeg).toBeCloseTo(45, 3);
    }

    // External walls unchanged on both ends.
    expect(expanded.getExternalWallThickness("left")).toBeCloseTo(30, 3);
    expect(expanded.getExternalWallThickness("right")).toBeCloseTo(30, 3);
  });

  it("leaves the height alone when a bay widens", () => {
    const before = solved(250, 250);
    const after = solved(400, 250);
    // Anisotropic by construction: there is no scale factor anywhere in the path.
    expect(after.totalHeight).toBeCloseTo(before.totalHeight, 6);
    expect(after.totalHeight).toBeCloseTo(200 + 2 * 30, 6);
  });

  it("keeps all eight haunches at 45 degrees across both bays", () => {
    const m = solved(400, 250);
    const haunches = m.getAllHaunches();
    expect(haunches).toHaveLength(8);
    for (const h of haunches) {
      expect(h.legHorizontal).toBeCloseTo(35, 3);
      expect(h.angleDeg).toBeCloseTo(45, 3);
    }
  });
});
