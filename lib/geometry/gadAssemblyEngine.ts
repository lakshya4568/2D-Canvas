import { Point, Shape, RectangleShape, CircleShape, EllipseShape, PolygonShape, StarShape } from "./types";
import { lineMetrics, computeShapeBounds } from "./metrics";
import { detectClosedLoops } from "../parametric/closedGeometry";
import { recognizeHaunches } from "../inference/haunchRecognizer";
import { DEFAULT_TOLERANCE_POLICY } from "./tolerance";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface GADClearanceSpec {
  top: number;
  bottom: number;
  left: number;
  right: number;
  mid?: number; // Intermediate spacing / web / partition if multi-feature
  radial?: number; // For concentric / circular features
}

export interface GADHaunch {
  shapeId?: string;
  startPoint: Point;
  endPoint: Point;
  legLength: number;
  angleDeg: number;
  corner: "tl" | "tr" | "br" | "bl";
}

export type GADPrimitiveKind = "rectangle" | "circle" | "ellipse" | "polygon" | "star" | "loop";

export interface GADFeature {
  id: string; // Shape ID or Loop ID
  kind: GADPrimitiveKind;
  shapeIds: string[];
  bounds: BoundingBox;
  span: number; // Clear span / horizontal width (or diameter 2*R)
  clearHeight: number; // Clear vertical height
  radius?: number; // If circular
  center?: Point;
  depth?: number; // Hierarchy level (0 = root, 1 = bay, 2 = sub-cavity/duct)
  parentId?: string;
  haunches: GADHaunch[];
}

export interface GADAssemblyOuter {
  id: string; // Shape ID or Loop ID
  kind: GADPrimitiveKind;
  shapeIds: string[];
  bounds: BoundingBox;
  radius?: number;
}

export interface GADAssembly {
  id: string;
  outer: GADAssemblyOuter;
  features: GADFeature[];
  voids?: GADFeature[];
  clearances: GADClearanceSpec;
  walls?: GADClearanceSpec;
  totalWidth: number;
  totalHeight: number;
  treeDepth?: number;
}

export interface GADShapeRole {
  inAssembly: boolean;
  assembly?: GADAssembly;
  role?: "outer" | "inner";
  depth?: number;
  parentId?: string;
  featureIndex?: number;
  edgeType?: "top" | "bottom" | "left" | "right" | "haunch" | "body";
  clearance?: number;
  clearancesToParent?: GADClearanceSpec;
}

export interface CandidateRegion {
  id: string;
  kind: GADPrimitiveKind;
  shapeIds: string[];
  bounds: BoundingBox;
  center: Point;
  area: number;
  vertices?: Point[];
  radius?: number;
}

/**
 * Extracts all closed geometric regions from the drawing:
 * - Rectangles
 * - Circles
 * - Ellipses
 * - Regular Polygons
 * - Closed Line Loops (with chamfers/haunches)
 */
