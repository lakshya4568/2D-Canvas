/**
 * Mathematical Closed Shape and Polygon Analysis Engine
 * Detects closed loops from line segments, calculates exact Shoelace area,
 * mathematical polygon centroid, perimeter, bounding box, center of mass,
 * interior/exterior angles, and geometric symmetry.
 */

import { Point, Shape } from "../geometry/types";

export interface EdgeMetric {
  index: number;
  start: Point;
  end: Point;
  length: number;
  direction: Point; // Normalized unit vector
  angleDeg: number; // Heading in degrees [0, 360)
  shapeId?: string;
  name?: string;
}

export interface VertexMetric {
  index: number;
  point: Point;
  interiorAngleDeg: number;
  exteriorAngleDeg: number;
  turnAngleDeg: number; // Positive = left/CCW turn, Negative = right/CW turn
}

export type MassDensityModel =
  | { type: "uniform"; density: number }
  | { type: "explicit"; mass: number }
  | { type: "per-region"; densityMap: Record<number, number> };

export interface ClosedShapeAnalysis {
  isClosed: boolean;
  vertexCount: number;
  vertices: Point[];
  edges: EdgeMetric[];
  vertexMetrics: VertexMetric[];
  area: number;
  signedArea: number;
  isCounterClockwise: boolean;
  perimeter: number;
  centroid: Point;
  centerOfMass: Point;
  totalMass: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  symmetry: {
    hasVerticalSymmetry: boolean;
    hasHorizontalSymmetry: boolean;
    symmetryAxesCount: number;
  };
}

export interface DetectedLoop {
  id: string;
  isClosed: boolean;
  vertices: Point[];
  shapes: Shape[];
  analysis: ClosedShapeAnalysis;
}

/**
 * Calculates mathematical polygon analysis for an ordered sequence of vertices.
 * Handles arbitrary simple polygons (convex, concave, irregular).
 */
