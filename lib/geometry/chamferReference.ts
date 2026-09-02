import { Point, Shape, SnapResult } from "./types";

export interface ChamferInfo {
  shapeId: string;
  name?: string;
  p1: Point;
  p2: Point;
  length: number;
  angleDeg: number;
  dx: number;
  dy: number;
}

/**
 * Detects chamfer-like segments among shapes.
 * A chamfer is typically a diagonal line (e.g. 45°, 135°, 225°, 315° within tolerance,
 * or non-orthogonal lines), or any shape with 'chamfer' or 'miter' in its name/id.
 */
export function detectChamferSegments(shapes: Shape[]): ChamferInfo[] {
  const chamfers: ChamferInfo[] = [];

  for (const s of shapes) {
    if (s.isVisible === false) continue;
    if (s.type === "line" || s.type === "arrow") {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      if (len < 5) continue;

      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;

      const isNamedChamfer = Boolean(
        (s.name && /chamfer|miter|bevel/i.test(s.name)) ||
        (s.id && /chamfer|miter|bevel/i.test(s.id))
      );

      // Check diagonal angles (45°, 135°, 225°, 315° ± 15°), or named chamfers
      const isDiagonal =
        Math.abs((angle % 90) - 45) <= 15 ||
        (angle > 15 && angle < 75) ||
        (angle > 105 && angle < 165) ||
        (angle > 195 && angle < 255) ||
        (angle > 285 && angle < 345);

      if (isNamedChamfer || isDiagonal) {
        chamfers.push({
          shapeId: s.id,
          name: s.name,
          p1: { x: s.x1, y: s.y1 },
          p2: { x: s.x2, y: s.y2 },
          length: len,
          angleDeg: angle,
          dx: Math.abs(dx),
          dy: Math.abs(dy),
        });
      }
    }
  }

  return chamfers;
}

export interface ChamferReferenceSnapOptions {
  shapes: Shape[];
  startPoint: Point;
  rawPoint: Point;
  worldThreshold: number;
}

/**
 * Computes chamfer extension reference points and snaps to them when drawing another chamfer.
 * If the current line touches or aligns with a previous chamfer:
 * - Shows a reference point indicating it can be extended till this point
 * - Creates a guide line touching the previous chamfer directly to the reference point
 */
