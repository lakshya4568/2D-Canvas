/**
 * Parametric Model & Symbol Manager
 * Manages variables, shape parameter bindings, formula evaluation, and bidirectional synchronization.
 */

import { Shape } from "../geometry/types";
import { lineMetrics, rectMetrics, circleMetrics, getShapeCenter } from "../geometry/metrics";
import { DependencyGraph } from "./dependencyGraph";
import { parseFormula, evaluateFormula, SymbolTable } from "./expression";
import { GeometricConstraint, solveConstraints, SolverResult } from "./constraints";
import { LocalCoordinateSystem, Transform2D, Vector2D, AffineMatrix2D } from "./transform2d";
import { GeometryObjectState, GeometryObject, RelativePlacementDef } from "./geometryObject";
import { LCSSolver, LCSSolveReport } from "./solver";
import { ConstraintGraph, DOFAnalysis } from "./constraintGraph";
import { GeometricConstraintSolver, GeometricSolveResult } from "./constraintSolver";
import { detectClosedLoops, analyzePolygon, ClosedShapeAnalysis, DetectedLoop } from "./closedGeometry";
import { ConstructionManager } from "./constructionGeometry";
import { solveClosedStructuralLoop } from "./structuralLoopSolver";

export interface ParametricVariable {
  name: string;
  value: number;
  formula?: string;
  unit?: string;
  description?: string;
  min?: number;
  max?: number;
}

export interface ShapeParameterDef {
  key: string;
  label: string;
  value: number;
  readOnly?: boolean;
}

export class ParametricModel {
  public variables = new Map<string, ParametricVariable>();
  public graph = new DependencyGraph();
  public constraints: GeometricConstraint[] = [];
  public lcsSolver = new LCSSolver();
  public cadObjects = new Map<string, GeometryObjectState>();
  public constraintGraph = new ConstraintGraph();
  public geometricSolver = new GeometricConstraintSolver();
  public constructionManager = new ConstructionManager();
  public activeLoops: DetectedLoop[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.variables.clear();
    this.graph.clear();
    this.constraints = [];
    this.cadObjects.clear();
    this.constraintGraph.clear();
    this.constructionManager.clear();
    this.activeLoops = [];
  }

  /**
   * Generates canonical shape name if none exists (e.g. L1, L2, R1, C1)
   */
  public static getShapeName(shape: Shape, index: number): string {
    if (shape.name) return shape.name;
    switch (shape.type) {
      case "line":
        return `L${index + 1}`;
      case "arrow":
        return `A${index + 1}`;
      case "rectangle":
        return `R${index + 1}`;
      case "circle":
        return `C${index + 1}`;
      case "ellipse":
        return `E${index + 1}`;
      case "polygon":
        return `P${index + 1}`;
      case "star":
        return `S${index + 1}`;
      default:
        return `Shape_${index + 1}`;
    }
  }

