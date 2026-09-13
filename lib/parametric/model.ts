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
import { BipartiteConstraintGraph } from "./graph/bipartiteGraph";
import { extractConnectedSubgraphsBFS, ConnectedSubgraph } from "./graph/bfsPartition";
import type { ParametricVariable, ShapeParameterDef } from "./types";

export type { ParametricVariable, ShapeParameterDef };

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
          const isInner = Boolean((s.name && /inner|cutout/i.test(s.name)) || /inner|cutout/i.test(shapeName));
          const boundW = getVarValue(
            `${shapeName}.width`, `${shapeName}_width`, `${shapeName}_Width`,
            s.name ? `${s.name}.width` : "", s.name ? `${s.name}_width` : "", s.name ? `${s.name}_Width` : "",
            cleanName ? `${cleanName}.width` : "", cleanName ? `${cleanName}_width` : "", cleanName ? `${cleanName}_Width` : "",
            `${s.id}.width`, `${s.id}_width`, `${s.id}_Width`,
            ...(isInner
              ? ["InnerWidth", "inner_width", "Inner_Width", "innerWidth"]
              : ["W", "Width", "width"])
          );
          const boundH = getVarValue(
            `${shapeName}.height`, `${shapeName}_height`, `${shapeName}_Height`,
            s.name ? `${s.name}.height` : "", s.name ? `${s.name}_height` : "", s.name ? `${s.name}_Height` : "",
            cleanName ? `${cleanName}.height` : "", cleanName ? `${cleanName}_height` : "", cleanName ? `${cleanName}_Height` : "",
            `${s.id}.height`, `${s.id}_height`, `${s.id}_Height`,
            ...(isInner
              ? ["InnerHeight", "inner_height", "Inner_Height", "innerHeight"]
              : ["H", "Height", "height"])
          );
          const boundX = getVarValue(
            `${shapeName}.x`, `${shapeName}_x`, `${shapeName}_X`,
            s.name ? `${s.name}.x` : "", s.name ? `${s.name}_x` : "", s.name ? `${s.name}_X` : "",
            cleanName ? `${cleanName}.x` : "", cleanName ? `${cleanName}_x` : "", cleanName ? `${cleanName}_X` : "",
            `${s.id}.x`, `${s.id}_x`, `${s.id}_X`,
            ...(isInner ? ["InnerX", "inner_x", "Inner_X", "innerX"] : [])
          );
          const boundY = getVarValue(
            `${shapeName}.y`, `${shapeName}_y`, `${shapeName}_Y`,
            s.name ? `${s.name}.y` : "", s.name ? `${s.name}_y` : "", s.name ? `${s.name}_Y` : "",
            cleanName ? `${cleanName}.y` : "", cleanName ? `${cleanName}_y` : "", cleanName ? `${cleanName}_Y` : "",
            `${s.id}.y`, `${s.id}_y`, `${s.id}_Y`,
            ...(isInner ? ["InnerY", "inner_y", "Inner_Y", "innerY"] : [])
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

    // The generic resolution path, and the only one.
    //
    // What used to stand here was a cascade of branches keyed on magic entity
    // ids — `culvert_inner_top`, `culvert_haunch_tr`, `b1_haunch_bl`,
    // `miter_tl`, `edge_top` — each one re-deriving a particular drawing's
    // geometry from a particular set of variable names. It worked for exactly
    // the templates it named and for nothing a draftsman drew, which is the
    // definition of the failure UPCE-MASTER-1.0 exists to end (§21: no
    // hardcoded civil object types in the kernel).
    //
    // Everything below is id-agnostic. It reasons about connectivity, closed
    // loops and coincident joints, so it treats a culvert, a truss and a shape
    // somebody drew this morning the same way — because by this point they are
    // all just connected lines.

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
