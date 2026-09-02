/**
 * Local Coordinate System (LCS) Aware Constraint & Dependency Solver
 * Orchestrates the full CAD resolution pipeline:
 *   Dependency Graph -> Cycle Detection -> Variable Evaluation -> Relative Coordinate Resolution
 *   -> Hierarchical Transforms -> Geometric Constraint Solving -> World Geometry Projection
 */

import { Point, Shape } from "../geometry/types";
import { DependencyGraph, CycleReport } from "./dependencyGraph";
import { parseFormula, evaluateFormula, SymbolTable } from "./expression";
import { GeometricConstraint, solveConstraints, SolverResult } from "./constraints";
import { GeometryObjectState, GeometryObject } from "./geometryObject";
import { LocalCoordinateSystem, Transform2D, Vector2D } from "./transform2d";

export interface LCSSolverOptions {
  maxConstraintIterations?: number;
  tolerance?: number;
}

export interface LCSSolveReport {
  objects: Map<string, GeometryObjectState>;
  shapes: Shape[];
  cycles: CycleReport;
  diagnostics: string[];
  errors: string[];
  success: boolean;
}

export class LCSSolver {
  private graph = new DependencyGraph();

  /**
   * Builds the dependency graph representing variables, relative coordinates,
   * hierarchical parents, and geometric constraints.
   */
  public buildGraph(
    variables: Map<string, { name: string; value: number; formula?: string }>,
    objects: Map<string, GeometryObjectState>
  ): CycleReport {
    this.graph.clear();

    // 1. Add variable dependencies
    for (const [varName, v] of variables.entries()) {
      this.graph.addNode(varName, varName, "variable");
      if (v.formula) {
        try {
          const ast = parseFormula(v.formula);
          const rawDeps = Array.from(ast.dependencies);
          const mappedDeps: string[] = [];
          for (const dep of rawDeps) {
            mappedDeps.push(dep);
            if (dep.includes(".")) {
              const objName = dep.split(".")[0];
              mappedDeps.push(objName);
              this.graph.addNode(dep);
              this.graph.setDependencies(dep, [objName]);
            }
          }
          this.graph.setDependencies(varName, mappedDeps);
        } catch {
          // Syntax errors will be reported during evaluation
        }
      }
    }

    // 2. Add object relative placement & parent dependencies
    for (const [objId, obj] of objects.entries()) {
      const objNode = this.graph.addNode(obj.name, obj.name, "shape_param");
      const deps: string[] = [];

      // Parent dependency
      if (obj.parentId) {
        const parent = objects.get(obj.parentId);
        if (parent) deps.push(parent.name);
      }

      // Relative attachment dependency
      if (obj.relativePlacement?.attachedTo) {
        const refName = obj.relativePlacement.attachedTo.split(".")[0];
        deps.push(refName);
      }
      if (obj.relativePlacement?.referenceObjectId) {
        deps.push(obj.relativePlacement.referenceObjectId);
      }

      // Parameter variable bindings
      for (const varBinding of Object.values(obj.variables)) {
        deps.push(varBinding);
      }

      // Explicit dependencies
      for (const d of obj.dependencies) {
        deps.push(d);
      }

      if (deps.length > 0) {
        this.graph.setDependencies(obj.name, deps);
      }
    }

    // 3. Add constraint dependencies
    for (const [objId, obj] of objects.entries()) {
      for (const c of obj.constraints) {
        if (!c.enabled) continue;
        const cNode = this.graph.addNode(c.id, c.name || c.id, "constraint");
        const shapeNames = c.shapeIds
          .map((id) => objects.get(id)?.name || id)
          .filter(Boolean);
        this.graph.setDependencies(c.id, shapeNames);
      }
    }

    return this.graph.detectCycles();
  }

