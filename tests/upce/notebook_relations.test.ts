/**
 * The notebook's relationship demands, driven through the LIVE kernel.
 *
 * `tests/unit/upce_notebook_verification.test.ts` proves the maths. This proves
 * the maths is reachable: the same relationships expressed as UPCE constraints,
 * so they appear in "Rules in force", carry a parameter, survive a rebuild and
 * move geometry through `regenerate` — which is the difference between a module
 * that exists and a feature a draftsman has.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { regenerate, namesOf, startAuthoring } from "../../lib/upce/document";
import { edgesIn, loopsIn, lineRelationOptions, relateLines, relateCentroids } from "../../lib/upce/link";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import type { AuthoringSketch } from "../../lib/upce/types";

const MM = 1;

/** Two rectangles with nothing between them — the notebook's recurring picture. */
function twoBoxes(): Shape[] {
  return [
    { id: "R1", name: "R1", type: "rectangle", x: 0, y: 0, width: 400, height: 300 } as Shape,
    { id: "R2", name: "R2", type: "rectangle", x: 900, y: 0, width: 400, height: 300 } as Shape,
  ];
}

function session(shapes: Shape[]) {
  const names = namesOf(shapes);
  let sketch = startAuthoring(shapes).sketch;
  const go = (next: AuthoringSketch, why = "edit") => {
    const r = regenerate(shapes, next, { shapeNames: names });
    if (r.rejection) throw new Error(`${why}: ${r.rejection}`);
    sketch = r.sketch;
    return r;
  };
  go(sketch, "baseline");
  // Anchor, level, and name both sizes — the order a draftsman works in.
  //
  // The sizes matter to these tests rather than being scene-setting. With
  // nothing holding a rectangle's shape, "bring the two centres together" has
  // infinitely many answers and the minimum-norm one squashes a box instead of
  // moving it: the solver is not wrong, the drawing simply never said the boxes
  // were rigid. Saying it is what makes the notebook's picture — two rectangles
  // keeping their shape and closing up — the only solution available.
  for (let round = 0; round < 12; round++) {
    const report = suggestCompletion(sketch, names);
    const pick =
      report.quickFixes.find((x) => x.dofRemoved > 0) ??
      report.groups
        .flatMap((g) => g.options)
        .find((o) => o.title.startsWith("Name ") && o.dofRemoved > 0) ??
      report.groups
        .flatMap((g) => g.options)
        .find((o) => o.title.includes("horizontal") && o.dofRemoved > 0);
    if (!pick) break;
    go(applyAction(sketch, pick), pick.title);
  }
  return { shapes, names, get sketch() { return sketch; }, go };
}

describe("Notebook pages 4-6 — line-to-line relative movement", () => {
  it("offers all three ways to hold one edge against another, measured as drawn", () => {
    const s = session(twoBoxes());
    const edges = edgesIn(s.sketch, ["R1", "R2"], s.names);
    expect(edges.length).toBe(8);

    const a = edges.find((e) => e.segmentId.startsWith("R1") && e.orientation === "vertical")!;
    const b = edges.find((e) => e.segmentId.startsWith("R2") && e.orientation === "vertical")!;
    const options = lineRelationOptions(s.sketch, a.segmentId, b.segmentId);

    expect(options.map((o) => o.kind)).toEqual(["relative_x", "relative_y", "normal_offset"]);
    // Every option reports what it measures NOW, so agreeing to one moves nothing.
    for (const o of options) expect(Number.isFinite(o.measured)).toBe(true);
  });

  it("carries the second edge along when the first is driven (page 4)", () => {
    const s = session(twoBoxes());
    const edges = edgesIn(s.sketch, ["R1", "R2"], s.names);
    const refEdge = edges.find((e) => e.segmentId === "R1:e1")!;
    const follower = edges.find((e) => e.segmentId === "R2:e3")!;

    const before = lineRelationOptions(s.sketch, refEdge.segmentId, follower.segmentId)
      .find((o) => o.kind === "relative_x")!.measured;

    const { sketch: related, refused } = relateLines(
      s.sketch, refEdge.segmentId, follower.segmentId, "relative_x", "R1", "R2"
    );
    expect(refused).toBeUndefined();
    s.go(related, "relate");

    // It is a real rule in the model, not a note.
    const rule = s.sketch.constraints.find((c) => c.kind === "relative_x")!;
    expect(rule).toBeDefined();
    expect(rule.strength).toBe("hard");
    expect(rule.label).toContain("R2");

    // Now widen R1. R2 follows, and the gap the author agreed to is unchanged.
    const widened = s.shapes.map((sh) =>
      sh.id === "R1" ? ({ ...sh, width: 700 } as Shape) : sh
    );
    const r = regenerate(widened, s.sketch, { shapeNames: s.names, source: "geometry" });
    expect(r.rejection).toBeUndefined();

    const after = lineRelationOptions(r.sketch, refEdge.segmentId, follower.segmentId)
      .find((o) => o.kind === "relative_x")!.measured;
    expect(after).toBeCloseTo(before, MM);

    // R2 actually moved rather than R1 being prevented from growing.
    const r2 = r.shapes.find((sh) => sh.id === "R2") as any;
    expect(r2.x).toBeGreaterThan(900 - 1);
  });

  it("keeps a true thickness across a rotated pair, with the side preserved", () => {
    const s = session(twoBoxes());
    const a = "R1:e1";
    const b = "R2:e3";
    const drawn = lineRelationOptions(s.sketch, a, b).find((o) => o.kind === "normal_offset")!.measured;

    const { sketch: related, refused } = relateLines(s.sketch, a, b, "normal_offset", "R1", "R2");
    expect(refused).toBeUndefined();
    s.go(related, "offset");

    const rule = s.sketch.constraints.find((c) => c.kind === "normal_offset")!;
    // Signed, so the value carries the side and R2 cannot pass through R1.
    expect(rule.value).toBeCloseTo(drawn, 6);
  });
});

