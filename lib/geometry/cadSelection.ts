import { Shape } from "./types";
import { computeShapeBounds } from "./metrics";

export interface MarqueeSelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * AutoCAD Directional Selection:
   * - false: Left-to-Right (Blue solid window selection) -> Strictly enclosed entities only.
   * - true: Right-to-Left (Green dashed crossing selection) -> Touched or enclosed entities.
   */
  isCrossing: boolean;
}

/**
 * Evaluates AutoCAD-standard marquee selection against an array of shapes.
 *
 * @param shapes The candidate shapes to test against the marquee box.
 * @param marquee The marquee selection box in model-space world coordinates.
 * @returns Array of matching shape IDs.
 */
export function evaluateCadMarqueeSelection(
  shapes: readonly Shape[],
  marquee: MarqueeSelectionBox
): string[] {
  if (marquee.width <= 0 || marquee.height <= 0) {
    return [];
  }

  const mMinX = marquee.x;
  const mMaxX = marquee.x + marquee.width;
  const mMinY = marquee.y;
  const mMaxY = marquee.y + marquee.height;

  const matchedIds: string[] = [];

  for (const shape of shapes) {
    if (shape.isVisible === false) continue;
    const b = computeShapeBounds(shape);

    if (marquee.isCrossing) {
      // Crossing (Right-to-Left): any intersection or touch
      const intersects =
        b.maxX >= mMinX &&
        b.minX <= mMaxX &&
        b.maxY >= mMinY &&
        b.minY <= mMaxY;
      if (intersects) {
        matchedIds.push(shape.id);
      }
    } else {
      // Window (Left-to-Right): strict containment only
      const strictlyContained =
        b.minX >= mMinX &&
        b.maxX <= mMaxX &&
        b.minY >= mMinY &&
        b.maxY <= mMaxY;
      if (strictlyContained) {
        matchedIds.push(shape.id);
      }
    }
  }

  return matchedIds;
}