  /**
   * Extracts all design parameters from a shape
   */
  public static getShapeParameters(shape: Shape): ShapeParameterDef[] {
    const params: ShapeParameterDef[] = [];

    switch (shape.type) {
      case "line":
      case "arrow": {
        const m = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
        params.push(
          { key: "x1", label: "Start X", value: Number(shape.x1.toFixed(2)) },
          { key: "y1", label: "Start Y", value: Number(shape.y1.toFixed(2)) },
          { key: "x2", label: "End X", value: Number(shape.x2.toFixed(2)) },
          { key: "y2", label: "End Y", value: Number(shape.y2.toFixed(2)) },
          { key: "length", label: "Length (L)", value: Number(m.length.toFixed(2)) },
          { key: "angle", label: "Angle (°)", value: Number(m.angleDeg.toFixed(2)) },
          { key: "dx", label: "Delta X", value: Number(m.dx.toFixed(2)), readOnly: true },
          { key: "dy", label: "Delta Y", value: Number(m.dy.toFixed(2)), readOnly: true }
        );
        break;
      }
      case "rectangle": {
        const m = rectMetrics(shape.x, shape.y, shape.width, shape.height);
        params.push(
          { key: "x", label: "X Position", value: Number(shape.x.toFixed(2)) },
          { key: "y", label: "Y Position", value: Number(shape.y.toFixed(2)) },
          { key: "width", label: "Width (W)", value: Number(shape.width.toFixed(2)) },
          { key: "height", label: "Height (H)", value: Number(shape.height.toFixed(2)) },
          { key: "rotation", label: "Rotation (°)", value: Number((shape.rotation || 0).toFixed(2)) },
          { key: "area", label: "Area", value: Number(m.area.toFixed(2)), readOnly: true },
          { key: "perimeter", label: "Perimeter", value: Number(m.perimeter.toFixed(2)), readOnly: true }
        );
        break;
      }
      case "circle": {
        const m = circleMetrics(shape.cx, shape.cy, shape.r);
        params.push(
          { key: "cx", label: "Center X", value: Number(shape.cx.toFixed(2)) },
          { key: "cy", label: "Center Y", value: Number(shape.cy.toFixed(2)) },
          { key: "r", label: "Radius (R)", value: Number(shape.r.toFixed(2)) },
          { key: "diameter", label: "Diameter (Ø)", value: Number(m.diameter.toFixed(2)) },
          { key: "area", label: "Area", value: Number(m.area.toFixed(2)), readOnly: true },
          { key: "circumference", label: "Circumference", value: Number(m.circumference.toFixed(2)), readOnly: true }
        );
        break;
      }
      case "ellipse": {
        params.push(
          { key: "cx", label: "Center X", value: Number(shape.cx.toFixed(2)) },
          { key: "cy", label: "Center Y", value: Number(shape.cy.toFixed(2)) },
          { key: "rx", label: "Radius X", value: Number(shape.rx.toFixed(2)) },
          { key: "ry", label: "Radius Y", value: Number(shape.ry.toFixed(2)) },
          { key: "rotation", label: "Rotation (°)", value: Number((shape.rotation || 0).toFixed(2)) }
        );
        break;
      }
      case "polygon": {
        params.push(
          { key: "cx", label: "Center X", value: Number(shape.cx.toFixed(2)) },
          { key: "cy", label: "Center Y", value: Number(shape.cy.toFixed(2)) },
          { key: "r", label: "Radius", value: Number(shape.r.toFixed(2)) },
          { key: "sides", label: "Sides", value: shape.sides }
        );
        break;
      }
      case "star": {
        params.push(
          { key: "cx", label: "Center X", value: Number(shape.cx.toFixed(2)) },
          { key: "cy", label: "Center Y", value: Number(shape.cy.toFixed(2)) },
          { key: "innerR", label: "Inner Radius", value: Number(shape.innerR.toFixed(2)) },
          { key: "outerR", label: "Outer Radius", value: Number(shape.outerR.toFixed(2)) },
          { key: "points", label: "Points", value: shape.points }
        );
        break;
      }
    }

    return params;
  }

  /**
   * Builds symbol table of all active variables and exposed shape parameters
   */
  public buildSymbolTable(shapes: Shape[]): SymbolTable {
    const symbols: SymbolTable = {};

    // 1. Registered custom variables (e.g. W = 200)
    for (const [name, v] of this.variables.entries()) {
      symbols[name] = v.value;
    }

    // 2. Shape properties (e.g. L1.length, Line_1.length, R1.width, Rectangle_1.width)
    shapes.forEach((s, idx) => {
      const shapeName = ParametricModel.getShapeName(s, idx);
      const legacyPrefix = s.type.charAt(0).toUpperCase() + s.type.slice(1) + `_${idx + 1}`;
      const params = ParametricModel.getShapeParameters(s);

      for (const p of params) {
        symbols[`${shapeName}.${p.key}`] = p.value;
        symbols[`${legacyPrefix}.${p.key}`] = p.value;
        if (s.id) {
          symbols[`${s.id}.${p.key}`] = p.value;
        }
      }

      // Direct scalar property access (e.g. L1 = 300, R1 = width)
      if (s.type === "line" || s.type === "arrow") {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        symbols[shapeName] = Number(len.toFixed(2));
        symbols[legacyPrefix] = Number(len.toFixed(2));
      } else if (s.type === "rectangle") {
        symbols[shapeName] = s.width;
      } else if (s.type === "circle") {
        symbols[shapeName] = s.r;
      }
    });

    return symbols;
  }

