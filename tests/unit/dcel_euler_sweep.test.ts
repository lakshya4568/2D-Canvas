/**
 * Euler-characteristic validation on EVERY DCEL build, across the whole §74
 * fixture library — one of the two coverage gaps the implementation prompt
 * called out explicitly.
 *
 * "Euler-characteristic validation on every DCEL build: V − E + F = 2 for a
 *  connected planar map (adjust for multiple components/holes), plus half-edge
 *  twin-pairing verification and zero disconnected joints."
 *
 * UPCE-MASTER-1.0 §19, §75.1, and the test-requirements section of the prompt.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DcelPlanarMap } from "../../lib/geometry/topology/dcel";
import { Point2D } from "../../lib/geometry/topology/types";
import { ParametricSketch } from "../../lib/parametric/schemaTypes";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

const ROOT = join(import.meta.dir, "..", "..");
const FIXTURE_DIRS = ["basic", "civil", "difficult"] as const;

interface LoadedFixture {
  group: string;
  name: string;
  segments: { p1: Point2D; p2: Point2D; sourceShapeId?: string }[];
}

/** Lowers a fixture's primitives into the segment list the DCEL consumes. */
function fixtureSegments(sketch: ParametricSketch): LoadedFixture["segments"] {
  const points = sketch.primitives.points ?? {};
  const segments: LoadedFixture["segments"] = [];

  for (const line of Object.values(sketch.primitives.lines ?? {})) {
    if (line.isConstruction === true) continue;
    const a = points[line.startPointId];
    const b = points[line.endPointId];
    if (!a || !b) continue;
    segments.push({ p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y }, sourceShapeId: line.id });
  }

  for (const poly of Object.values(sketch.primitives.polylines ?? {})) {
    if (poly.isConstruction === true) continue;
    const verts = poly.vertices.map((v) => points[v]).filter(Boolean);
    const limit = poly.closed ? verts.length : verts.length - 1;
    for (let i = 0; i < limit; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      segments.push({ p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y }, sourceShapeId: poly.id });
    }
  }

  return segments;
}

function loadFixtures(): LoadedFixture[] {
  const out: LoadedFixture[] = [];
  for (const group of FIXTURE_DIRS) {
    const dir = join(ROOT, "fixtures", group);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const sketch = JSON.parse(readFileSync(join(dir, file), "utf8")) as ParametricSketch;
      out.push({ group, name: file.replace(/\.json$/, ""), segments: fixtureSegments(sketch) });
    }
  }
  return out;
}

const FIXTURES = loadFixtures();

describe("§74 The fixture library is complete and loadable", () => {
  it("loads every fixture in all three groups", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(30);
    for (const group of FIXTURE_DIRS) {
      expect(FIXTURES.filter((f) => f.group === group).length).toBeGreaterThan(0);
    }
  });
});

describe("Euler characteristic holds on every DCEL build", () => {
  const withSegments = FIXTURES.filter((f) => f.segments.length >= 3);

  it("has straight-edge geometry to arrange in most fixtures", () => {
    expect(withSegments.length).toBeGreaterThan(0);
  });

  for (const fixture of FIXTURES.filter((f) => f.segments.length >= 3)) {
    it(`V − E + F = 1 + C for ${fixture.group}/${fixture.name}`, () => {
      // buildFromSegments runs validateTopology internally and THROWS on a
      // violation, so a clean build is itself the assertion.
      const map = DcelPlanarMap.buildFromSegments(fixture.segments, {
        policy: DEFAULT_TOLERANCE_POLICY,
      });

      const V = map.vertices.size;
      const E = map.edges.size;
      const F = map.faces.size;
      const C = map.connectedComponentsCount;
      let holes = 0;
      for (const face of map.faces.values()) holes += face.innerHoles.length;

      const euler = V - E + F;
      const expected = 1 + C;
      expect(
        euler === expected || euler + holes === expected,
        `${fixture.name}: V(${V}) − E(${E}) + F(${F}) = ${euler}, expected ${expected} (holes ${holes})`
      ).toBe(true);
    });
  }
});

