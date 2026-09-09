import { describe, it, expect } from "vitest";
import { RectangleShape, LineShape, CircleShape, EllipseShape } from "../../lib/geometry/types";
import {
  lowerShapesToTopology,
  LineAdapter,
  RectangleAdapter,
  CircleAdapter,
  PolygonPolylineAdapter,
  ArcAdapter,
  CarrierAdapter,
} from "../../lib/geometry/adapters";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

describe("Primitive Adapters & Topology Lowering (UPCE-MASTER-1.0 §5.1 & §86)", () => {
  it("should lower a rectangle into 4 vertices and 4 segments with preserved source editing ID", () => {
    const rect: RectangleShape = {
      id: "box_1",
      name: "Box 1",
      type: "rectangle",
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    };

    const adapter = new RectangleAdapter();
    const { vertices, segments } = adapter.lower(rect);

    expect(vertices).toHaveLength(4);
    expect(segments).toHaveLength(4);

    for (const v of vertices) {
      expect(v.sourceShapeId).toBe("box_1");
    }
    for (const s of segments) {
      expect(s.sourceShapeId).toBe("box_1");
      expect(s.curveType).toBe("line");
    }

    // Check corners
    expect(vertices[0].point).toEqual({ x: 100, y: 50 });
    expect(vertices[1].point).toEqual({ x: 300, y: 50 });
    expect(vertices[2].point).toEqual({ x: 300, y: 200 });
    expect(vertices[3].point).toEqual({ x: 100, y: 200 });
  });

  it("should lower two adjacent rectangles into a shared topological segment/vertex graph", () => {
    // Cell 1: x: 0 to 500, y: 0 to 400
    const cell1: RectangleShape = {
      id: "bay_1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 500,
      height: 400,
    };

    // Cell 2 sharing dividing wall at x = 500: x: 500 to 1000, y: 0 to 400
    const cell2: RectangleShape = {
      id: "bay_2",
      type: "rectangle",
      x: 500,
      y: 0,
      width: 500,
      height: 400,
    };

    const topology = lowerShapesToTopology([cell1, cell2], {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    // 2 separate rectangles would have 8 vertices, but 2 are shared at (500, 0) and (500, 400)
    // Welded graph should have 6 unique vertices
    expect(topology.vertices).toHaveLength(6);

    // Verify both shapes are represented in the segments
    const cell1Segs = topology.segments.filter((s) => s.sourceShapeId === "bay_1");
    const cell2Segs = topology.segments.filter((s) => s.sourceShapeId === "bay_2");
    expect(cell1Segs).toHaveLength(4);
    expect(cell2Segs).toHaveLength(4);
  });

  it("should lower circle into quadrant arc segments with analytical arc parameters", () => {
    const circle: CircleShape = {
      id: "pipe_1",
      type: "circle",
      cx: 200,
      cy: 200,
      r: 50,
    };

    const adapter = new CircleAdapter();
    const { vertices, segments } = adapter.lower(circle);

    expect(vertices).toHaveLength(4);
    expect(segments).toHaveLength(4);

    for (const seg of segments) {
      expect(seg.curveType).toBe("arc");
      expect(seg.arcParams).toBeDefined();
      expect(seg.arcParams?.radius).toBe(50);
      expect(seg.arcParams?.center).toEqual({ x: 200, y: 200 });
    }
  });

  it("should preserve carrier curves (ellipse & spline) as non-constraint-editable", () => {
    const ellipse: EllipseShape = {
      id: "ell_1",
      type: "ellipse",
      cx: 100,
      cy: 100,
      rx: 80,
      ry: 40,
    };

    const carrierAdapter = new CarrierAdapter();
    const carrier = carrierAdapter.lowerEllipse(ellipse);

    expect(carrier.id).toBe("carrier_ell_1");
    expect(carrier.isCarrier).toBe(true);
    expect(carrier.isConstraintEditable).toBe(false);
    expect(carrier.type).toBe("ellipse");
    expect(carrier.boundingBox).toEqual({
      minX: 20,
      maxX: 180,
      minY: 60,
      maxY: 140,
    });
  });

  it("should lift updated vertex coordinates back to shape properties", () => {
    const rect: RectangleShape = {
      id: "box_1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    const adapter = new RectangleAdapter();
    // Simulate solver displacing vertices: width expands to 180, height to 120
    const vertexMap = new Map([
      ["box_1_v0", { x: 0, y: 0 }],
      ["box_1_v1", { x: 180, y: 0 }],
      ["box_1_v2", { x: 180, y: 120 }],
      ["box_1_v3", { x: 0, y: 120 }],
    ]);

    const updated = adapter.lift(rect, vertexMap);
    expect(updated.width).toBe(180);
    expect(updated.height).toBe(120);
    expect(updated.x).toBe(0);
    expect(updated.y).toBe(0);
  });

  it("should lower rotated rectangles and polygons with exact rotated model coordinates", () => {
    // 100x100 rectangle rotated 90 degrees around center (50, 50)
    const rect: RectangleShape = {
      id: "rot_rect",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 90,
    };

    const rectAdapter = new RectangleAdapter();
    const loweredRect = rectAdapter.lower(rect);
    expect(loweredRect.vertices).toHaveLength(4);
    // Center is (50, 50). (0, 0) rotated 90° clockwise around (50, 50) is (100, 0)
    expect(loweredRect.vertices[0].point.x).toBeCloseTo(100, 4);
    expect(loweredRect.vertices[0].point.y).toBeCloseTo(0, 4);

    // Triangle rotated 180 degrees
    const polyAdapter = new PolygonPolylineAdapter();
    const loweredPoly = polyAdapter.lower({
      id: "rot_tri",
      type: "polygon",
      cx: 100,
      cy: 100,
      r: 50,
      sides: 3,
      rotation: 180,
    });
    expect(loweredPoly.vertices).toHaveLength(3);
    // Unrotated apex at -90° (0, -50 relative: (100, 50)). Rotated 180° around (100, 100) is (100, 150)
    expect(loweredPoly.vertices[0].point.x).toBeCloseTo(100, 4);
    expect(loweredPoly.vertices[0].point.y).toBeCloseTo(150, 4);
  });

  it("should lower arc, spline, and star shapes polymorphically in lowerShapesToTopology", () => {
    const arcShape = {
      id: "arc_1",
      type: "arc",
      cx: 0,
      cy: 0,
      r: 50,
      startAngleRad: 0,
      endAngleRad: Math.PI / 2,
    };

    const splineShape = {
      id: "spline_1",
      type: "spline",
      controlPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 100 },
        { x: 100, y: 0 },
      ],
    };

    const starShape = {
      id: "star_1",
      type: "star",
      cx: 200,
      cy: 200,
      innerR: 20,
      outerR: 50,
      points: 5,
    };

    const topology = lowerShapesToTopology([arcShape as any, splineShape as any, starShape as any], {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    expect(topology.segments.filter((s) => s.sourceShapeId === "arc_1")).toHaveLength(1);
    expect(topology.segments.filter((s) => s.sourceShapeId === "star_1")).toHaveLength(10); // 5 points = 10 edges
    expect(topology.carriers.filter((c) => c.sourceShapeId === "spline_1")).toHaveLength(1);
  });

  it("should feed lowered adjacent rectangles directly into DCEL and satisfy Euler-Poincare", () => {
    const { DcelPlanarMap } = require("../../lib/geometry/topology/dcel");
    const cell1: RectangleShape = { id: "c1", type: "rectangle", x: 0, y: 0, width: 300, height: 200 };
    const cell2: RectangleShape = { id: "c2", type: "rectangle", x: 300, y: 0, width: 300, height: 200 };

    const topology = lowerShapesToTopology([cell1, cell2], { policy: DEFAULT_TOLERANCE_POLICY });
    const map = DcelPlanarMap.buildFromSegments(topology.segments, { policy: DEFAULT_TOLERANCE_POLICY });

    expect(map.vertices.size).toBe(6);
    expect(map.edges.size).toBe(7);
    expect(map.faces.size).toBe(3);
    expect(map.vertices.size - map.edges.size + map.faces.size).toBe(1 + map.connectedComponentsCount);
  });
});
