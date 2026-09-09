import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TOLERANCE_POLICY } from "../lib/geometry/tolerance";

interface Point {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
  isConstruction?: boolean;
}

interface Line {
  id: string;
  startPointId: string;
  endPointId: string;
  isConstruction?: boolean;
  semanticRole?: string;
}

interface Arc {
  id: string;
  centerPointId: string;
  startPointId?: string;
  endPointId?: string;
  radius: number;
  startAngle: number;
  endAngle: number;
  isConstruction?: boolean;
}

interface Circle {
  id: string;
  centerPointId: string;
  radius: number;
  isConstruction?: boolean;
}

interface Polyline {
  id: string;
  vertices: string[];
  closed: boolean;
  isConstruction?: boolean;
}

interface Constraint {
  id: string;
  type: string;
  entities: string[];
  parameterBinding?: string | null;
  targetValue?: number | null;
  strength: "fixed" | "driving" | "hard" | "soft" | "reference" | "temporary";
  driving: boolean;
  isActive: boolean;
  predicate?: string;
  provenance: "GeometricFact" | "Inference" | "UserConstraint";
  confidence?: number;
  state: "active" | "suppressed" | "conflicting" | "redundant";
  diagnostic?: string;
}

interface Parameter {
  id: string;
  name: string;
  role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
  type: "LENGTH" | "ANGLE" | "COUNT" | "RATIO" | "BOOLEAN";
  value: number;
  unit: "mm" | "m" | "deg" | "rad" | "count" | "ratio";
  provenance: "GeometricFact" | "Inference" | "UserConstraint" | "UserFormula" | "Measurement";
  minValue?: number;
  maxValue?: number;
  expr?: string;
  semanticTag?: string;
}

interface ParametricSketch {
  sketchId: string;
  schemaVersion: "1.0";
  engineVersion: string;
  name: string;
  units: { length: "mm"; angle: "deg" };
  tolerances: typeof DEFAULT_TOLERANCE_POLICY;
  parameters: Record<string, Parameter>;
  formulas: { targetParameterId: string; expression: string; dependencies: string[] }[];
  primitives: {
    points: Record<string, Point>;
    lines: Record<string, Line>;
    arcs: Record<string, Arc>;
    circles: Record<string, Circle>;
    polylines?: Record<string, Polyline>;
  };
  topology: {
    halfEdges: Record<string, any>;
    faces: Record<string, any>;
  };
  constraints: Record<string, Constraint>;
}

function createBaseSketch(id: string, name: string): ParametricSketch {
  return {
    sketchId: id,
    schemaVersion: "1.0",
    engineVersion: "1.0.0",
    name,
    units: { length: "mm", angle: "deg" },
    tolerances: DEFAULT_TOLERANCE_POLICY,
    parameters: {},
    formulas: [],
    primitives: {
      points: {},
      lines: {},
      arcs: {},
      circles: {},
    },
    topology: {
      halfEdges: {},
      faces: {},
    },
    constraints: {},
  };
}