export function getChamferReferenceSnap(options: ChamferReferenceSnapOptions): SnapResult | null {
  const { shapes, startPoint, rawPoint, worldThreshold } = options;
  const chamfers = detectChamferSegments(shapes);
  if (chamfers.length === 0) return null;

  // Current drawing vector
  const curDx = rawPoint.x - startPoint.x;
  const curDy = rawPoint.y - startPoint.y;
  const curDist = Math.hypot(curDx, curDy);
  if (curDist < 4) return null;

  // Find nearest / most relevant previous chamfer
  let prevChamfer: ChamferInfo | null = null;
  let minDist = Infinity;
  for (const c of chamfers) {
    const d1 = Math.hypot(startPoint.x - c.p1.x, startPoint.y - c.p1.y);
    const d2 = Math.hypot(startPoint.x - c.p2.x, startPoint.y - c.p2.y);
    const d = Math.min(d1, d2);
    if (d < minDist) {
      minDist = d;
      prevChamfer = c;
    }
  }

  if (!prevChamfer) return null;

  // Nearest touching point on the previous chamfer
  const dP1 = Math.hypot(rawPoint.x - prevChamfer.p1.x, rawPoint.y - prevChamfer.p1.y);
  const dP2 = Math.hypot(rawPoint.x - prevChamfer.p2.x, rawPoint.y - prevChamfer.p2.y);
  const touchPoint = dP1 <= dP2 ? prevChamfer.p1 : prevChamfer.p2;

  interface CandidateRef {
    target: Point;
    touchFrom: Point;
    label: string;
    priority: number;
  }

  const candidates: CandidateRef[] = [];

  // 1. Equal-Depth Corner Chamfer Extent (Matching deltaX / deltaY)
  const signX = curDx >= 0 ? 1 : -1;
  const signY = curDy >= 0 ? 1 : -1;
  const symTarget: Point = {
    x: startPoint.x + signX * prevChamfer.dx,
    y: startPoint.y + signY * prevChamfer.dy,
  };
  candidates.push({
    target: symTarget,
    touchFrom: touchPoint,
    label: `CHAMFER REF: EXTEND TO THIS (L=${Math.round(prevChamfer.length)}mm)`,
    priority: 1,
  });

  // 2. Exact Equal Length along current drawing angle
  const lenRatio = prevChamfer.length / curDist;
  const equalLenTarget: Point = {
    x: startPoint.x + curDx * lenRatio,
    y: startPoint.y + curDy * lenRatio,
  };
  candidates.push({
    target: equalLenTarget,
    touchFrom: touchPoint,
    label: `CHAMFER REF: EXTEND TO THIS (L=${Math.round(prevChamfer.length)}mm)`,
    priority: 2,
  });

  // 3. Coordinate alignment with Previous Chamfer Vertices:
  for (const v of [prevChamfer.p1, prevChamfer.p2]) {
    if (Math.abs(curDx) > 1e-4) {
      const t = (v.x - startPoint.x) / curDx;
      if (t > 0.1 && t < 5) {
        const alignTarget: Point = { x: v.x, y: startPoint.y + t * curDy };
        candidates.push({
          target: alignTarget,
          touchFrom: v,
          label: `CHAMFER REF: ALIGNED X=${Math.round(v.x)}`,
          priority: 3,
        });
      }
    }
    if (Math.abs(curDy) > 1e-4) {
      const t = (v.y - startPoint.y) / curDy;
      if (t > 0.1 && t < 5) {
        const alignTarget: Point = { x: startPoint.x + t * curDx, y: v.y };
        candidates.push({
          target: alignTarget,
          touchFrom: v,
          label: `CHAMFER REF: ALIGNED Y=${Math.round(v.y)}`,
          priority: 3,
        });
      }
    }
  }

  // 4. Collinear / Ray Extension along previous chamfer line:
  const lineDx = prevChamfer.p2.x - prevChamfer.p1.x;
  const lineDy = prevChamfer.p2.y - prevChamfer.p1.y;
  const lineLenSq = lineDx * lineDx + lineDy * lineDy;
  if (lineLenSq > 0) {
    const u = ((rawPoint.x - prevChamfer.p1.x) * lineDx + (rawPoint.y - prevChamfer.p1.y) * lineDy) / lineLenSq;
    const projPt: Point = {
      x: prevChamfer.p1.x + u * lineDx,
      y: prevChamfer.p1.y + u * lineDy,
    };
    candidates.push({
      target: projPt,
      touchFrom: u < 0 ? prevChamfer.p1 : prevChamfer.p2,
      label: `CHAMFER EXTENSION REF`,
      priority: 4,
    });
  }

  // Find candidate closest to rawPoint within worldThreshold, respecting priority
  let bestCandidate: CandidateRef | null = null;
  let bestDist = worldThreshold;

  for (const cand of candidates) {
    const d = Math.hypot(rawPoint.x - cand.target.x, rawPoint.y - cand.target.y);
    if (d <= worldThreshold) {
      if (!bestCandidate || d < bestDist - 1 || (Math.abs(d - bestDist) <= 1 && cand.priority < bestCandidate.priority)) {
        bestDist = d;
        bestCandidate = cand;
      }
    }
  }

  if (!bestCandidate) return null;

  return {
    point: bestCandidate.target,
    snapped: true,
    snapType: "vertex",
    category: "chamfer_ref",
    targetPoint: bestCandidate.target,
    sourcePoint: bestCandidate.touchFrom,
    snapLabel: bestCandidate.label,
    guideLines: [
      {
        x1: bestCandidate.touchFrom.x,
        y1: bestCandidate.touchFrom.y,
        x2: bestCandidate.target.x,
        y2: bestCandidate.target.y,
      },
    ],
  };
}
