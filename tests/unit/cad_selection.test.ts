import { describe, it, expect } from "vitest";
import { evaluateCadMarqueeSelection, MarqueeSelectionBox } from "../../lib/geometry/cadSelection";
import { RectangleShape, LineShape, CircleShape, Shape } from "../../lib/geometry/types";

describe("AutoCAD Directional Marquee Selection", () => {
  const rectA: RectangleShape = {
    id: "rect_A",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
  };

  const lineB: LineShape = {
    id: "line_B",
    type: "line",
    x1: 400,
    y1: 100,
    x2: 600,
    y2: 300,
  };

  const circleC: CircleShape = {
    id: "circle_C",
    type: "circle",
    cx: 800,
    cy: 200,
    r: 50, // bounds: [750, 850] x [150, 250]
  };

  const shapes: Shape[] = [rectA, lineB, circleC];

  describe("Window Selection (Left-to-Right, isCrossing: false)", () => {
    it("selects nothing if the marquee only partially intersects shapes", () => {
      // Marquee covers [50, 200] x [50, 150].
      // rectA is [100, 300] x [100, 200] -> partially overlaps, not completely enclosed.
      const marquee: MarqueeSelectionBox = {
        x: 50,
        y: 50,
        width: 150,
        height: 100,
        isCrossing: false,
      };

      const selected = evaluateCadMarqueeSelection(shapes, marquee);
      expect(selected).toEqual([]);
    });

    it("selects only shapes that are 100% strictly contained within the marquee", () => {
      // Marquee covers [80, 320] x [80, 220], completely enclosing rectA [100, 300] x [100, 200].
      // Does not enclose lineB or circleC.
      const marquee: MarqueeSelectionBox = {
        x: 80,
        y: 80,
        width: 240,
        height: 140,
        isCrossing: false,
      };

      const selected = evaluateCadMarqueeSelection(shapes, marquee);
      expect(selected).toEqual(["rect_A"]);
    });

    it("selects multiple shapes when all are strictly contained", () => {
      // Marquee covers [50, 900] x [50, 350], enclosing rectA, lineB, and circleC.
      const marquee: MarqueeSelectionBox = {
        x: 50,
        y: 50,
        width: 850,
        height: 300,
        isCrossing: false,
      };

      const selected = evaluateCadMarqueeSelection(shapes, marquee);
      expect(selected).toHaveLength(3);
      expect(selected).toContain("rect_A");
      expect(selected).toContain("line_B");
      expect(selected).toContain("circle_C");
    });
  });

  describe("Crossing Selection (Right-to-Left, isCrossing: true)", () => {
    it("selects any shape that touches or partially intersects the marquee", () => {
      // Marquee covers [250, 450] x [150, 250].
      // Intersects rectA (right edge at 300) and lineB (starts at 400).
      // Does not touch circleC (starts at 750).
      const marquee: MarqueeSelectionBox = {
        x: 250,
        y: 150,
        width: 200,
        height: 100,
        isCrossing: true,
      };

      const selected = evaluateCadMarqueeSelection(shapes, marquee);
      expect(selected).toHaveLength(2);
      expect(selected).toContain("rect_A");
      expect(selected).toContain("line_B");
      expect(selected).not.toContain("circle_C");
    });

    it("selects fully contained shapes in crossing mode as well", () => {
      const marquee: MarqueeSelectionBox = {
        x: 700,
        y: 100,
        width: 200,
        height: 200,
        isCrossing: true,
      };

      const selected = evaluateCadMarqueeSelection(shapes, marquee);
      expect(selected).toEqual(["circle_C"]);
    });
  });

  describe("Edge cases & Filters", () => {
    it("returns empty array for zero or negative dimensions", () => {
      expect(evaluateCadMarqueeSelection(shapes, { x: 0, y: 0, width: 0, height: 100, isCrossing: true })).toEqual([]);
      expect(evaluateCadMarqueeSelection(shapes, { x: 0, y: 0, width: 100, height: -5, isCrossing: false })).toEqual([]);
    });

    it("ignores invisible shapes", () => {
      const hiddenRect: RectangleShape = {
        ...rectA,
        id: "hidden_rect",
        isVisible: false,
      };
      const marquee: MarqueeSelectionBox = {
        x: 50,
        y: 50,
        width: 500,
        height: 500,
        isCrossing: true,
      };
      const selected = evaluateCadMarqueeSelection([hiddenRect], marquee);
      expect(selected).toEqual([]);
    });
  });
});
