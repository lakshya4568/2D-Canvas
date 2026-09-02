/**
 * CAD Geometry Object State & Sub-Entity Reference Model
 * Defines explicit structured state for parametric CAD entities,
 * object awareness of their sub-elements (endpoints, edges, corners, axes),
 * and relative coordinate definitions.
 */

import { Point, Shape, ShapeType } from "../geometry/types";
import { LocalCoordinateSystem, Vector2D } from "./transform2d";
import { GeometricConstraint } from "./constraints";
import { analyzePolygon, ClosedShapeAnalysis } from "./closedGeometry";

/**
 * Exposed sub-element types for dot-notation references in formulas and constraints
 * e.g. Line_A.endPoint, Rectangle_1.topEdge.length, Circle_1.center
 */
export interface ExposedSubEntities {
  points: Record<string, Point>;
  vectors: Record<string, Vector2D>;
  scalars: Record<string, number>;
  edges?: Record<string, { start: Point; end: Point; length: number; direction: Vector2D }>;
}

export interface RelativePlacementDef {
  /**
   * Reference target for origin, e.g. "Line_A.endPoint" or "Rectangle_1.topLeft"
   */
  attachedTo?: string;

  /**
   * Relative offset from attached target in reference object's local frame
   */
  offset?: { x: number | string; y: number | string };

  /**
   * Relative angle in degrees (or formula), e.g. 90 or "Line_A.angle + 90"
   */
  relativeAngle?: number | string;

  /**
   * Reference frame provider (parent or peer LCS)
   */
  referenceObjectId?: string;
}

export interface GeometryObjectState {
  id: string;
  name: string;
  type: ShapeType;
  parentId?: string;

  /**
   * Local Coordinate System (origin, axes, rotation, scale, 2D transforms)
   */
  lcs: LocalCoordinateSystem;

  /**
   * Intrinsic parameters in local space (e.g. length, width, height, radius)
   */
  parameters: Record<string, number>;

  /**
   * Variable bindings: parameterName -> variableName (e.g. "length" -> "L1")
   */
  variables: Record<string, string>;

  /**
   * Relative coordinate relationships to other objects
   */
  relativePlacement?: RelativePlacementDef;

  /**
   * Geometric and dimensional constraints attached to this object
   */
  constraints: GeometricConstraint[];

  /**
   * Objects or sub-elements this object explicitly references
   */
  references: string[];

  /**
   * Object IDs this object depends on
   */
  dependencies: string[];

  /**
   * Explicit polygon vertices in world or local space (for closed polygons)
   */
  vertices?: Point[];

  /**
   * Exact mathematical closed-shape analysis (Shoelace area, centroid, angles, perimeter)
   */
  analysis?: ClosedShapeAnalysis;

  /**
   * Display and CAD metadata (color, stroke, dash, layer)
   */
  metadata: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    fill?: string;
    opacity?: number;
    layerId?: string;
    locked?: boolean;
    isLocked?: boolean;
    groupId?: string;
  };
}

