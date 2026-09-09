/**
 * Universal Level-1 Candidate Detection Engine
 * UPCE-MASTER-1.0 §86, §5.2, Part VI (GEOM-RP/1), Gate G2 (§76)
 *
 * Replaces axis-aligned bounding boxes (computeShapeBounds) with real edge-to-edge
 * vector predicates evaluated on DCEL half-edges, vertices, and cycles.
 *
 * Gated by SVD row-space admissibility (evaluateCandidateAdmissibility) per §32.
 * Zero shape-type branching is strictly enforced.
 */

import { Point2D, DcelVertex, DcelHalfEdge, DcelFace } from "../geometry/topology/types";
import { DcelPlanarMap, DcelSegmentInput } from "../geometry/topology/dcel";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import {
  evaluateParallel,
  evaluateParallelOffset,
  evaluateCoincidence,
  evaluatePointOnLine,
  evaluateSegmentLength,
  evaluateEqualLength,
  evaluatePerpendicular,
  evaluateCornerChamfer,
  evaluateConcentricRadialOffset,
  evaluateTangencyLineCircle,
  evaluateTangencyCircleCircle,
  evaluatePointOnCircle,
  evaluateSignedAngle,
  evaluateSymmetry,
  SegmentPrimitive,
  CirclePrimitive,
  ArcPrimitive,
} from "../geometry/predicates/vectorPredicates";
import {
  evaluateCandidateAdmissibility,
  AdmissibilityEvaluation,
} from "./admissibilityFilter";
import {
  ConstraintCandidate,
  CandidatePredicateType,
  clusterCandidates,
  MergedParameterCard,
} from "./candidateClusterer";

export interface DetectionOptions {
  policy?: TolerancePolicy;
  conformanceLevel?: 1 | 2 | 3; // GEOM-RP/1 Clause 9 Conformance Level (default: 1)
  predicateTypes?: CandidatePredicateType[];
  currentJacobian?: number[][];
  discardRedundant?: boolean; // If true, redundant candidates are discarded silently per §32
  minOffsetMm?: number;       // Minimum wall thickness / offset (default: 1.0 mm)
  maxOffsetMm?: number;       // Maximum wall thickness / offset (default: 5000.0 mm)
  contextId?: string;
  vertexIndexMap?: Map<string, number>;
  evaluateResidual?: (cand: {
    entityIds: string[];
    nominalValue: number;
    predicate: CandidatePredicateType;
  }) => number;
  candidateResiduals?: Map<string, number> | Record<string, number>;
  directOnly?: boolean;       // If true, filters out intervening parallel edges (default: true)
  circles?: CirclePrimitive[]; // Level-2 circular primitives
}

/**
 * Builds a deterministic vertex ID -> variable index lookup for Jacobian and gradient construction.
 */
export function buildVertexIndexMap(map: DcelPlanarMap): Map<string, number> {
  const vertexIndexMap = new Map<string, number>();
  let idx = 0;
  for (const vId of map.vertices.keys()) {
    vertexIndexMap.set(vId, idx++);
  }
  return vertexIndexMap;
}

/**
 * Extracts discrete edge primitives from a DCEL planar map.
 * Merges twin half-edges into unique undirected topological edges.
 */