export function extractCandidateRegions(shapes: Shape[]): CandidateRegion[] {
  const candidates: CandidateRegion[] = [];

  // 1. Primitive single shapes
  for (const s of shapes) {
    if (s.type === "rectangle" && s.width > 2 && s.height > 2) {
      candidates.push({
        id: s.id,
        kind: "rectangle",
        shapeIds: [s.id],
        bounds: {
          minX: s.x,
          minY: s.y,
          maxX: s.x + s.width,
          maxY: s.y + s.height,
          width: s.width,
          height: s.height,
        },
        center: { x: s.x + s.width / 2, y: s.y + s.height / 2 },
        area: s.width * s.height,
        vertices: [
          { x: s.x, y: s.y },
          { x: s.x + s.width, y: s.y },
          { x: s.x + s.width, y: s.y + s.height },
          { x: s.x, y: s.y + s.height },
        ],
      });
    } else if (s.type === "circle" && s.r > 2) {
      candidates.push({
        id: s.id,
        kind: "circle",
        shapeIds: [s.id],
        bounds: {
          minX: s.cx - s.r,
          minY: s.cy - s.r,
          maxX: s.cx + s.r,
          maxY: s.cy + s.r,
          width: s.r * 2,
          height: s.r * 2,
        },
        center: { x: s.cx, y: s.cy },
        area: Math.PI * s.r * s.r,
        radius: s.r,
      });
    } else if (s.type === "ellipse" && s.rx > 2 && s.ry > 2) {
      candidates.push({
        id: s.id,
        kind: "ellipse",
        shapeIds: [s.id],
        bounds: {
          minX: s.cx - s.rx,
          minY: s.cy - s.ry,
          maxX: s.cx + s.rx,
          maxY: s.cy + s.ry,
          width: s.rx * 2,
          height: s.ry * 2,
        },
        center: { x: s.cx, y: s.cy },
        area: Math.PI * s.rx * s.ry,
      });
    } else if (s.type === "polygon" && s.r > 2) {
      const sides = s.sides || 6;
      candidates.push({
        id: s.id,
        kind: "polygon",
        shapeIds: [s.id],
        bounds: {
          minX: s.cx - s.r,
          minY: s.cy - s.r,
          maxX: s.cx + s.r,
          maxY: s.cy + s.r,
          width: s.r * 2,
          height: s.r * 2,
        },
        center: { x: s.cx, y: s.cy },
        area: 0.5 * sides * s.r * s.r * Math.sin((2 * Math.PI) / sides),
        radius: s.r,
      });
    }
  }

  // 2. Closed line loops (e.g. 8-edge chamfered box girder cavities, haunched bays)
  const detectedLoops = detectClosedLoops(shapes, 25.0);
  for (const loop of detectedLoops) {
    if (!loop.isClosed || loop.shapes.length < 3) continue;
    const b = loop.analysis.boundingBox;
    if (b.width <= 5 || b.height <= 5) continue;

    candidates.push({
      id: loop.id,
      kind: "loop",
      shapeIds: loop.shapes.map((s) => s.id),
      bounds: {
        minX: b.minX,
        minY: b.minY,
        maxX: b.maxX,
        maxY: b.maxY,
        width: b.width,
        height: b.height,
      },
      center: loop.analysis.centroid,
      area: loop.analysis.area,
      vertices: loop.vertices,
    });
  }

  return candidates;
}

/**
 * Checks whether childRegion is strictly geometrically contained within parentRegion.
 */
function isGeometricallyContained(child: CandidateRegion, parent: CandidateRegion): boolean {
  if (child.id === parent.id) return false;
  // Child must be strictly smaller in area
  if (child.area >= parent.area * 0.98) return false;

  const eps = DEFAULT_TOLERANCE_POLICY.snap_import_mm;
  return (
    child.bounds.minX >= parent.bounds.minX - eps &&
    child.bounds.maxX <= parent.bounds.maxX + eps &&
    child.bounds.minY >= parent.bounds.minY - eps &&
    child.bounds.maxY <= parent.bounds.maxY + eps
  );
}

/**
 * Automatically discovers arbitrary N-level GAD assemblies across any drawing canvas:
 * - Nested rectangles (inner cavities, rooms, cutouts, stepped footings)
 * - Multi-cell / multi-bay assemblies (box girder bays, double cell culverts)
 * - Curvilinear embedded features (circular drainage pipes, prestressing ducts, circular piers)
 * - Multi-level nesting (Deck -> Girder -> Cellular Void -> Circular Duct)
 * - Closed line loops with chamfers/haunches
 */