export function analyzePolygon(
  vertices: Point[],
  densityModel: MassDensityModel = { type: "uniform", density: 1 }
): ClosedShapeAnalysis {
  const n = vertices.length;
  if (n < 3) {
    return createDegenerateAnalysis(vertices);
  }

  // 1. Signed Area using Shoelace Algorithm
  // A = 0.5 * sum(x_i * y_{i+1} - x_{i+1} * y_i)
  let signedAreaSum = 0;
  let perimeter = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const edges: EdgeMetric[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];

    // Bounding box
    if (p1.x < minX) minX = p1.x;
    if (p1.y < minY) minY = p1.y;
    if (p1.x > maxX) maxX = p1.x;
    if (p1.y > maxY) maxY = p1.y;

    // Shoelace cross product
    const cross = p1.x * p2.y - p2.x * p1.y;
    signedAreaSum += cross;

    // Edge metrics
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    perimeter += len;

    const dir = len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
    let heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (heading < 0) heading += 360;

    edges.push({
      index: i,
      start: { ...p1 },
      end: { ...p2 },
      length: Number(len.toFixed(4)),
      direction: { x: Number(dir.x.toFixed(6)), y: Number(dir.y.toFixed(6)) },
      angleDeg: Number(heading.toFixed(2)),
    });
  }

  const signedArea = signedAreaSum / 2;
  const area = Math.abs(signedArea);
  const isCounterClockwise = signedArea > 0;

  // 2. Exact Centroid calculation
  // C_x = (1 / (6 * signedArea)) * sum((x_i + x_{i+1}) * (x_i * y_{i+1} - x_{i+1} * y_i))
  // C_y = (1 / (6 * signedArea)) * sum((y_i + y_{i+1}) * (x_i * y_{i+1} - x_{i+1} * y_i))
  let cx = 0;
  let cy = 0;

  if (Math.abs(signedArea) > 1e-9) {
    let cxSum = 0;
    let cySum = 0;
    for (let i = 0; i < n; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % n];
      const cross = p1.x * p2.y - p2.x * p1.y;
      cxSum += (p1.x + p2.x) * cross;
      cySum += (p1.y + p2.y) * cross;
    }
    cx = cxSum / (6 * signedArea);
    cy = cySum / (6 * signedArea);
  } else {
    // Degenerate/flat polygon: fallback to arithmetic mean of vertices
    cx = vertices.reduce((sum, p) => sum + p.x, 0) / n;
    cy = vertices.reduce((sum, p) => sum + p.y, 0) / n;
  }

  const centroid: Point = {
    x: Number(cx.toFixed(3)),
    y: Number(cy.toFixed(3)),
  };

  // 3. Center of Mass & Total Mass
  let totalMass = 0;
  let centerOfMass: Point = { ...centroid };

  if (densityModel.type === "uniform") {
    totalMass = area * densityModel.density;
    centerOfMass = { ...centroid };
  } else if (densityModel.type === "explicit") {
    totalMass = densityModel.mass;
    centerOfMass = { ...centroid };
  } else if (densityModel.type === "per-region") {
    let weightedX = 0;
    let weightedY = 0;
    totalMass = 0;
    for (let i = 0; i < n; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % n];
      const triArea = Math.abs((p1.x * (p2.y - centroid.y) + p2.x * (centroid.y - p1.y) + centroid.x * (p1.y - p2.y)) / 2);
      const density = densityModel.densityMap[i] ?? 1;
      const triMass = triArea * density;
      const triCx = (p1.x + p2.x + centroid.x) / 3;
      const triCy = (p1.y + p2.y + centroid.y) / 3;
      weightedX += triCx * triMass;
      weightedY += triCy * triMass;
      totalMass += triMass;
    }
    if (totalMass > 1e-9) {
      centerOfMass = {
        x: Number((weightedX / totalMass).toFixed(3)),
        y: Number((weightedY / totalMass).toFixed(3)),
      };
    }
  }

  // 4. Interior, Exterior, and Turn Angles
  const vertexMetrics: VertexMetric[] = [];

  for (let i = 0; i < n; i++) {
    const prevPt = vertices[(i - 1 + n) % n];
    const currPt = vertices[i];
    const nextPt = vertices[(i + 1) % n];

    // Vector incoming: prev -> curr
    const vIn = { x: currPt.x - prevPt.x, y: currPt.y - prevPt.y };
    // Vector outgoing: curr -> next
    const vOut = { x: nextPt.x - currPt.x, y: nextPt.y - currPt.y };

    const angleIn = Math.atan2(vIn.y, vIn.x);
    const angleOut = Math.atan2(vOut.y, vOut.x);

    let turnRad = angleOut - angleIn;
    while (turnRad > Math.PI) turnRad -= 2 * Math.PI;
    while (turnRad < -Math.PI) turnRad += 2 * Math.PI;

    const turnDeg = (turnRad * 180) / Math.PI;

    // Interior angle depends on orientation (CCW vs CW)
    let interiorDeg = isCounterClockwise ? 180 - turnDeg : 180 + turnDeg;
    while (interiorDeg < 0) interiorDeg += 360;
    while (interiorDeg >= 360) interiorDeg -= 360;

    const exteriorDeg = 360 - interiorDeg;

    vertexMetrics.push({
      index: i,
      point: { ...currPt },
      interiorAngleDeg: Number(interiorDeg.toFixed(2)),
      exteriorAngleDeg: Number(exteriorDeg.toFixed(2)),
      turnAngleDeg: Number(turnDeg.toFixed(2)),
    });
  }

  // 5. Symmetry Detection
  const symmetry = detectPolygonSymmetry(vertices, centroid);

  return {
    isClosed: true,
    vertexCount: n,
    vertices: vertices.map((p) => ({ ...p })),
    edges,
    vertexMetrics,
    area: Number(area.toFixed(3)),
    signedArea: Number(signedArea.toFixed(3)),
    isCounterClockwise,
    perimeter: Number(perimeter.toFixed(3)),
    centroid,
    centerOfMass,
    totalMass: Number(totalMass.toFixed(3)),
    boundingBox: {
      minX: Number(minX.toFixed(2)),
      minY: Number(minY.toFixed(2)),
      maxX: Number(maxX.toFixed(2)),
      maxY: Number(maxY.toFixed(2)),
      width: Number((maxX - minX).toFixed(2)),
      height: Number((maxY - minY).toFixed(2)),
    },
    symmetry,
  };
}

function detectPolygonSymmetry(
  vertices: Point[],
  centroid: Point,
  tol: number = 1.0
): { hasVerticalSymmetry: boolean; hasHorizontalSymmetry: boolean; symmetryAxesCount: number } {
  const n = vertices.length;
  if (n < 3) return { hasVerticalSymmetry: false, hasHorizontalSymmetry: false, symmetryAxesCount: 0 };

  const pointMatches = (pt: Point, target: Point) => Math.hypot(pt.x - target.x, pt.y - target.y) <= tol;

  let hasVert = true;
  for (const p of vertices) {
    const reflected: Point = { x: 2 * centroid.x - p.x, y: p.y };
    if (!vertices.some((v) => pointMatches(v, reflected))) {
      hasVert = false;
      break;
    }
  }

  let hasHoriz = true;
  for (const p of vertices) {
    const reflected: Point = { x: p.x, y: 2 * centroid.y - p.y };
    if (!vertices.some((v) => pointMatches(v, reflected))) {
      hasHoriz = false;
      break;
    }
  }

  let count = 0;
  if (hasVert) count++;
  if (hasHoriz) count++;

  return {
    hasVerticalSymmetry: hasVert,
    hasHorizontalSymmetry: hasHoriz,
    symmetryAxesCount: count,
  };
}

