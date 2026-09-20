/**
 * The annotation layout engine: what counts as a clash, and how it is settled.
 *
 * The distinction the whole thing rests on is drafting practice, not geometry:
 * lines cross lines on every real drawing and that is fine; a line through a
 * WORD, or a word on a word, is not. These tests hold that line, and hold the
 * engine to moving the least it can.
 */

import { describe, it, expect } from "vitest";
import {
  boxGap,
  findClashes,
  inkOf,
  layoutAnnotations,
  overlapArea,
  textBox,
  translateInk,
  type Obstacle,
  type Placeable,
} from "@/lib/cad/layout";
import type { DrawPrim } from "@/lib/cad/drawList";

const text = (x: number, y: number, s: string, height = 100, extra: Partial<Extract<DrawPrim, { k: "text" }>> = {}): DrawPrim => ({
  k: "text",
  x,
  y,
  text: s,
  height,
  rotation: 0,
  align: "center",
  baseline: "middle",
  layerId: "text",
  ...extra,
});
const line = (x1: number, y1: number, x2: number, y2: number): DrawPrim => ({ k: "line", x1, y1, x2, y2, layerId: "outline" });

const obstacle = (id: string, prims: DrawPrim[], extra: Partial<Obstacle> = {}): Obstacle => ({ id, kind: "other", ink: inkOf(prims), weight: 1, ...extra });

/** A placeable that may stay put or step sideways by the given amounts. */
function movable(id: string, prims: DrawPrim[], offsets: number[], kind = "text"): Placeable<number> {
  const ink = inkOf(prims);
  return {
    id,
    kind,
    weight: 1,
    crossable: kind === "leader",
    options: [
      { ink, distance: 0, payload: 0 },
      ...offsets.map((d) => ({ ink: translateInk(ink, d, 0), distance: Math.abs(d), payload: d })),
    ],
  };
}

describe("what a piece of text occupies", () => {
  it("measures the words, where they are anchored", () => {
    const b = textBox(text(0, 0, "600") as Extract<DrawPrim, { k: "text" }>);
    // Three characters at 100 high, centred on the anchor.
    expect(b.maxX - b.minX).toBeCloseTo(3 * 100 * 0.6, 6);
    expect(b.maxY - b.minY).toBeCloseTo(100, 6);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 6);

    const left = textBox(text(0, 0, "600", 100, { align: "left", baseline: "bottom" }) as Extract<DrawPrim, { k: "text" }>);
    expect(left.minX).toBeCloseTo(0, 6);
    expect(left.maxY).toBeCloseTo(0, 6);
  });

  it("measures a rotated note by the paper it really covers", () => {
    const upright = textBox(text(0, 0, "WING WALL") as Extract<DrawPrim, { k: "text" }>);
    const turned = textBox(text(0, 0, "WING WALL", 100, { rotation: 90 }) as Extract<DrawPrim, { k: "text" }>);
    expect(turned.maxY - turned.minY).toBeCloseTo(upright.maxX - upright.minX, 6);
    expect(turned.maxX - turned.minX).toBeCloseTo(upright.maxY - upright.minY, 6);
  });

  it("keeps words and lines apart: one is a box, the other is a path", () => {
    const ink = inkOf([text(0, 0, "300"), line(0, 0, 1000, 0)]);
    expect(ink.texts).toHaveLength(1);
    expect(ink.segments).toEqual([0, 0, 1000, 0]);
  });
});

describe("what counts as a clash", () => {
  const gap = 50;

  it("two texts on the same paper", () => {
    const clashes = findClashes([movable("A", [text(0, 0, "2000")], [])], [obstacle("B", [text(30, 0, "2000")])], gap);
    expect(clashes.map((c) => c.kind)).toContain("overlap");
  });

  it("a line drawn through a word", () => {
    const clashes = findClashes([movable("Note", [text(0, 0, "HAUNCH")], [])], [obstacle("Wall", [line(-1000, 0, 1000, 0)])], gap);
    expect(clashes[0]?.kind).toBe("overlap");
  });

  it("lines crossing lines — which is ordinary drafting, not a fault", () => {
    const clashes = findClashes([movable("DimA", [line(0, -500, 0, 500)], [], "dimension")], [obstacle("DimB", [line(-500, 0, 500, 0)])], gap);
    expect(clashes).toEqual([]);
  });

  it("but two leaders crossing, which is", () => {
    const clashes = findClashes(
      [movable("L1", [line(0, -500, 0, 500)], [], "leader")],
      [obstacle("L2", [line(-500, 0, 500, 0)], { crossable: true })],
      gap
    );
    expect(clashes[0]?.kind).toBe("crossing");
  });

  it("text too close to read apart, even with clear water between", () => {
    const clashes = findClashes([movable("A", [text(0, 0, "AB")], [])], [obstacle("B", [text(0, 120, "CD")])], gap);
    expect(clashes[0]?.kind).toBe("close");
    expect(clashes[0].amount).toBeGreaterThan(0);
    expect(boxGap(textBox(text(0, 0, "AB") as never), textBox(text(0, 120, "CD") as never))).toBeLessThan(gap);
  });

  it("nothing to report when there is room", () => {
    expect(findClashes([movable("A", [text(0, 0, "AB")], [])], [obstacle("B", [text(0, 900, "CD")])], gap)).toEqual([]);
  });
});