export class GeometryObject {
  /**
   * Creates a stateful CAD object from a standard drawing Shape
   */
  public static fromShape(shape: Shape, name?: string): GeometryObjectState {
    const objName = name || shape.name || `${shape.type}_${shape.id.slice(0, 5)}`;
    let lcs: LocalCoordinateSystem;
    const parameters: Record<string, number> = {};

    switch (shape.type) {
      case "line":
      case "arrow": {
        const start = { x: shape.x1, y: shape.y1 };
        const end = { x: shape.x2, y: shape.y2 };
        const len = Math.hypot(end.x - start.x, end.y - start.y);
        lcs = LocalCoordinateSystem.fromLine(start, end);
        parameters.length = len;
        break;
      }
      case "rectangle": {
        const origin = { x: shape.x, y: shape.y };
        const rotRad = ((shape.rotation || 0) * Math.PI) / 180;
        lcs = new LocalCoordinateSystem(origin, rotRad);
        parameters.width = shape.width;
        parameters.height = shape.height;
        break;
      }
      case "circle": {
        const origin = { x: shape.cx, y: shape.cy };
        lcs = new LocalCoordinateSystem(origin, 0);
        parameters.radius = shape.r;
        break;
      }
      case "ellipse": {
        const origin = { x: shape.cx, y: shape.cy };
        const rotRad = ((shape.rotation || 0) * Math.PI) / 180;
        lcs = new LocalCoordinateSystem(origin, rotRad);
        parameters.rx = shape.rx;
        parameters.ry = shape.ry;
        break;
      }
      case "polygon": {
        const origin = { x: shape.cx, y: shape.cy };
        const rotRad = ((shape.rotation || 0) * Math.PI) / 180;
        lcs = new LocalCoordinateSystem(origin, rotRad);
        parameters.radius = shape.r;
        parameters.sides = shape.sides;
        break;
      }
      case "star": {
        const origin = { x: shape.cx, y: shape.cy };
        const rotRad = ((shape.rotation || 0) * Math.PI) / 180;
        lcs = new LocalCoordinateSystem(origin, rotRad);
        parameters.radius = shape.outerR;
        parameters.outerR = shape.outerR;
        parameters.innerR = shape.innerR;
        parameters.points = shape.points;
        break;
      }
      default: {
        lcs = new LocalCoordinateSystem();
        break;
      }
    }

    return {
      id: shape.id,
      name: objName,
      type: shape.type,
      lcs,
      parameters,
      variables: {},
      constraints: [],
      references: [],
      dependencies: [],
      metadata: {
        stroke: shape.strokeColor,
        strokeWidth: shape.strokeWidth,
        strokeDasharray: shape.strokeDasharray,
        fill: (shape as any).fillColor,
        opacity: shape.opacity,
        isLocked: shape.isLocked,
        groupId: shape.groupId,
      },
    };
  }

  /**
   * Resolves all exposed sub-elements of a CAD object in world space.
   * Enables deep geometric queries such as Rectangle.topEdge.length or Line.endPoint.
   */
  public static getExposedSubEntities(obj: GeometryObjectState): ExposedSubEntities {
    const points: Record<string, Point> = {};
    const vectors: Record<string, Vector2D> = {};
    const scalars: Record<string, number> = {};
    const edges: Record<string, { start: Point; end: Point; length: number; direction: Vector2D }> = {};

    points["origin"] = obj.lcs.localToWorld({ x: 0, y: 0 });
    vectors["axisX"] = obj.lcs.localVectorToWorld({ x: 1, y: 0 });
    vectors["axisY"] = obj.lcs.localVectorToWorld({ x: 0, y: 1 });
    scalars["rotation"] = (obj.lcs.rotationRad * 180) / Math.PI;

    switch (obj.type) {
      case "line":
      case "arrow": {
        const length = obj.parameters.length ?? 0;
        const start = obj.lcs.localToWorld({ x: 0, y: 0 });
        const end = obj.lcs.localToWorld({ x: length, y: 0 });
        const mid = obj.lcs.localToWorld({ x: length / 2, y: 0 });

        points["startPoint"] = start;
        points["start"] = start;
        points["endPoint"] = end;
        points["end"] = end;
        points["midpoint"] = mid;
        points["mid"] = mid;

        vectors["direction"] = vectors["axisX"];
        scalars["length"] = length;
        scalars["angle"] = (obj.lcs.rotationRad * 180) / Math.PI;
        break;
      }

      case "rectangle": {
        const w = obj.parameters.width ?? 0;
        const h = obj.parameters.height ?? 0;

        const tl = obj.lcs.localToWorld({ x: 0, y: 0 });
        const tr = obj.lcs.localToWorld({ x: w, y: 0 });
        const br = obj.lcs.localToWorld({ x: w, y: h });
        const bl = obj.lcs.localToWorld({ x: 0, y: h });
        const center = obj.lcs.localToWorld({ x: w / 2, y: h / 2 });

        points["topLeft"] = tl;
        points["topRight"] = tr;
        points["bottomRight"] = br;
        points["bottomLeft"] = bl;
        points["center"] = center;

        scalars["width"] = w;
        scalars["height"] = h;
        scalars["area"] = w * h;
        scalars["perimeter"] = 2 * (w + h);

        edges["topEdge"] = { start: tl, end: tr, length: w, direction: vectors["axisX"] };
        edges["rightEdge"] = { start: tr, end: br, length: h, direction: vectors["axisY"] };
        edges["bottomEdge"] = { start: br, end: bl, length: w, direction: { x: -vectors["axisX"].x, y: -vectors["axisX"].y } };
        edges["leftEdge"] = { start: bl, end: tl, length: h, direction: { x: -vectors["axisY"].x, y: -vectors["axisY"].y } };
        break;
      }

      case "circle": {
        const r = obj.parameters.radius ?? 0;
        const center = obj.lcs.localToWorld({ x: 0, y: 0 });

        points["center"] = center;
        scalars["radius"] = r;
        scalars["diameter"] = 2 * r;
        scalars["area"] = Math.PI * r * r;
        scalars["circumference"] = 2 * Math.PI * r;
        break;
      }

      case "polygon": {
        const r = obj.parameters.radius ?? 0;
        const sides = Math.max(3, obj.parameters.sides ?? 3);

        // Build vertex list: either from explicit obj.vertices or regular polygon
        let polyVertices: Point[] = [];
        if (obj.vertices && obj.vertices.length >= 3) {
          polyVertices = obj.vertices.map((v) => obj.lcs.localToWorld(v));
        } else {
          const step = (Math.PI * 2) / sides;
          for (let i = 0; i < sides; i++) {
            const a = -Math.PI / 2 + i * step;
            polyVertices.push(obj.lcs.localToWorld({ x: r * Math.cos(a), y: r * Math.sin(a) }));
          }
        }

        const analysis = analyzePolygon(polyVertices);
        obj.analysis = analysis;

        points["center"] = analysis.centroid;
        points["centroid"] = analysis.centroid;
        points["centerOfMass"] = analysis.centerOfMass;
        points["topLeft"] = { x: analysis.boundingBox.minX, y: analysis.boundingBox.minY };
        points["bottomRight"] = { x: analysis.boundingBox.maxX, y: analysis.boundingBox.maxY };

        scalars["radius"] = r;
        scalars["sides"] = sides;
        scalars["area"] = analysis.area;
        scalars["perimeter"] = analysis.perimeter;
        scalars["width"] = analysis.boundingBox.width;
        scalars["height"] = analysis.boundingBox.height;

        for (let i = 0; i < analysis.vertices.length; i++) {
          points[`vertex_${i}`] = analysis.vertices[i];
          scalars[`vertex_${i}.interiorAngle`] = analysis.vertexMetrics[i]?.interiorAngleDeg ?? 0;
          scalars[`vertex_${i}.exteriorAngle`] = analysis.vertexMetrics[i]?.exteriorAngleDeg ?? 0;
        }

        for (let i = 0; i < analysis.edges.length; i++) {
          const e = analysis.edges[i];
          edges[`edge_${i}`] = { start: e.start, end: e.end, length: e.length, direction: e.direction };
          scalars[`edge_${i}.length`] = e.length;
          scalars[`edge_${i}.angle`] = e.angleDeg;
        }
        break;
      }
    }

    return { points, vectors, scalars, edges };
  }

