import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { DcelPlanarMap, DcelSegmentInput } from "../../lib/geometry/topology/dcel";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import { Point2D } from "../../lib/geometry/topology/types";
import { BipartiteConstraintGraph } from "../../lib/parametric/graph/bipartiteGraph";
import { extractConnectedSubgraphsBFS } from "../../lib/parametric/graph/bfsPartition";
import { DualGraphOrchestrator } from "../../lib/parametric/dualGraphOrchestrator";
import { ParameterManager } from "../../lib/parametric/parameterManager";

interface FixturePoint {
  id: string;
  x: number;
  y: number;
}

interface FixtureLine {
  id: string;
  startPointId: string;
  endPointId: string;
}

interface FixtureData {
  sketchId: string;
  primitives: {
    points: Record<string, FixturePoint>;
    lines: Record<string, FixtureLine>;
  };
}

function rotatePoint(pt: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: pt.x * cos - pt.y * sin,
    y: pt.x * sin + pt.y * cos,
  };
}

function loadFixtureSegments(filePath: string, rotationRad: number = 0): DcelSegmentInput[] {
  const content = readFileSync(filePath, "utf-8");
  const data: FixtureData = JSON.parse(content);
  const points = data.primitives.points;
  const lines = data.primitives.lines;

  const segments: DcelSegmentInput[] = [];

  for (const line of Object.values(lines)) {
    const p1Raw = points[line.startPointId];
    const p2Raw = points[line.endPointId];
    if (!p1Raw || !p2Raw) continue;

    const p1 = rotationRad !== 0 ? rotatePoint(p1Raw, rotationRad) : { x: p1Raw.x, y: p1Raw.y };
    const p2 = rotationRad !== 0 ? rotatePoint(p2Raw, rotationRad) : { x: p2Raw.x, y: p2Raw.y };

    segments.push({
      p1,
      p2,
      sourceShapeId: line.id,
    });
  }

  return segments;
}