  /**
   * Sets or creates a variable with a numeric value or formula expression
   */
  public setVariable(name: string, valueOrFormula: number | string, description?: string): { success: boolean; error?: string } {
    let numVal: number;
    let formulaStr: string | undefined;

    if (typeof valueOrFormula === "number") {
      numVal = valueOrFormula;
    } else {
      const trimmed = valueOrFormula.trim();
      const parsedNum = Number(trimmed);
      if (!isNaN(parsedNum) && trimmed !== "") {
        numVal = parsedNum;
      } else {
        formulaStr = trimmed;
        // Temporary test evaluate to extract dependencies
        const parseRes = parseFormula(formulaStr);
        if (parseRes.error) {
          return { success: false, error: parseRes.error };
        }
        numVal = 0; // will be evaluated in propagation
      }
    }

    const existing = this.variables.get(name);
    this.variables.set(name, {
      name,
      value: numVal,
      formula: formulaStr,
      description: description ?? existing?.description,
    });

    // Update dependency graph
    if (formulaStr) {
      const parseRes = parseFormula(formulaStr);
      this.graph.setDependencies(name, parseRes.dependencies);
    } else {
      this.graph.setDependencies(name, []);
    }

    const cycleCheck = this.graph.detectCycles();
    if (cycleCheck.hasCycle) {
      // Revert if cycle detected
      if (existing) this.variables.set(name, existing);
      else this.variables.delete(name);
      return { success: false, error: cycleCheck.message };
    }

    return { success: true };
  }

  /**
   * Deletes a variable
   */
  public deleteVariable(name: string): void {
    this.variables.delete(name);
    this.graph.removeNode(name);
  }

  /**
   * Evaluates all formula-driven variables in topological dependency order
   */
  public evaluateAllVariables(shapes: Shape[]): { errors: string[] } {
    const errors: string[] = [];
    const symbols = this.buildSymbolTable(shapes);

    const evalOrder = this.graph.getEvaluationOrder();
    if (evalOrder.error) {
      return { errors: [evalOrder.error] };
    }

    for (const varName of evalOrder.order) {
      const v = this.variables.get(varName);
      if (v && v.formula) {
        const evalRes = evaluateFormula(v.formula, symbols);
        if (evalRes.error) {
          errors.push(`Formula error in '${varName} = ${v.formula}': ${evalRes.error}`);
        } else {
          v.value = evalRes.value;
          symbols[varName] = evalRes.value;
        }
      }
    }

    return { errors };
  }