export function detectGADAssemblies(shapes: Shape[]): GADAssembly[] {
  const candidates = extractCandidateRegions(shapes);
  if (candidates.length < 2) return [];

  // Sort candidates by area ascending (smallest inner shapes first)
  candidates.sort((a, b) => a.area - b.area);

  // For each candidate, find its immediate parent: the container with minimum area
  const parentMap = new Map<string, CandidateRegion>();
  const childrenMap = new Map<string, CandidateRegion[]>();

  for (const child of candidates) {
    let bestParent: CandidateRegion | null = null;

    for (const cand of candidates) {
      if (isGeometricallyContained(child, cand)) {
        if (!bestParent || cand.area < bestParent.area) {
          bestParent = cand;
        }
      }
    }

    if (bestParent) {
      parentMap.set(child.id, bestParent);
      if (!childrenMap.has(bestParent.id)) {
        childrenMap.set(bestParent.id, []);
      }
      childrenMap.get(bestParent.id)!.push(child);
    }
  }

  if (childrenMap.size === 0) return [];

  // Compute depths of all candidates
  const depthMap = new Map<string, number>();
  function getDepth(cand: CandidateRegion): number {
    if (depthMap.has(cand.id)) return depthMap.get(cand.id)!;
    const parent = parentMap.get(cand.id);
    const d = parent ? getDepth(parent) + 1 : 0;
    depthMap.set(cand.id, d);
    return d;
  }
  for (const c of candidates) {
    getDepth(c);
  }

  const assemblies: GADAssembly[] = [];

  // Each candidate that contains direct children forms a GADAssembly
  // Sort parent containers by area descending so outer frames appear first
  const parentCandidates = Array.from(childrenMap.keys())
    .map((pId) => candidates.find((c) => c.id === pId)!)
    .filter(Boolean)
    .sort((a, b) => b.area - a.area);

  for (const outerCand of parentCandidates) {
    const directChildren = childrenMap.get(outerCand.id) || [];
    if (directChildren.length === 0) continue;

    // Sort features horizontally (left to right)
    directChildren.sort((a, b) => a.bounds.minX - b.bounds.minX);

    const firstF = directChildren[0];
    const lastF = directChildren[directChildren.length - 1];

    const cLeft = firstF.bounds.minX - outerCand.bounds.minX;
    const cRight = outerCand.bounds.maxX - lastF.bounds.maxX;
    const cTop =
      Math.min(...directChildren.map((v) => v.bounds.minY)) - outerCand.bounds.minY;
    const cBottom =
      outerCand.bounds.maxY - Math.max(...directChildren.map((v) => v.bounds.maxY));

    let cMid: number | undefined = undefined;
    if (directChildren.length > 1) {
      cMid = directChildren[1].bounds.minX - directChildren[0].bounds.maxX;
    }

    let radial: number | undefined = undefined;
    if (outerCand.kind === "circle" && directChildren.length === 1 && directChildren[0].kind === "circle") {
      radial = (outerCand.radius ?? outerCand.bounds.width / 2) - (directChildren[0].radius ?? directChildren[0].bounds.width / 2);
    }

    const assemblyFeatures: GADFeature[] = directChildren.map((v) => {
      const haunches: GADHaunch[] = [];
      if (v.kind === "loop" && v.vertices) {
        const recognized = recognizeHaunches(v.vertices);
        const center = v.center;

        for (const rh of recognized) {
          const pt = rh.startPoint;
          let corner: "tl" | "tr" | "br" | "bl" = "tl";
          if (pt.x <= center.x && pt.y <= center.y) corner = "tl";
          else if (pt.x > center.x && pt.y <= center.y) corner = "tr";
          else if (pt.x > center.x && pt.y > center.y) corner = "br";
          else corner = "bl";

          haunches.push({
            startPoint: rh.startPoint,
            endPoint: rh.endPoint,
            legLength: rh.legLength,
            angleDeg: rh.angleDeg,
            corner,
          });
        }
      }

      return {
        id: v.id,
        kind: v.kind,
        shapeIds: v.shapeIds,
        bounds: v.bounds,
        span: v.bounds.width,
        clearHeight: v.bounds.height,
        radius: v.radius,
        center: v.center,
        depth: depthMap.get(v.id) || 1,
        parentId: outerCand.id,
        haunches,
      };
    });

    const clearancesSpec: GADClearanceSpec = {
      top: Math.max(0, cTop),
      bottom: Math.max(0, cBottom),
      left: Math.max(0, cLeft),
      right: Math.max(0, cRight),
      mid: cMid !== undefined ? Math.max(0, cMid) : undefined,
      radial,
    };

    assemblies.push({
      id: `gad_assembly_${outerCand.id}`,
      outer: {
        id: outerCand.id,
        kind: outerCand.kind,
        shapeIds: outerCand.shapeIds,
        bounds: outerCand.bounds,
        radius: outerCand.radius,
      },
      features: assemblyFeatures,
      voids: assemblyFeatures,
      clearances: clearancesSpec,
      walls: clearancesSpec,
      totalWidth: outerCand.bounds.width,
      totalHeight: outerCand.bounds.height,
      treeDepth: depthMap.get(outerCand.id) || 0,
    });
  }

  return assemblies;
}

