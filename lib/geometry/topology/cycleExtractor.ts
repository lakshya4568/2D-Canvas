import { Point2D, DcelVertex, DcelHalfEdge, DcelFace } from "./types";
import { isPointInsideBoundary } from "./holeNesting";

export interface RawCycle {
  halfEdgeIds: string[];
  signedArea: number; // Shoelace area: > 0 for CCW (solid), < 0 for CW (void/exterior)
}

/**
 * Calculates geometric centroid of a polygon cycle.
 */
export function computeCycleCentroid(
  cycleHalfEdgeIds: string[],
  halfEdges: Map<string, DcelHalfEdge>,
  vertices: Map<string, DcelVertex>
): Point2D {
  const n = cycleHalfEdgeIds.length;
  if (n === 0) return { x: 0, y: 0 };

  const pts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const he = halfEdges.get(cycleHalfEdgeIds[i]);
    if (!he) continue;
    const v = vertices.get(he.origin);
    if (v) pts.push(v.point);
  }

  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0] };
  if (pts.length === 2) return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

  let signedArea = 0.0;
  let cx = 0.0;
  let cy = 0.0;

  for (let i = 0; i < pts.length; i++) {
    const pA = pts[i];
    const pB = pts[(i + 1) % pts.length];
    const cross = pA.x * pB.y - pB.x * pA.y;
    signedArea += cross;
    cx += (pA.x + pB.x) * cross;
    cy += (pA.y + pB.y) * cross;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-9) {
    let sumX = 0;
    let sumY = 0;
    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
    }
    return { x: sumX / pts.length, y: sumY / pts.length };
  }

  cx /= 6 * signedArea;
  cy /= 6 * signedArea;
  return { x: cx, y: cy };
}

/**
 * Computes an interior point strictly inside a face by stepping inward from an outer edge.
 */
export function getInteriorTestPoint(
  startHalfEdgeId: string,
  halfEdges: Map<string, DcelHalfEdge>,
  vertices: Map<string, DcelVertex>
): Point2D {
  const he = halfEdges.get(startHalfEdgeId);
  if (!he) return { x: 0, y: 0 };
  const v1 = vertices.get(he.origin)?.point;
  const v2 = vertices.get(he.target)?.point;
  if (!v1 || !v2) return { x: 0, y: 0 };

  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { ...v1 };

  const midX = (v1.x + v2.x) / 2;
  const midY = (v1.y + v2.y) / 2;

  // Inward normal (to the left of the CCW edge)
  const nx = -dy / len;
  const ny = dx / len;
  const step = Math.min(1.0, len * 0.05);

  return {
    x: midX + nx * step,
    y: midY + ny * step,
  };
}

/**
 * Traverses half-edge cycles, calculates signed Shoelace area, extracts faces,
 * assigns nesting depth via ray casting, and tags categories.
 */