export function extractDcelEdges(map: DcelPlanarMap): Array<{
  edgeId: string;
  startVertexId: string;
  endVertexId: string;
  primitive: SegmentPrimitive;
  sourceShapeId?: string;
  faceIds: string[];
}> {
  const edges: Array<{
    edgeId: string;
    startVertexId: string;
    endVertexId: string;
    primitive: SegmentPrimitive;
    sourceShapeId?: string;
    faceIds: string[];
  }> = [];

  for (const edge of map.edges.values()) {
    const he = map.halfEdges.get(edge.halfEdge);
    if (!he) continue;
    const twin = map.halfEdges.get(he.twin);

    const vStart = map.vertices.get(he.origin);
    const vEnd = map.vertices.get(he.target);
    if (!vStart || !vEnd) continue;

    const faceIds: string[] = [];
    if (he.face) faceIds.push(he.face);
    if (twin && twin.face) faceIds.push(twin.face);

    edges.push({
      edgeId: edge.id,
      startVertexId: vStart.id,
      endVertexId: vEnd.id,
      primitive: {
        id: edge.id,
        start: { x: vStart.point.x, y: vStart.point.y },
        end: { x: vEnd.point.x, y: vEnd.point.y },
        sourceShapeId: edge.sourceShapeId ?? he.sourceShapeId,
        tags: he.tags,
      },
      sourceShapeId: edge.sourceShapeId ?? he.sourceShapeId,
      faceIds,
    });
  }

  return edges;
}

/**
 * Computes numerical gradient vector for a parallel offset constraint f(X) = offset(X) - target
 * with respect to 2D vertex coordinates X in the planar map.
 */
function computeOffsetGradient(
  vStartA: Point2D,
  vEndA: Point2D,
  vStartB: Point2D,
  vEndB: Point2D,
  vIdxStartA: number,
  vIdxEndA: number,
  vIdxStartB: number,
  vIdxEndB: number,
  totalVariables: number,
  nominalOffsetSign: number = 1.0
): number[] {
  const g = new Array<number>(totalVariables).fill(0);
  const h = 1e-6;

  const evalOffset = (
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    p4: Point2D
  ): number => {
    const dAx = p2.x - p1.x;
    const dAy = p2.y - p1.y;
    const lenA = Math.hypot(dAx, dAy);
    if (lenA < 1e-9) return 0;
    const nAx = -dAy / lenA;
    const nAy = dAx / lenA;

    const rStart_x = p3.x - p1.x;
    const rStart_y = p3.y - p1.y;
    const rEnd_x = p4.x - p1.x;
    const rEnd_y = p4.y - p1.y;

    const offStart = rStart_x * nAx + rStart_y * nAy;
    const offEnd = rEnd_x * nAx + rEnd_y * nAy;
    return nominalOffsetSign * ((offStart + offEnd) / 2.0);
  };

  const pts = [
    { ...vStartA },
    { ...vEndA },
    { ...vStartB },
    { ...vEndB },
  ];
  const varIndices = [
    vIdxStartA * 2, vIdxStartA * 2 + 1,
    vIdxEndA * 2, vIdxEndA * 2 + 1,
    vIdxStartB * 2, vIdxStartB * 2 + 1,
    vIdxEndB * 2, vIdxEndB * 2 + 1,
  ];

  for (let i = 0; i < 4; i++) {
    // x coordinate
    pts[i].x += h;
    const fPlusX = evalOffset(pts[0], pts[1], pts[2], pts[3]);
    pts[i].x -= 2 * h;
    const fMinusX = evalOffset(pts[0], pts[1], pts[2], pts[3]);
    pts[i].x += h;
    g[varIndices[i * 2]] = (fPlusX - fMinusX) / (2 * h);

    // y coordinate
    pts[i].y += h;
    const fPlusY = evalOffset(pts[0], pts[1], pts[2], pts[3]);
    pts[i].y -= 2 * h;
    const fMinusY = evalOffset(pts[0], pts[1], pts[2], pts[3]);
    pts[i].y += h;
    g[varIndices[i * 2 + 1]] = (fPlusY - fMinusY) / (2 * h);
  }

  return g;
}

/**
 * Checks whether an edge eM lies strictly between eA and eB along their normal direction
 * with overlapping longitudinal projection, blocking direct line-of-sight between eA and eB.
 */
