/**
 * Dragging is the other direction through the same kernel.
 *
 * Every authoring panel changes intent and lets the geometry follow. The canvas
 * does the reverse: it writes coordinates and the model has to catch up. These
 * tests cover that direction, because two user-visible bugs lived in the gap —
 * constraint glyphs stranded at a shape's old position, and a `fix` rule that a
 * drag could walk straight through.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { regenerate, namesOf, addConstraint, startAuthoring } from "../../lib/upce/document";
import type { SketchConstraint } from "../../lib/upce/types";
import { nestedRectangles } from "./fixtures";

/** 0.05 mm — the engine's own working accuracy, not a tighter invention. */
const MM = 1;

function moveShape(shapes: Shape[], id: string, dx: number, dy: number): Shape[] {
  return shapes.map((s) =>
    s.id === id ? ({ ...s, x: (s as any).x + dx, y: (s as any).y + dy } as Shape) : s
  );
}

function dimension(id: string, a: string, b: string, value: number): SketchConstraint {
  return {
    id,
    kind: "distance",
    points: [a, b],
    segments: [],
    value,
    strength: "hard",
    driving: true,
    state: "active",
    label: `${id} = ${value}`,
    provenance: { origin: "user", detail: "test", createdAt: 0 },
  };
}

function pin(pointId: string, x: number, y: number): SketchConstraint {
  return {
    id: `fix_${pointId}`,
    kind: "fix",
    points: [pointId],
    segments: [],
    value: x,
    valueY: y,
    strength: "hard",
    driving: true,
    state: "active",
    label: "pinned to the sheet",
    provenance: { origin: "user", detail: "test", createdAt: 0 },
  };
}

