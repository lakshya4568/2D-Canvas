/**
 * Three defects the draftsman reported, each proved by its symptom.
 *
 *   "for a line there is only length and not width and height"
 *   "I keep L2 to L1 193 mm apart, yet they still come close ... it shouldn't
 *    destroy the geometry"
 *   "I can't change a line length manually"
 *
 * The first two are kernel defects and are tested here. The third is a panel
 * that rendered a number instead of a field, and is tested by the same maths
 * these rely on: a length typed must lengthen along the direction the line has.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { regenerate, namesOf, startAuthoring, addConstraint } from "../../lib/upce/document";
import { suggestCompletion } from "../../lib/upce/completion";
import { measurablesIn, relateCentroids, shapesAtRisk, holdShapes } from "../../lib/upce/link";
import { shapeFreedomOf } from "../../lib/upce/dof";
import { findProfiles } from "../../lib/upce/profile";
import type { AuthoringSketch } from "../../lib/upce/types";

function run(shapes: Shape[], sketch: AuthoringSketch, why: string) {
  const r = regenerate(shapes, sketch, { shapeNames: namesOf(shapes) });
  if (r.rejection) throw new Error(`${why}: ${r.rejection}`);
  return r;
}

/** A quadrilateral from four loose lines — not a rectangle primitive. */
function looseQuad(x: number, y: number, w: number, h: number, id: string): Shape[] {
  const c = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  return c.map((_, i) => {
    const a = c[i];
    const b = c[(i + 1) % 4];
    return {
      id: `${id}_${i}`,
      name: `${id}_${i}`,
      type: "line",
      x1: a[0],
      y1: a[1],
      x2: b[0],
      y2: b[1],
    } as Shape;
  });
}

// ---------------------------------------------------------------------------
// A line has a length, not a width and a height
// ---------------------------------------------------------------------------

describe("A line is measured as a line", () => {
  const line: Shape[] = [
    { id: "L1", name: "L1", type: "line", x1: 0, y1: 0, x2: 300, y2: 400 } as Shape,
  ];

  it("offers its length and its two ends, never a width or a height", () => {
    const sketch = startAuthoring(line).sketch;
    const m = measurablesIn(sketch, ["L1"], namesOf(line));
    const labels = m.map((x) => x.label);

    // 3-4-5: the length is 500, not the 300 and 400 of its bounding box.
    const length = m.find((x) => x.kind === "distance");
    expect(length).toBeDefined();
    expect(length!.value).toBeCloseTo(500, 6);
    expect(length!.label).toBe("L1 length");

    expect(labels.some((l) => /width|height/i.test(l))).toBe(false);

    // Notebook page 8: both ends, both axes, each drivable on its own.
    for (const want of ["L1 start X", "L1 start Y", "L1 end X", "L1 end Y"]) {
      expect(labels).toContain(want);
    }
    expect(m.find((x) => x.label === "L1 end X")!.value).toBeCloseTo(300, 6);
    expect(m.find((x) => x.label === "L1 end Y")!.value).toBeCloseTo(400, 6);
  });

  it("asks about its length, not its size on each axis", () => {
    const sketch = startAuthoring(line).sketch;
    const report = suggestCompletion(sketch, namesOf(line));
    const titles = report.groups.flatMap((g) => g.options).map((o) => o.title);

    expect(titles).toContain("Name L1's length and drive it");
    expect(titles.some((t) => /L1's width|L1's height/.test(t))).toBe(false);
  });

  it("drives a length without turning the line", () => {
    let sketch = startAuthoring(line).sketch;
    const m = measurablesIn(sketch, ["L1"], namesOf(line));
    const length = m.find((x) => x.kind === "distance")!;

    sketch = addConstraint(sketch, {
      kind: "distance",
      points: [...length.points],
      segments: [],
      value: 1000,
      strength: "hard",
      driving: true,
      state: "active",
      label: "L1 length",
      provenance: { origin: "user", detail: "test", createdAt: Date.now() },
    });

    const r = run(line, sketch, "double the length");
    const out = r.shapes[0] as unknown as Record<string, number>;
    expect(Math.hypot(out.x2 - out.x1, out.y2 - out.y1)).toBeCloseTo(1000, 3);
    // Still 3-4-5, so the direction survived: 53.13 degrees.
    const angle = (Math.atan2(out.y2 - out.y1, out.x2 - out.x1) * 180) / Math.PI;
    expect(angle).toBeCloseTo(53.13010235, 4);
  });

  it("holds an absolute position when one is named", () => {
    let sketch = startAuthoring(line).sketch;
    sketch = addConstraint(sketch, {
      kind: "position_x",
      points: ["L1:v0"],
      segments: [],
      value: 250,
      strength: "hard",
      driving: true,
      state: "active",
      label: "L1 start X",
      provenance: { origin: "user", detail: "test", createdAt: Date.now() },
    });
    sketch = addConstraint(sketch, {
      kind: "position_y",
      points: ["L1:v0"],
      segments: [],
      value: -80,
      strength: "hard",
      driving: true,
      state: "active",
      label: "L1 start Y",
      provenance: { origin: "user", detail: "test", createdAt: Date.now() },
    });

    const r = run(line, sketch, "place the start");
    const out = r.shapes[0] as unknown as Record<string, number>;
    expect(out.x1).toBeCloseTo(250, 6);
    expect(out.y1).toBeCloseTo(-80, 6);
  });
});