function hasInterveningParallelEdge(
  eA: SegmentPrimitive,
  eB: SegmentPrimitive,
  allEdges: Array<{ primitive: SegmentPrimitive; edgeId: string }>,
  policy: TolerancePolicy
): boolean {
  const offAB = evaluateParallelOffset(eA, eB, policy);
  if (!offAB.isOffset) return false;
  const tB = offAB.nominalOffset;

  for (const m of allEdges) {
    if (m.primitive.id === eA.id || m.primitive.id === eB.id) continue;
    const offAM = evaluateParallelOffset(eA, m.primitive, policy);
    if (!offAM.isOffset) continue;
    const tM = offAM.nominalOffset;

    // Check if tM is strictly between 0 and tB with margin
    const isBetween =
      (tB > policy.geometry_mm && tM > policy.geometry_mm && tM < tB - policy.geometry_mm) ||
      (tB < -policy.geometry_mm && tM < -policy.geometry_mm && tM > tB + policy.geometry_mm);

    if (isBetween && offAM.overlapLength >= policy.geometry_mm) {
      const offMB = evaluateParallelOffset(m.primitive, eB, policy);
      if (offMB.overlapLength >= policy.geometry_mm) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves candidate constraint residual from options (if provided).
 */
function getCandidateResidual(
  predicate: CandidatePredicateType,
  entityIds: string[],
  nominalValue: number,
  options: DetectionOptions
): number {
  if (options.evaluateResidual) {
    return options.evaluateResidual({ predicate, entityIds, nominalValue });
  }
  if (options.candidateResiduals) {
    const k1 = entityIds.join("::");
    const k2 = [...entityIds].reverse().join("::");
    if (options.candidateResiduals instanceof Map) {
      return options.candidateResiduals.get(k1) ?? options.candidateResiduals.get(k2) ?? 0.0;
    }
    return options.candidateResiduals[k1] ?? options.candidateResiduals[k2] ?? 0.0;
  }
  return 0.0;
}

/**
 * Detects Level-1 candidates from a DCEL Planar Map without bounding boxes.
 * Evaluates real edge-to-edge normal projections and vertex coincidence.
 */
export function detectCandidatesFromDcel(
  map: DcelPlanarMap,
  options: DetectionOptions = {}
): ConstraintCandidate[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const minOffset = options.minOffsetMm ?? 1.0;
  const maxOffset = options.maxOffsetMm ?? 5000.0;
  const discardRedundant = options.discardRedundant ?? false;
  const directOnly = options.directOnly ?? true;
  const currentJacobian = options.currentJacobian;

  const edges = extractDcelEdges(map);
  const candidates: ConstraintCandidate[] = [];
  let candidateCounter = 0;

  const level = options.conformanceLevel ?? (options.circles && options.circles.length > 0 ? 2 : 1);
  const shouldDetect = (pred: CandidatePredicateType): boolean => {
    if (options.predicateTypes) return options.predicateTypes.includes(pred);
    if (pred === "P1_PARALLEL" || pred === "P3_PARALLEL_OFFSET" || pred === "P8_COINCIDENCE") return true;
    if (level >= 2) {
      if (
        pred === "P2_PERPENDICULAR" ||
        pred === "P4_CORNER_CHAMFER" ||
        pred === "P5_CONCENTRIC_RADIAL_OFFSET" ||
        pred === "P6_TANGENT" ||
        pred === "POINT_ON_CIRCLE" ||
        pred === "SIGNED_ANGLE"
      ) {
        return true;
      }
    }
    if (level >= 3) {
      if (pred === "EQUAL_LENGTH" || pred === "P9_SYMMETRY") return true;
    }
    return false;
  };

  // Build vertex index lookup for SVD gradient construction
  const vertexIndexMap = options.vertexIndexMap ?? buildVertexIndexMap(map);
  const totalCoords = map.vertices.size * 2;

  // 1. Edge-to-Edge Predicate Evaluation (P1 Parallel and P3 Parallel Offset)
  if (shouldDetect("P3_PARALLEL_OFFSET")) {
    for (let i = 0; i < edges.length; i++) {
      const eA = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const eB = edges[j];

      // Evaluate Parallel Offset (P3)
      const offsetRes = evaluateParallelOffset(eA.primitive, eB.primitive, policy);
      if (
        offsetRes.isOffset &&
        offsetRes.thickness >= minOffset &&
        offsetRes.thickness <= maxOffset &&
        offsetRes.overlapLength >= policy.geometry_mm
      ) {
        // Direct adjacency check to eliminate multi-layer intervening edges
        if (directOnly && hasInterveningParallelEdge(eA.primitive, eB.primitive, edges, policy)) {
          continue;
        }

        // Construct gradient for SVD admissibility
        const vStartA = map.vertices.get(eA.startVertexId)!.point;
        const vEndA = map.vertices.get(eA.endVertexId)!.point;
        const vStartB = map.vertices.get(eB.startVertexId)!.point;
        const vEndB = map.vertices.get(eB.endVertexId)!.point;

        const offsetSign = Math.sign(offsetRes.nominalOffset) || 1.0;

        const grad = computeOffsetGradient(
          vStartA,
          vEndA,
          vStartB,
          vEndB,
          vertexIndexMap.get(eA.startVertexId)!,
          vertexIndexMap.get(eA.endVertexId)!,
          vertexIndexMap.get(eB.startVertexId)!,
          vertexIndexMap.get(eB.endVertexId)!,
          totalCoords,
          offsetSign
        );

        const entityIds = [eA.edgeId, eB.edgeId];
        const candResidual = getCandidateResidual(
          "P3_PARALLEL_OFFSET",
          entityIds,
          offsetRes.thickness,
          options
        );

        let status: ConstraintCandidate["status"] = "admissible";
        let diagnosis: string | undefined;

        if (currentJacobian) {
          const evalRes: AdmissibilityEvaluation = evaluateCandidateAdmissibility(
            currentJacobian,
            grad,
            candResidual,
            { policy }
          );
          status = evalRes.isAdmissible
            ? "admissible"
            : evalRes.status === "conflicting"
            ? "conflicting"
            : evalRes.status === "redundant"
            ? "redundant"
            : "pending";
          diagnosis = evalRes.diagnosis;
        }

        if (discardRedundant && status === "redundant") {
          continue; // Discard silently per §32
        }

        // Infer parameter name from topological face nesting depth
        const commonFaces = eA.faceIds.filter((fid) => eB.faceIds.includes(fid));
        let isVoidSpan = false;
        let isSolidWall = false;
        for (const fid of commonFaces) {
          const f = map.faces.get(fid);
          if (f && !f.isExterior) {
            if (f.nestingDepth % 2 === 0) {
              isSolidWall = true;
            } else {
              isVoidSpan = true;
            }
          }
        }

        let parameterName = "WallThickness";
        let displayName = "Wall Thickness";
        if (isVoidSpan && !isSolidWall) {
          parameterName = "ClearSpan";
          displayName = "Clear Span";
        }

        candidates.push({
          id: `cand_offset_${++candidateCounter}`,
          predicate: "P3_PARALLEL_OFFSET",
          entityIds,
          nominalValue: offsetRes.thickness,
          measuredDeviation: offsetRes.deviation,
          confidence: offsetRes.deviation < 1e-4 ? "GeometricFact" : "Inference",
          status,
          provenance: "GEOM-RP/1-P3",
          contextId: options.contextId,
          parameterName,
          displayName,
          description: `Parallel offset of ${offsetRes.thickness.toFixed(2)} mm between edge ${eA.edgeId} and ${eB.edgeId}`,
          gradient: grad,
          residual: candResidual,
          diagnosis,
        });
      }
    }
  }
}

  // 2. Vertex Coincidence Evaluation (P8)
  if (shouldDetect("P8_COINCIDENCE")) {
    const vertices = Array.from(map.vertices.values());
    for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const vA = vertices[i];
      const vB = vertices[j];
      const coincRes = evaluateCoincidence(vA.point, vB.point, policy);
      if (coincRes.isCoincident && coincRes.distance > 1e-9) {
        const entityIds = [vA.id, vB.id];
        const candResidual = getCandidateResidual(
          "P8_COINCIDENCE",
          entityIds,
          coincRes.distance,
          options
        );

        // Construct analytical gradient for coincidence distance constraint
        const grad = new Array<number>(totalCoords).fill(0);
        const dist = coincRes.distance > 1e-9 ? coincRes.distance : 1e-6;
        const iA = vertexIndexMap.get(vA.id)!;
        const iB = vertexIndexMap.get(vB.id)!;
        grad[iA * 2] = (vA.point.x - vB.point.x) / dist;
        grad[iA * 2 + 1] = (vA.point.y - vB.point.y) / dist;
        grad[iB * 2] = -(vA.point.x - vB.point.x) / dist;
        grad[iB * 2 + 1] = -(vA.point.y - vB.point.y) / dist;

        let status: ConstraintCandidate["status"] = "admissible";
        let diagnosis: string | undefined;

        if (currentJacobian) {
          const evalRes: AdmissibilityEvaluation = evaluateCandidateAdmissibility(
            currentJacobian,
            grad,
            candResidual,
            { policy }
          );
          status = evalRes.isAdmissible
            ? "admissible"
            : evalRes.status === "conflicting"
            ? "conflicting"
            : evalRes.status === "redundant"
            ? "redundant"
            : "pending";
          diagnosis = evalRes.diagnosis;
        }

        if (discardRedundant && status === "redundant") {
          continue;
        }

        candidates.push({
          id: `cand_coinc_${++candidateCounter}`,
          predicate: "P8_COINCIDENCE",
          entityIds,
          nominalValue: coincRes.distance,
          measuredDeviation: coincRes.distance,
          confidence: "GeometricFact",
          status,
          provenance: "GEOM-RP/1-P8",
          contextId: options.contextId,
          parameterName: "VertexWeld",
          displayName: "Vertex Weld",
          description: `Coincident vertices ${vA.id} and ${vB.id} within weld tolerance (${coincRes.distance.toFixed(3)} mm)`,
          gradient: grad,
          residual: candResidual,
          diagnosis,
        });
      }
    }
  }
}

  // 3. Perpendicular Edge Pairs (P2)
  if (shouldDetect("P2_PERPENDICULAR")) {
    for (let i = 0; i < edges.length; i++) {
      const eA = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const eB = edges[j];
      const sharesVertex =
        eA.startVertexId === eB.startVertexId ||
        eA.startVertexId === eB.endVertexId ||
        eA.endVertexId === eB.startVertexId ||
        eA.endVertexId === eB.endVertexId;

      if (!sharesVertex) continue;

      const perpRes = evaluatePerpendicular(eA.primitive, eB.primitive, policy);
      if (perpRes.isPerpendicular) {
        const entityIds = [eA.edgeId, eB.edgeId];
        const candResidual = Math.abs(perpRes.cosTheta);

        let status: ConstraintCandidate["status"] = "admissible";
        let diagnosis: string | undefined;

        if (currentJacobian) {
          const grad = new Array<number>(totalCoords).fill(0);
          const iA1 = vertexIndexMap.get(eA.startVertexId)!;
          const iA2 = vertexIndexMap.get(eA.endVertexId)!;
          const iB1 = vertexIndexMap.get(eB.startVertexId)!;
          const iB2 = vertexIndexMap.get(eB.endVertexId)!;

          const dxA = eA.primitive.end.x - eA.primitive.start.x;
          const dyA = eA.primitive.end.y - eA.primitive.start.y;
          const lenA = Math.hypot(dxA, dyA) + 1e-15;
          const dxB = eB.primitive.end.x - eB.primitive.start.x;
          const dyB = eB.primitive.end.y - eB.primitive.start.y;
          const lenB = Math.hypot(dxB, dyB) + 1e-15;

          const uAx = dxA / lenA;
          const uAy = dyA / lenA;
          const uBx = dxB / lenB;
          const uBy = dyB / lenB;

          grad[iA1 * 2] += -uBx;
          grad[iA1 * 2 + 1] += -uBy;
          grad[iA2 * 2] += uBx;
          grad[iA2 * 2 + 1] += uBy;

          grad[iB1 * 2] += -uAx;
          grad[iB1 * 2 + 1] += -uAy;
          grad[iB2 * 2] += uAx;
          grad[iB2 * 2 + 1] += uAy;

          const evalRes = evaluateCandidateAdmissibility(currentJacobian, grad, candResidual, { policy });
          status = evalRes.isAdmissible
            ? "admissible"
            : evalRes.status === "conflicting"
            ? "conflicting"
            : evalRes.status === "redundant"
            ? "redundant"
            : "pending";
          diagnosis = evalRes.diagnosis;
        }

        if (discardRedundant && status === "redundant") {
          continue;
        }

        candidates.push({
          id: `cand_perp_${++candidateCounter}`,
          predicate: "P2_PERPENDICULAR",
          entityIds,
          nominalValue: 90.0,
          measuredDeviation: Math.abs(perpRes.cosTheta),
          confidence: Math.abs(perpRes.cosTheta) < 1e-4 ? "GeometricFact" : "Inference",
          status,
          provenance: "GEOM-RP/1-P2",
          contextId: options.contextId,
          parameterName: "SquareCorner",
          displayName: "Square Corner",
          description: `Perpendicular edges ${eA.edgeId} and ${eB.edgeId} (cosθ = ${perpRes.cosTheta.toFixed(4)})`,
          residual: candResidual,
          diagnosis,
        });
      }
    }
  }
}

  // 4. Corner Chamfer Detection in DCEL face cycles (P4)
  if (shouldDetect("P4_CORNER_CHAMFER")) {
    const seenChamferEdges = new Set<string>();
    for (const face of map.faces.values()) {
    if (face.isExterior) continue;

    const startHalfEdges: string[] = [];
    if (face.outerBoundary) startHalfEdges.push(face.outerBoundary);
    if (face.innerHoles) startHalfEdges.push(...face.innerHoles);

    for (const startHe of startHalfEdges) {
      const cycleHalfEdges: DcelHalfEdge[] = [];
      let currKey: string | undefined = startHe;
      const visited = new Set<string>();

      while (currKey && !visited.has(currKey)) {
        visited.add(currKey);
        const he = map.halfEdges.get(currKey);
        if (!he) break;
        cycleHalfEdges.push(he);
        currKey = he.next;
      }

    const m = cycleHalfEdges.length;
    if (m >= 3) {
      for (let k = 0; k < m; k++) {
        const hePrev = cycleHalfEdges[(k - 1 + m) % m];
        const heChamfer = cycleHalfEdges[k];
        const heNext = cycleHalfEdges[(k + 1) % m];

        if (seenChamferEdges.has(heChamfer.edge)) continue;

        const vP1 = map.vertices.get(hePrev.origin)?.point;
        const vP2 = map.vertices.get(hePrev.target)?.point;
        const vC1 = map.vertices.get(heChamfer.origin)?.point;
        const vC2 = map.vertices.get(heChamfer.target)?.point;
        const vN1 = map.vertices.get(heNext.origin)?.point;
        const vN2 = map.vertices.get(heNext.target)?.point;

        if (!vP1 || !vP2 || !vC1 || !vC2 || !vN1 || !vN2) continue;

        const edgeA: SegmentPrimitive = { id: hePrev.edge, start: vP1, end: vP2 };
        const chamferEdge: SegmentPrimitive = { id: heChamfer.edge, start: vC1, end: vC2 };
        const edgeB: SegmentPrimitive = { id: heNext.edge, start: vN1, end: vN2 };

        const lenA = Math.hypot(vP2.x - vP1.x, vP2.y - vP1.y);
        const lenC = Math.hypot(vC2.x - vC1.x, vC2.y - vC1.y);
        const lenB = Math.hypot(vN2.x - vN1.x, vN2.y - vN1.y);

        const chamferRes = evaluateCornerChamfer(edgeA, edgeB, chamferEdge, policy);
        if (chamferRes.isChamfer && lenC < lenA && lenC < lenB && chamferRes.legA <= 500) {
          seenChamferEdges.add(heChamfer.edge);
          const entityIds = [hePrev.edge, heChamfer.edge, heNext.edge];
          const legVal = chamferRes.isEqualLeg
            ? (chamferRes.legA + chamferRes.legB) / 2.0
            : chamferRes.legA;

          candidates.push({
            id: `cand_chamfer_${++candidateCounter}`,
            predicate: "P4_CORNER_CHAMFER",
            entityIds,
            nominalValue: legVal,
            measuredDeviation: chamferRes.legDelta,
            confidence: chamferRes.isEqualLeg ? "GeometricFact" : "Inference",
            status: "admissible",
            provenance: "GEOM-RP/1-P4",
            contextId: face.id,
            parameterName: chamferRes.isEqualLeg ? "HaunchLeg" : "CornerChamfer",
            displayName: chamferRes.isEqualLeg ? "Haunch Leg" : "Corner Chamfer",
            description: `Chamfer at ${(chamferRes.angleDeg).toFixed(1)}° with legs ${chamferRes.legA.toFixed(1)} mm and ${chamferRes.legB.toFixed(1)} mm`,
          });
        }
      }
    }
  }
}
}

  // 5. Circular & Tangent Relationships (P5 Concentric & P6 Tangent)
  if (
    options.circles &&
    options.circles.length > 0 &&
    (shouldDetect("P5_CONCENTRIC_RADIAL_OFFSET") || shouldDetect("P6_TANGENT"))
  ) {
    const circles = options.circles;
    for (let i = 0; i < circles.length; i++) {
      const cA = circles[i];
      for (let j = i + 1; j < circles.length; j++) {
        const cB = circles[j];
        // P5 Concentric
        const concRes = evaluateConcentricRadialOffset(cA, cB, policy);
        if (concRes.isConcentric) {
          candidates.push({
            id: `cand_conc_${++candidateCounter}`,
            predicate: "P5_CONCENTRIC_RADIAL_OFFSET",
            entityIds: [cA.id ?? `circle_${i}`, cB.id ?? `circle_${j}`],
            nominalValue: concRes.radialOffset,
            measuredDeviation: concRes.centerDistance,
            confidence: "GeometricFact",
            status: "admissible",
            provenance: "GEOM-RP/1-P5",
            contextId: options.contextId,
            parameterName: "RadialOffset",
            displayName: "Radial Offset",
            description: `Concentric radial offset of ${concRes.radialOffset.toFixed(2)} mm (center delta: ${concRes.centerDistance.toFixed(3)} mm)`,
          });
        }

        // P6 Circle-Circle Tangent
        const tanCC = evaluateTangencyCircleCircle(cA, cB, policy);
        if (tanCC.isTangent) {
          candidates.push({
            id: `cand_tan_cc_${++candidateCounter}`,
            predicate: "P6_TANGENT",
            entityIds: [cA.id ?? `circle_${i}`, cB.id ?? `circle_${j}`],
            nominalValue: tanCC.nominalDistance,
            measuredDeviation: tanCC.deviation,
            confidence: "GeometricFact",
            status: "admissible",
            provenance: "GEOM-RP/1-P6",
            contextId: options.contextId,
            parameterName: "TangentContact",
            displayName: "Tangent Contact",
            description: `${tanCC.tangencyType.toUpperCase()} tangency between circles (deviation: ${tanCC.deviation.toFixed(3)} mm)`,
          });
        }
      }

      // P6 Line-Circle Tangent against DCEL edges
      for (const edge of edges) {
        const tanLC = evaluateTangencyLineCircle(edge.primitive, cA, policy);
        if (tanLC.isTangent) {
          candidates.push({
            id: `cand_tan_lc_${++candidateCounter}`,
            predicate: "P6_TANGENT",
            entityIds: [edge.edgeId, cA.id ?? `circle_${i}`],
            nominalValue: cA.radius,
            measuredDeviation: tanLC.deviation,
            confidence: tanLC.isOnSegment ? "GeometricFact" : "Inference",
            status: "admissible",
            provenance: "GEOM-RP/1-P6",
            contextId: options.contextId,
            parameterName: "TangentContact",
            displayName: "Tangent Contact",
            description: `Line-to-circle tangency between edge ${edge.edgeId} and circle (deviation: ${tanLC.deviation.toFixed(3)} mm)`,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Builds DCEL planar map from discrete segment inputs and executes candidate detection.
 * Evaluates edge-to-edge predicates on DCEL topology and detects coincidence on raw segment endpoints.
 */
export function detectCandidatesFromSegments(
  segments: DcelSegmentInput[],
  options: DetectionOptions = {}
): ConstraintCandidate[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const map = DcelPlanarMap.buildFromSegments(segments, { policy });
  const dcelCandidates = detectCandidatesFromDcel(map, options);

  // Scan input segment endpoints for P8 coincidence candidates before topological welding
  const rawCoincidenceCandidates: ConstraintCandidate[] = [];
  const ptPairsSeen = new Set<string>();
  let coincCounter = 0;

  for (let i = 0; i < segments.length; i++) {
    const sA = segments[i];
    const ptsA = [
      { pt: sA.p1, name: `${sA.sourceShapeId ?? "seg"}_${i}_start` },
      { pt: sA.p2, name: `${sA.sourceShapeId ?? "seg"}_${i}_end` },
    ];
    for (let j = i + 1; j < segments.length; j++) {
      const sB = segments[j];
      const ptsB = [
        { pt: sB.p1, name: `${sB.sourceShapeId ?? "seg"}_${j}_start` },
        { pt: sB.p2, name: `${sB.sourceShapeId ?? "seg"}_${j}_end` },
      ];
      for (const pA of ptsA) {
        for (const pB of ptsB) {
          const pairKey = pA.name < pB.name ? `${pA.name}::${pB.name}` : `${pB.name}::${pA.name}`;
          if (ptPairsSeen.has(pairKey)) continue;
          ptPairsSeen.add(pairKey);

          const coincRes = evaluateCoincidence(pA.pt, pB.pt, policy);
          if (coincRes.isCoincident && coincRes.distance > 1e-9) {
            const entityIds = [pA.name, pB.name];
            const candResidual = getCandidateResidual(
              "P8_COINCIDENCE",
              entityIds,
              coincRes.distance,
              options
            );

            rawCoincidenceCandidates.push({
              id: `cand_coinc_raw_${++coincCounter}`,
              predicate: "P8_COINCIDENCE",
              entityIds,
              nominalValue: coincRes.distance,
              measuredDeviation: coincRes.distance,
              confidence: "GeometricFact",
              status: "admissible",
              provenance: "GEOM-RP/1-P8",
              contextId: options.contextId,
              parameterName: "VertexWeld",
              displayName: "Vertex Weld",
              description: `Coincident endpoints ${pA.name} and ${pB.name} within weld tolerance (${coincRes.distance.toFixed(3)} mm)`,
              residual: candResidual,
            });
          }
        }
      }
    }
  }

  return [...dcelCandidates, ...rawCoincidenceCandidates];
}

/**
 * Full candidate detection and clustering pipeline.
 * Evaluates predicates on real geometry, clusters candidates, and produces merged parameter cards.
 */
export function detectAndClusterCandidates(
  target: DcelPlanarMap | DcelSegmentInput[],
  options: DetectionOptions = {}
): {
  candidates: ConstraintCandidate[];
  cards: MergedParameterCard[];
} {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const candidates = Array.isArray(target)
    ? detectCandidatesFromSegments(target, options)
    : detectCandidatesFromDcel(target, options);

  const cards = clusterCandidates(candidates, policy);
  return { candidates, cards };
}
