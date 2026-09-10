import { Point, Viewport, BoundingBox } from "./types";

/**
 * Absolute zoom limits for the viewport.
 *
 * The floor matters more than it looks. Real civil GAD sheets are drafted in
 * model-space millimetres and routinely span hundreds of metres — a longitudinal
 * section 460 m tall needs a scale near 0.002 to fit an 800 px viewport. A floor
 * of 0.05 silently makes such a drawing unviewable: it imports, it is in state,
 * and it can never be brought on screen.
 */
export const MIN_ZOOM_SCALE = 1e-4;
export const MAX_ZOOM_SCALE = 20;

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
  minScale = MIN_ZOOM_SCALE,
  maxScale = MAX_ZOOM_SCALE
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

/**
 * Builds the Viewport that frames `bounds` inside a canvas of the given pixel
 * size, centred, with a margin expressed as a fraction of the smaller axis.
 *
 * This is AutoCAD's ZOOM EXTENTS. Note the transform this must invert is the
 * one the canvas actually applies, `screen = world * scale + pan`
 * (`worldToScreenPoint`), so the pan term is a pixel offset, not a world offset.
 */
export function fitViewportToBounds(
  bounds: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
  marginFraction = 0.08
): Viewport {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }

  const margin = Math.min(canvasWidth, canvasHeight) * marginFraction;
  const usableWidth = Math.max(1, canvasWidth - margin * 2);
  const usableHeight = Math.max(1, canvasHeight - margin * 2);

  // A degenerate extent (single point, or a purely horizontal/vertical run) has
  // zero measure on one axis; fall back to that axis rather than dividing by it.
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scaleX = width > 1e-9 ? usableWidth / width : Infinity;
  const scaleY = height > 1e-9 ? usableHeight / height : Infinity;

  let scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
  }
  scale = clamp(scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: canvasWidth / 2 - centerX * scale,
    y: canvasHeight / 2 - centerY * scale,
    scale,
  };
}