function createDegenerateAnalysis(vertices: Point[]): ClosedShapeAnalysis {
  return {
    isClosed: false,
    vertexCount: vertices.length,
    vertices: vertices.map((p) => ({ ...p })),
    edges: [],
    vertexMetrics: [],
    area: 0,
    signedArea: 0,
    isCounterClockwise: false,
    perimeter: 0,
    centroid: vertices[0] ? { ...vertices[0] } : { x: 0, y: 0 },
    centerOfMass: vertices[0] ? { ...vertices[0] } : { x: 0, y: 0 },
    totalMass: 0,
    boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    symmetry: { hasVerticalSymmetry: false, hasHorizontalSymmetry: false, symmetryAxesCount: 0 },
  };
}

/**
 * Automatically detects closed loops / cycles from an arbitrary collection of line shapes.
 * Builds an endpoint graph within tolerance eps and extracts closed paths.
 */
export function detectClosedLoops(shapes: Shape[], tolerance: number = 2.0): DetectedLoop[] {
  const lineShapes = shapes.filter((s) => s.type === "line" || s.type === "arrow") as Array<
    Shape & { x1: number; y1: number; x2: number; y2: number }
  >;

  if (lineShapes.length < 3) return [];

  interface Segment {
    shape: Shape;
    p1: Point;
    p2: Point;
    used: boolean;
  }

  const segments: Segment[] = lineShapes.map((s) => ({
    shape: s,
    p1: { x: s.x1, y: s.y1 },
    p2: { x: s.x2, y: s.y2 },
    used: false,
  }));

  const loops: DetectedLoop[] = [];
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].used) continue;

    const currentLoopVertices: Point[] = [segments[i].p1, segments[i].p2];
    const currentLoopShapes: Shape[] = [segments[i].shape];
    segments[i].used = true;

    let head = segments[i].p2;
    let foundNext = true;

    while (foundNext) {
      foundNext = false;

      // Check if we closed the loop
      if (currentLoopVertices.length >= 3 && dist(head, currentLoopVertices[0]) <= tolerance) {
        break;
      }

      for (let j = 0; j < segments.length; j++) {
        if (segments[j].used) continue;

        const s = segments[j];
        if (dist(head, s.p1) <= tolerance) {
          currentLoopVertices.push(s.p2);
          currentLoopShapes.push(s.shape);
          head = s.p2;
          s.used = true;
          foundNext = true;
          break;
        } else if (dist(head, s.p2) <= tolerance) {
          currentLoopVertices.push(s.p1);
          currentLoopShapes.push(s.shape);
          head = s.p1;
          s.used = true;
          foundNext = true;
          break;
        }
      }
    }

    const isClosed =
      currentLoopVertices.length >= 4 &&
      dist(currentLoopVertices[0], currentLoopVertices[currentLoopVertices.length - 1]) <= tolerance;

    if (isClosed) {
      const uniqueVertices = currentLoopVertices.slice(0, currentLoopVertices.length - 1);
      const analysis = analyzePolygon(uniqueVertices);

      loops.push({
        id: `loop_${loops.length + 1}_${Date.now()}`,
        isClosed: true,
        vertices: uniqueVertices,
        shapes: currentLoopShapes,
        analysis,
      });
    }
  }

  return loops;
}

/**
 * Calculates composite mass properties from multiple closed shapes.
 */
export function computeCompositeMassProperties(
  components: Array<{ analysis: ClosedShapeAnalysis; mass?: number; density?: number }>
): { totalArea: number; totalMass: number; compositeCentroid: Point; compositeCenterOfMass: Point } {
  let totalArea = 0;
  let totalMass = 0;
  let weightedAreaX = 0;
  let weightedAreaY = 0;
  let weightedMassX = 0;
  let weightedMassY = 0;

  for (const comp of components) {
    const a = comp.analysis;
    totalArea += a.area;
    weightedAreaX += a.centroid.x * a.area;
    weightedAreaY += a.centroid.y * a.area;

    const m = comp.mass !== undefined ? comp.mass : a.area * (comp.density ?? 1);
    totalMass += m;
    weightedMassX += a.centerOfMass.x * m;
    weightedMassY += a.centerOfMass.y * m;
  }

  const compositeCentroid: Point =
    totalArea > 1e-9
      ? {
          x: Number((weightedAreaX / totalArea).toFixed(3)),
          y: Number((weightedAreaY / totalArea).toFixed(3)),
        }
      : { x: 0, y: 0 };

  const compositeCenterOfMass: Point =
    totalMass > 1e-9
      ? {
          x: Number((weightedMassX / totalMass).toFixed(3)),
          y: Number((weightedMassY / totalMass).toFixed(3)),
        }
      : { x: 0, y: 0 };

  return {
    totalArea: Number(totalArea.toFixed(3)),
    totalMass: Number(totalMass.toFixed(3)),
    compositeCentroid,
    compositeCenterOfMass,
  };
}
