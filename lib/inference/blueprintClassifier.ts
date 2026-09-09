/**
 * Domain Blueprint Auto-Classification Engine
 * UPCE-MASTER-1.0 §86, §39–§42, Gate G8 (§76)
 *
 * Autonomously recognizes standard civil infrastructure topologies from raw un-annotated
 * CAD line/arc sketches and DCEL planar maps:
 * - single_cell_culvert: 1 outer solid boundary enclosing 1 cavity void (with/without haunches)
 * - multi_cell_culvert: 1 outer solid boundary enclosing N >= 2 cavity voids side-by-side
 * - bridge_pier: Multi-stage vertical column assembly (pier cap, column shaft, footing pad)
 * - parapet_barrier: Crash barrier / parapet wall profile (vertical back, sloped crash face)
 * - retaining_wall: Cantilever T or L retaining wall profile (stem, footing base)
 * - generic_frame: Closed orthogonal / polygonal structural framework
 *
 * Populates curated semantic dictionary vocabulary and driving parameter cards.
 */

import { Point2D, DcelFace, DcelHalfEdge } from "../geometry/topology/types";
import { DcelPlanarMap, DcelSegmentInput } from "../geometry/topology/dcel";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import {
  evaluateCornerChamfer,
  evaluateParallelOffset,
  SegmentPrimitive,
} from "../geometry/predicates/vectorPredicates";
import {
  computeFaceBoundaryMetrics,
  FaceBoundaryMetrics,
  extractFaceBoundaryCycles,
  autoTagDcelFaces,
  tagFace,
  untagFace,
} from "../geometry/topology/semanticFaceTagger";
import {
  CURATED_SEMANTIC_VOCABULARY,
  SemanticParameterDefinition,
  classifySemanticParameter,
} from "./semanticVocabulary";

export type BlueprintTopologyType =
  | "single_cell_culvert"
  | "multi_cell_culvert"
  | "bridge_pier"
  | "parapet_barrier"
  | "retaining_wall"
  | "generic_frame";

export interface BlueprintFeatureMetrics {
  outerDimensions: { width: number; height: number };
  cellCount: number;
  haunchCount: number;
  clearSpans: number[];
  clearHeights: number[];
  wallThicknesses: number[];
  topSlabThickness?: number;
  bottomSlabThickness?: number;
  intermediateWallThickness?: number;
  pierWidth?: number;
  pierHeight?: number;
  capWidth?: number;
  capHeight?: number;
  footingWidth?: number;
  footingHeight?: number;
  parapetHeight?: number;
  skewAngleDeg?: number;
}

export interface SuggestedParameterCard {
  name: string;
  displayName: string;
  value: number;
  unit: "mm" | "deg" | "m" | "count" | "ratio";
  role: "DRIVING" | "DERIVED" | "FIXED";
  range: { min: number; max: number };
  description: string;
  standardsReference?: string;
  category: string;
}

export interface DomainBlueprintClassification {
  topologyType: BlueprintTopologyType;
  confidence: number; // 0.0 to 1.0
  title: string;
  description: string;
  standardsReference?: string;
  features: BlueprintFeatureMetrics;
  faceTags: Map<string, string[]>;
  suggestedParameters: SuggestedParameterCard[];
}

export interface BlueprintClassifierOptions {
  policy?: TolerancePolicy;
  contextHint?: "culvert" | "bridge" | "auto";
}

/**
 * Computes dominant skew/rotation angle of sketch edges relative to horizontal.
 */
function computeDominantSkewAngle(map: DcelPlanarMap): number {
  const angleSamples: number[] = [];
  for (const edge of map.edges.values()) {
    const he = map.halfEdges.get(edge.halfEdge);
    if (!he) continue;
    const v1 = map.vertices.get(he.origin)?.point;
    const v2 = map.vertices.get(he.target)?.point;
    if (!v1 || !v2) continue;

    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const len = Math.hypot(dx, dy);
    if (len < 10.0) continue; // Skip micro segments

    let theta = Math.atan2(dy, dx);
    if (theta < 0) theta += Math.PI;
    // Map to [0, pi/2)
    const modAngle = theta % (Math.PI / 2);
    angleSamples.push(modAngle);
  }

  if (angleSamples.length === 0) return 0.0;
  angleSamples.sort((a, b) => a - b);
  const medianRad = angleSamples[Math.floor(angleSamples.length / 2)];
  const deg = (medianRad * 180.0) / Math.PI;
  // If close to 0 or 90, skew is 0
  if (deg < 2.0 || Math.abs(deg - 90.0) < 2.0) return 0.0;
  return deg;
}

