/**
 * Converts UI Shape objects to a canonical ParametricSketch.
 * UPCE-MASTER-1.0 §69.
 */

import { Shape } from "../geometry/types";
import { ParametricSketch } from "../parametric/schemaTypes";
import { DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { ParametricVariable } from "../parametric/types";

export function shapesToParametricSketch(
  shapes: Shape[],
  variables?: Map<string, ParametricVariable> | Record<string, ParametricVariable> | Record<string, number>,
  sketchId: string = "canvas_sketch"
): ParametricSketch {
  const points: ParametricSketch["primitives"]["points"] = {};
  const lines: ParametricSketch["primitives"]["lines"] = {};
  const circles: ParametricSketch["primitives"]["circles"] = {};
  const arcs: ParametricSketch["primitives"]["arcs"] = {};
  const polylines: NonNullable<ParametricSketch["primitives"]["polylines"]> = {};

  let ptIdx = 0;
  const allocPt = (x: number, y: number, prefix: string = "pt"): string => {
    const id = `${prefix}_${ptIdx++}`;
    points[id] = {
      id,
      x,
      y,
      isConstruction: false,
      fixed: false,
    };
    return id;
  };

  for (const s of shapes) {
    if (s.type === "line" || s.type === "arrow") {
      const p1 = allocPt(s.x1, s.y1, `${s.id}_p1`);
      const p2 = allocPt(s.x2, s.y2, `${s.id}_p2`);
      lines[s.id] = {
        id: s.id,
        startPointId: p1,
        endPointId: p2,
        isConstruction: false,
      };
    } else if (s.type === "rectangle") {
      const p1 = allocPt(s.x, s.y, `${s.id}_tl`);
      const p2 = allocPt(s.x + s.width, s.y, `${s.id}_tr`);
      const p3 = allocPt(s.x + s.width, s.y + s.height, `${s.id}_br`);
      const p4 = allocPt(s.x, s.y + s.height, `${s.id}_bl`);

      lines[`${s.id}_top`] = { id: `${s.id}_top`, startPointId: p1, endPointId: p2 };
      lines[`${s.id}_right`] = { id: `${s.id}_right`, startPointId: p2, endPointId: p3 };
      lines[`${s.id}_bottom`] = { id: `${s.id}_bottom`, startPointId: p3, endPointId: p4 };
      lines[`${s.id}_left`] = { id: `${s.id}_left`, startPointId: p4, endPointId: p1 };
    } else if (s.type === "circle") {
      const center = allocPt(s.cx, s.cy, `${s.id}_c`);
      circles[s.id] = {
        id: s.id,
        centerPointId: center,
        radius: s.r,
      };
    } else if (s.type === "ellipse") {
      const center = allocPt(s.cx, s.cy, `${s.id}_c`);
      circles[s.id] = {
        id: s.id,
        centerPointId: center,
        radius: (s.rx + s.ry) / 2,
      };
    } else if ((s as any).type === "arc") {
      const arc = s as any;
      const center = allocPt(arc.cx, arc.cy, `${arc.id}_c`);
      arcs[arc.id] = {
        id: arc.id,
        centerPointId: center,
        radius: arc.radius,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
      };
    } else if (s.type === "polygon") {
      // Regular polygon vertices around (cx, cy)
      const sides = Math.max(3, s.sides || 3);
      const polyPts: string[] = [];
      for (let i = 0; i < sides; i++) {
        const theta = (2 * Math.PI * i) / sides - Math.PI / 2;
        const vx = s.cx + s.r * Math.cos(theta);
        const vy = s.cy + s.r * Math.sin(theta);
        polyPts.push(allocPt(vx, vy, `${s.id}_p${i}`));
      }
      polylines[s.id] = {
        id: s.id,
        vertices: polyPts,
        closed: true,
      };
    }
  }

  const parameters: ParametricSketch["parameters"] = {};
  if (variables) {
    if (variables instanceof Map) {
      for (const [name, v] of variables.entries()) {
        parameters[name] = {
          id: name,
          name,
          role: "DRIVING",
          type: "LENGTH",
          value: v.value,
          unit: (v.unit as any) ?? "mm",
          provenance: "UserConstraint",
        };
      }
    } else {
      for (const [name, val] of Object.entries(variables)) {
        const numVal = typeof val === "number" ? val : typeof (val as any)?.value === "number" ? (val as any).value : 0;
        const unit = typeof (val as any)?.unit === "string" ? (val as any).unit : "mm";
        parameters[name] = {
          id: name,
          name,
          role: "DRIVING",
          type: "LENGTH",
          value: numVal,
          unit,
          provenance: "UserConstraint",
        };
      }
    }
  }

  return {
    sketchId,
    schemaVersion: "1.0",
    engineVersion: "1.0.0",
    units: {
      length: "mm",
      angle: "deg",
    },
    tolerances: {
      units: "mm",
      weld_mm: DEFAULT_TOLERANCE_POLICY.weld_mm,
      geometry_mm: DEFAULT_TOLERANCE_POLICY.geometry_mm,
      cluster_mm: DEFAULT_TOLERANCE_POLICY.cluster_mm,
      angle_rad: DEFAULT_TOLERANCE_POLICY.angle_rad,
      solver_residual: DEFAULT_TOLERANCE_POLICY.solver_residual,
      singular_value_eps: DEFAULT_TOLERANCE_POLICY.singular_value_eps,
      independence_eps: DEFAULT_TOLERANCE_POLICY.independence_eps,
    },
    parameters,
    formulas: [],
    primitives: {
      points,
      lines,
      arcs,
      circles,
      polylines,
    },
    constraints: {},
    topology: {
      halfEdges: {},
      faces: {},
    },
  };
}
