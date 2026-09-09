/**
 * Semantic Face Tagging & Boundary Cycle Classification Engine
 * UPCE-MASTER-1.0 §86, §35–§38, §5.1, Gate G7 (§76)
 *
 * Implements semantic face tagging for DCEL faces and boundary cycles:
 * - deck_slab
 * - pier_column
 * - parapet_barrier
 * - internal_cavity_void
 * - culvert_barrel
 * - culvert_wall
 */

import { Point2D, DcelFace, DcelHalfEdge, DcelVertex } from "./types";
import { DcelPlanarMap } from "./dcel";

export type StandardFaceTag =
  | "deck_slab"
  | "pier_column"
  | "parapet_barrier"
  | "internal_cavity_void"
  | "culvert_barrel"
  | "culvert_wall";

export interface FaceBoundaryMetrics {
  faceId: string;
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
  width: number;
  height: number;
  aspectRatio: number; // Oriented aspect ratio (rotation-invariant)
  orientedLength: number;
  orientedThickness: number;
  principalAngleRad: number;
  area: number;
  centroid: Point2D;
  vertexCount: number;
  hasHoles: boolean;
  holeCount: number;
  nestingDepth: number;
}

/**
 * Adds a semantic tag to a DCEL face if not already present.
 */
export function tagFace(face: DcelFace, tag: StandardFaceTag | string): void {
  if (!face.tags.includes(tag)) {
    face.tags.push(tag);
  }
}

/**
 * Removes a semantic tag from a DCEL face.
 */
export function untagFace(face: DcelFace, tag: StandardFaceTag | string): void {
  face.tags = face.tags.filter((t) => t !== tag);
}

/**
 * Checks if a DCEL face contains a specific semantic tag.
 */
export function hasFaceTag(face: DcelFace, tag: StandardFaceTag | string): boolean {
  return face.tags.includes(tag);
}

/**
 * Retrieves all faces in the DCEL map matching a specific tag.
 */
export function getFacesByTag(map: DcelPlanarMap, tag: StandardFaceTag | string): DcelFace[] {
  const result: DcelFace[] = [];
  for (const face of map.faces.values()) {
    if (hasFaceTag(face, tag)) {
      result.push(face);
    }
  }
  return result;
}

/**
 * Extracts the outer boundary polygon points and inner hole polygons for a DCEL face.
 */
export function extractFaceBoundaryCycles(
  map: DcelPlanarMap,
  faceId: string
): { outerCycle: Point2D[]; innerHoleCycles: Point2D[][] } {
  const face = map.faces.get(faceId);
  if (!face) {
    throw new Error(`[SemanticFaceTagger] Face '${faceId}' does not exist in DCEL map.`);
  }

  const outerCycle: Point2D[] = [];
  if (face.outerBoundary) {
    let currId = face.outerBoundary;
    const visited = new Set<string>();
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const he = map.halfEdges.get(currId);
      if (!he) break;
      const originV = map.vertices.get(he.origin);
      if (originV) outerCycle.push(originV.point);
      currId = he.next;
    }
  }

  const innerHoleCycles: Point2D[][] = [];
  for (const holeStartId of face.innerHoles) {
    const holeCycle: Point2D[] = [];
    let currId = holeStartId;
    const visited = new Set<string>();
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const he = map.halfEdges.get(currId);
      if (!he) break;
      const originV = map.vertices.get(he.origin);
      if (originV) holeCycle.push(originV.point);
      currId = he.next;
    }
    if (holeCycle.length > 0) {
      innerHoleCycles.push(holeCycle);
    }
  }

  return { outerCycle, innerHoleCycles };
}

/**
 * Calculates rotation-invariant geometric and topological boundary metrics for a DCEL face.
 * Uses 2D principal component covariance analysis (PCA) to determine true oriented length,
 * oriented thickness, and coordinate-free aspect ratio without axis-aligned bounding box distortion.
 */
export function computeFaceBoundaryMetrics(
  map: DcelPlanarMap,
  faceId: string
): FaceBoundaryMetrics {
  const face = map.faces.get(faceId);
  if (!face) {
    throw new Error(`[SemanticFaceTagger] Face '${faceId}' does not exist.`);
  }

  const { outerCycle } = extractFaceBoundaryCycles(map, faceId);
  if (outerCycle.length === 0) {
    return {
      faceId,
      boundingBox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      width: 0,
      height: 0,
      aspectRatio: 1,
      orientedLength: 0,
      orientedThickness: 0,
      principalAngleRad: 0,
      area: face.area,
      centroid: face.centroid,
      vertexCount: 0,
      hasHoles: face.innerHoles.length > 0,
      holeCount: face.innerHoles.length,
      nestingDepth: face.nestingDepth,
    };
  }

  // 1. AABB calculation (for elevation queries)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let sumX = 0;
  let sumY = 0;
  const n = outerCycle.length;

  for (const pt of outerCycle) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    sumX += pt.x;
    sumY += pt.y;
  }

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);

  // 2. Rotation-invariant 2D Covariance / PCA Analysis
  const cx = sumX / n;
  const cy = sumY / n;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;

  for (const pt of outerCycle) {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  cxx /= n;
  cyy /= n;
  cxy /= n;

  // Principal axis orientation angle
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Project vertices along principal and orthogonal axes
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const pt of outerCycle) {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const u = dx * cosT + dy * sinT;
    const v = -dx * sinT + dy * cosT;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const spanU = Math.max(0, maxU - minU);
  const spanV = Math.max(0, maxV - minV);

  const orientedLength = Math.max(spanU, spanV);
  const orientedThickness = Math.max(1e-6, Math.min(spanU, spanV));
  const orientedAspectRatio = orientedLength / orientedThickness;

  // Normalize principal orientation angle to the direction of greatest span
  let principalAngleRad = spanU >= spanV ? theta : theta + Math.PI / 2;
  while (principalAngleRad > Math.PI / 2) principalAngleRad -= Math.PI;
  while (principalAngleRad < -Math.PI / 2) principalAngleRad += Math.PI;

  return {
    faceId,
    boundingBox: { minX, maxX, minY, maxY },
    width,
    height,
    aspectRatio: orientedAspectRatio,
    orientedLength,
    orientedThickness,
    principalAngleRad,
    area: Math.abs(face.area),
    centroid: face.centroid,
    vertexCount: outerCycle.length,
    hasHoles: face.innerHoles.length > 0,
    holeCount: face.innerHoles.length,
    nestingDepth: face.nestingDepth,
  };
}