  /**
   * Resolves a dot-notation sub-entity path, e.g.:
   *   "Line_A.endPoint" -> Point { x, y }
   *   "Rectangle_1.topEdge.length" -> number
   *   "Circle_1.center.x" -> number
   *   "Polygon_1.centroid" -> Point { x, y }
   *   "Polygon_1.area" -> number
   */
  public static resolveEntityPath(
    path: string,
    objects: Map<string, GeometryObjectState>
  ): any {
    const parts = path.split(".");
    if (parts.length === 0) return undefined;

    const objNameOrId = parts[0];
    let targetObj: GeometryObjectState | undefined;
    for (const obj of objects.values()) {
      if (obj.name === objNameOrId || obj.id === objNameOrId) {
        targetObj = obj;
        break;
      }
    }

    if (!targetObj) return undefined;
    if (parts.length === 1) return targetObj;

    const sub = GeometryObject.getExposedSubEntities(targetObj);
    const fullProp = parts.slice(1).join(".");

    // Check full joined path in scalars (e.g. "centroid.x", "vertex_0.interiorAngle")
    if (fullProp in sub.scalars) {
      return sub.scalars[fullProp];
    }

    const subProp = parts[1];

    // Check scalar
    if (subProp in sub.scalars) {
      return sub.scalars[subProp];
    }

    // Check point
    if (subProp in sub.points) {
      const pt = sub.points[subProp];
      if (parts.length === 2) return pt;
      if (parts[2] === "x") return pt.x;
      if (parts[2] === "y") return pt.y;
    }

    // Check vector
    if (subProp in sub.vectors) {
      const vec = sub.vectors[subProp];
      if (parts.length === 2) return vec;
      if (parts[2] === "x") return vec.x;
      if (parts[2] === "y") return vec.y;
    }

    // Check edge
    if (sub.edges && subProp in sub.edges) {
      const edge = sub.edges[subProp];
      if (parts.length === 2) return edge;
      if (parts[2] === "length") return edge.length;
      if (parts[2] === "start") return parts[3] === "x" ? edge.start.x : parts[3] === "y" ? edge.start.y : edge.start;
      if (parts[2] === "end") return parts[3] === "x" ? edge.end.x : parts[3] === "y" ? edge.end.y : edge.end;
      if (parts[2] === "direction") return edge.direction;
    }

    return undefined;
  }

