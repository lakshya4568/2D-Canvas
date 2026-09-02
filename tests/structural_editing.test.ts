import { describe, it, expect } from "vitest";
import { StructuralEditor, PolygonTopology } from "../lib/parametric/structuralEditing";
import { analyzePolygon } from "../lib/parametric/closedGeometry";
import { GeometryObject, GeometryObjectState } from "../lib/parametric/geometryObject";
import { LCSSolver } from "../lib/parametric/solver";

describe("Structural Topology Editing & Derived Property Referencing", () => {
  it("inserts a vertex on a polygon edge and re-solves closed metrics", () => {
    // Square: (0, 0) -> (100, 0) -> (100, 100) -> (0, 100)
    const initialVertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const topo: PolygonTopology = {
      id: "poly1",
      name: "Square",
      vertices: initialVertices,
      isClosed: true,
      analysis: analyzePolygon(initialVertices),
    };

    expect(topo.analysis?.area).toBe(10000);
    expect(topo.vertices.length).toBe(4);

    // Insert vertex along top edge (index 0, between (0,0) and (100,0)) at (50, -20) (making a house shape!)
    const res = StructuralEditor.insertVertex(topo, 0, { x: 50, y: -20 });
    expect(res.success).toBe(true);
    expect(res.topology.vertices.length).toBe(5);
    expect(res.isClosedNow).toBe(true);

    // New area should be square area (10000) + triangle roof area (0.5 * 100 * 20 = 1000) = 11000!
    expect(res.topology.analysis?.area).toBe(11000);
  });

  it("deleting an edge breaks closed topology into an open polyline", () => {
    const initialVertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const topo: PolygonTopology = {
      id: "poly1",
      name: "Square",
      vertices: initialVertices,
      isClosed: true,
      analysis: analyzePolygon(initialVertices),
    };

    // Delete edge 2
    const res = StructuralEditor.deleteEdge(topo, 2);
    expect(res.success).toBe(true);
    expect(res.isClosedNow).toBe(false); // Closed structure broken!
    expect(res.topology.analysis).toBeUndefined();
  });

  it("propagates derived polygon properties to dependent geometry: Circle.center = Polygon.centroid", () => {
    const solver = new LCSSolver();

    // Polygon: 200 x 200 square at (0, 0)
    // Centroid is at (100, 100)
    const polyObj = GeometryObject.fromShape({
      id: "poly_1",
      name: "Polygon_1",
      type: "polygon",
      cx: 100,
      cy: 100,
      r: 100,
      sides: 4,
    });
    // Local vertices centered around origin (0, 0) in local space
    polyObj.vertices = [
      { x: -100, y: -100 },
      { x: 100, y: -100 },
      { x: 100, y: 100 },
      { x: -100, y: 100 },
    ];

    // Circle whose center is bound to Polygon_1.centroid and radius to Polygon_1.width / 10
    const circleObj = GeometryObject.fromShape({
      id: "circ_1",
      name: "Circle_1",
      type: "circle",
      cx: 0,
      cy: 0,
      r: 10,
    });
    circleObj.relativePlacement = {
      attachedTo: "Polygon_1.centroid",
    };
    circleObj.variables.radius = "R_Circle";

    const variables = new Map([
      ["R_Circle", { name: "R_Circle", value: 20, formula: "Polygon_1.width / 10" }],
    ]);

    const objects = new Map([
      ["poly_1", polyObj],
      ["circ_1", circleObj],
    ]);

    const report = solver.solve(variables, objects);
    expect(report.success).toBe(true);

    const circShape = report.shapes.find((s) => s.name === "Circle_1") as any;
    // Circle center should be at polygon centroid (100, 100)
    expect(circShape.cx).toBeCloseTo(100, 1);
    expect(circShape.cy).toBeCloseTo(100, 1);

    // Circle radius should be width / 10 = 200 / 10 = 20
    expect(circShape.r).toBeCloseTo(20, 1);
  });
});
