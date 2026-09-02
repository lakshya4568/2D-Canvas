import { Point, Shape } from "../geometry/types";
import { ParametricVariable } from "./model";

export interface ConnectedGeometrySolveOptions {
  shapes: Shape[];
  variables: Map<string, ParametricVariable>;
}

export interface ConnectedGeometrySolveResult {
  updatedShapes: Shape[];
  handled: boolean;
}

interface VertexCluster {
  id: number;
  x: number;
  y: number;
}

interface ComponentEdge {
  shape: Shape;
  v1Id: number;
  v2Id: number;
  origLen: number;
  targetLen: number;
}

interface Component {
  vertexIds: Set<number>;
  edges: ComponentEdge[];
}

/**
 * Solves arbitrary connected 2D geometric line networks (triangles, rectangles,
 * diagonal-braced frames, trusses, polygons, complex multi-loop assemblies).
 * 
 * Invariants:
 * 1. Shared vertices ALWAYS move together: lines never detach into mid-air.
 * 2. If a single dimension is edited, the entire connected figure scales
 *    proportionally, preserving all angles, parallelisms, and joint connections.
 * 3. Connected edges autocalculate their dimensions in real time.
 */
export function solveConnectedGeometry(
  options: ConnectedGeometrySolveOptions
): ConnectedGeometrySolveResult {
  const { shapes, variables } = options;
  const lineShapes = shapes.filter(
    (s) => (s.type === "line" || s.type === "arrow") && s.isVisible !== false
  ) as Array<Shape & { x1: number; y1: number; x2: number; y2: number }>;

  if (lineShapes.length === 0) {
    return { updatedShapes: shapes, handled: false };
  }

  const TOLERANCE = 15.0; // Connection tolerance in world px

  // 1. Cluster endpoints into shared vertices
  const vertices: VertexCluster[] = [];

  const getOrCreateVertex = (pt: Point): number => {
    for (let i = 0; i < vertices.length; i++) {
      if (Math.hypot(vertices[i].x - pt.x, vertices[i].y - pt.y) <= TOLERANCE) {
        return i;
      }
    }
    const newId = vertices.length;
    vertices.push({ id: newId, x: pt.x, y: pt.y });
    return newId;
  };

  const edgeMappings: ComponentEdge[] = lineShapes.map((s) => {
    const v1Id = getOrCreateVertex({ x: s.x1, y: s.y1 });
    const v2Id = getOrCreateVertex({ x: s.x2, y: s.y2 });
    const currentLen = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

    let targetLen = 0;
    if (s.name && variables.has(s.name)) {
      targetLen = variables.get(s.name)!.value;
    }
    if (targetLen <= 0) targetLen = currentLen;

    return {
      shape: s,
      v1Id,
      v2Id,
      origLen: currentLen,
      targetLen,
    };
  });

  // 2. Disjoint Set Union (DSU) to find connected components
  const parent = Array.from({ length: vertices.length }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };

  for (const edge of edgeMappings) {
    union(edge.v1Id, edge.v2Id);
  }

  // Group edges into components by root vertex ID
  const componentMap = new Map<number, Component>();
  for (let vId = 0; vId < vertices.length; vId++) {
    const root = find(vId);
    if (!componentMap.has(root)) {
      componentMap.set(root, { vertexIds: new Set(), edges: [] });
    }
    componentMap.get(root)!.vertexIds.add(vId);
  }

  for (const edge of edgeMappings) {
    const root = find(edge.v1Id);
    componentMap.get(root)!.edges.push(edge);
  }

  // 3. Solve each connected component
  const updatedShapeMap = new Map<string, Shape>();
  let anyHandled = false;

  for (const comp of componentMap.values()) {
    // Check which edges in this component had an intentional user change (>= 1.5px)
    let drivingEdge: ComponentEdge | null = null;
    let singleScale = 1;
    let changeCount = 0;

    for (const edge of comp.edges) {
      if (edge.origLen > 1 && Math.abs(edge.targetLen - edge.origLen) >= 1.5) {
        drivingEdge = edge;
        singleScale = edge.targetLen / edge.origLen;
        changeCount++;
      }
    }

    // SINGLE DRIVEN EDGE: Proportional Conformal Scaling of the Entire Connected Figure
    if (changeCount === 1 && drivingEdge && singleScale > 0) {
      // Anchor is the start vertex of the driving edge
      const anchorVertex = vertices[drivingEdge.v1Id];
      const anchor: Point = { x: anchorVertex.x, y: anchorVertex.y };

      // Scale all vertices in this component around the anchor
      const scaledVertexMap = new Map<number, Point>();
      for (const vId of comp.vertexIds) {
        const v = vertices[vId];
        scaledVertexMap.set(vId, {
          x: Number((anchor.x + singleScale * (v.x - anchor.x)).toFixed(2)),
          y: Number((anchor.y + singleScale * (v.y - anchor.y)).toFixed(2)),
        });
      }

      // Update every edge in this component so endpoints strictly match the scaled vertices
      for (const edge of comp.edges) {
        const p1 = scaledVertexMap.get(edge.v1Id)!;
        const p2 = scaledVertexMap.get(edge.v2Id)!;

        // Autocalculate variable value if no explicit formula
        if (edge.shape.name && variables.has(edge.shape.name)) {
          const v = variables.get(edge.shape.name)!;
          if (!v.formula) {
            v.value = Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y));
          }
        }

        updatedShapeMap.set(edge.shape.id, {
          ...edge.shape,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
        } as Shape);
      }

      anyHandled = true;
    }
  }

  if (!anyHandled) {
    return { updatedShapes: shapes, handled: false };
  }

  // Merge updated shapes back into the full shapes array
  const updatedShapes = shapes.map((s) => updatedShapeMap.get(s.id) || s);
  return { updatedShapes, handled: true };
}
