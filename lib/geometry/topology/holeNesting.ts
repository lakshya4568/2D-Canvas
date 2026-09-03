import { Point2D, DcelVertex, DcelHalfEdge } from "./types";

/**
 * Tests if point pt is inside the closed polygon defined by startHalfEdge cycle using ray casting.
 */
export function isPointInsideBoundary(
  pt: Point2D,
  startHalfEdgeId: string,
  halfEdges: Map<string, DcelHalfEdge>,
  vertices: Map<string, DcelVertex>
): boolean {
  let inside = false;
  let currId = startHalfEdgeId;
  let count = 0;
  const maxEdges = halfEdges.size + 1;

  do {
    const he = halfEdges.get(currId);
    if (!he) break;
    const v1 = vertices.get(he.origin)?.point;
    const v2 = vertices.get(he.target)?.point;
    if (!v1 || !v2) break;

    // Ray-segment crossing check along positive X direction
    const intersects =
      v1.y > pt.y !== v2.y > pt.y &&
      pt.x < ((v2.x - v1.x) * (pt.y - v1.y)) / (v2.y - v1.y + 1e-15) + v1.x;

    if (intersects) {
      inside = !inside;
    }

    currId = he.next;
    count++;
  } while (currId !== startHalfEdgeId && count < maxEdges);

  return inside;
}