/**
 * Helper to build a suggested parameter record from curated vocabulary.
 */
function createSuggestedParam(
  name: string,
  value: number,
  overrides?: Partial<SuggestedParameterCard>
): SuggestedParameterCard {
  const def = CURATED_SEMANTIC_VOCABULARY[name];
  const roundedVal = Math.round(value * 100) / 100;
  if (def) {
    return {
      name: def.name,
      displayName: def.displayName,
      value: roundedVal,
      unit: def.defaultUnit,
      role: def.role,
      range: { min: def.standardRange.min, max: def.standardRange.max },
      description: def.description,
      standardsReference: def.standardsReference,
      category: def.category,
      ...overrides,
    };
  }
  return {
    name,
    displayName: name.replace(/([A-Z])/g, " $1").trim(),
    value: roundedVal,
    unit: "mm",
    role: "DRIVING",
    range: { min: 10, max: 50000 },
    description: `Parametric dimension for ${name}`,
    category: "general",
    ...overrides,
  };
}

/**
 * Counts corner haunches in a polygon cycle.
 */
function countCycleHaunches(
  cycle: Point2D[],
  policy: TolerancePolicy
): { count: number; avgLegLength: number } {
  const m = cycle.length;
  if (m < 4) return { count: 0, avgLegLength: 0 };

  let count = 0;
  let totalLeg = 0;

  for (let k = 0; k < m; k++) {
    const pPrev = cycle[(k - 1 + m) % m];
    const pCurr = cycle[k];
    const pNext = cycle[(k + 1) % m];
    const pNext2 = cycle[(k + 2) % m];

    const lenA = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
    const lenC = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y);
    const lenB = Math.hypot(pNext2.x - pNext.x, pNext2.y - pNext.y);

    const edgeA: SegmentPrimitive = { id: `prev_${k}`, start: pPrev, end: pCurr };
    const chamferEdge: SegmentPrimitive = { id: `chamfer_${k}`, start: pCurr, end: pNext };
    const edgeB: SegmentPrimitive = { id: `next_${k}`, start: pNext, end: pNext2 };

    const res = evaluateCornerChamfer(edgeA, edgeB, chamferEdge, policy);
    const isHaunch =
      res.isChamfer &&
      res.isEqualLeg &&
      lenC < lenA &&
      lenC < lenB &&
      res.legA <= 500 &&
      Math.abs(res.cornerAngleDeg - 90.0) <= 15.0 &&
      Math.abs(res.angleDeg - 45.0) <= 15.0;

    if (isHaunch) {
      count++;
      totalLeg += (res.legA + res.legB) / 2.0;
    }
  }

  return {
    count,
    avgLegLength: count > 0 ? totalLeg / count : 0,
  };
}

/**
 * Autonomously classifies a domain blueprint from a DCEL planar map or segment array.
 */