export function extractDcelCycles(
  halfEdges: Map<string, DcelHalfEdge>,
  vertices: Map<string, DcelVertex>
): { faces: Map<string, DcelFace>; rawCycles: RawCycle[] } {
  const visited = new Set<string>();
  const rawCycles: RawCycle[] = [];
  const faces = new Map<string, DcelFace>();
  let faceCounter = 0;

  for (const [hId] of halfEdges.entries()) {
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
  const solidCycles = rawCycles.filter((c) => c.signedArea > 1e-9);
  const holeOrExtCycles = rawCycles.filter((c) => c.signedArea < -1e-9);

  // 1. Create interior solid faces
  for (const sc of solidCycles) {
    const faceId = `f_${++faceCounter}`;
    const centroid = computeCycleCentroid(sc.halfEdgeIds, halfEdges, vertices);

    // Collect tags from constituent half-edges
    const tagsSet = new Set<string>();
    for (const hId of sc.halfEdgeIds) {
      const edge = halfEdges.get(hId);
      if (edge?.tags) {
        for (const t of edge.tags) tagsSet.add(t);
      }
    }

    const face: DcelFace = {
      id: faceId,
      outerBoundary: sc.halfEdgeIds[0],
      innerHoles: [],
      area: sc.signedArea,
      isExterior: false,
      nestingDepth: 0,
      centroid,
      tags: Array.from(tagsSet),
      semanticCategory: "UNCLASSIFIED",
    };

    for (const hId of sc.halfEdgeIds) {
      const edge = halfEdges.get(hId);
      if (edge) edge.face = faceId;
    }

    faces.set(faceId, face);
  }

  // 2. Classify holes vs exterior face
  for (const hc of holeOrExtCycles) {
    const hcTwinIds = new Set(
      hc.halfEdgeIds.map((id) => halfEdges.get(id)?.twin).filter(Boolean) as string[]
    );
    const testPt = computeCycleCentroid(hc.halfEdgeIds, halfEdges, vertices);

    let parentFace: DcelFace | null = null;
    let minParentArea = Infinity;

    for (const face of faces.values()) {
      if (face.isExterior || !face.outerBoundary) continue;

      // An inner hole cannot share boundary edges with the face's outer boundary
      let sharesBoundary = false;
      let currId = face.outerBoundary;
      const visitedEdges = new Set<string>();
      while (currId && !visitedEdges.has(currId)) {
        visitedEdges.add(currId);
        if (hcTwinIds.has(currId)) {
          sharesBoundary = true;
          break;
        }
        currId = halfEdges.get(currId)?.next || "";
      }
      if (sharesBoundary) continue;

      // An inner hole must be strictly smaller in area than the enclosing face
      if (Math.abs(hc.signedArea) >= face.area) continue;

      if (isPointInsideBoundary(testPt, face.outerBoundary, halfEdges, vertices)) {
        if (face.area < minParentArea) {
          minParentArea = face.area;
          parentFace = face;
        }
      }
    }

    if (parentFace) {
      parentFace.innerHoles.push(hc.halfEdgeIds[0]);
      for (const hId of hc.halfEdgeIds) {
        const edge = halfEdges.get(hId);
        if (edge) edge.face = parentFace.id;
      }
    } else {
      // All unbounded CW cycles belong to the SINGLE shared exterior face
      let extFace = Array.from(faces.values()).find((f) => f.isExterior);
      if (!extFace) {
        const extFaceId = `f_ext_${++faceCounter}`;
        extFace = {
          id: extFaceId,
          outerBoundary: null,
          innerHoles: [hc.halfEdgeIds[0]],
          area: hc.signedArea,
          isExterior: true,
          nestingDepth: -1,
          centroid: { x: 0, y: 0 },
          tags: ["EXTERIOR"],
          semanticCategory: "VOID",
        };
        faces.set(extFaceId, extFace);
      } else {
        extFace.innerHoles.push(hc.halfEdgeIds[0]);
        extFace.area += hc.signedArea;
      }

      for (const hId of hc.halfEdgeIds) {
        const edge = halfEdges.get(hId);
        if (edge) edge.face = extFace.id;
      }
    }
  }

  // 3. Ensure a single unbounded exterior face always exists
  let hasExtFace = false;
  for (const f of faces.values()) {
    if (f.isExterior) {
      hasExtFace = true;
      break;
    }
  }
  if (!hasExtFace) {
    const extFaceId = `f_ext_${++faceCounter}`;
    faces.set(extFaceId, {
      id: extFaceId,
      outerBoundary: null,
      innerHoles: [],
      area: 0,
      isExterior: true,
      nestingDepth: -1,
      centroid: { x: 0, y: 0 },
      tags: ["EXTERIOR"],
      semanticCategory: "VOID",
    });
  }

  // 4. Compute nesting depth via ray casting (even = solid, odd = interior void)
  const interiorFaces = Array.from(faces.values()).filter((f) => !f.isExterior && f.outerBoundary);
  for (const face of interiorFaces) {
    let depth = 0;
    const testPt = getInteriorTestPoint(face.outerBoundary!, halfEdges, vertices);
    for (const other of interiorFaces) {
      if (other.id === face.id || !other.outerBoundary) continue;
      if (isPointInsideBoundary(testPt, other.outerBoundary, halfEdges, vertices)) {
        depth++;
      }
    }
    face.nestingDepth = depth;
    if (depth % 2 !== 0) {
      face.semanticCategory = "VOID";
    }
  }

  return { faces, rawCycles };
}