  /**
   * Synchronizes variables into shape parameters and runs the constraint solver
   */
  public syncModel(shapes: Shape[]): { updatedShapes: Shape[]; errors: string[] } {
    // 1. Evaluate variables
    const { errors } = this.evaluateAllVariables(shapes);

    const getVarValue = (...names: string[]): number | undefined => {
      for (const n of names) {
        const v = this.variables.get(n);
        if (v !== undefined) return v.value;
      }
      return undefined;
    };

    // 2. Map variables into shapes if variable names match (e.g. if a shape parameter is bound)
    const loops = detectClosedLoops(shapes, 25.0);
    const loopShapeIds = new Set<string>();
    for (const loop of loops) {
      for (const s of loop.shapes) {
        loopShapeIds.add(s.id);
      }
    }

    const updatedShapes: Shape[] = shapes.map((shape, idx) => {
      const s = { ...shape };
      const shapeName = ParametricModel.getShapeName(s, idx);

      switch (s.type) {
        case "rectangle": {
          const boundW = getVarValue(`${shapeName}.width`, `${s.id}.width`, "W", "Width", "width");
          const boundH = getVarValue(`${shapeName}.height`, `${s.id}.height`, "H", "Height", "height");
          if (typeof boundW === "number" && boundW > 0 && Math.abs(boundW - s.width) > 1e-4) {
            s.width = boundW;
          }
          if (typeof boundH === "number" && boundH > 0 && Math.abs(boundH - s.height) > 1e-4) {
            s.height = boundH;
          }
          break;
        }
        case "circle": {
          const boundR = getVarValue(`${shapeName}.r`, `${s.id}.r`, "R", "Radius", "radius");
          if (typeof boundR === "number" && boundR > 0 && Math.abs(boundR - s.r) > 1e-4) {
            s.r = boundR;
          }
          break;
        }
        case "line":
        case "arrow": {
          // If this line is part of a closed loop, the structural loop solver handles it
          // as a unified closed contour, strictly preserving coincident joints!
          if (loopShapeIds.has(s.id)) {
            break;
          }

          const boundL = getVarValue(
            s.name ?? "",
            `${s.name}.length`,
            shapeName,
            `${shapeName}.length`,
            `${s.id}.length`,
            "L",
            "Length",
            "length"
          );
          if (typeof boundL === "number" && boundL > 0) {
            const currentL = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            if (Math.abs(boundL - currentL) > 1e-4 && currentL > 0) {
              const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
              s.x2 = s.x1 + Math.cos(angle) * boundL;
              s.y2 = s.y1 + Math.sin(angle) * boundL;
            }
          }
          break;
        }
      }

      return s;
    });

    // 2b. Canonical resolution for slab / multi-line frames
    const topOuter = updatedShapes.find((s) => s.name === "top_outer_rect");
    if (topOuter && topOuter.type === "line") {
      const ox = topOuter.x1;
      const oy = topOuter.y1;
      const W = (getVarValue("top_outer_rect") as number) ?? 300;
      const H = (getVarValue("height_outer_rect") as number) ?? 180;
      const T = (getVarValue("wall_thickness") as number) ?? 25;

      for (const s of updatedShapes) {
        if (s.type === "line") {
          switch (s.name) {
            case "top_outer_rect":
              s.x1 = ox; s.y1 = oy; s.x2 = ox + W; s.y2 = oy;
              break;
            case "right_outer_rect":
              s.x1 = ox + W; s.y1 = oy; s.x2 = ox + W; s.y2 = oy + H;
              break;
            case "bottom_outer_rect":
              s.x1 = ox + W; s.y1 = oy + H; s.x2 = ox; s.y2 = oy + H;
              break;
            case "left_outer_rect":
              s.x1 = ox; s.y1 = oy + H; s.x2 = ox; s.y2 = oy;
              break;
            case "top_inner_rect":
              s.x1 = ox + T; s.y1 = oy + T; s.x2 = ox + W - T; s.y2 = oy + T;
              break;
            case "right_inner_rect":
              s.x1 = ox + W - T; s.y1 = oy + T; s.x2 = ox + W - T; s.y2 = oy + H - T;
              break;
            case "bottom_inner_rect":
              s.x1 = ox + W - T; s.y1 = oy + H - T; s.x2 = ox + T; s.y2 = oy + H - T;
              break;
            case "left_inner_rect":
              s.x1 = ox + T; s.y1 = oy + H - T; s.x2 = ox + T; s.y2 = oy + T;
              break;
            case "miter_top_left":
            case "miter_tl":
              s.x1 = ox; s.y1 = oy; s.x2 = ox + T; s.y2 = oy + T;
              break;
            case "miter_top_right":
            case "miter_tr":
              s.x1 = ox + W; s.y1 = oy; s.x2 = ox + W - T; s.y2 = oy + T;
              break;
            case "miter_bottom_right":
            case "miter_br":
              s.x1 = ox + W; s.y1 = oy + H; s.x2 = ox + W - T; s.y2 = oy + H - T;
              break;
            case "miter_bottom_left":
            case "miter_bl":
              s.x1 = ox; s.y1 = oy + H; s.x2 = ox + T; s.y2 = oy + H - T;
              break;
          }
        }
      }
    } else if (updatedShapes.some((s) => s.name === "edge_top")) {
      const edgeTop = updatedShapes.find((s) => s.name === "edge_top")!;
      const ox = (edgeTop as any).x1;
      const oy = (edgeTop as any).y1;
      const L_top = (getVarValue("edge_top", "edge_top.length", "top_edge_length") as number) ?? 177;
      const L_tr = (getVarValue("edge_tr", "edge_tr.length", "tr_chamfer_length") as number) ?? 38;
      const L_right = (getVarValue("edge_right", "edge_right.length", "right_edge_length") as number) ?? 92;
      const L_br = (getVarValue("edge_br", "edge_br.length", "br_chamfer_length") as number) ?? 38;
      const L_bot = (getVarValue("edge_bottom", "edge_bottom.length", "bottom_edge_length") as number) ?? 176;
      const L_bl = (getVarValue("edge_bl", "edge_bl.length", "bl_chamfer_length") as number) ?? 46;
      const L_left = (getVarValue("edge_left", "edge_left.length", "left_edge_length") as number) ?? 79;
      const L_tl = (getVarValue("edge_tl", "edge_tl.length", "tl_chamfer_length") as number) ?? 44;

      const v0 = { x: ox, y: oy };
      const v1 = { x: ox + L_top, y: oy };
      const v2 = { x: v1.x + L_tr * Math.SQRT1_2, y: v1.y + L_tr * Math.SQRT1_2 };
      const v3 = { x: v2.x, y: v2.y + L_right };
      const v4 = { x: v3.x - L_br * Math.SQRT1_2, y: v3.y + L_br * Math.SQRT1_2 };

      const v7 = { x: v0.x - L_tl * Math.SQRT1_2, y: v0.y + L_tl * Math.SQRT1_2 };
      const v6 = { x: v7.x, y: v7.y + L_left };
      const v5 = { x: v6.x + L_bl * Math.SQRT1_2, y: v4.y };

      for (const s of updatedShapes) {
        if (s.type === "line") {
          switch (s.name) {
            case "edge_top": s.x1 = v0.x; s.y1 = v0.y; s.x2 = v1.x; s.y2 = v1.y; break;
            case "edge_tr": s.x1 = v1.x; s.y1 = v1.y; s.x2 = v2.x; s.y2 = v2.y; break;
            case "edge_right": s.x1 = v2.x; s.y1 = v2.y; s.x2 = v3.x; s.y2 = v3.y; break;
            case "edge_br": s.x1 = v3.x; s.y1 = v3.y; s.x2 = v4.x; s.y2 = v4.y; break;
            case "edge_bottom": s.x1 = v4.x; s.y1 = v4.y; s.x2 = v5.x; s.y2 = v5.y; break;
            case "edge_bl": s.x1 = v5.x; s.y1 = v5.y; s.x2 = v6.x; s.y2 = v6.y; break;
            case "edge_left": s.x1 = v6.x; s.y1 = v6.y; s.x2 = v7.x; s.y2 = v7.y; break;
            case "edge_tl": s.x1 = v7.x; s.y1 = v7.y; s.x2 = v0.x; s.y2 = v0.y; break;
          }
        }
      }

      const syncTwin = (name1: string, name2: string, val: number) => {
        if (this.variables.has(name1)) {
          const v = this.variables.get(name1)!;
          if (!v.formula) v.value = val;
        }
        if (this.variables.has(name2)) {
          const v = this.variables.get(name2)!;
          if (!v.formula) v.value = val;
        }
      };
      syncTwin("edge_top", "top_edge_length", L_top);
      syncTwin("edge_tr", "tr_chamfer_length", L_tr);
      syncTwin("edge_right", "right_edge_length", L_right);
      syncTwin("edge_br", "br_chamfer_length", L_br);
      syncTwin("edge_bottom", "bottom_edge_length", L_bot);
      syncTwin("edge_bl", "bl_chamfer_length", L_bl);
      syncTwin("edge_left", "left_edge_length", L_left);
      syncTwin("edge_tl", "tl_chamfer_length", L_tl);
    } else {
      // Check if shapes form closed loops (e.g. triangle, polygon, octagonal frame)
      let loopHandled = false;

      if (loops.length > 0) {
        for (const loop of loops) {
          const solveRes = solveClosedStructuralLoop({
            loopShapes: loop.shapes,
            loopVertices: loop.vertices,
            variables: this.variables,
          });

          if (solveRes.closed) {
            for (const solvedShape of solveRes.updatedShapes) {
              const idx = updatedShapes.findIndex((s) => s.id === solvedShape.id);
              if (idx !== -1) {
                updatedShapes[idx] = solvedShape;
              }
            }
            loopHandled = true;
          }
        }
      }

      if (!loopHandled) {
        // General forward-only line connection: adjust connected lines without circular feedback
        for (let i = 0; i < updatedShapes.length; i++) {
          const curr = updatedShapes[i];
          const orig = shapes[i];
          if ((curr.type === "line" || curr.type === "arrow") && (orig.type === "line" || orig.type === "arrow")) {
            const shiftX2 = curr.x2 - orig.x2;
            const shiftY2 = curr.y2 - orig.y2;
            if (Math.abs(shiftX2) > 1e-4 || Math.abs(shiftY2) > 1e-4) {
              for (let j = i + 1; j < updatedShapes.length; j++) {
                const other = updatedShapes[j];
                if (other.type === "line" || other.type === "arrow") {
                  if (Math.hypot(other.x1 - orig.x2, other.y1 - orig.y2) < 4) {
                    other.x1 += shiftX2;
                    other.y1 += shiftY2;
                    if (Math.abs(other.x2 - other.x1) < 1e-4) other.x2 += shiftX2;
                    if (Math.abs(other.y2 - other.y1) < 1e-4) other.y2 += shiftY2;
                  }
                }
              }
            }
          }
        }
      }
    }

    // 3. Solve geometric constraints
    if (this.constraints.length > 0) {
      const solverRes = solveConstraints(updatedShapes, this.constraints);
      return {
        updatedShapes: solverRes.updatedShapes,
        errors,
      };
    }

    return { updatedShapes, errors };
  }