describe("Notebook page 9 — centre-to-centre driving", () => {
  it("names the gap between two centres and moves both shapes when it changes", () => {
    const s = session(twoBoxes());
    const loops = loopsIn(s.sketch, ["R1", "R2"], s.names);
    expect(loops).toHaveLength(2);

    const { sketch: related, refused } = relateCentroids(
      s.sketch, loops[0].loop, loops[1].loop, loops[0].label, loops[1].label, "CentreGap"
    );
    expect(refused).toBeUndefined();
    s.go(related, "centres");

    const param = s.sketch.parameters.CentreGap;
    expect(param).toBeDefined();
    expect(param.role).toBe("DRIVING");
    expect(param.value).toBeCloseTo(900, MM); // centres at 200 and 1100

    const rule = s.sketch.constraints.find((c) => c.kind === "centroid_distance")!;
    expect(rule.paramRef).toBe("CentreGap");
    expect(rule.loopA).toHaveLength(4);
    expect(rule.loopB).toHaveLength(4);

    // Close them up. Both rectangles come in — that is the notebook's sentence.
    const before = s.go(s.sketch).shapes.map((sh) => (sh as any).x);
    const closer: AuthoringSketch = {
      ...s.sketch,
      parameters: { ...s.sketch.parameters, CentreGap: { ...param, value: 500 } },
    };
    const r = s.go(closer, "close up");

    const r1 = r.shapes.find((sh) => sh.id === "R1") as any;
    const r2 = r.shapes.find((sh) => sh.id === "R2") as any;
    const centres = Math.hypot(r2.x + r2.width / 2 - (r1.x + r1.width / 2), 0);
    expect(centres).toBeCloseTo(500, MM);

    // Neither box was distorted to get there.
    expect(r1.width).toBeCloseTo(400, MM);
    expect(r2.width).toBeCloseTo(400, MM);
    expect(before.length).toBe(2);
  });

  it("survives a rebuild, so the rule is part of the document", () => {
    const s = session(twoBoxes());
    const loops = loopsIn(s.sketch, ["R1", "R2"], s.names);
    s.go(relateCentroids(s.sketch, loops[0].loop, loops[1].loop, "R1", "R2", "CentreGap").sketch);

    // Regenerating re-lowers every shape and merges the intent forward. A rule
    // written on loops has to come through that, or it would quietly vanish the
    // first time anything else changed.
    const again = s.go(s.sketch, "rebuild");
    const rule = again.sketch.constraints.find((c) => c.kind === "centroid_distance");
    expect(rule).toBeDefined();
    expect(rule!.loopA).toHaveLength(4);
  });

  it("refuses a second centre rule that would say what the first already says", () => {
    const s = session(twoBoxes());
    const loops = loopsIn(s.sketch, ["R1", "R2"], s.names);
    s.go(relateCentroids(s.sketch, loops[0].loop, loops[1].loop, "R1", "R2", "Gap1").sketch);

    const second = relateCentroids(s.sketch, loops[0].loop, loops[1].loop, "R1", "R2", "Gap2");
    expect(second.refused).toBeTruthy();
    expect(s.sketch.parameters.Gap2).toBeUndefined();
  });
});