describe("Gate G1 Acceptance Criterion (UPCE-MASTER-1.0 §76)", () => {
  const fixturesDir = resolve(__dirname, "../../fixtures");

  const testFixtureFiles = [
    resolve(fixturesDir, "basic/rectangle.json"),
    resolve(fixturesDir, "basic/triangle.json"),
    resolve(fixturesDir, "basic/closed_polygon.json"),
    resolve(fixturesDir, "basic/nested_rectangle.json"),
    resolve(fixturesDir, "civil/single_cell_culvert.json"),
  ];

  describe("Criterion 1: Rotation Invariance of Primitive Graph & Pairwise Vector Measurements", () => {
    const rotationAnglesDeg = [15, 37, 45, 90, 120, 180];

    for (const fixturePath of testFixtureFiles) {
      const fixtureName = fixturePath.split("/").slice(-2).join("/");

      it(`should preserve primitive graph topology and pairwise vector measurements for ${fixtureName} under all rotation angles`, () => {
        const segsBase = loadFixtureSegments(fixturePath, 0);
        if (segsBase.length === 0) return;

        const mapBase = DcelPlanarMap.buildFromSegments(segsBase, {
          policy: DEFAULT_TOLERANCE_POLICY,
        });

        // Compute baseline pairwise Euclidean distances between all vertices
        const baseVertices = Array.from(mapBase.vertices.values());
        const baseDistances: number[] = [];
        for (let i = 0; i < baseVertices.length; i++) {
          for (let j = i + 1; j < baseVertices.length; j++) {
            baseDistances.push(
              Math.hypot(
                baseVertices[i].point.x - baseVertices[j].point.x,
                baseVertices[i].point.y - baseVertices[j].point.y
              )
            );
          }
        }
        baseDistances.sort((a, b) => a - b);

        // Baseline vertex degree sequence
        const baseDegrees = Array.from(mapBase.vertices.values())
          .map((v) => {
            let deg = 0;
            for (const he of mapBase.halfEdges.values()) {
              if (he.origin === v.id) deg++;
            }
            return deg;
          })
          .sort((a, b) => a - b);

        // Baseline sorted face areas
        const baseAreas = Array.from(mapBase.faces.values())
          .filter((f) => !f.isExterior)
          .map((f) => Math.abs(f.area))
          .sort((a, b) => a - b);

        for (const angleDeg of rotationAnglesDeg) {
          const angleRad = (angleDeg * Math.PI) / 180;
          const segsRot = loadFixtureSegments(fixturePath, angleRad);

          const mapRot = DcelPlanarMap.buildFromSegments(segsRot, {
            policy: DEFAULT_TOLERANCE_POLICY,
          });

          // 1. Primitive Graph Topology Invariance
          expect(mapRot.vertices.size).toBe(mapBase.vertices.size);
          expect(mapRot.edges.size).toBe(mapBase.edges.size);
          expect(mapRot.halfEdges.size).toBe(mapBase.halfEdges.size);
          expect(mapRot.faces.size).toBe(mapBase.faces.size);
          expect(mapRot.connectedComponentsCount).toBe(mapBase.connectedComponentsCount);

          // Degree sequence invariance
          const rotDegrees = Array.from(mapRot.vertices.values())
            .map((v) => {
              let deg = 0;
              for (const he of mapRot.halfEdges.values()) {
                if (he.origin === v.id) deg++;
              }
              return deg;
            })
            .sort((a, b) => a - b);
          expect(rotDegrees).toEqual(baseDegrees);

          // Face area invariance under rotation
          const rotAreas = Array.from(mapRot.faces.values())
            .filter((f) => !f.isExterior)
            .map((f) => Math.abs(f.area))
            .sort((a, b) => a - b);

          expect(rotAreas.length).toBe(baseAreas.length);
          for (let k = 0; k < baseAreas.length; k++) {
            expect(rotAreas[k]).toBeCloseTo(baseAreas[k], 4);
          }

          // 2. Pairwise Vector Distance Measurement Invariance
          const rotVertices = Array.from(mapRot.vertices.values());
          const rotDistances: number[] = [];
          for (let i = 0; i < rotVertices.length; i++) {
            for (let j = i + 1; j < rotVertices.length; j++) {
              rotDistances.push(
                Math.hypot(
                  rotVertices[i].point.x - rotVertices[j].point.x,
                  rotVertices[i].point.y - rotVertices[j].point.y
                )
              );
            }
          }
          rotDistances.sort((a, b) => a - b);

          expect(rotDistances.length).toBe(baseDistances.length);
          for (let k = 0; k < baseDistances.length; k++) {
            expect(rotDistances[k]).toBeCloseTo(baseDistances[k], 4);
          }
        }
      });
    }
  });

  describe("Criterion 2: Disconnected Components Get Separate Topological and Solve Partitions", () => {
    it("should partition disconnected components topologically in DCEL with C >= 2 and valid Euler characteristic", () => {
      // Create two completely disconnected rectangles (Component 1 at (0,0), Component 2 at (1000, 0))
      const comp1 = [
        { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
        { p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 } },
        { p1: { x: 100, y: 100 }, p2: { x: 0, y: 100 } },
        { p1: { x: 0, y: 100 }, p2: { x: 0, y: 0 } },
      ];

      const comp2 = [
        { p1: { x: 1000, y: 0 }, p2: { x: 1100, y: 0 } },
        { p1: { x: 1100, y: 0 }, p2: { x: 1100, y: 100 } },
        { p1: { x: 1100, y: 100 }, p2: { x: 1000, y: 100 } },
        { p1: { x: 1000, y: 100 }, p2: { x: 1000, y: 0 } },
      ];

      const map = DcelPlanarMap.buildFromSegments([...comp1, ...comp2], {
        policy: DEFAULT_TOLERANCE_POLICY,
      });

      // 8 vertices, 8 edges, 3 faces (2 interior + 1 shared exterior)
      expect(map.vertices.size).toBe(8);
      expect(map.edges.size).toBe(8);
      expect(map.faces.size).toBe(3);

      // Must detect exactly 2 disconnected topological components!
      expect(map.connectedComponentsCount).toBe(2);

      // Euler characteristic must satisfy V - E + F = 1 + C (8 - 8 + 3 = 1 + 2 = 3)
      expect(map.vertices.size - map.edges.size + map.faces.size).toBe(1 + map.connectedComponentsCount);
    });

    it("should partition solve subgraphs independently when a disconnected component is dirty", () => {
      // Build bipartite constraint graph with two disjoint components:
      // Component A: entities [eA1, eA2], constraint [cA1]
      // Component B: entities [eB1, eB2], constraint [cB1]
      const bg = new BipartiteConstraintGraph();
      bg.addEntity("eA1", 2);
      bg.addEntity("eA2", 2);
      bg.addConstraint("cA1", ["eA1", "eA2"], 1);

      bg.addEntity("eB1", 2);
      bg.addEntity("eB2", 2);
      bg.addConstraint("cB1", ["eB1", "eB2"], 1);

      const pm = new ParameterManager();
      pm.setDriving("paramA", 100);
      pm.setDriving("paramB", 200);

      const orchestrator = new DualGraphOrchestrator(pm, bg);

      // Mark ONLY Component A dirty
      const subgraphs = orchestrator.partitionDirtySubgraphs(["eA1"]);

      // Exactly 1 connected subgraph should be returned for the solve partition
      expect(subgraphs).toHaveLength(1);
      const subA = subgraphs[0];

      // Subgraph must contain ONLY component A entities and constraints!
      expect(Array.from(subA.entityIds).sort()).toEqual(["eA1", "eA2"]);
      expect(Array.from(subA.constraintIds)).toEqual(["cA1"]);

      // Component B entities and constraints must NOT be included (zero global rigid-body subtraction)
      expect(subA.entityIds.has("eB1")).toBe(false);
      expect(subA.entityIds.has("eB2")).toBe(false);
      expect(subA.constraintIds.has("cB1")).toBe(false);
    });
  });
});