/**
 * Checks whether a given shape ID participates in any discovered GAD assembly across any tree depth.
 */
export function isShapeInGADAssembly(
  shapes: Shape[],
  shapeId: string
): GADShapeRole {
  const assemblies = detectGADAssemblies(shapes);
  if (assemblies.length === 0) return { inAssembly: false };

  // First priority: Check if shape is an INNER feature in any assembly (closest parent relationship)
  for (const asm of assemblies) {
    for (let fIdx = 0; fIdx < asm.features.length; fIdx++) {
      const f = asm.features[fIdx];
      if (f.shapeIds.includes(shapeId)) {
        const shape = shapes.find((s) => s.id === shapeId);

        // Compute clearances specifically to this feature's parent
        const cLeft = f.bounds.minX - asm.outer.bounds.minX;
        const cRight = asm.outer.bounds.maxX - f.bounds.maxX;
        const cTop = f.bounds.minY - asm.outer.bounds.minY;
        const cBottom = asm.outer.bounds.maxY - f.bounds.maxY;

        const clearancesToParent: GADClearanceSpec = {
          left: Math.max(0, cLeft),
          right: Math.max(0, cRight),
          top: Math.max(0, cTop),
          bottom: Math.max(0, cBottom),
          mid: asm.clearances.mid,
          radial: asm.clearances.radial,
        };

        if (shape?.type === "rectangle" || shape?.type === "circle" || shape?.type === "ellipse" || shape?.type === "polygon") {
          return {
            inAssembly: true,
            assembly: asm,
            role: "inner",
            depth: f.depth,
            parentId: f.parentId,
            featureIndex: fIdx,
            edgeType: "body",
            clearancesToParent,
          };
        }

        if (shape?.type === "line" || shape?.type === "arrow") {
          const l = shape as any;
          const isHaunch = f.haunches.some((h) => h.shapeId === shapeId);
          if (isHaunch) {
            return {
              inAssembly: true,
              assembly: asm,
              role: "inner",
              depth: f.depth,
              parentId: f.parentId,
              featureIndex: fIdx,
              edgeType: "haunch",
              clearancesToParent,
            };
          }

          const midY = (l.y1 + l.y2) / 2;
          const midX = (l.x1 + l.x2) / 2;
          const isHorizontal = Math.abs(l.y2 - l.y1) <= Math.abs(l.x2 - l.x1);

          if (isHorizontal) {
            const edgeType = midY < (f.bounds.minY + f.bounds.maxY) / 2 ? "top" : "bottom";
            const clearance = edgeType === "top" ? clearancesToParent.top : clearancesToParent.bottom;
            return {
              inAssembly: true,
              assembly: asm,
              role: "inner",
              depth: f.depth,
              parentId: f.parentId,
              featureIndex: fIdx,
              edgeType,
              clearance,
              clearancesToParent,
            };
          } else {
            const edgeType = midX < (f.bounds.minX + f.bounds.maxX) / 2 ? "left" : "right";
            const clearance = edgeType === "left" ? clearancesToParent.left : clearancesToParent.right;
            return {
              inAssembly: true,
              assembly: asm,
              role: "inner",
              depth: f.depth,
              parentId: f.parentId,
              featureIndex: fIdx,
              edgeType,
              clearance,
              clearancesToParent,
            };
          }
        }

        return {
          inAssembly: true,
          assembly: asm,
          role: "inner",
          depth: f.depth,
          parentId: f.parentId,
          featureIndex: fIdx,
          clearancesToParent,
        };
      }
    }
  }

  // Second priority: Check if shape is an outer boundary container of an assembly
  for (const asm of assemblies) {
    if (asm.outer.shapeIds.includes(shapeId)) {
      return {
        inAssembly: true,
        assembly: asm,
        role: "outer",
        depth: asm.treeDepth || 0,
        edgeType: "body",
        clearancesToParent: asm.clearances,
      };
    }
  }

  return { inAssembly: false };
}

