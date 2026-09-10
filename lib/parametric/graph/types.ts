/**
 * Bipartite Graph and Dulmage-Mendelsohn Decomposition Types
 * UPCE-MASTER-1.0 §18, §30, §86
 * Decouples graph storage from decomposition algorithms.
 */

export interface EntityNode {
  id: string;
  degreesOfFreedom: number;
  /**
   * §18 anchor rule: "every ParametricSketch MUST fix at least one entity (or one
   * LCS origin) to remove the three global rigid-body DOF. Without it, DOF
   * analysis mis-reports three spurious degrees of freedom on every sketch and
   * every diagnosis downstream is wrong."
   */
  isFixed?: boolean;
}

export interface ConstraintNode {
  id: string;
  entityIds: string[];
  equationCount: number;
}

export interface IBipartiteConstraintGraph {
  entities: Map<string, EntityNode>;
  constraints: Map<string, ConstraintNode>;
  entityToConstraints: Map<string, Set<string>>;
  constraintToEntities: Map<string, Set<string>>;
  addEntity(id: string, degreesOfFreedom?: number): void;
  setAnchor(id: string): void;
  hasAnchor(): boolean;
  addConstraint(id: string, entityIds: string[], equationCount?: number): void;
  calculateDegreesOfFreedom(): number;
  decomposeDM(): DMResult;
}

export interface ComponentDOF {
  componentId: string;
  entityIds: string[];
  variableCount: number; // |V_k|
  rank: number;          // rank(J_k)
  isAnchored: boolean;
  dAnchor: number;       // D_anchor,k: 0 if anchored, 3 if floating (capped at |V_k|)
  dof: number;           // DOF_k = |V_k| - rank(J_k) - D_anchor,k
  status: "under_constrained" | "well_constrained" | "over_constrained";
  conflictingConstraints?: string[];
}

export interface DMResult {
  underConstrained: {
    variables: string[];
    constraints: string[];
    dof: number;
  };
  wellConstrained: {
    variables: string[];
    constraints: string[];
    blocks: { variables: string[]; constraints: string[] }[];
  };
  overConstrained: {
    variables: string[];
    constraints: string[];
    conflictingConstraints: string[];
  };
  totalDof: number;
  status: "under_constrained" | "well_constrained" | "over_constrained";
  components: ComponentDOF[];
}

export interface SVDConflictResult {
  conflictingConstraints: string[];
  redundantConstraints: string[];
  rank: number;
  nullspaceModes: {
    singularValue: number;
    residualProjection: number;
    participatingConstraints: string[];
    isConflicting: boolean;
  }[];
}