describe("settling a crowded drawing", () => {
  const gap = 50;

  it("moves the label off what it was sitting on", () => {
    const item = movable("Note", [text(0, 0, "HAUNCH 200")], [-600, 600, -1200, 1200]);
    const wall = obstacle("Wall", [text(0, 0, "WALL 350")]);
    const r = layoutAnnotations([item], [wall], { gap });
    expect(r.moved).toEqual(["Note"]);
    expect(r.clashes).toEqual([]);
    expect(r.cost.after).toBeLessThan(r.cost.before);
  });

  it("takes the nearest clear place, not the furthest", () => {
    const item = movable("Note", [text(0, 0, "A NOTE")], [-600, 600, -1800, 1800]);
    const r = layoutAnnotations([item], [obstacle("X", [text(0, 0, "ON TOP")])], { gap });
    expect(Math.abs(r.chosen.get("Note")!.payload)).toBe(600);
  });

  it("leaves an annotation that is already clear exactly where the draftsman put it", () => {
    const item = movable("Note", [text(0, 0, "CLEAR")], [-600, 600]);
    const r = layoutAnnotations([item], [obstacle("Far", [text(0, 5000, "AWAY")])], { gap });
    expect(r.moved).toEqual([]);
    expect(r.chosen.get("Note")!.payload).toBe(0);
  });

  it("separates two labels that are on each other, moving both apart", () => {
    const a = movable("A", [text(0, 0, "AAAA")], [-500, 500]);
    const b = movable("B", [text(0, 0, "BBBB")], [-500, 500]);
    const r = layoutAnnotations([a, b], [], { gap });
    expect(r.clashes).toEqual([]);
    expect(r.chosen.get("A")!.payload).not.toBe(r.chosen.get("B")!.payload);
  });

  it("will not move a label into something else", () => {
    // Free to the left, blocked to the right.
    const item = movable("Note", [text(0, 0, "NOTE")], [-700, 700]);
    const r = layoutAnnotations([item], [obstacle("Here", [text(0, 0, "X")]), obstacle("Right", [text(700, 0, "BLOCKED")])], { gap });
    expect(r.chosen.get("Note")!.payload).toBe(-700);
  });

  it("gives the same answer every time it is run", () => {
    const build = () => [movable("A", [text(0, 0, "AAAA")], [-500, 500, -900, 900]), movable("B", [text(100, 0, "BBBB")], [-500, 500, -900, 900])];
    const one = layoutAnnotations(build(), [obstacle("G", [line(-2000, 300, 2000, 300)])], { gap });
    const two = layoutAnnotations(build(), [obstacle("G", [line(-2000, 300, 2000, 300)])], { gap });
    expect([...two.chosen].map(([k, v]) => [k, v.payload])).toEqual([...one.chosen].map(([k, v]) => [k, v.payload]));
  });

  it("reports what it could not place rather than pretending", () => {
    // Boxed in on every side it can reach.
    const item = movable("Note", [text(0, 0, "NOTE")], [-400, 400]);
    const r = layoutAnnotations([item], [obstacle("A", [text(0, 0, "X")]), obstacle("B", [text(-400, 0, "Y")]), obstacle("C", [text(400, 0, "Z")])], { gap });
    expect(r.clashes.length).toBeGreaterThan(0);
  });

  it("measures overlap as real paper, so the worst clash is dealt with first", () => {
    const small = overlapArea({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 9, minY: 0, maxX: 20, maxY: 10 });
    const large = overlapArea({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 1, minY: 0, maxX: 20, maxY: 10 });
    expect(large).toBeGreaterThan(small);
  });
});