  /**
   * Converts a resolved GeometryObjectState into a world-space CAD Shape for rendering
   */
  public static toShape(obj: GeometryObjectState): Shape {
    const base = {
      id: obj.id,
      name: obj.name,
      strokeColor: obj.metadata.stroke || "#000000",
      strokeWidth: obj.metadata.strokeWidth || 2,
      strokeDasharray: obj.metadata.strokeDasharray,
      opacity: obj.metadata.opacity ?? 1,
      isLocked: obj.metadata.isLocked,
      groupId: obj.metadata.groupId,
    };

    switch (obj.type) {
      case "line":
      case "arrow": {
        const length = obj.parameters.length ?? 0;
        const p1 = obj.lcs.localToWorld({ x: 0, y: 0 });
        const p2 = obj.lcs.localToWorld({ x: length, y: 0 });
        return {
          ...base,
          type: obj.type,
          x1: Number(p1.x.toFixed(2)),
          y1: Number(p1.y.toFixed(2)),
          x2: Number(p2.x.toFixed(2)),
          y2: Number(p2.y.toFixed(2)),
        } as Shape;
      }

      case "rectangle": {
        const origin = obj.lcs.origin;
        return {
          ...base,
          type: "rectangle",
          x: Number(origin.x.toFixed(2)),
          y: Number(origin.y.toFixed(2)),
          width: Number((obj.parameters.width ?? 0).toFixed(2)),
          height: Number((obj.parameters.height ?? 0).toFixed(2)),
          rotation: Number(((obj.lcs.rotationRad * 180) / Math.PI).toFixed(2)),
          fillColor: obj.metadata.fill,
        } as Shape;
      }

      case "circle": {
        const origin = obj.lcs.origin;
        return {
          ...base,
          type: "circle",
          cx: Number(origin.x.toFixed(2)),
          cy: Number(origin.y.toFixed(2)),
          r: Number((obj.parameters.radius ?? 0).toFixed(2)),
          fillColor: obj.metadata.fill,
        } as Shape;
      }

      case "ellipse": {
        const origin = obj.lcs.origin;
        return {
          ...base,
          type: "ellipse",
          cx: Number(origin.x.toFixed(2)),
          cy: Number(origin.y.toFixed(2)),
          rx: Number((obj.parameters.rx ?? 0).toFixed(2)),
          ry: Number((obj.parameters.ry ?? 0).toFixed(2)),
          rotation: Number(((obj.lcs.rotationRad * 180) / Math.PI).toFixed(2)),
          fillColor: obj.metadata.fill,
        } as Shape;
      }

      case "polygon": {
        const origin = obj.lcs.origin;
        return {
          ...base,
          type: "polygon",
          cx: Number(origin.x.toFixed(2)),
          cy: Number(origin.y.toFixed(2)),
          r: Number((obj.parameters.radius ?? 0).toFixed(2)),
          sides: obj.parameters.sides ?? 5,
          rotation: Number(((obj.lcs.rotationRad * 180) / Math.PI).toFixed(2)),
          fillColor: obj.metadata.fill,
        } as Shape;
      }

      case "star": {
        const origin = obj.lcs.origin;
        const outerR = Number((obj.parameters.outerR ?? obj.parameters.radius ?? 50).toFixed(2));
        return {
          ...base,
          type: "star",
          cx: Number(origin.x.toFixed(2)),
          cy: Number(origin.y.toFixed(2)),
          outerR,
          innerR: Number((obj.parameters.innerR ?? outerR * 0.5).toFixed(2)),
          points: obj.parameters.points ?? 5,
          rotation: Number(((obj.lcs.rotationRad * 180) / Math.PI).toFixed(2)),
          fillColor: obj.metadata.fill,
        } as Shape;
      }

      default:
        throw new Error(`Unsupported CAD shape type: ${obj.type}`);
    }
  }
}
