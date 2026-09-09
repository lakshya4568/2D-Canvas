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
import { solveConnectedGeometry } from "./connectedComponentSolver";
import {
  createSingleCellCulvertModel,
  solveSingleCellCulvertSpan,
  createTwoSpanCulvertModel,
  solveTwoSpanCulvertBay1,
} from "../state/index";
import { BipartiteConstraintGraph } from "./graph/bipartiteGraph";
import { extractConnectedSubgraphsBFS, ConnectedSubgraph } from "./graph/bfsPartition";

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

    // 1. Default shape properties from drawn canvas geometry (fallback)
    shapes.forEach((s, idx) => {
      const shapeName = ParametricModel.getShapeName(s, idx);
      const legacyPrefix = s.type.charAt(0).toUpperCase() + s.type.slice(1) + `_${idx + 1}`;
      const params = ParametricModel.getShapeParameters(s);

      const cleanName = s.name ? s.name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") : "";
      for (const p of params) {
        const capitalizedKey = p.key.charAt(0).toUpperCase() + p.key.slice(1);
        symbols[`${shapeName}.${p.key}`] = p.value;
        symbols[`${shapeName}.${capitalizedKey}`] = p.value;
        symbols[`${shapeName}_${p.key}`] = p.value;
        symbols[`${shapeName}_${capitalizedKey}`] = p.value;

        symbols[`${legacyPrefix}.${p.key}`] = p.value;
        symbols[`${legacyPrefix}.${capitalizedKey}`] = p.value;
        symbols[`${legacyPrefix}_${p.key}`] = p.value;
        symbols[`${legacyPrefix}_${capitalizedKey}`] = p.value;

        if (s.name) {
          symbols[`${s.name}.${p.key}`] = p.value;
          symbols[`${s.name}.${capitalizedKey}`] = p.value;
          symbols[`${s.name}_${p.key}`] = p.value;
          symbols[`${s.name}_${capitalizedKey}`] = p.value;
        }
        if (cleanName) {
          symbols[`${cleanName}.${p.key}`] = p.value;
          symbols[`${cleanName}.${capitalizedKey}`] = p.value;
          symbols[`${cleanName}_${p.key}`] = p.value;
          symbols[`${cleanName}_${capitalizedKey}`] = p.value;
        }
        if (s.id) {
          symbols[`${s.id}.${p.key}`] = p.value;
          symbols[`${s.id}.${capitalizedKey}`] = p.value;
          symbols[`${s.id}_${p.key}`] = p.value;
          symbols[`${s.id}_${capitalizedKey}`] = p.value;
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

    // 2. Explicit registered custom variables and calculated formulas (OVERRIDE shape defaults)
    for (const [name, v] of this.variables.entries()) {
      symbols[name] = v.value;

      // Populate common dot/underscore and case aliases so formula expressions resolve cleanly
      const match = name.match(/^([a-zA-Z0-9]+)[._]([a-zA-Z0-9]+)$/);
      if (match) {
        const prefix = match[1];
        const prop = match[2];
        const capProp = prop.charAt(0).toUpperCase() + prop.slice(1).toLowerCase();
        const lowProp = prop.toLowerCase();
        symbols[`${prefix}.${lowProp}`] = v.value;
        symbols[`${prefix}.${capProp}`] = v.value;
        symbols[`${prefix}_${lowProp}`] = v.value;
        symbols[`${prefix}_${capProp}`] = v.value;
      }
    }

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
        if (!n) continue;
        const v = this.variables.get(n);
        if (v !== undefined) return v.value;
      }
      // Case-insensitive & dot/underscore normalized fallback
      const varEntries = Array.from(this.variables.entries());
      for (const n of names) {
        if (!n) continue;
        const normN = n.replace(/[._]/g, "").toLowerCase();
        const found = varEntries.find(([k]) => k.replace(/[._]/g, "").toLowerCase() === normN);
        if (found) return found[1].value;
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

    // Helper: determine if a line has connected neighbors (i.e. is part of a multi-line figure)
    const isLineConnectedToOthers = (line: Shape): boolean => {
      const l = line as any;
      for (const other of shapes) {
        if (other.id === line.id) continue;
        if (other.type !== "line" && other.type !== "arrow") continue;
        const o = other as any;
        const d11 = Math.hypot(l.x1 - o.x1, l.y1 - o.y1);
        const d12 = Math.hypot(l.x1 - o.x2, l.y1 - o.y2);
        const d21 = Math.hypot(l.x2 - o.x1, l.y2 - o.y1);
        const d22 = Math.hypot(l.x2 - o.x2, l.y2 - o.y2);
        if (Math.min(d11, d12, d21, d22) <= 15.0) return true;
      }
      return false;
    };

    const updatedShapes: Shape[] = shapes.map((shape, idx) => {
      const s = { ...shape };
      const shapeName = ParametricModel.getShapeName(s, idx);

      switch (s.type) {
        case "rectangle": {
          const cleanName = s.name ? s.name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") : "";
          const boundW = getVarValue(
            `${shapeName}.width`, `${shapeName}_width`, `${shapeName}_Width`,
            s.name ? `${s.name}.width` : "", s.name ? `${s.name}_width` : "", s.name ? `${s.name}_Width` : "",
            cleanName ? `${cleanName}.width` : "", cleanName ? `${cleanName}_width` : "", cleanName ? `${cleanName}_Width` : "",
            `${s.id}.width`, `${s.id}_width`, `${s.id}_Width`,
            "W", "Width", "width"
          );
          const boundH = getVarValue(
            `${shapeName}.height`, `${shapeName}_height`, `${shapeName}_Height`,
            s.name ? `${s.name}.height` : "", s.name ? `${s.name}_height` : "", s.name ? `${s.name}_Height` : "",
            cleanName ? `${cleanName}.height` : "", cleanName ? `${cleanName}_height` : "", cleanName ? `${cleanName}_Height` : "",
            `${s.id}.height`, `${s.id}_height`, `${s.id}_Height`,
            "H", "Height", "height"
          );
          const boundX = getVarValue(
            `${shapeName}.x`, `${shapeName}_x`, `${shapeName}_X`,
            s.name ? `${s.name}.x` : "", s.name ? `${s.name}_x` : "", s.name ? `${s.name}_X` : "",
            cleanName ? `${cleanName}.x` : "", cleanName ? `${cleanName}_x` : "", cleanName ? `${cleanName}_X` : "",
            `${s.id}.x`, `${s.id}_x`, `${s.id}_X`
          );
          const boundY = getVarValue(
            `${shapeName}.y`, `${shapeName}_y`, `${shapeName}_Y`,
            s.name ? `${s.name}.y` : "", s.name ? `${s.name}_y` : "", s.name ? `${s.name}_Y` : "",
            cleanName ? `${cleanName}.y` : "", cleanName ? `${cleanName}_y` : "", cleanName ? `${cleanName}_Y` : "",
            `${s.id}.y`, `${s.id}_y`, `${s.id}_Y`
          );

          if (typeof boundW === "number" && boundW > 0 && Math.abs(boundW - s.width) > 1e-4) {
            s.width = boundW;
          }
          if (typeof boundH === "number" && boundH > 0 && Math.abs(boundH - s.height) > 1e-4) {
            s.height = boundH;
          }
          if (typeof boundX === "number" && Math.abs(boundX - s.x) > 1e-4) {
            s.x = boundX;
          }
          if (typeof boundY === "number" && Math.abs(boundY - s.y) > 1e-4) {
            s.y = boundY;
          }
          break;
        }
        case "circle": {
          const cleanName = s.name ? s.name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") : "";
          const boundR = getVarValue(
            `${shapeName}.r`, `${shapeName}_r`, `${shapeName}_Radius`, `${shapeName}_radius`,
            s.name ? `${s.name}.r` : "", s.name ? `${s.name}_r` : "", s.name ? `${s.name}_Radius` : "",
            cleanName ? `${cleanName}.r` : "", cleanName ? `${cleanName}_r` : "", cleanName ? `${cleanName}_Radius` : "",
            `${s.id}.r`, `${s.id}_r`, `${s.id}_Radius`,
            "R", "Radius", "radius"
          );
          const boundCX = getVarValue(
            `${shapeName}.cx`, `${shapeName}_cx`, `${shapeName}_X`, `${shapeName}_x`,
            s.name ? `${s.name}.cx` : "", s.name ? `${s.name}_cx` : "", s.name ? `${s.name}_X` : "",
            cleanName ? `${cleanName}.cx` : "", cleanName ? `${cleanName}_cx` : "", cleanName ? `${cleanName}_X` : "",
            `${s.id}.cx`, `${s.id}_cx`, `${s.id}_X`
          );
          const boundCY = getVarValue(
            `${shapeName}.cy`, `${shapeName}_cy`, `${shapeName}_Y`, `${shapeName}_y`,
            s.name ? `${s.name}.cy` : "", s.name ? `${s.name}_cy` : "", s.name ? `${s.name}_Y` : "",
            cleanName ? `${cleanName}.cy` : "", cleanName ? `${cleanName}_cy` : "", cleanName ? `${cleanName}_Y` : "",
            `${s.id}.cy`, `${s.id}_cy`, `${s.id}_Y`
          );
          if (typeof boundR === "number" && boundR > 0 && Math.abs(boundR - s.r) > 1e-4) {
            s.r = boundR;
          }
          if (typeof boundCX === "number" && Math.abs(boundCX - s.cx) > 1e-4) {
            s.cx = boundCX;
          }
          if (typeof boundCY === "number" && Math.abs(boundCY - s.cy) > 1e-4) {
            s.cy = boundCY;
          }
          break;
        }
        case "line":
        case "arrow": {
          // If this line is part of a closed loop or connected figure, the connected geometry
          // solver handles it as a unified assembly, strictly preserving coincident joints!
          if (loopShapeIds.has(s.id) || isLineConnectedToOthers(s)) {
            break;
          }

          const boundL = getVarValue(
            s.name ?? "",
            `${s.name}.length`,
            `${s.name}_length`,
            `${s.name}_Length`,
            shapeName,
            `${shapeName}.length`,
            `${shapeName}_length`,
            `${shapeName}_Length`,
            `${s.id}.length`,
            `${s.id}_length`,
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

    const culvertOuter = updatedShapes.find((s) => s.id === "culvert_outer" || s.name === "culvert_outer");
    if (culvertOuter && culvertOuter.type === "rectangle") {
      const ox = culvertOuter.x;
      const oy = culvertOuter.y;
      const targetSpan = (getVarValue("clear_span", "Span", "span") as number) ?? 300;
      const clearH = (getVarValue("clear_height", "Height", "height") as number) ?? 200;
      const wallT = (getVarValue("wall_thickness") as number) ?? 30;
      const haunchL = (getVarValue("haunch_leg") as number) ?? 35;

      const culvert = createSingleCellCulvertModel({
        clearSpan: 300,
        clearHeight: clearH,
        wallThickness: wallT,
        haunchLeg: haunchL,
      });

      const solved = solveSingleCellCulvertSpan(culvert, targetSpan);
      if (solved.converged) {
        culvertOuter.width = solved.outerWidth;
        culvertOuter.height = solved.outerHeight;

        const innerPts = solved.innerLoop;
        for (const s of updatedShapes) {
          if (s.type === "line") {
            switch (s.id) {
              case "culvert_inner_top":
                s.x1 = ox + innerPts[0].x; s.y1 = oy + innerPts[0].y;
                s.x2 = ox + innerPts[1].x; s.y2 = oy + innerPts[1].y;
                break;
              case "culvert_haunch_tr":
                s.x1 = ox + innerPts[1].x; s.y1 = oy + innerPts[1].y;
                s.x2 = ox + innerPts[2].x; s.y2 = oy + innerPts[2].y;
                break;
              case "culvert_inner_right":
                s.x1 = ox + innerPts[2].x; s.y1 = oy + innerPts[2].y;
                s.x2 = ox + innerPts[3].x; s.y2 = oy + innerPts[3].y;
                break;
              case "culvert_haunch_br":
                s.x1 = ox + innerPts[3].x; s.y1 = oy + innerPts[3].y;
                s.x2 = ox + innerPts[4].x; s.y2 = oy + innerPts[4].y;
                break;
              case "culvert_inner_bottom":
                s.x1 = ox + innerPts[4].x; s.y1 = oy + innerPts[4].y;
                s.x2 = ox + innerPts[5].x; s.y2 = oy + innerPts[5].y;
                break;
              case "culvert_haunch_bl":
                s.x1 = ox + innerPts[5].x; s.y1 = oy + innerPts[5].y;
                s.x2 = ox + innerPts[6].x; s.y2 = oy + innerPts[6].y;
                break;
              case "culvert_inner_left":
                s.x1 = ox + innerPts[6].x; s.y1 = oy + innerPts[6].y;
                s.x2 = ox + innerPts[7].x; s.y2 = oy + innerPts[7].y;
                break;
              case "culvert_haunch_tl":
                s.x1 = ox + innerPts[7].x; s.y1 = oy + innerPts[7].y;
                s.x2 = ox + innerPts[0].x; s.y2 = oy + innerPts[0].y;
                break;
            }
          }
        }
      }
    } else if (updatedShapes.some((s) => s.id === "two_span_outer" || s.name === "outer_frame")) {
      const twoSpanOuter = updatedShapes.find((s) => s.id === "two_span_outer" || s.name === "outer_frame");
      if (twoSpanOuter && twoSpanOuter.type === "rectangle") {
        const ox = twoSpanOuter.x;
        const oy = twoSpanOuter.y;
        const b1Span = (getVarValue("bay1_span") as number) ?? 250;
        const b2Span = (getVarValue("bay2_span") as number) ?? 250;
        const clearH = (getVarValue("clear_height") as number) ?? 200;
        const extW = (getVarValue("ext_wall") as number) ?? 30;
        const midW = (getVarValue("mid_wall") as number) ?? 40;
        const haunchL = (getVarValue("haunch_leg") as number) ?? 35;

        const culvert = createTwoSpanCulvertModel({
          bay1Span: 250,
          bay2Span: b2Span,
          clearHeight: clearH,
          extWallThickness: extW,
          midWallThickness: midW,
          haunchLeg: haunchL,
        });

        const solved = solveTwoSpanCulvertBay1(culvert, b1Span);
        if (solved.converged) {
          twoSpanOuter.width = solved.totalWidth;
          twoSpanOuter.height = solved.totalHeight;

          const b1Pts = solved.bay1Loop;
          const b2Pts = solved.bay2Loop;

          for (const s of updatedShapes) {
            if (s.type === "line") {
              switch (s.id) {
                case "b1_top":
                  s.x1 = ox + b1Pts[0].x; s.y1 = oy + b1Pts[0].y;
                  s.x2 = ox + b1Pts[1].x; s.y2 = oy + b1Pts[1].y;
                  break;
                case "b1_haunch_tr":
                  s.x1 = ox + b1Pts[1].x; s.y1 = oy + b1Pts[1].y;
                  s.x2 = ox + b1Pts[2].x; s.y2 = oy + b1Pts[2].y;
                  break;
                case "b1_right":
                  s.x1 = ox + b1Pts[2].x; s.y1 = oy + b1Pts[2].y;
                  s.x2 = ox + b1Pts[3].x; s.y2 = oy + b1Pts[3].y;
                  break;
                case "b1_haunch_br":
                  s.x1 = ox + b1Pts[3].x; s.y1 = oy + b1Pts[3].y;
                  s.x2 = ox + b1Pts[4].x; s.y2 = oy + b1Pts[4].y;
                  break;
                case "b1_bottom":
                  s.x1 = ox + b1Pts[4].x; s.y1 = oy + b1Pts[4].y;
                  s.x2 = ox + b1Pts[5].x; s.y2 = oy + b1Pts[5].y;
                  break;
                case "b1_haunch_bl":
                  s.x1 = ox + b1Pts[5].x; s.y1 = oy + b1Pts[5].y;
                  s.x2 = ox + b1Pts[6].x; s.y2 = oy + b1Pts[6].y;
                  break;
                case "b1_left":
                  s.x1 = ox + b1Pts[6].x; s.y1 = oy + b1Pts[6].y;
                  s.x2 = ox + b1Pts[7].x; s.y2 = oy + b1Pts[7].y;
                  break;
                case "b1_haunch_tl":
                  s.x1 = ox + b1Pts[7].x; s.y1 = oy + b1Pts[7].y;
                  s.x2 = ox + b1Pts[0].x; s.y2 = oy + b1Pts[0].y;
                  break;

                case "b2_top":
                  s.x1 = ox + b2Pts[0].x; s.y1 = oy + b2Pts[0].y;
                  s.x2 = ox + b2Pts[1].x; s.y2 = oy + b2Pts[1].y;
                  break;
                case "b2_haunch_tr":
                  s.x1 = ox + b2Pts[1].x; s.y1 = oy + b2Pts[1].y;
                  s.x2 = ox + b2Pts[2].x; s.y2 = oy + b2Pts[2].y;
                  break;
                case "b2_right":
                  s.x1 = ox + b2Pts[2].x; s.y1 = oy + b2Pts[2].y;
                  s.x2 = ox + b2Pts[3].x; s.y2 = oy + b2Pts[3].y;
                  break;
                case "b2_haunch_br":
                  s.x1 = ox + b2Pts[3].x; s.y1 = oy + b2Pts[3].y;
                  s.x2 = ox + b2Pts[4].x; s.y2 = oy + b2Pts[4].y;
                  break;
                case "b2_bottom":
                  s.x1 = ox + b2Pts[4].x; s.y1 = oy + b2Pts[4].y;
                  s.x2 = ox + b2Pts[5].x; s.y2 = oy + b2Pts[5].y;
                  break;
                case "b2_haunch_bl":
                  s.x1 = ox + b2Pts[5].x; s.y1 = oy + b2Pts[5].y;
                  s.x2 = ox + b2Pts[6].x; s.y2 = oy + b2Pts[6].y;
                  break;
                case "b2_left":
                  s.x1 = ox + b2Pts[6].x; s.y1 = oy + b2Pts[6].y;
                  s.x2 = ox + b2Pts[7].x; s.y2 = oy + b2Pts[7].y;
                  break;
                case "b2_haunch_tl":
                  s.x1 = ox + b2Pts[7].x; s.y1 = oy + b2Pts[7].y;
                  s.x2 = ox + b2Pts[0].x; s.y2 = oy + b2Pts[0].y;
                  break;
              }
            }
          }
        }
      }
    } else {
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
      // 1. Check connected component geometry (handles ANY connected figures:
      // triangles, rectangles with diagonals, trusses, multi-loop assemblies, etc.)
      const connRes = solveConnectedGeometry({
        shapes,
        variables: this.variables,
      });

      let handled = false;
      if (connRes.handled) {
        for (const s of connRes.updatedShapes) {
          const idx = updatedShapes.findIndex((us) => us.id === s.id);
          if (idx !== -1) {
            updatedShapes[idx] = s;
          }
        }
        handled = true;
      } else if (loops.length > 0) {
        // 2. Fallback to cyclical loop solver for multi-edge polygons
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
            handled = true;
          }
        }
      }

      if (!handled) {
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
    }

    // 3. Re-evaluate formulas with freshly updated geometry variables
    this.evaluateAllVariables(updatedShapes);

    // 4. Solve geometric constraints
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
  public solveParametricGeometricModel(shapes: Shape[], dirtyEntityIds?: string[]): {
    updatedShapes: Shape[];
    loops: DetectedLoop[];
    errors: string[];
    dofAnalysis?: DOFAnalysis;
    affectedSubgraphs?: ConnectedSubgraph[];
  } {
    // 1. Detect closed loops and publish derived metrics to symbol table
    const loops = this.detectLoops(shapes);

    // 2. Solve algebraic dependencies & LCS transforms
    const lcsRes = this.solveWithLCS(shapes);
    let resolvedShapes = lcsRes.shapes;

    // 3. Incremental dirty sub-problem resolution via BFS partitioning (§33, §34)
    if (dirtyEntityIds && dirtyEntityIds.length > 0 && this.constraintGraph.constraints.size > 0) {
      const incRes = this.solveIncrementalDirty(resolvedShapes, dirtyEntityIds);
      return {
        updatedShapes: incRes.updatedShapes,
        loops,
        errors: [...lcsRes.errors, ...incRes.errors],
        dofAnalysis: incRes.dofAnalysis,
        affectedSubgraphs: incRes.affectedSubgraphs,
      };
    }

    // 4. Populate constraint graph entities and solve geometric constraints if any exist
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

  /**
   * Solves an incremental dirty subgraph via BFS partitioning (UPCE-MASTER-1.0 §33, §34).
   * Restricts the numerical solve to only the connected component containing dirty entities.
   */
  public solveIncrementalDirty(shapes: Shape[], dirtyEntityIds: string[]): {
    updatedShapes: Shape[];
    affectedSubgraphs: ConnectedSubgraph[];
    errors: string[];
    dofAnalysis?: DOFAnalysis;
  } {
    // 1. Build bipartite graph from active entities & constraints
    const bg = new BipartiteConstraintGraph();
    for (const [id, ent] of this.constraintGraph.entities.entries()) {
      bg.addEntity(id, ent.isFixed ? 0 : ent.dof || 2);
    }
    for (const [id, c] of this.constraintGraph.constraints.entries()) {
      bg.addConstraint(id, c.entityIds, c.dofCost || 1);
    }

    // 2. Extract affected connected subgraphs containing dirty entities
    const subgraphs = extractConnectedSubgraphsBFS(bg, dirtyEntityIds);
    if (subgraphs.length === 0) {
      return {
        updatedShapes: shapes,
        affectedSubgraphs: [],
        errors: [],
      };
    }

    const allAffectedEntities = new Set<string>();
    const allAffectedConstraints = new Set<string>();
    for (const sg of subgraphs) {
      for (const e of sg.entityIds) allAffectedEntities.add(e);
      for (const c of sg.constraintIds) allAffectedConstraints.add(c);
    }

    // 3. Create scoped subgraph with only affected entities & constraints
    const scopedGraph = new ConstraintGraph();
    for (const eId of allAffectedEntities) {
      const ent = this.constraintGraph.entities.get(eId);
      if (ent) scopedGraph.entities.set(eId, { ...ent });
    }
    for (const cId of allAffectedConstraints) {
      const c = this.constraintGraph.constraints.get(cId);
      if (c) scopedGraph.constraints.set(cId, { ...c });
    }

    const dofAnalysis = scopedGraph.analyzeDOF();
    const geomRes = this.geometricSolver.solve(scopedGraph);

    // 4. Update only shapes affected by the partitioned solve
    const updatedShapes = shapes.map((s) => {
      const p1Key = `${s.id}_p1`;
      const p2Key = `${s.id}_p2`;
      if (allAffectedEntities.has(p1Key) || allAffectedEntities.has(p2Key) || allAffectedEntities.has(s.id)) {
        if (s.type === "line" || s.type === "arrow") {
          const p1 = geomRes.points.get(p1Key);
          const p2 = geomRes.points.get(p2Key);
          if (p1 && p2) {
            return { ...s, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
          }
        }
      }
      return s;
    });

    return {
      updatedShapes,
      affectedSubgraphs: subgraphs,
      errors: geomRes.errors,
      dofAnalysis,
    };
  }
}