/**
 * Automatically tags DCEL faces using rotation-invariant aspect ratios, boundary nesting, and structural context.
 */
export function autoTagDcelFaces(
  map: DcelPlanarMap,
  context: "bridge" | "culvert" | "auto" = "auto"
): Map<string, string[]> {
  const taggedMap = new Map<string, string[]>();

  const nonExteriorFaces = Array.from(map.faces.values()).filter((f) => !f.isExterior);
  if (nonExteriorFaces.length === 0) return taggedMap;

  // Compute metrics for all interior faces
  const metricsList = nonExteriorFaces.map((f) => computeFaceBoundaryMetrics(map, f.id));

  // Determine context if "auto"
  let effectiveContext = context;
  if (effectiveContext === "auto") {
    const hasVoids = nonExteriorFaces.some(
      (f) => f.nestingDepth % 2 === 1 || f.semanticCategory === "VOID"
    );
    const hasMultiSolid = nonExteriorFaces.length >= 3;
    effectiveContext = hasVoids && !hasMultiSolid ? "culvert" : "bridge";
  }

  // Find global bounds across all non-exterior faces
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;

  for (const m of metricsList) {
    if (m.vertexCount === 0) continue;
    if (m.boundingBox.minY < globalMinY) globalMinY = m.boundingBox.minY;
    if (m.boundingBox.maxY > globalMaxY) globalMaxY = m.boundingBox.maxY;
  }

  for (const m of metricsList) {
    const face = map.faces.get(m.faceId);
    if (!face) continue;

    // Compute orientation metrics
    const isHorizontal = Math.abs(Math.cos(m.principalAngleRad)) >= Math.abs(Math.sin(m.principalAngleRad));
    const isVertical = Math.abs(Math.sin(m.principalAngleRad)) > Math.abs(Math.cos(m.principalAngleRad));
    const isNearTop = m.boundingBox.maxY >= globalMaxY - 0.35 * Math.max(1, globalMaxY - globalMinY);

    const hasDeckTag = face.tags.includes("deck_slab");
    const hasPierTag = face.tags.includes("pier_column");
    const hasBarrierTag = face.tags.includes("parapet_barrier");

    // Preserve pre-existing semantic tags and resolve shared-boundary tag bleed
    if (hasPierTag && hasDeckTag) {
      // Shared boundary between deck and pier: resolve by structural orientation
      if (isVertical) {
        untagFace(face, "deck_slab");
        face.semanticCategory = "PIER";
      } else {
        untagFace(face, "pier_column");
        face.semanticCategory = "DECK";
      }
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }
    if (hasDeckTag) {
      face.semanticCategory = "DECK";
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }
    if (hasPierTag) {
      face.semanticCategory = "PIER";
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }
    if (hasBarrierTag) {
      face.semanticCategory = "BARRIER";
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }
    if (face.tags.includes("culvert_barrel")) {
      face.semanticCategory = "OUTER_WALL";
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }
    if (face.tags.includes("culvert_wall")) {
      face.semanticCategory = "OUTER_WALL";
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }
    if (face.tags.includes("internal_cavity_void")) {
      face.semanticCategory = "VOID";
      taggedMap.set(face.id, [...face.tags]);
      continue;
    }

    // Rule 1: Odd nesting depth = internal void
    if (m.nestingDepth % 2 === 1 || face.semanticCategory === "VOID") {
      tagFace(face, "internal_cavity_void");
      face.semanticCategory = "VOID";
    } else if (effectiveContext === "culvert") {
      if (m.hasHoles) {
        tagFace(face, "culvert_barrel");
        face.semanticCategory = "OUTER_WALL";
      } else {
        tagFace(face, "culvert_wall");
        face.semanticCategory = "OUTER_WALL";
      }
    } else {
      // Bridge context classification using rotation-invariant principal axis & aspect ratio
      if (m.aspectRatio >= 2.0 && isHorizontal) {
        untagFace(face, "pier_column");
        untagFace(face, "culvert_wall");
        untagFace(face, "parapet_barrier");
        tagFace(face, "deck_slab");
        face.semanticCategory = "DECK";
      } else if (m.aspectRatio >= 1.2 && isVertical) {
        untagFace(face, "deck_slab");
        untagFace(face, "culvert_wall");
        untagFace(face, "parapet_barrier");
        tagFace(face, "pier_column");
        face.semanticCategory = "PIER";
      } else if (isNearTop && m.aspectRatio < 2.0) {
        untagFace(face, "deck_slab");
        untagFace(face, "pier_column");
        untagFace(face, "culvert_wall");
        tagFace(face, "parapet_barrier");
        face.semanticCategory = "BARRIER";
      } else {
        untagFace(face, "deck_slab");
        untagFace(face, "pier_column");
        tagFace(face, "culvert_wall");
        if (face.semanticCategory === "UNCLASSIFIED") {
          face.semanticCategory = "OUTER_WALL";
        }
      }
    }

    taggedMap.set(face.id, [...face.tags]);
  }

  return taggedMap;
}