  /**
   * Executes the full deterministic topological solve pipeline.
   */
  public solve(
    variables: Map<string, { name: string; value: number; formula?: string }>,
    objects: Map<string, GeometryObjectState>,
    globalConstraints: GeometricConstraint[] = [],
    options: LCSSolverOptions = {}
  ): LCSSolveReport {
    const diagnostics: string[] = [];
    const errors: string[] = [];

    // Step 1: Detect cycles
    const cycleReport = this.buildGraph(variables, objects);
    if (cycleReport.hasCycle) {
      errors.push(cycleReport.message || "Circular dependency detected in CAD model");
      // Continue with best-effort without infinite looping
    }

    // Helper to populate symbol table with all object sub-entities (e.g. Line_A.length, Rectangle_1.width)
    const populateObjectSymbols = () => {
      for (const obj of objects.values()) {
        const sub = GeometryObject.getExposedSubEntities(obj);
        for (const [scalarKey, scalarVal] of Object.entries(sub.scalars)) {
          symbols[`${obj.name}.${scalarKey}`] = scalarVal;
          symbols[`${obj.id}.${scalarKey}`] = scalarVal;
        }
        for (const [ptKey, pt] of Object.entries(sub.points)) {
          symbols[`${obj.name}.${ptKey}.x`] = pt.x;
          symbols[`${obj.name}.${ptKey}.y`] = pt.y;
          symbols[`${obj.id}.${ptKey}.x`] = pt.x;
          symbols[`${obj.id}.${ptKey}.y`] = pt.y;
        }
        if (sub.edges) {
          for (const [edgeKey, edge] of Object.entries(sub.edges)) {
            symbols[`${obj.name}.${edgeKey}.length`] = edge.length;
            symbols[`${obj.name}.${edgeKey}.start.x`] = edge.start.x;
            symbols[`${obj.name}.${edgeKey}.start.y`] = edge.start.y;
            symbols[`${obj.name}.${edgeKey}.end.x`] = edge.end.x;
            symbols[`${obj.name}.${edgeKey}.end.y`] = edge.end.y;
          }
        }
      }
    };

    // Step 2: Build symbol table containing evaluated variables & sub-elements
    const symbols: SymbolTable = {};
    for (const [name, v] of variables.entries()) {
      symbols[name] = v.value;
    }

    // Stage A: Initial parameter update from static variables
    for (const obj of objects.values()) {
      for (const [paramKey, varName] of Object.entries(obj.variables)) {
        if (varName in symbols) {
          obj.parameters[paramKey] = symbols[varName];
        }
      }
      if (obj.name in symbols && (obj.type === "line" || obj.type === "arrow")) {
        obj.parameters.length = symbols[obj.name];
      }
    }

    // Stage C: Evaluate formulas and object parameters in topological order
    const evalOrder = this.graph.topologicalSort();
    for (const nodeId of evalOrder) {
      // 1. Check if nodeId is a variable with formula
      const v = variables.get(nodeId);
      if (v && v.formula) {
        const evalRes = evaluateFormula(v.formula, symbols);
        if (evalRes.error) {
          errors.push(`Formula error in '${nodeId} = ${v.formula}': ${evalRes.error}`);
        } else {
          v.value = evalRes.value;
          symbols[nodeId] = evalRes.value;
        }
      }

      // 2. Check if nodeId is an object
      const obj = Array.from(objects.values()).find((o) => o.name === nodeId || o.id === nodeId);
      if (obj) {
        for (const [paramKey, varName] of Object.entries(obj.variables)) {
          if (varName in symbols) {
            obj.parameters[paramKey] = symbols[varName];
          }
        }
        // 2b. Direct parameter variable assignments if not already bound
        for (const paramKey of Object.keys(obj.parameters)) {
          if (!obj.variables[paramKey]) {
            const fullKey = `${obj.name}.${paramKey}`;
            if (variables.has(fullKey) && fullKey in symbols) {
              obj.parameters[paramKey] = symbols[fullKey];
            }
          }
        }
        if (variables.has(obj.name) && !obj.variables.length && (obj.type === "line" || obj.type === "arrow")) {
          obj.parameters.length = symbols[obj.name];
        }
        populateObjectSymbols();
      }
    }

    // Stage D: Re-update parameters that depend on evaluated formulas
    for (const obj of objects.values()) {
      for (const [paramKey, varName] of Object.entries(obj.variables)) {
        if (varName in symbols) {
          obj.parameters[paramKey] = symbols[varName];
        }
      }
      for (const paramKey of Object.keys(obj.parameters)) {
        if (!obj.variables[paramKey]) {
          const fullKey = `${obj.name}.${paramKey}`;
          if (variables.has(fullKey) && fullKey in symbols) {
            obj.parameters[paramKey] = symbols[fullKey];
          }
        }
      }
      if (variables.has(obj.name) && !obj.variables.length && (obj.type === "line" || obj.type === "arrow")) {
        obj.parameters.length = symbols[obj.name];
      }
    }

    // Stage E: Refresh object sub-entities with updated parameters
    populateObjectSymbols();

    // Step 6: Resolve relative placements and hierarchical local coordinate frames
    for (const nodeId of evalOrder) {
      let currentObj: GeometryObjectState | undefined;
      for (const obj of objects.values()) {
        if (obj.name === nodeId || obj.id === nodeId) {
          currentObj = obj;
          break;
        }
      }
      if (!currentObj) continue;

      // Handle relative placement
      if (currentObj.relativePlacement) {
        const rel = currentObj.relativePlacement;

        // Attachment point (e.g. Line_A.endPoint)
        if (rel.attachedTo) {
          const targetPt = GeometryObject.resolveEntityPath(rel.attachedTo, objects);
          if (targetPt && typeof targetPt === "object" && "x" in targetPt && "y" in targetPt) {
            currentObj.lcs.origin = { x: targetPt.x, y: targetPt.y };
          }
        }

        // Relative angle
        if (rel.relativeAngle !== undefined) {
          let angleDeg = 0;
          if (typeof rel.relativeAngle === "number") {
            angleDeg = rel.relativeAngle;
          } else if (typeof rel.relativeAngle === "string") {
            const evalRes = evaluateFormula(rel.relativeAngle, symbols);
            angleDeg = evalRes.value;
          }
          currentObj.lcs.rotationRad = (angleDeg * Math.PI) / 180;
        }

        // Relative offset in reference frame
        if (rel.offset && rel.referenceObjectId) {
          const refObj = objects.get(rel.referenceObjectId);
          if (refObj) {
            const ox = typeof rel.offset.x === "number" ? rel.offset.x : symbols[String(rel.offset.x)] ?? 0;
            const oy = typeof rel.offset.y === "number" ? rel.offset.y : symbols[String(rel.offset.y)] ?? 0;
            currentObj.lcs.origin = refObj.lcs.localToWorld({ x: ox, y: oy });
          }
        }

        currentObj.lcs.setTransform(currentObj.lcs.origin, currentObj.lcs.rotationRad, currentObj.lcs.scale);
      }

      // Handle parent-child hierarchical transformations
      if (currentObj.parentId) {
        const parentObj = objects.get(currentObj.parentId);
        if (parentObj) {
          currentObj.lcs.updateHierarchicalWorldTransform(parentObj.lcs.worldMatrix);
        }
      } else {
        currentObj.lcs.updateHierarchicalWorldTransform();
      }
    }

    // Step 7: Convert to CAD Shapes for rendering
    const shapes: Shape[] = [];
    for (const obj of objects.values()) {
      shapes.push(GeometryObject.toShape(obj));
    }

    // Step 8: Apply Geometric Constraints (if any are active)
    const allConstraints = [
      ...globalConstraints,
      ...Array.from(objects.values()).flatMap((o) => o.constraints),
    ];

    let finalShapes = shapes;
    if (allConstraints.length > 0) {
      const solverRes = solveConstraints(shapes, allConstraints);
      finalShapes = solverRes.updatedShapes;
      for (const diag of solverRes.diagnostics) {
        if (!diag.satisfied) {
          diagnostics.push(`Constraint '${diag.constraintId}' residual: ${diag.residual.toFixed(3)}`);
        }
      }
    }

    return {
      objects,
      shapes: finalShapes,
      cycles: cycleReport,
      diagnostics,
      errors,
      success: errors.length === 0,
    };
  }