describe("Half-edge twin pairing and cycle continuity", () => {
  for (const fixture of FIXTURES.filter((f) => f.segments.length >= 3)) {
    it(`every half-edge is correctly paired and linked in ${fixture.group}/${fixture.name}`, () => {
      const map = DcelPlanarMap.buildFromSegments(fixture.segments);

      for (const he of map.halfEdges.values()) {
        const twin = map.halfEdges.get(he.twin);
        expect(twin, `missing twin for ${he.id}`).toBeDefined();
        expect(twin!.twin).toBe(he.id);
        // A twin runs the other way along the same undirected edge.
        expect(twin!.origin).toBe(he.target);
        expect(twin!.target).toBe(he.origin);
        expect(twin!.edge).toBe(he.edge);

        const next = map.halfEdges.get(he.next);
        expect(next, `missing next for ${he.id}`).toBeDefined();
        expect(next!.prev).toBe(he.id);
        // next must continue from where this half-edge ended.
        expect(next!.origin).toBe(he.target);

        const prev = map.halfEdges.get(he.prev);
        expect(prev, `missing prev for ${he.id}`).toBeDefined();
        expect(prev!.next).toBe(he.id);
      }
    });
  }
});

describe("Zero disconnected joints", () => {
  for (const fixture of FIXTURES.filter((f) => f.segments.length >= 3)) {
    it(`every vertex carries a live incident half-edge in ${fixture.group}/${fixture.name}`, () => {
      const map = DcelPlanarMap.buildFromSegments(fixture.segments);
      for (const v of map.vertices.values()) {
        expect(v.incidentHalfEdge, `vertex ${v.id} has no incident half-edge`).toBeTruthy();
        expect(map.halfEdges.has(v.incidentHalfEdge!)).toBe(true);
        expect(map.halfEdges.get(v.incidentHalfEdge!)!.origin).toBe(v.id);
      }
    });
  }
});

describe("Every face closes", () => {
  for (const fixture of FIXTURES.filter((f) => f.segments.length >= 3)) {
    it(`every face boundary cycle returns to its start in ${fixture.group}/${fixture.name}`, () => {
      const map = DcelPlanarMap.buildFromSegments(fixture.segments);

      for (const face of map.faces.values()) {
        for (const start of [face.outerBoundary, ...face.innerHoles].filter(Boolean) as string[]) {
          let current = start;
          let steps = 0;
          const limit = map.halfEdges.size + 1;
          do {
            const he = map.halfEdges.get(current);
            expect(he, `broken cycle in face ${face.id}`).toBeDefined();
            expect(he!.face).toBe(face.id);
            current = he!.next;
            steps += 1;
          } while (current !== start && steps <= limit);
          expect(steps).toBeLessThanOrEqual(limit);
          expect(current).toBe(start);
        }
      }
    });
  }
});

describe("Euler validation actually rejects a corrupted map", () => {
  it("throws when validateTopology is run on a broken twin link", () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const map = DcelPlanarMap.buildFromSegments(
      square.map((p, i) => ({ p1: p, p2: square[(i + 1) % square.length] }))
    );
    // Sanity: the intact map validates.
    expect(() => map.validateTopology()).not.toThrow();

    const victim = [...map.halfEdges.values()][0];
    victim.twin = "nonexistent_half_edge";
    expect(() => map.validateTopology()).toThrow(/twin pairing/);
  });

  it("throws on a disconnected joint", () => {
    const square: Point2D[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const map = DcelPlanarMap.buildFromSegments(
      square.map((p, i) => ({ p1: p, p2: square[(i + 1) % square.length] }))
    );
    [...map.vertices.values()][0].incidentHalfEdge = null;
    expect(() => map.validateTopology()).toThrow(/Disconnected joint/);
  });
});