/**
 * Recursively shifts a feature and all its nested descendants by (dx, dy).
 */
function shiftFeatureAndDescendants(
  featureId: string,
  dx: number,
  dy: number,
  shapeMap: Map<string, Shape>,
  candidates: CandidateRegion[]
) {
  if (dx === 0 && dy === 0) return;

  const targetCand = candidates.find((c) => c.id === featureId);
  if (!targetCand) return;

  // Find all candidates that are inside targetCand (its descendants)
  const descendantsToShift: CandidateRegion[] = [targetCand];
  for (const other of candidates) {
    if (other.id !== targetCand.id && isGeometricallyContained(other, targetCand)) {
      descendantsToShift.push(other);
    }
  }

  for (const cand of descendantsToShift) {
    for (const sId of cand.shapeIds) {
      const s = shapeMap.get(sId);
      if (!s) continue;

      switch (s.type) {
        case "rectangle":
          s.x += dx;
          s.y += dy;
          break;
        case "circle":
        case "ellipse":
        case "polygon":
        case "star":
          s.cx += dx;
          s.cy += dy;
          break;
        case "line":
        case "arrow":
          (s as any).x1 += dx;
          (s as any).x2 += dx;
          (s as any).y1 += dy;
          (s as any).y2 += dy;
          break;
      }
    }
  }
}

/**
 * Universal Variational GAD Solver:
 * - Solves arbitrary GAD assembly adjustments variationally without user formulas across any tree depth
 * - Handles Rectangles, Circles, Ellipses, Polygons, and Line Loops
 * - Shifts sibling features AND their nested descendants rigidly
 * - Recursively expands outer parent frames up to root
 * - Preserves all clearance invariants and haunches
 */