  /**
   * Bidirectional direct manipulation helper:
   * When user moves an endpoint or point in world space, calculates the corresponding
   * local parameter update and updates the object's LCS state.
   */
  public static handleDirectPointManipulation(
    obj: GeometryObjectState,
    pointIndex: number, // 0 = start/origin, 1 = end
    worldPoint: Point
  ): void {
    if (obj.type === "line" || obj.type === "arrow") {
      if (pointIndex === 0) {
        // Moving origin in world space
        obj.lcs.setTransform(worldPoint, obj.lcs.rotationRad, obj.lcs.scale);
      } else {
        // Moving endpoint: updates length and orientation in local frame
        const localPt = obj.lcs.worldToLocal(worldPoint);
        const newLen = Math.hypot(localPt.x, localPt.y);
        const newAngleRad = Math.atan2(worldPoint.y - obj.lcs.origin.y, worldPoint.x - obj.lcs.origin.x);
        obj.parameters.length = newLen;
        obj.lcs.setTransform(obj.lcs.origin, newAngleRad, obj.lcs.scale);
      }
    } else if (obj.type === "rectangle") {
      if (pointIndex === 0) {
        obj.lcs.setTransform(worldPoint, obj.lcs.rotationRad, obj.lcs.scale);
      } else {
        const localPt = obj.lcs.worldToLocal(worldPoint);
        obj.parameters.width = Math.max(5, localPt.x);
        obj.parameters.height = Math.max(5, localPt.y);
      }
    } else if (obj.type === "circle") {
      if (pointIndex === 0) {
        obj.lcs.setTransform(worldPoint, 0, obj.lcs.scale);
      } else {
        const dist = Math.hypot(worldPoint.x - obj.lcs.origin.x, worldPoint.y - obj.lcs.origin.y);
        obj.parameters.radius = Math.max(2, dist);
      }
    }
  }
}
