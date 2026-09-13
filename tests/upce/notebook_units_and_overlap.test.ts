/**
 * The notebook's remaining three demands, driven through the LIVE kernel.
 *
 *   pages 3 and 5  "consider a closed structure as a single unit", "whether its
 *                   a line, rect, triangle or anything ... group it, treat as
 *                   single component"
 *   pages 1 and 2  "cell pitch or unit pitch ... wall thickness should be
 *                   maintained at exact b/w the two cells on increasing"
 *   page 7         "they will start to overlap ... green shaded needs to be cut"
 *
 * Everything below goes through `regenerate`, not through the modules directly,
 * because the question these answer is not "does the maths work" — that is
 * settled elsewhere — but "does a draftsman get it".
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { regenerate, namesOf, startAuthoring, addConstraint } from "../../lib/upce/document";
import { createComponent, createRepeat, measureUnit } from "../../lib/upce/repeat";
import { setComponentRigid, rigidConflict, condensationFor } from "../../lib/upce/rigid";
import { detectOverlaps, fuseSketch, sketchRegions } from "../../lib/upce/fusion";
import { fuseRegions } from "../../lib/topology/booleanFusion";
import { buildSystem } from "../../lib/upce/residuals";
import type { AuthoringSketch } from "../../lib/upce/types";

function run(shapes: Shape[], sketch: AuthoringSketch, why: string) {
  const r = regenerate(shapes, sketch, { shapeNames: namesOf(shapes) });
  if (r.rejection) throw new Error(`${why}: ${r.rejection}`);
  return r;
}

// ---------------------------------------------------------------------------
// Pages 3 and 5 — a group is a body, not a label
// ---------------------------------------------------------------------------

/** A triangle drawn the way a draftsman draws one: three separate lines. */
function triangleAndDatum(): Shape[] {
  return [
    { id: "T1", name: "T1", type: "line", x1: 0, y1: 0, x2: 500, y2: 0 } as Shape,
    { id: "T2", name: "T2", type: "line", x1: 500, y1: 0, x2: 250, y2: 400 } as Shape,
    { id: "T3", name: "T3", type: "line", x1: 250, y1: 400, x2: 0, y2: 0 } as Shape,
    { id: "D", name: "Datum", type: "line", x1: -200, y1: -100, x2: -200, y2: 500 } as Shape,
  ];
}

function triangleSession(rigid: boolean, tether = true) {
  const shapes = triangleAndDatum();
  let sketch = startAuthoring(shapes).sketch;

  const { sketch: withComponent, component } = createComponent(
    sketch,
    shapes,
    ["T1", "T2", "T3"],
    "Triangle"
  );
  sketch = rigid ? setComponentRigid(withComponent, component.id, true) : withComponent;

  if (!tether) return { shapes, sketch };

  // The datum is held where it is, so the only thing that can move is the group.
  for (const [pid, x, y] of [
    ["D:v0", -200, -100],
    ["D:v1", -200, 500],
  ] as const) {
    sketch = addConstraint(sketch, {
      kind: "fix",
      points: [pid],
      segments: [],
      value: x,
      valueY: y,
      strength: "hard",
      driving: true,
      state: "active",
      label: `hold ${pid}`,
      provenance: { origin: "user", detail: "datum", createdAt: Date.now() },
    });
  }

  sketch = addConstraint(
    sketch,
    {
      kind: "distance_x",
      points: ["D:v0", "T1:v0"],
      segments: [],
      value: 200,
      strength: "hard",
      driving: true,
      state: "active",
      label: "triangle sits 200 from the datum",
      provenance: { origin: "user", detail: "notebook page 4", createdAt: Date.now() },
    },
    "offset"
  );

  return { shapes, sketch };
}

function triangleFrom(shapes: Shape[]) {
  const by = new Map(shapes.map((s) => [s.id, s as unknown as Record<string, number>]));
  const p = (id: string, k: "1" | "2") => ({ x: by.get(id)![`x${k}`], y: by.get(id)![`y${k}`] });
  const a = p("T1", "1");
  const b = p("T1", "2");
  const c = p("T2", "2");
  const side = (u: { x: number; y: number }, v: { x: number; y: number }) =>
    Math.hypot(v.x - u.x, v.y - u.y);
  return { a, b, c, ab: side(a, b), bc: side(b, c), ca: side(c, a) };
}

