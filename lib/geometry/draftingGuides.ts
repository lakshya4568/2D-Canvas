/**
 * The guides a draftsman expects while drawing (UPCE-MASTER-1.0 §8, GEOM-RP/1).
 *
 * Object snapping already answers "where is there something to grab?". It does
 * not answer the questions a draftsman actually asks with the cursor still
 * moving:
 *
 *     is this the same length as that one?
 *     is this parallel to that?
 *     is this lined up with that corner over there?
 *
 * Those are relationships, not positions, and they are the relationships a
 * drawing is made of. Without them the draftsman lands on 399.7 and 400.2 and
 * then spends the authoring pass telling the system they meant the same number —
 * which it has to take on trust, because 399.7 and 400.2 are not equal.
 *
 * Snapping them makes the geometry EXACTLY equal, and that changes the whole
 * character of the authoring pass that follows: the detector reads an exact
 * match and proposes the rule with real evidence, instead of proposing a
 * near-match the author has to adjudicate. The gesture and the model agree
 * because the gesture was exact.
 *
 * Nothing here knows what is being drawn. It compares lengths to lengths and
 * directions to directions, which is as true of a culvert wall as of a line
 * someone drew by accident.
 */

import { Point, Shape, SnapInference } from "./types";
import { getShapeSegments } from "./snapping";

/** An edge already on the sheet, with what it measures. */
export interface ReferenceEdge {
  shapeId: string;
  edgeIndex: number;
  p1: Point;
  p2: Point;
  length: number;
  /** Direction in radians, folded to [0, PI): a line has no head or tail here. */
  direction: number;
}

export interface GuideReferences {
  edges: ReferenceEdge[];
  /** Every vertex worth lining up with. */
  anchors: Point[];
}

/** Folds an angle to [0, PI). Two edges pointing opposite ways are parallel. */
function foldDirection(dx: number, dy: number): number {
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI) a -= Math.PI;
  return a;
}

/**
 * Everything on the sheet worth measuring against.
 *
 * `excludeId` drops the shape being drawn, which would otherwise be compared
 * with itself and report a perfect match at every instant.
 */
export function collectReferences(shapes: Shape[], excludeId?: string | null): GuideReferences {
  const edges: ReferenceEdge[] = [];
  const anchors: Point[] = [];

  for (const shape of shapes) {
    if (excludeId && shape.id === excludeId) continue;
    const segs = getShapeSegments(shape);
    segs.forEach((seg, i) => {
      const dx = seg.p2.x - seg.p1.x;
      const dy = seg.p2.y - seg.p1.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) return;
      edges.push({
        shapeId: shape.id,
        edgeIndex: i,
        p1: seg.p1,
        p2: seg.p2,
        length,
        direction: foldDirection(dx, dy),
      });
      anchors.push(seg.p1, seg.p2);
    });
  }

  return { edges, anchors };
}

export interface GuideHit {
  point: Point;
  category: "equal_length" | "parallel" | "extension";
  label: string;
  inference: SnapInference;
  guideLines: { x1: number; y1: number; x2: number; y2: number }[];
  referenceEdges: { p1: Point; p2: Point }[];
  /** How far the cursor was pulled, so competing hits can be ranked. */
  pull: number;
}

/**
 * Snaps the dragged length to an edge that already exists.
 *
 * The cursor keeps its DIRECTION and gives up only its distance, which is what
 * makes this feel like a ruler rather than a magnet: the line points where the
 * hand points and stops where the drawing says. Shorter reference edges are
 * preferred on a tie because a draftsman matching a 350 wall means the 350, not
 * the 3500 that happens to be the same distance away in absolute terms.
 */
export function equalLengthSnap(
  startPoint: Point,
  rawPoint: Point,
  refs: GuideReferences,
  worldThreshold: number
): GuideHit | null {
  const dx = rawPoint.x - startPoint.x;
  const dy = rawPoint.y - startPoint.y;
  const current = Math.hypot(dx, dy);
  if (current < 1e-6) return null;

  const ux = dx / current;
  const uy = dy / current;

  let best: { edge: ReferenceEdge; delta: number } | null = null;
  for (const edge of refs.edges) {
    const delta = Math.abs(edge.length - current);
    if (delta > worldThreshold) continue;
    if (!best || delta < best.delta - 1e-9 || (Math.abs(delta - best.delta) <= 1e-9 && edge.length < best.edge.length)) {
      best = { edge, delta };
    }
  }
  if (!best) return null;

  const point = { x: startPoint.x + ux * best.edge.length, y: startPoint.y + uy * best.edge.length };
  return {
    point,
    category: "equal_length",
    label: `= ${best.edge.length.toFixed(1)}`,
    inference: {
      kind: "equal_length",
      referenceShapeId: best.edge.shapeId,
      referenceEdgeIndex: best.edge.edgeIndex,
      value: best.edge.length,
      label: `same length as an edge of ${best.edge.shapeId}`,
    },
    guideLines: [{ x1: startPoint.x, y1: startPoint.y, x2: point.x, y2: point.y }],
    referenceEdges: [{ p1: best.edge.p1, p2: best.edge.p2 }],
    pull: best.delta,
  };
}

/**
 * Snaps the dragged direction to an edge that already exists.
 *
 * Distance is kept and the angle is given up — the mirror image of the length
 * snap, and the two compose: hit both and the new edge is the same length AND
 * parallel, which is most of what "draw another one like that" means.
 *
 * Horizontal and vertical are reported as themselves rather than as "parallel to
 * that edge", because that is what they are and it is the stronger statement.
 */