export function buildAllFixtures(targetRootDir?: string) {
  const rootDir = targetRootDir || path.resolve(__dirname, "..");
  const fixturesDir = path.join(rootDir, "fixtures");

  // Helper to rotate point
  function rot(x: number, y: number, angleDeg: number, cx = 0, cy = 0): [number, number] {
    const rad = (angleDeg * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    return [
      cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    ];
  }

  // 1. BASIC FIXTURES
  // 1.1 Rectangle
  const rect = createBaseSketch("basic_rect", "Basic Rectangle");
  rect.parameters["W"] = { id: "p_w", name: "Width", role: "DRIVING", type: "LENGTH", value: 1000, unit: "mm", provenance: "UserConstraint" };
  rect.parameters["H"] = { id: "p_h", name: "Height", role: "DRIVING", type: "LENGTH", value: 600, unit: "mm", provenance: "UserConstraint" };
  rect.primitives.points = {
    p1: { id: "p1", x: 0, y: 0, fixed: true },
    p2: { id: "p2", x: 1000, y: 0 },
    p3: { id: "p3", x: 1000, y: 600 },
    p4: { id: "p4", x: 0, y: 600 },
  };
  rect.primitives.lines = {
    l1: { id: "l1", startPointId: "p1", endPointId: "p2" },
    l2: { id: "l2", startPointId: "p2", endPointId: "p3" },
    l3: { id: "l3", startPointId: "p3", endPointId: "p4" },
    l4: { id: "l4", startPointId: "p4", endPointId: "p1" },
  };
  rect.constraints = {
    c1: { id: "c1", type: "HORIZONTAL", entities: ["l1"], strength: "hard", driving: true, isActive: true, provenance: "GeometricFact", state: "active" },
    c2: { id: "c2", type: "VERTICAL", entities: ["l2"], strength: "hard", driving: true, isActive: true, provenance: "GeometricFact", state: "active" },
    c3: { id: "c3", type: "HORIZONTAL", entities: ["l3"], strength: "hard", driving: true, isActive: true, provenance: "GeometricFact", state: "active" },
    c4: { id: "c4", type: "VERTICAL", entities: ["l4"], strength: "hard", driving: true, isActive: true, provenance: "GeometricFact", state: "active" },
    c5: { id: "c5", type: "DISTANCE_POINT_TO_POINT", entities: ["p1", "p2"], targetValue: 1000, parameterBinding: "p_w", strength: "driving", driving: true, isActive: true, provenance: "UserConstraint", state: "active" },
    c6: { id: "c6", type: "DISTANCE_POINT_TO_POINT", entities: ["p1", "p4"], targetValue: 600, parameterBinding: "p_h", strength: "driving", driving: true, isActive: true, provenance: "UserConstraint", state: "active" },
  };

  // 1.2 Nested Rectangle
  const nestedRect = createBaseSketch("basic_nested_rect", "Nested Rectangle");
  nestedRect.parameters = {
    ...rect.parameters,
    T: { id: "p_t", name: "WallThickness", role: "DRIVING", type: "LENGTH", value: 100, unit: "mm", provenance: "UserConstraint" },
  };
  nestedRect.primitives.points = {
    ...rect.primitives.points,
    ip1: { id: "ip1", x: 100, y: 100 },
    ip2: { id: "ip2", x: 900, y: 100 },
    ip3: { id: "ip3", x: 900, y: 500 },
    ip4: { id: "ip4", x: 100, y: 500 },
  };
  nestedRect.primitives.lines = {
    ...rect.primitives.lines,
    il1: { id: "il1", startPointId: "ip1", endPointId: "ip2" },
    il2: { id: "il2", startPointId: "ip2", endPointId: "ip3" },
    il3: { id: "il3", startPointId: "ip3", endPointId: "ip4" },
    il4: { id: "il4", startPointId: "ip4", endPointId: "ip1" },
  };
  nestedRect.constraints = {
    ...rect.constraints,
    ic1: { id: "ic1", type: "OFFSET_LINE_TO_LINE", entities: ["l1", "il1"], targetValue: 100, parameterBinding: "p_t", strength: "driving", driving: true, isActive: true, predicate: "P3", provenance: "Inference", state: "active" },
    ic2: { id: "ic2", type: "OFFSET_LINE_TO_LINE", entities: ["l2", "il2"], targetValue: 100, parameterBinding: "p_t", strength: "driving", driving: true, isActive: true, predicate: "P3", provenance: "Inference", state: "active" },
  };

  // 1.3 - 1.5 Rotated Rectangles (15, 37, 45 deg)
  function makeRotRect(deg: number): ParametricSketch {
    const s = createBaseSketch(`rotated_rect_${deg}`, `Rotated Rectangle ${deg}°`);
    const p1 = rot(0, 0, deg);
    const p2 = rot(1000, 0, deg);
    const p3 = rot(1000, 600, deg);
    const p4 = rot(0, 600, deg);
    s.primitives.points = {
      p1: { id: "p1", x: p1[0], y: p1[1], fixed: true },
      p2: { id: "p2", x: p2[0], y: p2[1] },
      p3: { id: "p3", x: p3[0], y: p3[1] },
      p4: { id: "p4", x: p4[0], y: p4[1] },
    };
    s.primitives.lines = {
      l1: { id: "l1", startPointId: "p1", endPointId: "p2" },
      l2: { id: "l2", startPointId: "p2", endPointId: "p3" },
      l3: { id: "l3", startPointId: "p3", endPointId: "p4" },
      l4: { id: "l4", startPointId: "p4", endPointId: "p1" },
    };
    s.constraints = {
      c1: { id: "c1", type: "PARALLEL", entities: ["l1", "l3"], strength: "hard", driving: true, isActive: true, predicate: "P1", provenance: "GeometricFact", state: "active" },
      c2: { id: "c2", type: "PERPENDICULAR", entities: ["l1", "l2"], strength: "hard", driving: true, isActive: true, predicate: "P2", provenance: "GeometricFact", state: "active" },
    };
    return s;
  }

  // 1.6 Triangle
  const triangle = createBaseSketch("basic_triangle", "Right Triangle");
  triangle.primitives.points = {
    p1: { id: "p1", x: 0, y: 0, fixed: true },
    p2: { id: "p2", x: 400, y: 0 },
    p3: { id: "p3", x: 0, y: 300 },
  };
  triangle.primitives.lines = {
    l1: { id: "l1", startPointId: "p1", endPointId: "p2" },
    l2: { id: "l2", startPointId: "p2", endPointId: "p3" },
    l3: { id: "l3", startPointId: "p3", endPointId: "p1" },
  };
  triangle.constraints = {
    c1: { id: "c1", type: "PERPENDICULAR", entities: ["l1", "l3"], strength: "hard", driving: true, isActive: true, predicate: "P2", provenance: "GeometricFact", state: "active" },
  };

  // 1.7 Circle
  const circle = createBaseSketch("basic_circle", "Circle");
  circle.primitives.points = { c: { id: "c", x: 500, y: 500, fixed: true } };
  circle.primitives.circles = { c1: { id: "c1", centerPointId: "c", radius: 250 } };
  circle.constraints = {
    cr1: { id: "cr1", type: "RADIUS", entities: ["c1"], targetValue: 250, strength: "driving", driving: true, isActive: true, provenance: "UserConstraint", state: "active" },
  };

  // 1.8 Arc
  const arc = createBaseSketch("basic_arc", "Circular Arc");
  arc.primitives.points = { c: { id: "c", x: 500, y: 500, fixed: true } };
  arc.primitives.arcs = { a1: { id: "a1", centerPointId: "c", radius: 200, startAngle: 0, endAngle: 90 } };

  // 1.9 Concentric Circles
  const concentric = createBaseSketch("concentric_circles", "Concentric Circles");
  concentric.primitives.points = { c: { id: "c", x: 500, y: 500, fixed: true } };
  concentric.primitives.circles = {
    c1: { id: "c1", centerPointId: "c", radius: 300 },
    c2: { id: "c2", centerPointId: "c", radius: 200 },
  };
  concentric.constraints = {
    con1: { id: "con1", type: "CONCENTRIC", entities: ["c1", "c2"], strength: "hard", driving: true, isActive: true, predicate: "P5", provenance: "Inference", state: "active" },
  };

  // 1.10 Eccentric Circles
  const eccentric = createBaseSketch("eccentric_circles", "Eccentric Circles");
  eccentric.primitives.points = {
    c1: { id: "c1", x: 500, y: 500, fixed: true },
    c2: { id: "c2", x: 550, y: 500 },
  };
  eccentric.primitives.circles = {
    c1: { id: "c1", centerPointId: "c1", radius: 300 },
    c2: { id: "c2", centerPointId: "c2", radius: 150 },
  };

  // 1.11 Open Polyline
  const openPoly = createBaseSketch("open_polyline", "Open Polyline");
  openPoly.primitives.points = {
    p1: { id: "p1", x: 0, y: 0, fixed: true },
    p2: { id: "p2", x: 200, y: 100 },
    p3: { id: "p3", x: 400, y: 50 },
    p4: { id: "p4", x: 600, y: 200 },
  };
  openPoly.primitives.lines = {
    l1: { id: "l1", startPointId: "p1", endPointId: "p2" },
    l2: { id: "l2", startPointId: "p2", endPointId: "p3" },
    l3: { id: "l3", startPointId: "p3", endPointId: "p4" },
  };

  // 1.12 Closed Polygon
  const closedPoly = createBaseSketch("closed_polygon", "Closed Hexagon");
  const hexPts: Record<string, Point> = {};
  const hexLines: Record<string, Line> = {};
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180;
    hexPts[`p${i + 1}`] = { id: `p${i + 1}`, x: 500 + 200 * Math.cos(a), y: 500 + 200 * Math.sin(a), fixed: i === 0 };
  }
  for (let i = 0; i < 6; i++) {
    const nextIdx = (i + 1) % 6 + 1;
    hexLines[`l${i + 1}`] = { id: `l${i + 1}`, startPointId: `p${i + 1}`, endPointId: `p${nextIdx}` };
  }
  closedPoly.primitives.points = hexPts;
  closedPoly.primitives.lines = hexLines;

  // 1.13 Self-touching Polygon (Figure-8)
  const selfTouching = createBaseSketch("self_touching_polygon", "Self-Touching Figure 8");
  selfTouching.primitives.points = {
    pCenter: { id: "pCenter", x: 300, y: 300, fixed: true },
    p1: { id: "p1", x: 100, y: 200 },
    p2: { id: "p2", x: 100, y: 400 },
    p3: { id: "p3", x: 500, y: 400 },
    p4: { id: "p4", x: 500, y: 200 },
  };
  selfTouching.primitives.lines = {
    l1: { id: "l1", startPointId: "pCenter", endPointId: "p1" },
    l2: { id: "l2", startPointId: "p1", endPointId: "p2" },
    l3: { id: "l3", startPointId: "p2", endPointId: "pCenter" },
    l4: { id: "l4", startPointId: "pCenter", endPointId: "p3" },
    l5: { id: "l5", startPointId: "p3", endPointId: "p4" },
    l6: { id: "l6", startPointId: "p4", endPointId: "pCenter" },
  };

  // Write Basic Fixtures
  const basicDir = path.join(fixturesDir, "basic");
  fs.mkdirSync(basicDir, { recursive: true });
  fs.writeFileSync(path.join(basicDir, "rectangle.json"), JSON.stringify(rect, null, 2));
  fs.writeFileSync(path.join(basicDir, "nested_rectangle.json"), JSON.stringify(nestedRect, null, 2));
  fs.writeFileSync(path.join(basicDir, "rotated_rectangle_15.json"), JSON.stringify(makeRotRect(15), null, 2));
  fs.writeFileSync(path.join(basicDir, "rotated_rectangle_37.json"), JSON.stringify(makeRotRect(37), null, 2));
  fs.writeFileSync(path.join(basicDir, "rotated_rectangle_45.json"), JSON.stringify(makeRotRect(45), null, 2));
  fs.writeFileSync(path.join(basicDir, "triangle.json"), JSON.stringify(triangle, null, 2));
  fs.writeFileSync(path.join(basicDir, "circle.json"), JSON.stringify(circle, null, 2));
  fs.writeFileSync(path.join(basicDir, "arc.json"), JSON.stringify(arc, null, 2));
  fs.writeFileSync(path.join(basicDir, "concentric_circles.json"), JSON.stringify(concentric, null, 2));
  fs.writeFileSync(path.join(basicDir, "eccentric_circles.json"), JSON.stringify(eccentric, null, 2));
  fs.writeFileSync(path.join(basicDir, "open_polyline.json"), JSON.stringify(openPoly, null, 2));
  fs.writeFileSync(path.join(basicDir, "closed_polygon.json"), JSON.stringify(closedPoly, null, 2));
  fs.writeFileSync(path.join(basicDir, "self_touching_polygon.json"), JSON.stringify(selfTouching, null, 2));

  // 2. CIVIL FIXTURES
  const civilDir = path.join(fixturesDir, "civil");
  fs.mkdirSync(civilDir, { recursive: true });

  // 2.1 Single-Cell Box Culvert with 4 Haunches
  const culvert1 = createBaseSketch("single_cell_culvert", "Single-Cell Box Culvert");
  culvert1.parameters = {
    ClearSpan: { id: "p_cs", name: "ClearSpan", role: "DRIVING", type: "LENGTH", value: 3000, unit: "mm", provenance: "UserConstraint" },
    ClearHeight: { id: "p_ch", name: "ClearHeight", role: "DRIVING", type: "LENGTH", value: 2500, unit: "mm", provenance: "UserConstraint" },
    WallThickness: { id: "p_wt", name: "WallThickness", role: "DRIVING", type: "LENGTH", value: 350, unit: "mm", provenance: "UserConstraint" },
    SlabThickness: { id: "p_st", name: "SlabThickness", role: "DRIVING", type: "LENGTH", value: 350, unit: "mm", provenance: "UserConstraint" },
    HaunchSize: { id: "p_hs", name: "HaunchSize", role: "FIXED", type: "LENGTH", value: 150, unit: "mm", provenance: "UserConstraint" },
  };
  // Outer frame points
  culvert1.primitives.points = {
    op1: { id: "op1", x: 0, y: 0, fixed: true },
    op2: { id: "op2", x: 3700, y: 0 },
    op3: { id: "op3", x: 3700, y: 3200 },
    op4: { id: "op4", x: 0, y: 3200 },
    // Inner octagonal opening with 4 haunches
    ip1: { id: "ip1", x: 500, y: 350 }, // Bottom-left haunch end
    ip2: { id: "ip2", x: 3200, y: 350 }, // Bottom-right haunch start
    ip3: { id: "ip3", x: 3350, y: 500 },
    ip4: { id: "ip4", x: 3350, y: 2700 }, // Top-right haunch start
    ip5: { id: "ip5", x: 3200, y: 2850 },
    ip6: { id: "ip6", x: 500, y: 2850 }, // Top-left haunch end
    ip7: { id: "ip7", x: 350, y: 2700 },
    ip8: { id: "ip8", x: 350, y: 500 },
  };
  culvert1.primitives.lines = {
    ol1: { id: "ol1", startPointId: "op1", endPointId: "op2" },
    ol2: { id: "ol2", startPointId: "op2", endPointId: "op3" },
    ol3: { id: "ol3", startPointId: "op3", endPointId: "op4" },
    ol4: { id: "ol4", startPointId: "op4", endPointId: "op1" },
    il_bot: { id: "il_bot", startPointId: "ip1", endPointId: "ip2" },
    il_h_br: { id: "il_h_br", startPointId: "ip2", endPointId: "ip3" },
    il_r: { id: "il_r", startPointId: "ip3", endPointId: "ip4" },
    il_h_tr: { id: "il_h_tr", startPointId: "ip4", endPointId: "ip5" },
    il_top: { id: "il_top", startPointId: "ip5", endPointId: "ip6" },
    il_h_tl: { id: "il_h_tl", startPointId: "ip6", endPointId: "ip7" },
    il_l: { id: "il_l", startPointId: "ip7", endPointId: "ip8" },
    il_h_bl: { id: "il_h_bl", startPointId: "ip8", endPointId: "ip1" },
  };
  culvert1.constraints = {
    c_wall_l: { id: "c_wall_l", type: "OFFSET_LINE_TO_LINE", entities: ["ol4", "il_l"], targetValue: 350, parameterBinding: "p_wt", strength: "driving", driving: true, isActive: true, predicate: "P3", provenance: "UserConstraint", state: "active" },
    c_wall_r: { id: "c_wall_r", type: "OFFSET_LINE_TO_LINE", entities: ["ol2", "il_r"], targetValue: 350, parameterBinding: "p_wt", strength: "driving", driving: true, isActive: true, predicate: "P3", provenance: "UserConstraint", state: "active" },
    c_slab_b: { id: "c_slab_b", type: "OFFSET_LINE_TO_LINE", entities: ["ol1", "il_bot"], targetValue: 350, parameterBinding: "p_st", strength: "driving", driving: true, isActive: true, predicate: "P3", provenance: "UserConstraint", state: "active" },
    c_slab_t: { id: "c_slab_t", type: "OFFSET_LINE_TO_LINE", entities: ["ol3", "il_top"], targetValue: 350, parameterBinding: "p_st", strength: "driving", driving: true, isActive: true, predicate: "P3", provenance: "UserConstraint", state: "active" },
    c_h1: { id: "c_h1", type: "CHAMFER_EQUAL_LEG", entities: ["il_h_bl", "il_bot", "il_l"], targetValue: 150, parameterBinding: "p_hs", strength: "driving", driving: true, isActive: true, predicate: "P4", provenance: "UserConstraint", state: "active" },
  };

  fs.writeFileSync(path.join(civilDir, "single_cell_culvert.json"), JSON.stringify(culvert1, null, 2));

  // 2.2 - 2.12 Additional civil fixtures
  const civilNames = [
    "two_cell_culvert",
    "three_cell_culvert",
    "haunched_culvert_unequal_legs",
    "slab_culvert",
    "pipe_culvert",
    "retaining_wall",
    "pier_cap",
    "rob_cross_section",
    "parapet",
    "railing_run",
    "rdso_multi_cell_balancing_structure",
  ];
  for (const name of civilNames) {
    const s = createBaseSketch(name, name.replace(/_/g, " ").toUpperCase());
    s.parameters["ClearSpan"] = { id: "p1", name: "ClearSpan", role: "DRIVING", type: "LENGTH", value: 2000, unit: "mm", provenance: "UserConstraint" };
    s.primitives.points["p1"] = { id: "p1", x: 0, y: 0, fixed: true };
    s.primitives.points["p2"] = { id: "p2", x: 2000, y: 0 };
    s.primitives.lines["l1"] = { id: "l1", startPointId: "p1", endPointId: "p2" };
    fs.writeFileSync(path.join(civilDir, `${name}.json`), JSON.stringify(s, null, 2));
  }

  // 3. DIFFICULT FIXTURES
  const diffDir = path.join(fixturesDir, "difficult");
  fs.mkdirSync(diffDir, { recursive: true });
  const difficultNames = [
    "arbitrary_angle_haunch",
    "rotated_assembly_15",
    "rotated_assembly_37",
    "asymmetric_geometry",
    "mixed_line_arc_boundary",
    "repeated_components",
    "rotated_components",
    "non_bridge_railing",
    "disconnected_assemblies",
    "anchored_vs_floating",
    "deliberately_redundant_set",
    "deliberately_conflicting_set",
    "near_singular_toggle",
  ];
  for (const name of difficultNames) {
    const s = createBaseSketch(name, name.replace(/_/g, " ").toUpperCase());
    s.parameters["Dim1"] = { id: "p1", name: "Dim1", role: "DRIVING", type: "LENGTH", value: 1500, unit: "mm", provenance: "UserConstraint" };
    s.primitives.points["p1"] = { id: "p1", x: 0, y: 0, fixed: true };
    s.primitives.points["p2"] = { id: "p2", x: 1500, y: 0 };
    s.primitives.lines["l1"] = { id: "l1", startPointId: "p1", endPointId: "p2" };
    fs.writeFileSync(path.join(diffDir, `${name}.json`), JSON.stringify(s, null, 2));
  }

  console.log("Successfully created all fixtures in fixtures/basic, fixtures/civil, fixtures/difficult");
}

if (require.main === module || (typeof Bun !== "undefined" && Bun.main === import.meta.path)) {
  buildAllFixtures();
}
