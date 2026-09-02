/**
 * Parametric Model & Symbol Manager
 * Manages variables, shape parameter bindings, formula evaluation, and bidirectional synchronization.
 */

import { Shape } from "../geometry/types";
import { lineMetrics, rectMetrics, circleMetrics, getShapeCenter } from "../geometry/metrics";
import { DependencyGraph } from "./dependencyGraph";
import { parseFormula, evaluateFormula, SymbolTable } from "./expression";
import { GeometricConstraint, solveConstraints, SolverResult } from "./constraints";

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

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.variables.clear();
    this.graph.clear();
    this.constraints = [];
  }

  /**
   * Generates canonical shape name if none exists (e.g. Rectangle_1)
   */
  public static getShapeName(shape: Shape, index: number): string {
    if (shape.name) return shape.name;
    const prefix = shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
    return `${prefix}_${index + 1}`;
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

    // 2. Shape properties (e.g. Rectangle_1.width, Line_1.length, r1.width)
    shapes.forEach((s, idx) => {
      const shapeName = ParametricModel.getShapeName(s, idx);
      const params = ParametricModel.getShapeParameters(s);

      for (const p of params) {
        symbols[`${shapeName}.${p.key}`] = p.value;
        if (s.id) {
          symbols[`${s.id}.${p.key}`] = p.value;
        }
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
          }
        }
      }
    } else {
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
}
