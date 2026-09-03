import { Point2D, DcelVertex, DcelHalfEdge, DcelFace } from "./types";
import { isPointInsideBoundary } from "./holeNesting";

export interface RawCycle {
  halfEdgeIds: string[];
  signedArea: number; // Shoelace area: > 0 for CCW (solid), < 0 for CW (void/exterior)
}

/**
 * Traverses half-edge cycles, calculates signed Shoelace area, and classifies faces.
 */
export function extractDcelCycles(
  halfEdges: Map<string, DcelHalfEdge>,
  vertices: Map<string, DcelVertex>
): { faces: Map<string, DcelFace>; rawCycles: RawCycle[] } {
  const visited = new Set<string>();
  const rawCycles: RawCycle[] = [];
  const faces = new Map<string, DcelFace>();
  let faceCounter = 0;

  for (const [hId, he] of halfEdges.entries()) {
    if (visited.has(hId)) continue;

    const cycle: string[] = [];
    let currId = hId;
    let loopDetected = false;

    while (!visited.has(currId)) {
      visited.add(currId);
      cycle.push(currId);
      const curr = halfEdges.get(currId);
      if (!curr || !curr.next) {
        loopDetected = true;
        break;
      }
      currId = curr.next;
    }

    if (loopDetected || cycle.length < 3) continue;

    // Calculate signed area via Shoelace formula
    let signedArea = 0.0;
    for (let i = 0; i < cycle.length; i++) {
      const edge = halfEdges.get(cycle[i])!;
      const vA = vertices.get(edge.origin)!.point;
      const vB = vertices.get(edge.target)!.point;
      signedArea += vA.x * vB.y - vB.x * vA.y;
    }
    signedArea *= 0.5;

    rawCycles.push({ halfEdgeIds: cycle, signedArea });
  }

  // Separate positive area (CCW = Solid/Interior) from negative area (CW = Hole/Exterior)
  const solidCycles = rawCycles.filter((c) => c.signedArea > 0);
  const holeOrExtCycles = rawCycles.filter((c) => c.signedArea < 0);

  // 1. Create interior solid faces
  for (const sc of solidCycles) {
    const faceId = `f_${++faceCounter}`;
    const face: DcelFace = {
      id: faceId,
      outerBoundary: sc.halfEdgeIds[0],
      innerHoles: [],
      area: sc.signedArea,
      isExterior: false,
    };

    for (const hId of sc.halfEdgeIds) {
      const edge = halfEdges.get(hId);
      if (edge) edge.face = faceId;
    }

    faces.set(faceId, face);
  }

  // 2. Classify holes vs exterior face
  for (const hc of holeOrExtCycles) {
    // Pick a test point on the hole
    const repVertexId = halfEdges.get(hc.halfEdgeIds[0])!.origin;
    const testPt = vertices.get(repVertexId)!.point;

    let parentFace: DcelFace | null = null;
    let minParentArea = Infinity;

    for (const face of faces.values()) {
      if (face.isExterior || !face.outerBoundary) continue;
      if (isPointInsideBoundary(testPt, face.outerBoundary, halfEdges, vertices)) {
        if (face.area < minParentArea) {
          minParentArea = face.area;
          parentFace = face;
        }
      }
    }

    if (parentFace) {
      // It is an internal hole inside parentFace
      parentFace.innerHoles.push(hc.halfEdgeIds[0]);
      for (const hId of hc.halfEdgeIds) {
        const edge = halfEdges.get(hId);
        if (edge) edge.face = parentFace.id;
      }
    } else {
      // Unbounded exterior face
      const extFaceId = `f_ext_${++faceCounter}`;
      const extFace: DcelFace = {
        id: extFaceId,
        outerBoundary: null,
        innerHoles: [hc.halfEdgeIds[0]],
        area: hc.signedArea,
        isExterior: true,
      };
      for (const hId of hc.halfEdgeIds) {
        const edge = halfEdges.get(hId);
        if (edge) edge.face = extFaceId;
      }
      faces.set(extFaceId, extFace);
    }
  }

  return { faces, rawCycles };
}