// ---------------------------------------------------------------------------
// A positional rule must not be allowed to quietly destroy a shape
// ---------------------------------------------------------------------------

describe("Shape integrity is checked before a positional rule is made", () => {
  const scene = () => [...looseQuad(0, 0, 400, 300, "A"), ...looseQuad(900, 0, 400, 300, "B")];

  it("reports a loose quadrilateral as able to change shape", () => {
    const shapes = scene();
    const sketch = startAuthoring(shapes).sketch;
    const profiles = findProfiles(sketch, namesOf(shapes));
    expect(profiles).toHaveLength(2);

    for (const p of profiles) {
      const f = shapeFreedomOf(sketch, p);
      // Eight coordinates, four welds already counted in the point set, nothing
      // holding the corners square: five freedoms beyond the rigid-body three.
      expect(f.internal).toBeGreaterThan(0);
      expect(f.rigid).toBe(false);
    }
  });

  it("warns when centres are tied and the shapes can still deform", () => {
    const shapes = scene();
    const sketch = startAuthoring(shapes).sketch;
    const names = namesOf(shapes);
    const profiles = findProfiles(sketch, names);
    const loops = profiles.map((p) => p.pointIds);

    const { warning, atRisk, refused } = relateCentroids(
      sketch,
      loops[0],
      loops[1],
      profiles[0].label,
      profiles[1].label,
      undefined,
      names
    );
    expect(refused).toBeUndefined();
    expect(warning).toMatch(/can still change shape/);
    expect(atRisk && atRisk.length).toBeGreaterThan(0);
  });

  it("goes quiet once the shapes are held", () => {
    const shapes = scene();
    let sketch = startAuthoring(shapes).sketch;
    const names = namesOf(shapes);

    const ids = shapes.map((s) => s.id);
    expect(shapesAtRisk(sketch, ids, names)).toHaveLength(2);

    const held = holdShapes(sketch, shapes, ids, names);
    sketch = held.sketch;
    expect(held.held).toHaveLength(2);
    expect(shapesAtRisk(sketch, ids, names)).toHaveLength(0);
  });

  it("moves the shapes instead of squashing them once held", () => {
    const shapes = scene();
    let sketch = startAuthoring(shapes).sketch;
    const names = namesOf(shapes);

    sketch = holdShapes(sketch, shapes, shapes.map((s) => s.id), names).sketch;
    const profiles = findProfiles(sketch, names);
    const rel = relateCentroids(
      sketch,
      profiles[0].pointIds,
      profiles[1].pointIds,
      profiles[0].label,
      profiles[1].label,
      "Centres",
      names
    );
    expect(rel.refused).toBeUndefined();
    expect(rel.warning).toBeUndefined();
    sketch = rel.sketch;

    const before = run(shapes, sketch, "baseline");
    const sideOf = (list: Shape[], id: string) => {
      const s = list.find((x) => x.id === id) as unknown as Record<string, number>;
      return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    };
    const sidesBefore = ["A_0", "A_1", "B_0", "B_1"].map((id) => sideOf(before.shapes, id));

    // Close the centres by 400 — the move that produced trapezoids.
    const closed: AuthoringSketch = {
      ...before.sketch,
      parameters: {
        ...before.sketch.parameters,
        Centres: { ...before.sketch.parameters.Centres, value: 500 },
      },
    };
    const after = run(before.shapes, closed, "close the centres");
    const sidesAfter = ["A_0", "A_1", "B_0", "B_1"].map((id) => sideOf(after.shapes, id));

    // Every side is the length it was. The shapes moved; they did not deform.
    sidesAfter.forEach((len, i) => expect(len).toBeCloseTo(sidesBefore[i], 6));
  });
});