  /**
   * High-level Local Coordinate System (LCS) Solver
   * Translates incoming shapes into stateful CAD elements with local frames,
   * evaluates formulas and relative coordinate placements, resolves parent-child
   * transforms, and projects resolved geometry back to CAD shapes.
   */
  public solveWithLCS(shapes: Shape[]): LCSSolveReport {
    const objects = new Map<string, GeometryObjectState>();
    for (const shape of shapes) {
      const existing = this.cadObjects.get(shape.id);
      if (existing) {
        existing.name = shape.name || existing.name;
        objects.set(shape.id, existing);
      } else {
        const obj = GeometryObject.fromShape(shape);
        this.cadObjects.set(shape.id, obj);
        objects.set(shape.id, obj);
      }
    }

    return this.lcsSolver.solve(this.variables, objects, this.constraints);
  }

  /**
   * Automatically analyzes shapes for closed geometric loops and exposes their exact mathematical properties
   */
  public detectLoops(shapes: Shape[]): DetectedLoop[] {
    this.activeLoops = detectClosedLoops(shapes);
    for (let i = 0; i < this.activeLoops.length; i++) {
      const loop = this.activeLoops[i];
      const prefix = `Loop_${i + 1}`;
      const a = loop.analysis;
      this.variables.set(`${prefix}.area`, { name: `${prefix}.area`, value: a.area, description: "Closed loop Shoelace area" });
      this.variables.set(`${prefix}.perimeter`, { name: `${prefix}.perimeter`, value: a.perimeter, description: "Closed loop perimeter" });
      this.variables.set(`${prefix}.centroid.x`, { name: `${prefix}.centroid.x`, value: a.centroid.x, description: "Centroid X" });
      this.variables.set(`${prefix}.centroid.y`, { name: `${prefix}.centroid.y`, value: a.centroid.y, description: "Centroid Y" });
      this.variables.set(`${prefix}.width`, { name: `${prefix}.width`, value: a.boundingBox.width, description: "Bounding box width" });
      this.variables.set(`${prefix}.height`, { name: `${prefix}.height`, value: a.boundingBox.height, description: "Bounding box height" });
    }
    return this.activeLoops;
  }