export function parallelSnap(
  startPoint: Point,
  rawPoint: Point,
  refs: GuideReferences,
  angleToleranceRad: number
): GuideHit | null {
  const dx = rawPoint.x - startPoint.x;
  const dy = rawPoint.y - startPoint.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;

  const current = foldDirection(dx, dy);

  let best: { edge: ReferenceEdge; delta: number } | null = null;
  for (const edge of refs.edges) {
    // Both angles live in [0, PI), so the gap across the seam is the short way.
    const raw = Math.abs(edge.direction - current);
    const delta = Math.min(raw, Math.PI - raw);
    if (delta > angleToleranceRad) continue;
    if (!best || delta < best.delta) best = { edge, delta };
  }
  if (!best) return null;

  // Point along the reference direction, on the side the cursor is already on.
  const ax = Math.cos(best.edge.direction);
  const ay = Math.sin(best.edge.direction);
  const sign = dx * ax + dy * ay >= 0 ? 1 : -1;
  const point = { x: startPoint.x + sign * ax * length, y: startPoint.y + sign * ay * length };

  const deg = (best.edge.direction * 180) / Math.PI;
  const isHorizontal = Math.min(deg, 180 - deg) < 1e-6;
  const isVertical = Math.abs(deg - 90) < 1e-6;

  return {
    point,
    category: "parallel",
    label: isHorizontal ? "horizontal" : isVertical ? "vertical" : `∥ ${deg.toFixed(1)}°`,
    inference: {
      kind: isHorizontal ? "horizontal" : isVertical ? "vertical" : "parallel",
      referenceShapeId: best.edge.shapeId,
      referenceEdgeIndex: best.edge.edgeIndex,
      value: deg,
      label: isHorizontal
        ? "horizontal"
        : isVertical
          ? "vertical"
          : `parallel to an edge of ${best.edge.shapeId}`,
    },
    guideLines: [
      {
        x1: best.edge.p1.x,
        y1: best.edge.p1.y,
        x2: best.edge.p2.x,
        y2: best.edge.p2.y,
      },
    ],
    referenceEdges: [{ p1: best.edge.p1, p2: best.edge.p2 }],
    pull: best.delta * length,
  };
}

/**
 * Lines the cursor up with a vertex somewhere else on the sheet.
 *
 * AutoCAD calls this object-snap tracking, and it is the guide draftsmen reach
 * for most: the new corner belongs directly above that one, and no amount of
 * zooming in lets you find that by eye. Only one axis is given up, so the other
 * still follows the hand.
 *
 * Anchors within the threshold of the cursor are skipped — the cursor is already
 * ON that vertex, and ordinary vertex snapping has a better answer for it.
 */
export function extensionSnap(
  rawPoint: Point,
  refs: GuideReferences,
  worldThreshold: number
): GuideHit | null {
  const REACH = 1e5;
  let best: GuideHit | null = null;

  for (const a of refs.anchors) {
    const dx = Math.abs(rawPoint.x - a.x);
    const dy = Math.abs(rawPoint.y - a.y);
    if (Math.hypot(dx, dy) <= worldThreshold) continue;

    if (dx <= worldThreshold && dx < (best?.pull ?? Infinity)) {
      best = {
        point: { x: a.x, y: rawPoint.y },
        category: "extension",
        label: "aligned",
        inference: { kind: "vertical", value: a.x, label: "lined up with a corner above or below" },
        guideLines: [{ x1: a.x, y1: a.y - REACH, x2: a.x, y2: a.y + REACH }],
        referenceEdges: [],
        pull: dx,
      };
    }
    if (dy <= worldThreshold && dy < (best?.pull ?? Infinity)) {
      best = {
        point: { x: rawPoint.x, y: a.y },
        category: "extension",
        label: "aligned",
        inference: { kind: "horizontal", value: a.y, label: "lined up with a corner across" },
        guideLines: [{ x1: a.x - REACH, y1: a.y, x2: a.x + REACH, y2: a.y }],
        referenceEdges: [],
        pull: dy,
      };
    }
  }

  return best;
}

/**
 * Both length and direction at once, when both are available.
 *
 * Composing them is not the same as picking the better one. "The same length as
 * that, and parallel to it" is one gesture to a draftsman — copying an edge —
 * and offering only half of it makes them do the other half by hand.
 */
export function combinedGuideSnap(
  startPoint: Point,
  rawPoint: Point,
  refs: GuideReferences,
  worldThreshold: number,
  angleToleranceRad: number
): GuideHit | null {
  const par = parallelSnap(startPoint, rawPoint, refs, angleToleranceRad);
  // Length is measured along the direction the snap has settled on, so the two
  // agree instead of each answering about a different line.
  const afterAngle = par ? par.point : rawPoint;
  const len = equalLengthSnap(startPoint, afterAngle, refs, worldThreshold);

  if (par && len) {
    return {
      point: len.point,
      category: "equal_length",
      label: `${len.label} · ${par.label}`,
      inference: len.inference,
      guideLines: [...par.guideLines, ...len.guideLines],
      referenceEdges: [...par.referenceEdges, ...len.referenceEdges],
      pull: Math.min(par.pull, len.pull),
    };
  }
  return len ?? par;
}
