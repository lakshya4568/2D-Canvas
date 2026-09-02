/**
 * Bipartite Constraint Graph for 2D Parametric CAD
 * Represents geometric entities (points, lines, angles, LCS, variables)
 * and the geometric/dimensional constraints that connect them.
 * Performs Degrees of Freedom (DOF) analysis and classifies driving vs reference dimensions.
 */

import { Point } from "../geometry/types";

export type EntityType = "point" | "line" | "angle" | "lcs" | "variable" | "polygon";

export interface EntityNode {
  id: string;
  name: string;
  type: EntityType;
  // Current values
  point?: Point;
  length?: number;
  angleDeg?: number;
  value?: number;
  isFixed?: boolean;
  dof: number; // Degrees of freedom (Point = 2, Line = 4 or 2 if endpoints fixed, Scalar = 1)
  connectedConstraintIds: Set<string>;
}

export type ConstraintType =
  | "coincident"
  | "distance"
  | "length"
  | "horizontal"
  | "vertical"
  | "parallel"
  | "perpendicular"
  | "angle"
  | "equal_length"
  | "equal_angle"
  | "fixed"
  | "collinear"
  | "symmetric"
  | "formula";

export interface ConstraintNode {
  id: string;
  type: ConstraintType;
  name?: string;
  entityIds: string[]; // Entities bound by this constraint
  targetValue?: number; // Prescribed dimension or angle
  formula?: string; // Algebraic formula
  isDriving: boolean; // true = driving dimension, false = reference/derived dimension
  isHard: boolean; // true = strict equality, false = soft objective / preference
  weight: number; // For weighted least-squares solver (hard = 1000, soft = 1)
  dofCost: number; // Number of degrees of freedom this constraint removes
}

export interface DOFAnalysis {
  totalDOFs: number;
  activeConstraintsCount: number;
  effectiveDOF: number;
  status: "under_constrained" | "fully_constrained" | "over_constrained";
  freeEntities: string[];
  redundantConstraints: string[];
}

export class ConstraintGraph {
  public entities = new Map<string, EntityNode>();
  public constraints = new Map<string, ConstraintNode>();

  public clear(): void {
    this.entities.clear();
    this.constraints.clear();
  }

  // --- Entity Management ---

  public addPointEntity(id: string, name: string, point: Point, isFixed: boolean = false): EntityNode {
    const node: EntityNode = {
      id,
      name,
      type: "point",
      point: { ...point },
      isFixed,
      dof: isFixed ? 0 : 2,
      connectedConstraintIds: new Set(),
    };
    this.entities.set(id, node);
    return node;
  }

  public addLineEntity(id: string, name: string, length?: number, angleDeg?: number): EntityNode {
    const node: EntityNode = {
      id,
      name,
      type: "line",
      length,
      angleDeg,
      dof: 2,
      connectedConstraintIds: new Set(),
    };
    this.entities.set(id, node);
    return node;
  }

  public addVariableEntity(id: string, name: string, value: number, isFixed: boolean = false): EntityNode {
    const node: EntityNode = {
      id,
      name,
      type: "variable",
      value,
      isFixed,
      dof: isFixed ? 0 : 1,
      connectedConstraintIds: new Set(),
    };
    this.entities.set(id, node);
    return node;
  }

  // --- Constraint Management ---

  public addConstraint(
    id: string,
    type: ConstraintType,
    entityIds: string[],
    options: {
      targetValue?: number;
      formula?: string;
      isDriving?: boolean;
      isHard?: boolean;
      weight?: number;
      name?: string;
    } = {}
  ): ConstraintNode {
    let dofCost = 1;
    switch (type) {
      case "coincident":
        dofCost = 2; // (x1 = x2, y1 = y2)
        break;
      case "fixed":
        dofCost = 2; // (x = x0, y = y0)
        break;
      case "distance":
      case "length":
      case "horizontal":
      case "vertical":
      case "parallel":
      case "perpendicular":
      case "angle":
      case "equal_length":
      case "equal_angle":
      case "collinear":
      case "symmetric":
      case "formula":
        dofCost = 1;
        break;
    }

    const node: ConstraintNode = {
      id,
      type,
      name: options.name || `${type}_${id}`,
      entityIds,
      targetValue: options.targetValue,
      formula: options.formula,
      isDriving: options.isDriving ?? true,
      isHard: options.isHard ?? true,
      weight: options.weight ?? (options.isHard !== false ? 1000 : 1),
      dofCost,
    };

    this.constraints.set(id, node);

    // Link entity -> constraint
    for (const entId of entityIds) {
      const ent = this.entities.get(entId);
      if (ent) {
        ent.connectedConstraintIds.add(id);
      }
    }

    return node;
  }

  public removeConstraint(id: string): boolean {
    const c = this.constraints.get(id);
    if (!c) return false;

    for (const entId of c.entityIds) {
      const ent = this.entities.get(entId);
      if (ent) {
        ent.connectedConstraintIds.delete(id);
      }
    }

    return this.constraints.delete(id);
  }

  // --- Degrees of Freedom (DOF) Analysis ---

  public analyzeDOF(): DOFAnalysis {
    let totalDOFs = 0;
    const freeEntities: string[] = [];

    for (const [id, ent] of this.entities.entries()) {
      if (!ent.isFixed && ent.dof > 0) {
        totalDOFs += ent.dof;
        freeEntities.push(id);
      }
    }

    let activeConstraintsCost = 0;
    for (const c of this.constraints.values()) {
      // Only driving constraints remove degrees of freedom
      if (c.isDriving && c.isHard) {
        activeConstraintsCost += c.dofCost;
      }
    }

    const effectiveDOF = totalDOFs - activeConstraintsCost;
    let status: "under_constrained" | "fully_constrained" | "over_constrained" = "fully_constrained";

    if (effectiveDOF > 0) {
      status = "under_constrained";
    } else if (effectiveDOF < 0) {
      status = "over_constrained";
    }

    return {
      totalDOFs,
      activeConstraintsCount: this.constraints.size,
      effectiveDOF,
      status,
      freeEntities,
      redundantConstraints: [],
    };
  }

  /**
   * Returns all constraints attached to a specific entity
   */
  public getConstraintsForEntity(entityId: string): ConstraintNode[] {
    const ent = this.entities.get(entityId);
    if (!ent) return [];
    return Array.from(ent.connectedConstraintIds)
      .map((cid) => this.constraints.get(cid))
      .filter((c): c is ConstraintNode => !!c);
  }
}