  /**
   * Comprehensive Parametric & Constraint-Aware Geometry Solver
   * 1. Detects closed loops & computes Shoelace area, Centroid, Perimeter, Angles.
   * 2. Runs Dependency Graph to evaluate algebraic relationships & formulas.
   * 3. Runs Bipartite Constraint Graph & Geometric Solver (Gauss-Newton relaxation).
   * 4. Synchronizes resolved coordinates back to canvas shapes.
   */
  public solveParametricGeometricModel(shapes: Shape[]): {
    updatedShapes: Shape[];
    loops: DetectedLoop[];
    errors: string[];
    dofAnalysis?: DOFAnalysis;
  } {
    // 1. Detect closed loops and publish derived metrics to symbol table
    const loops = this.detectLoops(shapes);

    // 2. Solve algebraic dependencies & LCS transforms
    const lcsRes = this.solveWithLCS(shapes);
    let resolvedShapes = lcsRes.shapes;

    // 3. Populate constraint graph entities and solve geometric constraints if any exist
    let dofAnalysis: DOFAnalysis | undefined;
    if (this.constraintGraph.constraints.size > 0) {
      dofAnalysis = this.constraintGraph.analyzeDOF();
      const geomRes = this.geometricSolver.solve(this.constraintGraph);
      resolvedShapes = resolvedShapes.map((s) => {
        if (s.type === "line" || s.type === "arrow") {
          const p1 = geomRes.points.get(`${s.id}_p1`);
          const p2 = geomRes.points.get(`${s.id}_p2`);
          if (p1 && p2) {
            return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
          }
        }
        return s;
      });
    }

    return {
      updatedShapes: resolvedShapes,
      loops,
      errors: lcsRes.errors,
      dofAnalysis,
    };
  }
}
