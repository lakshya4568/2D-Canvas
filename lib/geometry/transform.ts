import { Point, Viewport } from "./types";

/**
 * Converts screen pointer coordinates (clientX, clientY) into SVG world space
 * using browser-native getScreenCTM() inverse transformation.
 */
export function screenToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    const rect = svg.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }
  const transformed = pt.matrixTransform(ctm.inverse());
  return {
    x: transformed.x,
    y: transformed.y,
  };
}

/**
 * Converts world coordinates to screen/container-relative pixel coordinates given a Viewport.
 */
export function worldToScreenPoint(worldPoint: Point, viewport: Viewport): Point {
  return {
    x: worldPoint.x * viewport.scale + viewport.x,
    y: worldPoint.y * viewport.scale + viewport.y,
  };
}

/**
 * Converts screen/container-relative pixel coordinates to world coordinates given a Viewport.
 */
export function screenToWorldPoint(screenPoint: Point, viewport: Viewport): Point {
  return {
    x: (screenPoint.x - viewport.x) / viewport.scale,
    y: (screenPoint.y - viewport.y) / viewport.scale,
  };
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates a new Viewport when zooming anchored at a specific screen point.
 * Ensures the world point currently under the cursor stays in the exact same screen position.
 */
export function zoomAtPoint(
  viewport: Viewport,
  screenFocalPoint: Point,
  factor: number,
  minScale = 0.1,
  maxScale = 10
): Viewport {
  const newScale = clamp(viewport.scale * factor, minScale, maxScale);
  if (newScale === viewport.scale) {
    return viewport;
  }

  const ratio = newScale / viewport.scale;
  const newX = screenFocalPoint.x - (screenFocalPoint.x - viewport.x) * ratio;
  const newY = screenFocalPoint.y - (screenFocalPoint.y - viewport.y) * ratio;

  return {
    x: newX,
    y: newY,
    scale: newScale,
  };
}

/**
 * Applies a pan translation delta to the viewport.
 */
export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  return {
    ...viewport,
    x: viewport.x + dx,
    y: viewport.y + dy,
  };
}