export function classifyDomainBlueprint(
  target: DcelPlanarMap | DcelSegmentInput[],
  options: BlueprintClassifierOptions = {}
): DomainBlueprintClassification {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const map = Array.isArray(target)
    ? DcelPlanarMap.buildFromSegments(target, { policy })
    : target;

  const skewAngleDeg = computeDominantSkewAngle(map);

  const nonExteriorFaces = Array.from(map.faces.values()).filter((f) => !f.isExterior);
  if (nonExteriorFaces.length === 0) {
    return {
      topologyType: "generic_frame",
      confidence: 0.1,
      title: "Empty Sketch",
      description: "No closed geometric faces found.",
      features: {
        outerDimensions: { width: 0, height: 0 },
        cellCount: 0,
        haunchCount: 0,
        clearSpans: [],
        clearHeights: [],
        wallThicknesses: [],
      },
      faceTags: new Map(),
      suggestedParameters: [],
    };
  }

  // Compute boundary metrics for all interior faces
  const metricsList = nonExteriorFaces.map((f) => computeFaceBoundaryMetrics(map, f.id));

  // Separate solids (even nesting depth) from voids (odd nesting depth or hole cycles)
  const solidFaces: FaceBoundaryMetrics[] = [];
  const voidFaces: FaceBoundaryMetrics[] = [];

  for (const m of metricsList) {
    if (m.nestingDepth % 2 === 1) {
      voidFaces.push(m);
    } else {
      solidFaces.push(m);
    }
  }

  // Also check if any solid face has internal hole cycles that were not registered as separate faces
  const holeVoidMetrics: {
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    width: number;
    height: number;
    cycle: Point2D[];
  }[] = [];

  for (const s of solidFaces) {
    const { innerHoleCycles } = extractFaceBoundaryCycles(map, s.faceId);
    for (const hole of innerHoleCycles) {
      if (hole.length >= 3) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const pt of hole) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        holeVoidMetrics.push({
          bounds: { minX, maxX, minY, maxY },
          width: maxX - minX,
          height: maxY - minY,
          cycle: hole,
        });
      }
    }
  }

  // Global outer boundary
  let globalMinX = Infinity, maxX = -Infinity, globalMinY = Infinity, maxY = -Infinity;
  for (const m of metricsList) {
    if (m.boundingBox.minX < globalMinX) globalMinX = m.boundingBox.minX;
    if (m.boundingBox.maxX > maxX) maxX = m.boundingBox.maxX;
    if (m.boundingBox.minY < globalMinY) globalMinY = m.boundingBox.minY;
    if (m.boundingBox.maxY > maxY) maxY = m.boundingBox.maxY;
  }
  const totalWidth = Math.max(0, maxX - globalMinX);
  const totalHeight = Math.max(0, maxY - globalMinY);

  // Collect all void geometries (authoritative voidFaces takes priority over holes to prevent double counting)
  interface VoidInfo {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
    cycle: Point2D[];
  }
  const allVoids: VoidInfo[] = [];

  if (voidFaces.length > 0) {
    for (const vf of voidFaces) {
      const { outerCycle } = extractFaceBoundaryCycles(map, vf.faceId);
      allVoids.push({
        minX: vf.boundingBox.minX,
        maxX: vf.boundingBox.maxX,
        minY: vf.boundingBox.minY,
        maxY: vf.boundingBox.maxY,
        width: vf.width,
        height: vf.height,
        cycle: outerCycle,
      });
    }
  } else {
    for (const h of holeVoidMetrics) {
      allVoids.push({
        minX: h.bounds.minX,
        maxX: h.bounds.maxX,
        minY: h.bounds.minY,
        maxY: h.bounds.maxY,
        width: h.width,
        height: h.height,
        cycle: h.cycle,
      });
    }
  }

  const totalVoidsCount = allVoids.length;

  // --------------------------------------------------------------------------
  // Category 1: Single-Cell or Multi-Cell Box Culverts
  // --------------------------------------------------------------------------
  if (totalVoidsCount >= 1) {

    // Sort voids horizontally (by minX)
    allVoids.sort((a, b) => a.minX - b.minX);

    // Analyze haunches across all voids
    let totalHaunches = 0;
    let totalHaunchLeg = 0;
    for (const v of allVoids) {
      const { count, avgLegLength } = countCycleHaunches(v.cycle, policy);
      totalHaunches += count;
      if (count > 0) totalHaunchLeg += avgLegLength * count;
    }
    const avgHaunchLeg = totalHaunches > 0 ? totalHaunchLeg / totalHaunches : 0;

    const cellCount = allVoids.length;
    const clearSpans = allVoids.map((v) => v.width);
    const clearHeights = allVoids.map((v) => v.height);

    // Calculate exterior clearances
    const leftWall = allVoids[0].minX - globalMinX;
    const rightWall = maxX - allVoids[cellCount - 1].maxX;
    const bottomSlab = Math.min(...allVoids.map((v) => v.minY)) - globalMinY;
    const topSlab = maxY - Math.max(...allVoids.map((v) => v.maxY));

    const avgExtWall = (leftWall + rightWall) / 2.0;

    // Calculate intermediate walls if multi-cell
    const intermediateWalls: number[] = [];
    for (let i = 0; i < cellCount - 1; i++) {
      const gap = allVoids[i + 1].minX - allVoids[i].maxX;
      intermediateWalls.push(gap);
    }
    const avgInterWall =
      intermediateWalls.length > 0
        ? intermediateWalls.reduce((a, b) => a + b, 0) / intermediateWalls.length
        : undefined;

    // Tag DCEL faces
    autoTagDcelFaces(map, "culvert");
    const faceTags = new Map<string, string[]>();
    for (const f of map.faces.values()) {
      if (f.tags.length > 0) faceTags.set(f.id, [...f.tags]);
    }

    if (cellCount === 1) {
      // Single-Cell Box Culvert
      const suggestedParams: SuggestedParameterCard[] = [
        createSuggestedParam("ClearSpan", clearSpans[0]),
        createSuggestedParam("ClearHeight", clearHeights[0]),
        createSuggestedParam("WallThickness", avgExtWall),
        createSuggestedParam("TopSlabThickness", topSlab),
        createSuggestedParam("BottomSlabThickness", bottomSlab),
      ];
      if (totalHaunches > 0) {
        suggestedParams.push(createSuggestedParam("HaunchLeg", avgHaunchLeg));
      }

      return {
        topologyType: "single_cell_culvert",
        confidence: 0.98,
        title: "Single-Cell RCC Box Culvert",
        description: `Single-cell box culvert with ${clearSpans[0].toFixed(0)} mm clear span, ${clearHeights[0].toFixed(0)} mm clear height, ${avgExtWall.toFixed(0)} mm walls, and ${totalHaunches} corner haunches.`,
        standardsReference: "IRC:SP:13 Clause 12.1 / RDSO Standard Drawings",
        features: {
          outerDimensions: { width: totalWidth, height: totalHeight },
          cellCount: 1,
          haunchCount: totalHaunches,
          clearSpans,
          clearHeights,
          wallThicknesses: [leftWall, rightWall],
          topSlabThickness: topSlab,
          bottomSlabThickness: bottomSlab,
          skewAngleDeg,
        },
        faceTags,
        suggestedParameters: suggestedParams,
      };
    } else {
      // Multi-Cell Balancing Box Culvert
      const avgSpan = clearSpans.reduce((a, b) => a + b, 0) / cellCount;
      const avgHeight = clearHeights.reduce((a, b) => a + b, 0) / cellCount;

      const suggestedParams: SuggestedParameterCard[] = [
        createSuggestedParam("ClearSpan", avgSpan, {
          description: `Clear span for ${cellCount} balancing barrels`,
        }),
        createSuggestedParam("ClearHeight", avgHeight),
        {
          name: "CellCount",
          displayName: "Cell Count",
          value: cellCount,
          unit: "count",
          role: "DRIVING",
          range: { min: 2, max: 10 },
          description: "Number of continuous culvert barrels/cells",
          category: "component",
        },
      ];

      clearSpans.forEach((cSpan, idx) => {
        suggestedParams.push({
          name: `Bay${idx + 1}Span`,
          displayName: `Bay ${idx + 1} Clear Span`,
          value: Math.round(cSpan * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 500, max: 15000 },
          description: `Clear span of culvert bay ${idx + 1}`,
          standardsReference: "IRC:SP:13 Clause 12.1",
          category: "civil_structural",
        });
      });

      suggestedParams.push(
        createSuggestedParam("WallThickness", avgExtWall, {
          description: "Exterior left and right sidewall thickness",
        }),
        createSuggestedParam("TopSlabThickness", topSlab),
        createSuggestedParam("BottomSlabThickness", bottomSlab)
      );

      if (avgInterWall !== undefined) {
        suggestedParams.push({
          name: "IntermediateWallThickness",
          displayName: "Intermediate Wall Thickness",
          value: Math.round(avgInterWall * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 150, max: 1500 },
          description: "Structural thickness of dividing web walls between adjacent barrels",
          standardsReference: "IRC:SP:13 Clause 12.2 / RDSO Standard",
          category: "civil_structural",
        });
      }

      if (totalHaunches > 0) {
        suggestedParams.push(createSuggestedParam("HaunchLeg", avgHaunchLeg));
      }

      return {
        topologyType: "multi_cell_culvert",
        confidence: 0.99,
        title: `${cellCount}-Cell Balancing RCC Box Culvert`,
        description: `${cellCount}-cell culvert with average span ${avgSpan.toFixed(0)} mm, ${avgHeight.toFixed(0)} mm height, and ${avgInterWall?.toFixed(0) ?? avgExtWall.toFixed(0)} mm dividing web walls.`,
        standardsReference: "IRC:SP:13 Clause 12.1 / RDSO Multi-Cell Box Culvert Standards",
        features: {
          outerDimensions: { width: totalWidth, height: totalHeight },
          cellCount,
          haunchCount: totalHaunches,
          clearSpans,
          clearHeights,
          wallThicknesses: [leftWall, rightWall, ...(avgInterWall !== undefined ? [avgInterWall] : [])],
          topSlabThickness: topSlab,
          bottomSlabThickness: bottomSlab,
          intermediateWallThickness: avgInterWall,
          skewAngleDeg,
        },
        faceTags,
        suggestedParameters: suggestedParams,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Category 2: Bridge Pier / Substructure (Stacked solid faces)
  // --------------------------------------------------------------------------
  if (solidFaces.length >= 2) {
    // Sort solid faces vertically by centroid Y descending (top to bottom)
    const sortedSolids = [...solidFaces].sort((a, b) => b.centroid.y - a.centroid.y);

    const topFace = sortedSolids[0];
    const midFace = sortedSolids[1];
    const botFace = sortedSolids.length >= 3 ? sortedSolids[2] : undefined;

    // Check Pier Cap: wide top face
    const isCap = topFace.aspectRatio >= 1.5;
    // Check Pier Column: slender middle face
    const isColumn = midFace.height > midFace.width || midFace.aspectRatio < 1.2;

    if (isCap && isColumn) {
      // Bridge Pier detected
      autoTagDcelFaces(map, "bridge");
      const faceTags = new Map<string, string[]>();
      for (const f of map.faces.values()) {
        if (f.tags.length > 0) faceTags.set(f.id, [...f.tags]);
      }

      const pierWidth = midFace.width;
      const pierHeight = midFace.height;
      const capWidth = topFace.width;
      const capHeight = topFace.height;
      const footingWidth = botFace ? botFace.width : undefined;
      const footingHeight = botFace ? botFace.height : undefined;

      const suggestedParams: SuggestedParameterCard[] = [
        createSuggestedParam("PierWidth", pierWidth),
        {
          name: "PierHeight",
          displayName: "Pier Height",
          value: Math.round(pierHeight * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 1000, max: 30000 },
          description: "Clear vertical height of pier column shaft",
          standardsReference: "IRC:78 Clause 706",
          category: "civil_structural",
        },
        {
          name: "CapWidth",
          displayName: "Pier Cap Width",
          value: Math.round(capWidth * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 1000, max: 40000 },
          description: "Transverse width of bridge pier cap / head",
          standardsReference: "IRC:78 Clause 706.3",
          category: "civil_structural",
        },
        {
          name: "CapHeight",
          displayName: "Pier Cap Height",
          value: Math.round(capHeight * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 300, max: 4000 },
          description: "Structural depth/thickness of pier cap",
          category: "civil_structural",
        },
      ];

      if (footingWidth && footingHeight) {
        suggestedParams.push({
          name: "FootingWidth",
          displayName: "Footing Width",
          value: Math.round(footingWidth * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 1000, max: 40000 },
          description: "Transverse width of pier foundation footing pad",
          category: "civil_structural",
        });
        suggestedParams.push({
          name: "FootingHeight",
          displayName: "Footing Height",
          value: Math.round(footingHeight * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 300, max: 5000 },
          description: "Structural depth of pier foundation footing pad",
          category: "civil_structural",
        });
      }

      return {
        topologyType: "bridge_pier",
        confidence: 0.95,
        title: "RCC Bridge Pier Assembly",
        description: `Bridge substructure with ${pierWidth.toFixed(0)} mm column shaft and ${capWidth.toFixed(0)} mm pier cap.`,
        standardsReference: "IRC:78 Clause 706 / IRS Substructure Rules",
        features: {
          outerDimensions: { width: totalWidth, height: totalHeight },
          cellCount: 0,
          haunchCount: 0,
          clearSpans: [],
          clearHeights: [pierHeight],
          wallThicknesses: [pierWidth],
          pierWidth,
          pierHeight,
          capWidth,
          capHeight,
          footingWidth,
          footingHeight,
          skewAngleDeg,
        },
        faceTags,
        suggestedParameters: suggestedParams,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Category 3: Parapet / Crash Barrier Profile
  // --------------------------------------------------------------------------
  if (solidFaces.length === 1) {
    const single = solidFaces[0];
    const { outerCycle } = extractFaceBoundaryCycles(map, single.faceId);

    // Check if sloped edge exists
    let hasVerticalEdge = false;
    let hasSlopedEdge = false;
    const m = outerCycle.length;
    for (let i = 0; i < m; i++) {
      const p1 = outerCycle[i];
      const p2 = outerCycle[(i + 1) % m];
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      if (dy > 20.0) {
        const angle = Math.atan2(dx, dy) * (180.0 / Math.PI);
        if (angle < 3.0) {
          hasVerticalEdge = true;
        } else if (angle >= 8.0 && angle <= 45.0) {
          hasSlopedEdge = true;
        }
      }
    }

    if (hasSlopedEdge || (single.height > single.width && hasVerticalEdge)) {
      const parapetHeight = single.height;
      const baseWidth = single.width;

      const faceTags = new Map<string, string[]>();
      const face = map.faces.get(single.faceId);
      if (face) {
        tagFace(face, "parapet_barrier");
        faceTags.set(face.id, [...face.tags]);
      }

      const suggestedParams: SuggestedParameterCard[] = [
        createSuggestedParam("ParapetHeight", parapetHeight),
        {
          name: "BaseWidth",
          displayName: "Base Width",
          value: Math.round(baseWidth * 100) / 100,
          unit: "mm",
          role: "DRIVING",
          range: { min: 200, max: 2000 },
          description: "Base width of parapet / crash barrier",
          category: "component",
        },
      ];

      return {
        topologyType: "parapet_barrier",
        confidence: 0.92,
        title: "Bridge Parapet / Crash Barrier Profile",
        description: `Crash barrier profile of height ${parapetHeight.toFixed(0)} mm with sloped front face.`,
        standardsReference: "IRC:5 Clause 109 / MoRTH Section 800",
        features: {
          outerDimensions: { width: totalWidth, height: totalHeight },
          cellCount: 0,
          haunchCount: 0,
          clearSpans: [baseWidth],
          clearHeights: [parapetHeight],
          wallThicknesses: [baseWidth],
          parapetHeight,
          skewAngleDeg,
        },
        faceTags,
        suggestedParameters: suggestedParams,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Default Category: Generic Parametric Frame
  // --------------------------------------------------------------------------
  const faceTags = new Map<string, string[]>();
  for (const f of map.faces.values()) {
    if (f.tags.length > 0) faceTags.set(f.id, [...f.tags]);
  }

  const suggestedParams: SuggestedParameterCard[] = [
    {
      name: "FrameWidth",
      displayName: "Frame Width",
      value: Math.round(totalWidth * 100) / 100,
      unit: "mm",
      role: "DRIVING",
      range: { min: 100, max: 50000 },
      description: "Total horizontal envelope width",
      category: "general",
    },
    {
      name: "FrameHeight",
      displayName: "Frame Height",
      value: Math.round(totalHeight * 100) / 100,
      unit: "mm",
      role: "DRIVING",
      range: { min: 100, max: 50000 },
      description: "Total vertical envelope height",
      category: "general",
    },
  ];

  return {
    topologyType: "generic_frame",
    confidence: 0.7,
    title: "Parametric Structural Frame",
    description: `Generic frame of ${totalWidth.toFixed(0)} mm x ${totalHeight.toFixed(0)} mm.`,
    features: {
      outerDimensions: { width: totalWidth, height: totalHeight },
      cellCount: totalVoidsCount,
      haunchCount: 0,
      clearSpans: [totalWidth],
      clearHeights: [totalHeight],
      wallThicknesses: [],
      skewAngleDeg,
    },
    faceTags,
    suggestedParameters: suggestedParams,
  };
}