describe("Notebook pages 3 and 5 — grouping makes a body, on any geometry", () => {
  it("translates the whole triangle when one of its edges is driven", () => {
    const { shapes, sketch } = triangleSession(true);
    const before = run(shapes, sketch, "baseline");
    const t0 = triangleFrom(before.shapes);

    const moved = {
      ...before.sketch,
      constraints: before.sketch.constraints.map((c) =>
        c.id === "offset" ? { ...c, value: 500 } : c
      ),
    };
    const after = run(before.shapes, moved, "drive the offset to 500");
    const t1 = triangleFrom(after.shapes);

    // Every vertex moved by the same +300, which is what "rigid" means. The
    // agreement is asserted in microns, not to a decimal place: one dimension
    // and nothing else leaves the body's rotation free, so what is being
    // claimed is that the freedom was not taken up — to a thousandth of a
    // millimetre, three orders below the weld tolerance.
    const MICRON = 1e-3;
    for (const dx of [t1.a.x - t0.a.x, t1.b.x - t0.b.x, t1.c.x - t0.c.x]) {
      expect(Math.abs(dx - 300)).toBeLessThan(MICRON);
    }
    for (const dy of [t1.a.y - t0.a.y, t1.b.y - t0.b.y, t1.c.y - t0.c.y]) {
      expect(Math.abs(dy)).toBeLessThan(MICRON);
    }

    // Said directly: the base is still horizontal.
    expect(Math.atan2(t1.b.y - t1.a.y, t1.b.x - t1.a.x)).toBeCloseTo(0, 5);

    // And nothing inside it changed — to machine precision, not to a tolerance.
    expect(t1.ab).toBeCloseTo(t0.ab, 9);
    expect(t1.bc).toBeCloseTo(t0.bc, 9);
    expect(t1.ca).toBeCloseTo(t0.ca, 9);
    expect(t1.ab).toBeCloseTo(500, 9);
  });

  it("distorts without the flag, which is the failure the notebook describes", () => {
    const { shapes, sketch } = triangleSession(false);
    const before = run(shapes, sketch, "baseline");
    const t0 = triangleFrom(before.shapes);

    const moved = {
      ...before.sketch,
      constraints: before.sketch.constraints.map((c) =>
        c.id === "offset" ? { ...c, value: 500 } : c
      ),
    };
    const after = run(before.shapes, moved, "drive the offset to 500");
    const t1 = triangleFrom(after.shapes);

    // The constrained corner went; the rest of the loop stayed where it was, so
    // the triangle is a different triangle. "Grouping did not enforce rigidity."
    expect(t1.a.x - t0.a.x).toBeCloseTo(300, 3);
    expect(Math.abs(t1.b.x - t0.b.x)).toBeLessThan(1);
    expect(Math.abs(t1.ab - t0.ab)).toBeGreaterThan(100);
  });

  it("counts a grouped body as three freedoms, not two per corner", () => {
    const loose = run(...Object.values(triangleSession(false)) as [Shape[], AuthoringSketch], "loose");
    const rigid = run(...Object.values(triangleSession(true)) as [Shape[], AuthoringSketch], "rigid");
    // Three welded corners plus the datum's two ends: ten coordinates. Freezing
    // the triangle leaves the datum's four and one frame's three.
    expect(loose.dof.variables).toBe(10);
    expect(rigid.dof.variables).toBe(7);
    expect(rigid.dof.dof).toBeLessThan(loose.dof.dof);
  });

  it("still turns a body when the rules leave no other way", () => {
    // Rigidity is a restriction on HOW a body may move, not on whether it may
    // turn. A stiffness that made rotation impossible rather than merely
    // unattractive would break notebook page 5's other half — "move, increase
    // size or rotate ... applicable to the full closed structure".
    const shapes = [
      { id: "L", name: "Bar", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 } as Shape,
    ];
    let sketch = startAuthoring(shapes).sketch;
    const made = createComponent(sketch, shapes, ["L"], "Bar");
    sketch = setComponentRigid(made.sketch, made.component.id, true);

    sketch = addConstraint(sketch, {
      kind: "fix",
      points: ["L:v0"],
      segments: [],
      value: 0,
      valueY: 0,
      strength: "hard",
      driving: true,
      state: "active",
      label: "pin the near end",
      provenance: { origin: "user", detail: "test", createdAt: Date.now() },
    });
    sketch = addConstraint(sketch, {
      kind: "distance_y",
      points: ["L:v0", "L:v1"],
      segments: [],
      value: 50,
      strength: "hard",
      driving: true,
      state: "active",
      label: "far end rises 50",
      provenance: { origin: "user", detail: "test", createdAt: Date.now() },
    });

    const r = run(shapes, sketch, "tilt the bar");
    const bar = r.shapes.find((s) => s.id === "L") as unknown as Record<string, number>;
    // A 100 long bar with its far end 50 above its near end is at 30 degrees,
    // and it is still 100 long.
    expect(Math.hypot(bar.x2 - bar.x1, bar.y2 - bar.y1)).toBeCloseTo(100, 6);
    expect(bar.y2 - bar.y1).toBeCloseTo(50, 4);
    expect((Math.atan2(bar.y2 - bar.y1, bar.x2 - bar.x1) * 180) / Math.PI).toBeCloseTo(30, 3);
  });

  it("carries the whole group when one of its lines is dragged", () => {
    // The other half of pages 3 and 5. A rule pulling a body around is the
    // solver's business; a draftsman grabbing a line and sliding it never
    // reaches the solver at all — the canvas writes it straight into the
    // drawing. Without the group absorbing that edit, the line they grabbed
    // goes and the other two stay.
    // No rule positions this triangle, so what happens to it is entirely the
    // group's doing. (A tethered one is pulled straight back, correctly — that
    // is the rule working, not the group failing.)
    const { shapes, sketch } = triangleSession(true, false);
    const settled = run(shapes, sketch, "baseline");
    const t0 = triangleFrom(settled.shapes);

    // Drag T2 — one edge of three — 120 across and 40 up.
    const dragged = settled.shapes.map((s) =>
      s.id === "T2"
        ? ({ ...s, x1: (s as never as Record<string, number>).x1 + 120,
             y1: (s as never as Record<string, number>).y1 + 40,
             x2: (s as never as Record<string, number>).x2 + 120,
             y2: (s as never as Record<string, number>).y2 + 40 } as Shape)
        : s
    );

    const r = regenerate(dragged, settled.sketch, {
      shapeNames: namesOf(dragged),
      source: "geometry",
    });
    expect(r.rejection).toBeUndefined();
    const t1 = triangleFrom(r.shapes);

    // All three corners went with it, by the same amount.
    for (const [now, was] of [[t1.a, t0.a], [t1.b, t0.b], [t1.c, t0.c]] as const) {
      expect(now.x - was.x).toBeCloseTo(120, 3);
      expect(now.y - was.y).toBeCloseTo(40, 3);
    }
    // The triangle is the same triangle.
    expect(t1.ab).toBeCloseTo(t0.ab, 6);
    expect(t1.bc).toBeCloseTo(t0.bc, 6);
    expect(t1.ca).toBeCloseTo(t0.ca, 6);

    // And nothing is reported as "held by a rule": the group did what was asked.
    expect(r.heldShapeIds).toHaveLength(0);
  });

  it("turns the whole group when one of its lines is turned", () => {
    const { shapes, sketch } = triangleSession(true, false);
    const settled = run(shapes, sketch, "baseline");
    const t0 = triangleFrom(settled.shapes);

    // Swing T1 about its own first end by 90 degrees.
    const pivot = t0.a;
    const spun = settled.shapes.map((s) => {
      if (s.id !== "T1") return s;
      const g = s as never as Record<string, number>;
      const turn = (x: number, y: number) => ({
        x: pivot.x - (y - pivot.y),
        y: pivot.y + (x - pivot.x),
      });
      const a = turn(g.x1, g.y1);
      const b = turn(g.x2, g.y2);
      return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y } as Shape;
    });

    const r = regenerate(spun, settled.sketch, { shapeNames: namesOf(spun), source: "geometry" });
    expect(r.rejection).toBeUndefined();
    const t1 = triangleFrom(r.shapes);

    // Every side kept its length, and the whole body turned a quarter turn.
    expect(t1.ab).toBeCloseTo(t0.ab, 6);
    expect(t1.bc).toBeCloseTo(t0.bc, 6);
    expect(t1.ca).toBeCloseTo(t0.ca, 6);
    const turned = (p: { x: number; y: number }) => ({
      x: pivot.x - (p.y - pivot.y),
      y: pivot.y + (p.x - pivot.x),
    });
    expect(t1.c.x).toBeCloseTo(turned(t0.c).x, 3);
    expect(t1.c.y).toBeCloseTo(turned(t0.c).y, 3);
  });

  it("leaves a loose group alone when one of its lines is dragged", () => {
    const { shapes, sketch } = triangleSession(false, false);
    const settled = run(shapes, sketch, "baseline");
    const t0 = triangleFrom(settled.shapes);

    const dragged = settled.shapes.map((s) =>
      s.id === "T2"
        ? ({ ...s, x1: (s as never as Record<string, number>).x1 + 120,
             x2: (s as never as Record<string, number>).x2 + 120 } as Shape)
        : s
    );
    const r = regenerate(dragged, settled.sketch, {
      shapeNames: namesOf(dragged),
      source: "geometry",
    });
    const t1 = triangleFrom(r.shapes);
    // T1 did not move: without the flag, a group is still only a name.
    expect(t1.a.x).toBeCloseTo(t0.a.x, 6);
  });

  it("refuses two bodies that would both own the same corner", () => {
    const shapes = triangleAndDatum();
    let sketch = startAuthoring(shapes).sketch;
    const first = createComponent(sketch, shapes, ["T1", "T2"], "A");
    sketch = setComponentRigid(first.sketch, first.component.id, true);
    const second = createComponent(sketch, shapes, ["T2", "T3"], "B");

    const sys = buildSystem(second.sketch);
    const refusal = rigidConflict(second.sketch, sys.index, second.component);
    expect(refusal).toMatch(/share/);

    // And if a hand-edited template asked for it anyway, the solver degrades
    // rather than throwing: the first frame keeps the shared corners.
    const forced = setComponentRigid(second.sketch, second.component.id, true);
    expect(() => condensationFor(forced, buildSystem(forced))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pages 1 and 2 — the pitch is measured, not typed
// ---------------------------------------------------------------------------

/** A hollow unit: an outline with one opening. Not called a culvert anywhere. */
function hollowUnit(outerW: number, wall: number): Shape[] {
  const h = 260;
  return [
    { id: "OUT", name: "Outline", type: "rectangle", x: 0, y: 0, width: outerW, height: h } as Shape,
    {
      id: "VOID",
      name: "Opening",
      type: "rectangle",
      x: wall,
      y: wall,
      width: outerW - 2 * wall,
      height: h - 2 * wall,
    } as Shape,
  ];
}

function arrayed(shapes: Shape[], count: number, gap?: number) {
  let sketch = startAuthoring(shapes).sketch;
  const made = createComponent(sketch, shapes, ["OUT", "VOID"], "Unit");
  sketch = made.sketch;
  const { sketch: withRule } = createRepeat(sketch, {
    componentId: made.component.id,
    count,
    pitch: 0,
    gap,
    spacingMode: "gap",
    direction: { x: 1, y: 0 },
  });
  return withRule;
}

/** Material between copy i's opening and copy i+1's opening, measured on shapes. */
function webBetween(shapes: Shape[], i: number): number {
  const voidOf = (id: string) => {
    const s = shapes.find((sh) => sh.id === id) as unknown as { x: number; width: number };
    return { left: s.x, right: s.x + s.width };
  };
  const a = voidOf(i === 0 ? "VOID" : `${repeatIdOf(shapes)}#${i}:VOID`);
  const b = voidOf(`${repeatIdOf(shapes)}#${i + 1}:VOID`);
  return b.left - a.right;
}

function repeatIdOf(shapes: Shape[]): string {
  const generated = shapes.find((s) => s.id.includes("#"))!;
  return generated.id.split("#")[0];
}

describe("Notebook pages 1 and 2 — cell pitch, and the wall that must not move", () => {
  it("defaults the material between copies to the unit's own wall", () => {
    const shapes = hollowUnit(360, 30);
    const sketch = arrayed(shapes, 3);
    expect(sketch.parameters.UnitGap.value).toBeCloseTo(30, 6);

    const r = run(shapes, sketch, "expand to three");
    expect(r.repeatMeasurements).toHaveLength(1);
    const m = r.repeatMeasurements[0];
    expect(m.extent).toBeCloseTo(360, 6);
    expect(m.opening).toBeCloseTo(300, 6);
    expect(m.wall).toBeCloseTo(30, 6);
    // P_cell = S_clear + t_mid, with t_mid defaulting to t_ext.
    expect(m.pitch).toBeCloseTo(330, 6);

    expect(webBetween(r.shapes, 0)).toBeCloseTo(30, 6);
    expect(webBetween(r.shapes, 1)).toBeCloseTo(30, 6);
  });

  it("holds the stated gap exactly when it is changed (the 55 mm case)", () => {
    const shapes = hollowUnit(360, 30);
    let sketch = arrayed(shapes, 3);
    sketch = run(shapes, sketch, "baseline").sketch;

    sketch = {
      ...sketch,
      parameters: { ...sketch.parameters, UnitGap: { ...sketch.parameters.UnitGap, value: 55 } },
    };
    const r = run(shapes, sketch, "gap 55");

    expect(webBetween(r.shapes, 0)).toBeCloseTo(55, 4);
    expect(webBetween(r.shapes, 1)).toBeCloseTo(55, 4);
    // The unit itself did not change to make room. Its own wall is still 30.
    expect(r.repeatMeasurements[0].wall).toBeCloseTo(30, 4);
  });

  it("keeps the web when the unit is widened — the pitch follows the geometry", () => {
    const narrow = hollowUnit(360, 30);
    let sketch = arrayed(narrow, 3);
    const first = run(narrow, sketch, "baseline");
    expect(first.repeatMeasurements[0].pitch).toBeCloseTo(330, 6);
    sketch = first.sketch;

    // The author widens the unit. A pitch typed as 330 would now be wrong and
    // every copy would sit inside its neighbour; a measured one is not.
    const wide = hollowUnit(460, 30);
    const r = regenerate(wide, sketch, { shapeNames: namesOf(wide), source: "geometry" });
    expect(r.rejection).toBeUndefined();

    expect(r.repeatMeasurements[0].opening).toBeCloseTo(400, 4);
    expect(r.repeatMeasurements[0].pitch).toBeCloseTo(430, 4);
    expect(webBetween(r.shapes, 0)).toBeCloseTo(30, 3);
    expect(webBetween(r.shapes, 1)).toBeCloseTo(30, 3);
  });

  it("measures a solid unit by its outline, because it has no opening", () => {
    const shapes = [
      { id: "OUT", name: "Post", type: "rectangle", x: 0, y: 0, width: 120, height: 900 } as Shape,
    ];
    let sketch = startAuthoring(shapes).sketch;
    const made = createComponent(sketch, shapes, ["OUT"], "Post");
    sketch = made.sketch;
    const m = measureUnit(sketch, made.component, { x: 1, y: 0 });
    expect(m.extent).toBeCloseTo(120, 6);
    expect(m.opening).toBe(0);
    expect(m.wall).toBe(0);
    expect(m.pitchFor(1880)).toBeCloseTo(2000, 6);
  });
});

// ---------------------------------------------------------------------------
// Page 7 — solids that run into each other
// ---------------------------------------------------------------------------

describe("Notebook page 7 — overlap is seen, named, and can be fused", () => {
  function twoHollowUnits(secondX: number): Shape[] {
    const h = 260;
    const w = 360;
    const wall = 30;
    return [
      { id: "A", type: "rectangle", x: 0, y: 0, width: w, height: h } as Shape,
      { id: "Av", type: "rectangle", x: wall, y: wall, width: w - 2 * wall, height: h - 2 * wall } as Shape,
      { id: "B", type: "rectangle", x: secondX, y: 0, width: w, height: h } as Shape,
      {
        id: "Bv",
        type: "rectangle",
        x: secondX + wall,
        y: wall,
        width: w - 2 * wall,
        height: h - 2 * wall,
      } as Shape,
    ];
  }

  it("reads two hollow units as two solids with one void each", () => {
    const shapes = twoHollowUnits(400);
    const sketch = startAuthoring(shapes).sketch;
    const regions = sketchRegions(sketch);
    expect(regions).toHaveLength(2);
    for (const r of regions) {
      expect(r.holes).toHaveLength(1);
      expect(r.areaMm2).toBeCloseTo(360 * 260 - 300 * 200, 6);
    }
  });

  it("says nothing while they are apart", () => {
    const shapes = twoHollowUnits(400);
    const r = run(shapes, startAuthoring(shapes).sketch, "apart");
    expect(r.topology.overlaps).toHaveLength(0);
    expect(r.fusion).toBeNull();
  });

  it("names the pair and the depth once they cross (x' > x)", () => {
    const shapes = twoHollowUnits(340); // 20 mm of interpenetration
    const sketch = startAuthoring(shapes).sketch;
    const overlaps = detectOverlaps(sketch);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].depthMm).toBeCloseTo(20, 3);
    expect(overlaps[0].crossedCorners).toBeGreaterThan(0);

    // And it is reported, not refused: the edit stands.
    const r = run(shapes, sketch, "overlapping");
    expect(r.topology.overlaps).toHaveLength(1);
  });

  it("fuses them into one pour with both voids kept", () => {
    const shapes = twoHollowUnits(340);
    const r = run(shapes, startAuthoring(shapes).sketch, "overlapping");
    expect(r.fusion).not.toBeNull();
    expect(r.fusion!.solids).toBe(1);
    expect(r.fusion!.voids).toBe(2);
    // The overlap is counted once, so the net area is less than the two taken
    // separately by exactly the material they share.
    expect(r.fusion!.netAreaMm2).toBeLessThan(r.fusion!.grossAreaMm2);
    expect(r.fusion!.grossAreaMm2 - r.fusion!.netAreaMm2).toBeCloseTo(20 * 260, 3);
  });

  it("leaves the seam in when the author wants a joint, not a pour", () => {
    const shapes = twoHollowUnits(340);
    const started = startAuthoring(shapes).sketch;
    const jointed = { ...started, meta: { ...started.meta, mergeOverlaps: false } };
    const r = run(shapes, jointed, "overlapping, not merged");
    // Two pours, each measured in full — not the arrangement's three faces.
    expect(r.fusion!.merged).toBe(false);
    expect(r.fusion!.solids).toBe(2);
    expect(r.fusion!.netAreaMm2).toBeCloseTo(r.fusion!.grossAreaMm2, 6);
    expect(r.fusion!.webs).toHaveLength(0);
    expect(r.topology.overlaps).toHaveLength(1);
  });

  it("comes apart again when the pieces are dragged apart", () => {
    const shapes = twoHollowUnits(340);
    const first = run(shapes, startAuthoring(shapes).sketch, "overlapping");
    expect(first.topology.overlaps).toHaveLength(1);

    const apart = twoHollowUnits(500);
    const r = regenerate(apart, first.sketch, { shapeNames: namesOf(apart), source: "geometry" });
    expect(r.topology.overlaps).toHaveLength(0);
    expect(r.fusion).toBeNull();
  });

  it("welds only what is declared structural", () => {
    // The fusion engine's own contract, which its code did not keep: two solids
    // that are not both structural are still arranged — you want to see where
    // they cross — but the seam between them is not dissolved. Only the
    // shared-web collapse honoured this; the union itself welded regardless, so
    // an expansion joint came back as one monolithic face.
    const cell = (id: string, x: number, structural: boolean) => ({
      id,
      structural,
      outer: [
        { x, y: 0 },
        { x: x + 360, y: 0 },
        { x: x + 360, y: 260 },
        { x, y: 260 },
      ],
      holes: [
        [
          { x: x + 30, y: 30 },
          { x: x + 330, y: 30 },
          { x: x + 330, y: 230 },
          { x: x + 30, y: 230 },
        ],
      ],
    });

    const welded = fuseRegions([cell("A", 0, true), cell("B", 340, true)]);
    expect(welded.externalFaces).toHaveLength(1);
    expect(welded.voidFaces).toHaveLength(2);

    const jointed = fuseRegions([cell("A", 0, false), cell("B", 340, false)]);
    expect(jointed.externalFaces.length).toBeGreaterThan(1);
    expect(jointed.voidFaces).toHaveLength(2);
    // Both saw the same crossings; they disagree only about what to do with them.
    expect(jointed.solidFaces.length).toBe(welded.solidFaces.length);
  });

  it("agrees with the fusion engine about the merged area", () => {
    const shapes = twoHollowUnits(340);
    const sketch = startAuthoring(shapes).sketch;
    const summary = fuseSketch(sketch, { merge: true })!;
    const regions = sketchRegions(sketch);
    const separately = regions.reduce((s, r) => s + r.areaMm2, 0);
    expect(summary.grossAreaMm2).toBeCloseTo(separately, 6);
    expect(summary.netAreaMm2).toBeCloseTo(separately - 20 * 260, 3);
  });
});