describe("geometry-first regeneration", () => {
  it("carries a free move into the sketch, so glyph anchors follow the shape", () => {
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const { sketch } = startAuthoring(shapes);

    const before = sketch.points["R2:v0"];
    expect(before).toBeDefined();

    const moved = moveShape(shapes, "R2", 250, 120);
    const result = regenerate(moved, sketch, { shapeNames: names, source: "geometry" });

    expect(result.rejection).toBeUndefined();
    // The sketch point — which is where the constraint glyph is drawn — has
    // travelled with the rectangle rather than staying behind.
    expect(result.sketch.points["R2:v0"].x).toBeCloseTo(before.x + 250, 0);
    expect(result.sketch.points["R2:v0"].y).toBeCloseTo(before.y + 120, 0);
    // Nothing held it, so nothing was pulled back.
    expect(result.movedShapeIds).not.toContain("R2");
  });

  it("does NOT carry the move when the caller is changing intent", () => {
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const { sketch } = startAuthoring(shapes);
    const before = sketch.points["R2:v0"];

    const moved = moveShape(shapes, "R2", 250, 120);
    const result = regenerate(moved, sketch, { shapeNames: names });

    // Default direction: the last solve is the truth and the drag is discarded.
    expect(result.sketch.points["R2:v0"].x).toBeCloseTo(before.x, 0);
  });

  it("pulls the pinned corner back to its pin and names the shape as held", () => {
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const started = startAuthoring(shapes).sketch;

    const anchor = started.points["R2:v0"];
    const pinned = addConstraint(started, pin("R2:v0", anchor.x, anchor.y), "pin_R2");

    const moved = moveShape(shapes, "R2", 400, 0);
    const result = regenerate(moved, pinned, { shapeNames: names, source: "geometry" });

    expect(result.rejection).toBeUndefined();
    // The pin won at the corner it holds.
    expect(result.sketch.points["R2:v0"].x).toBeCloseTo(anchor.x, 0);
    expect(result.sketch.points["R2:v0"].y).toBeCloseTo(anchor.y, 0);
    // And the UI is told which shape refused the move, so it can say why.
    expect(result.movedShapeIds).toContain("R2");
  });

  it("does not pretend one pin makes a shape rigid", () => {
    // "Pin to the sheet" fixes ONE corner. That removes the two translational
    // motions (§18) and nothing else: with no length constrained, the far edge
    // is still free, so a drag stretches the rectangle instead of moving it.
    // The kernel must behave that way rather than quietly freezing the shape,
    // or the DOF report would be lying about what is left free.
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const started = startAuthoring(shapes).sketch;
    const anchor = started.points["R2:v0"];
    const pinned = addConstraint(started, pin("R2:v0", anchor.x, anchor.y), "pin_R2");

    const moved = moveShape(shapes, "R2", 400, 250);
    const result = regenerate(moved, pinned, { shapeNames: names, source: "geometry" });
    const solved = result.shapes.find((s) => s.id === "R2") as any;

    expect(solved.width).toBeGreaterThan(3400 + MM);
  });

  it("is rigid once the pin is joined by both dimensions and a level edge", () => {
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const started = startAuthoring(shapes).sketch;
    const anchor = started.points["R2:v0"];

    let sketch = addConstraint(started, pin("R2:v0", anchor.x, anchor.y), "pin_R2");
    sketch = addConstraint(sketch, dimension("wR2", "R2:v0", "R2:v1", 3400), "wR2");
    sketch = addConstraint(sketch, dimension("hR2", "R2:v0", "R2:v3", 1800), "hR2");
    // Without this the rectangle is still free to spin about the pinned corner:
    // a pin plus two lengths leaves rotation, which is exactly why the DOF
    // report keeps asking for one more answer after a shape "looks" fixed.
    sketch = addConstraint(
      sketch,
      {
        // id is assigned by addConstraint
        kind: "horizontal",
        points: [],
        segments: ["R2:e0"],
        value: 0,
        strength: "hard",
        driving: true,
        state: "active",
        label: "bottom edge is level",
        provenance: { origin: "user", detail: "test", createdAt: 0 },
      },
      "levelR2"
    );

    const moved = moveShape(shapes, "R2", 400, 250);
    const result = regenerate(moved, sketch, { shapeNames: names, source: "geometry" });
    const solved = result.shapes.find((s) => s.id === "R2") as any;

    expect(result.rejection).toBeUndefined();
    expect(solved.x).toBeCloseTo(300, 0);
    expect(solved.y).toBeCloseTo(300, 0);
    expect(solved.width).toBeCloseTo(3400, 0);
    expect(solved.height).toBeCloseTo(1800, 0);
    expect(result.movedShapeIds).toContain("R2");
  });

  it("reports the move when a dimension holds an edge at its parameter value", () => {
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const started = startAuthoring(shapes).sketch;

    // Stretch the opening 500 mm wider than any rule allows it to be.
    const widened = shapes.map((s) =>
      s.id === "R2" ? ({ ...s, width: (s as any).width + 500 } as Shape) : s
    );

    const anchor = started.points["R2:v0"];
    let sketch = addConstraint(started, pin("R2:v0", anchor.x, anchor.y), "pin_R2");
    sketch = addConstraint(sketch, dimension("wR2", "R2:v0", "R2:v1", 3400), "wR2");

    const result = regenerate(widened, sketch, { shapeNames: names, source: "geometry" });
    expect(result.rejection).toBeUndefined();
    const solved = result.shapes.find((s) => s.id === "R2") as any;
    expect(solved.width).toBeCloseTo(3400, 0);
    expect(result.movedShapeIds).toContain("R2");
  });

  it("walks a pinned corner home from a long drag instead of stalling", () => {
    // The direct solve has to swallow the whole displacement in one bound, and
    // past about 150 mm it lands in a local minimum: a rectangle badly out of
    // square, which then refuses to lift back onto a rectangle primitive, so the
    // drawing and the sketch quietly disagree. Staging the anchor through the
    // homotopy is what stops that, and this is the range it has to hold over.
    const shapes = nestedRectangles();
    const names = namesOf(shapes);
    const started = startAuthoring(shapes).sketch;
    const anchor = started.points["R1:v0"];
    const sketch = addConstraint(started, pin("R1:v0", anchor.x, anchor.y), "pin_R1");

    for (const distance of [10, 50, 100, 200, 300, 600, 1200]) {
      const moved = moveShape(shapes, "R1", distance, distance / 2);
      const result = regenerate(moved, sketch, { shapeNames: names, source: "geometry" });

      expect(result.rejection).toBeUndefined();
      expect(result.converged, `drag of ${distance} did not converge`).toBe(true);
      expect(result.sketch.points["R1:v0"].x).toBeCloseTo(anchor.x, 0);
      expect(result.sketch.points["R1:v0"].y).toBeCloseTo(anchor.y, 0);

      // Opposite sides stay equal, so the shape is still a rectangle and the
      // result can actually be written back to the drawing.
      const c = [0, 1, 2, 3].map((i) => result.sketch.points[`R1:v${i}`]);
      const top = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
      const bottom = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y);
      expect(Math.abs(top - bottom), `drag of ${distance} bent the rectangle`).toBeLessThan(MM);
      // ...and the drawing agrees with the sketch rather than being left behind.
      const solved = result.shapes.find((sh) => sh.id === "R1") as any;
      expect(solved.width).toBeCloseTo(top, 0);
    }
  });
});
