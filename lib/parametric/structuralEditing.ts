/**
 * Structural Topology & Geometry Editing Operations
 * Supports vertex insertion, deletion, edge splitting, moving points/edges,
 * and automatic topological re-solving when closed loops break or form.
 */

import { Point } from "../geometry/types";
import { analyzePolygon, ClosedShapeAnalysis } from "./closedGeometry";

export interface PolygonTopology {
  id: string;
  name: string;
  vertices: Point[];
  isClosed: boolean;
  analysis?: ClosedShapeAnalysis;
}

export interface StructuralEditResult {
  success: boolean;
  topology: PolygonTopology;
  topologyChanged: boolean;
  wasClosed: boolean;
  isClosedNow: boolean;
  message?: string;
}

export class StructuralEditor {
  /**
   * Inserts a new vertex along edge between index and (index + 1)
   */
  public static insertVertex(
    topology: PolygonTopology,
    edgeIndex: number,
    point?: Point
  ): StructuralEditResult {
    const n = topology.vertices.length;
    if (edgeIndex < 0 || edgeIndex >= n) {
      return {
        success: false,
        topology,
        topologyChanged: false,
        wasClosed: topology.isClosed,
        isClosedNow: topology.isClosed,
        message: `Invalid edge index ${edgeIndex}`,
      };
    }

    const p1 = topology.vertices[edgeIndex];
    const p2 = topology.vertices[(edgeIndex + 1) % n];
    const newPt: Point = point ? { ...point } : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const newVertices = [...topology.vertices];
    newVertices.splice(edgeIndex + 1, 0, newPt);

    const wasClosed = topology.isClosed;
    const isClosedNow = newVertices.length >= 3;
    const analysis = isClosedNow ? analyzePolygon(newVertices) : undefined;

    const updatedTopology: PolygonTopology = {
      ...topology,
      vertices: newVertices,
      isClosed: isClosedNow,
      analysis,
    };

    return {
      success: true,
      topology: updatedTopology,
      topologyChanged: true,
      wasClosed,
      isClosedNow,
      message: `Inserted vertex at index ${edgeIndex + 1}`,
    };
  }

  /**
   * Deletes a vertex at index. If vertex count drops below 3, the closed loop is broken!
   */
  public static deleteVertex(
    topology: PolygonTopology,
    vertexIndex: number
  ): StructuralEditResult {
    const n = topology.vertices.length;
    if (vertexIndex < 0 || vertexIndex >= n || n <= 2) {
      return {
        success: false,
        topology,
        topologyChanged: false,
        wasClosed: topology.isClosed,
        isClosedNow: topology.isClosed,
        message: `Cannot delete vertex: minimum 3 vertices required for closed geometry.`,
      };
    }

    const newVertices = topology.vertices.filter((_, idx) => idx !== vertexIndex);
    const wasClosed = topology.isClosed;
    const isClosedNow = newVertices.length >= 3;
    const analysis = isClosedNow ? analyzePolygon(newVertices) : undefined;

    const updatedTopology: PolygonTopology = {
      ...topology,
      vertices: newVertices,
      isClosed: isClosedNow,
      analysis,
    };

    return {
      success: true,
      topology: updatedTopology,
      topologyChanged: true,
      wasClosed,
      isClosedNow,
      message: `Deleted vertex ${vertexIndex}`,
    };
  }

  /**
   * Deletes an edge. In a closed polygon, removing one edge breaks the loop into an open polyline!
   */
  public static deleteEdge(
    topology: PolygonTopology,
    edgeIndex: number
  ): StructuralEditResult {
    const n = topology.vertices.length;
    if (edgeIndex < 0 || edgeIndex >= n) {
      return {
        success: false,
        topology,
        topologyChanged: false,
        wasClosed: topology.isClosed,
        isClosedNow: topology.isClosed,
        message: `Invalid edge index ${edgeIndex}`,
      };
    }

    // Removing edge edgeIndex breaks the ring.
    // We re-order the vertices so the broken edge is at the ends.
    const reordered: Point[] = [];
    for (let i = 0; i < n; i++) {
      reordered.push({ ...topology.vertices[(edgeIndex + 1 + i) % n] });
    }

    const wasClosed = topology.isClosed;
    const updatedTopology: PolygonTopology = {
      ...topology,
      vertices: reordered,
      isClosed: false, // Broken loop!
      analysis: undefined,
    };

    return {
      success: true,
      topology: updatedTopology,
      topologyChanged: true,
      wasClosed,
      isClosedNow: false,
      message: `Deleted edge ${edgeIndex}, topology transitioned from closed polygon to open polyline`,
    };
  }

  /**
   * Moves a vertex by a delta or to a new position.
   */
  public static moveVertex(
    topology: PolygonTopology,
    vertexIndex: number,
    newPosition: Point
  ): StructuralEditResult {
    const n = topology.vertices.length;
    if (vertexIndex < 0 || vertexIndex >= n) {
      return {
        success: false,
        topology,
        topologyChanged: false,
        wasClosed: topology.isClosed,
        isClosedNow: topology.isClosed,
        message: `Invalid vertex index ${vertexIndex}`,
      };
    }

    const newVertices = topology.vertices.map((v, idx) =>
      idx === vertexIndex ? { ...newPosition } : { ...v }
    );

    const analysis = topology.isClosed ? analyzePolygon(newVertices) : undefined;
    const updatedTopology: PolygonTopology = {
      ...topology,
      vertices: newVertices,
      analysis,
    };

    return {
      success: true,
      topology: updatedTopology,
      topologyChanged: false, // Geometry changed, topology preserved
      wasClosed: topology.isClosed,
      isClosedNow: topology.isClosed,
    };
  }
}