export function solveGADAssemblyAdjustment(
  shapes: Shape[],
  target: {
    shapeId?: string;
    assemblyId?: string;
    featureIndex?: number;
    newSpan?: number;
    newHeight?: number;
    newRadius?: number;
    deltaSpan?: number;
    deltaHeight?: number;
    deltaRadius?: number;
    clearanceType?: "top" | "bottom" | "left" | "right" | "mid";
    newClearance?: number;
  }
): { updatedShapes: Shape[]; solved: boolean; description: string } {
  const assemblies = detectGADAssemblies(shapes);
  if (assemblies.length === 0) {
    return { updatedShapes: shapes, solved: false, description: "No GAD assembly detected" };
  }

  const candidates = extractCandidateRegions(shapes);

  let targetAsm: GADAssembly | undefined;
  let targetFeatureIndex = 0;

  if (target.shapeId) {
    const roleInfo = isShapeInGADAssembly(shapes, target.shapeId);
    if (roleInfo.inAssembly && roleInfo.assembly) {
      targetAsm = roleInfo.assembly;
      targetFeatureIndex = roleInfo.featureIndex ?? 0;
    }
  } else if (target.assemblyId) {
    targetAsm = assemblies.find((a) => a.id === target.assemblyId);
    targetFeatureIndex = target.featureIndex ?? 0;
  }

  if (!targetAsm) {
    targetAsm = assemblies[0];
    targetFeatureIndex = target.featureIndex ?? 0;
  }

  const targetFeature = targetAsm.features[targetFeatureIndex];
  if (!targetFeature) {
    return { updatedShapes: shapes, solved: false, description: "Target feature not found" };
  }

  let deltaW = 0;
  let deltaH = 0;

  if (targetFeature.kind === "circle") {
    const curR = targetFeature.radius ?? targetFeature.span / 2;
    let newR = curR;
    if (target.newRadius !== undefined) {
      newR = target.newRadius;
    } else if (target.deltaRadius !== undefined) {
      newR = curR + target.deltaRadius;
    } else if (target.newSpan !== undefined) {
      newR = target.newSpan / 2;
    } else if (target.deltaSpan !== undefined) {
      newR = curR + target.deltaSpan / 2;
    }
    const deltaR = newR - curR;
    deltaW = 2 * deltaR;
    deltaH = 2 * deltaR;
  } else {
    if (target.newSpan !== undefined) {
      deltaW = target.newSpan - targetFeature.span;
    } else if (target.deltaSpan !== undefined) {
      deltaW = target.deltaSpan;
    }

    if (target.newHeight !== undefined) {
      deltaH = target.newHeight - targetFeature.clearHeight;
    } else if (target.deltaHeight !== undefined) {
      deltaH = target.deltaHeight;
    }
  }

  if (Math.abs(deltaW) < 1e-4 && Math.abs(deltaH) < 1e-4) {
    return { updatedShapes: shapes, solved: true, description: "No dimension change" };
  }

  const shapeMap = new Map<string, Shape>();
  for (const s of shapes) {
    shapeMap.set(s.id, { ...s });
  }

  // 1. Update target feature geometry
  if (targetFeature.kind === "rectangle") {
    const rectShape = shapeMap.get(targetFeature.id);
    if (rectShape && rectShape.type === "rectangle") {
      rectShape.width = Math.max(5, rectShape.width + deltaW);
      rectShape.height = Math.max(5, rectShape.height + deltaH);
    }
  } else if (targetFeature.kind === "circle") {
    const circShape = shapeMap.get(targetFeature.id);
    if (circShape && circShape.type === "circle") {
      circShape.r = Math.max(2, circShape.r + deltaW / 2);
    }
  } else if (targetFeature.kind === "ellipse") {
    const ellShape = shapeMap.get(targetFeature.id);
    if (ellShape && ellShape.type === "ellipse") {
      ellShape.rx = Math.max(2, ellShape.rx + deltaW / 2);
      ellShape.ry = Math.max(2, ellShape.ry + deltaH / 2);
    }
  } else if (targetFeature.kind === "polygon") {
    const polyShape = shapeMap.get(targetFeature.id);
    if (polyShape && polyShape.type === "polygon") {
      polyShape.r = Math.max(2, polyShape.r + deltaW / 2);
    }
  } else if (targetFeature.kind === "loop") {
    const featureShapes = targetFeature.shapeIds
      .map((id) => shapeMap.get(id))
      .filter(Boolean) as Array<Shape & { x1: number; y1: number; x2: number; y2: number }>;

    const centerX = (targetFeature.bounds.minX + targetFeature.bounds.maxX) / 2;
    const centerY = (targetFeature.bounds.minY + targetFeature.bounds.maxY) / 2;

    for (const s of featureShapes) {
      if (s.type !== "line" && s.type !== "arrow") continue;

      const isHaunch =
        targetFeature.haunches.some((h) => h.shapeId === s.id) ||
        (Math.abs(Math.abs(s.x2 - s.x1) - Math.abs(s.y2 - s.y1)) < 3.0 &&
          Math.abs(s.x2 - s.x1) > 5.0 &&
          Math.abs(s.y2 - s.y1) > 5.0);
      const isHorizontal = !isHaunch && Math.abs(s.y2 - s.y1) <= Math.abs(s.x2 - s.x1);
      const isVertical = !isHaunch && Math.abs(s.x2 - s.x1) < Math.abs(s.y2 - s.y1);

      if (deltaW !== 0) {
        if (isHaunch) {
          const haunchMidX = (s.x1 + s.x2) / 2;
          if (haunchMidX > centerX) {
            s.x1 += deltaW;
            s.x2 += deltaW;
          }
        } else if (isHorizontal) {
          const rightIdx = s.x1 > s.x2 ? 1 : 2;
          if (rightIdx === 1) s.x1 += deltaW;
          else s.x2 += deltaW;
        } else if (isVertical) {
          const edgeMidX = (s.x1 + s.x2) / 2;
          if (edgeMidX > centerX) {
            s.x1 += deltaW;
            s.x2 += deltaW;
          }
        }
      }

      if (deltaH !== 0) {
        if (isHaunch) {
          const haunchMidY = (s.y1 + s.y2) / 2;
          if (haunchMidY > centerY) {
            s.y1 += deltaH;
            s.y2 += deltaH;
          }
        } else if (isVertical) {
          const bottomIdx = s.y1 > s.y2 ? 1 : 2;
          if (bottomIdx === 1) s.y1 += deltaH;
          else s.y2 += deltaH;
        } else if (isHorizontal) {
          const edgeMidY = (s.y1 + s.y2) / 2;
          if (edgeMidY > centerY) {
            s.y1 += deltaH;
            s.y2 += deltaH;
          }
        }
      }
    }
  }

  // 2. Shift subsequent sibling features AND their nested descendants rigidly
  if (deltaW !== 0) {
    for (let j = targetFeatureIndex + 1; j < targetAsm.features.length; j++) {
      const nextF = targetAsm.features[j];
      shiftFeatureAndDescendants(nextF.id, deltaW, 0, shapeMap, candidates);
    }
  }

  // 3. Recursively expand parent frames up the containment tree (preserving clearances)
  let currentOuterId = targetAsm.outer.id;
  while (currentOuterId) {
    const parentAsm = assemblies.find((a) => a.outer.id === currentOuterId);
    if (!parentAsm) break;

    // Expand this container
    if (parentAsm.outer.kind === "rectangle") {
      const outerRect = shapeMap.get(parentAsm.outer.id);
      if (outerRect && outerRect.type === "rectangle") {
        outerRect.width = Math.max(10, outerRect.width + deltaW);
        outerRect.height = Math.max(10, outerRect.height + deltaH);
      }
    } else if (parentAsm.outer.kind === "loop") {
      const outerCenterX = (parentAsm.outer.bounds.minX + parentAsm.outer.bounds.maxX) / 2;
      const outerCenterY = (parentAsm.outer.bounds.minY + parentAsm.outer.bounds.maxY) / 2;

      for (const sId of parentAsm.outer.shapeIds) {
        const s = shapeMap.get(sId);
        if (!s || (s.type !== "line" && s.type !== "arrow")) continue;

        const isHorizontal = Math.abs((s as any).y2 - (s as any).y1) <= Math.abs((s as any).x2 - (s as any).x1);
        const isVertical = Math.abs((s as any).x2 - (s as any).x1) < Math.abs((s as any).y2 - (s as any).y1);

        if (deltaW !== 0) {
          if (isHorizontal) {
            const rightIdx = (s as any).x1 > (s as any).x2 ? 1 : 2;
            if (rightIdx === 1) (s as any).x1 += deltaW;
            else (s as any).x2 += deltaW;
          } else if (isVertical) {
            const edgeMidX = ((s as any).x1 + (s as any).x2) / 2;
            if (edgeMidX > outerCenterX) {
              (s as any).x1 += deltaW;
              (s as any).x2 += deltaW;
            }
          }
        }

        if (deltaH !== 0) {
          if (isVertical) {
            const bottomIdx = (s as any).y1 > (s as any).y2 ? 1 : 2;
            if (bottomIdx === 1) (s as any).y1 += deltaH;
            else (s as any).y2 += deltaH;
          } else if (isHorizontal) {
            const edgeMidY = ((s as any).y1 + (s as any).y2) / 2;
            if (edgeMidY > outerCenterY) {
              (s as any).y1 += deltaH;
              (s as any).y2 += deltaH;
            }
          }
        }
      }
    }

    // Check if parentAsm.outer is itself a child in a higher-level assembly (grandparent)
    const grandparentAsm = assemblies.find((a) =>
      a.features.some((f) => f.id === parentAsm.outer.id)
    );

    if (grandparentAsm) {
      // Shift any subsequent siblings in the grandparent assembly
      const pIdx = grandparentAsm.features.findIndex((f) => f.id === parentAsm.outer.id);
      if (pIdx >= 0 && deltaW !== 0) {
        for (let sj = pIdx + 1; sj < grandparentAsm.features.length; sj++) {
          const siblingF = grandparentAsm.features[sj];
          shiftFeatureAndDescendants(siblingF.id, deltaW, 0, shapeMap, candidates);
        }
      }
      currentOuterId = grandparentAsm.outer.id;
    } else {
      // Reached root
      break;
    }
  }

  const updatedShapes = shapes.map((s) => shapeMap.get(s.id) || s);

  return {
    updatedShapes,
    solved: true,
    description: `Auto-calculated GAD: scaled ${targetFeature.kind} "${targetFeature.id}" by ΔW=${deltaW.toFixed(1)}px, ΔH=${deltaH.toFixed(1)}px`,
  };
}
