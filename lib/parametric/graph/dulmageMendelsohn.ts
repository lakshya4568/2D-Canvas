import { BipartiteConstraintGraph } from "./bipartiteGraph";
import { svd } from "../../solver/matrix/svd";

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

/**
 * Traces constraint conflicts and redundancies using Thin SVD left singular vectors (UPCE-MASTER-1.0 §30).
 * For J in R^(m x n), the left nullspace projection is P_perp = I - U U^T.
 * Left singular vectors u_l spanning the nullspace satisfy u_l^T J = 0.
 * If |u_l^T * F| > epsRes, constraints with non-zero components in u_l are in direct mathematical conflict.
 * If |u_l^T * F| <= epsRes, the linear dependency is satisfied and constraints are redundant.
 */
export function traceConflictsViaSVD(
  J: number[][],
  F: number[],
  constraintIds: string[],
  epsRank: number = 1e-8,
  epsRes: number = 1e-4
): SVDConflictResult {
  const m = J.length;
  if (m === 0) {
    return {
      conflictingConstraints: [],
      redundantConstraints: [],
      rank: 0,
      nullspaceModes: [],
    };
  }

  const { U, q } = svd(J);
  const k = q.length;

  let numericalRank = 0;
  for (let l = 0; l < k; l++) {
    if (q[l] > epsRank) numericalRank++;
  }

  const conflictingSet = new Set<string>();
  const redundantSet = new Set<string>();
  const modes: SVDConflictResult["nullspaceModes"] = [];

  // Compute left nullspace projection matrix P_perp = I_m - U * U^T
  const Pperp: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let uut = 0.0;
      for (let l = 0; l < k; l++) {
        if (q[l] > epsRank) {
          uut += U[i][l] * U[j][l];
        }
      }
      Pperp[i][j] = (i === j ? 1.0 : 0.0) - uut;
    }
  }

  // Decompose P_perp to find orthonormal basis of left nullspace
  const nullSvd = svd(Pperp);
  for (let l = 0; l < nullSvd.q.length; l++) {
    if (nullSvd.q[l] > 0.5) {
      // Valid left nullspace singular vector u_l
      const uVec = nullSvd.U.map((row) => row[l]);
      let projRes = 0.0;
      let maxWeight = 0.0;

      for (let i = 0; i < m; i++) {
        const uVal = Math.abs(uVec[i]);
        if (uVal > maxWeight) maxWeight = uVal;
        projRes += uVec[i] * (i < F.length ? F[i] : 0.0);
      }

      const isConflicting = Math.abs(projRes) > epsRes;
      const participating: string[] = [];
      const threshold = maxWeight * 0.15;

      for (let i = 0; i < m; i++) {
        if (Math.abs(uVec[i]) >= threshold && i < constraintIds.length) {
          const cId = constraintIds[i];
          participating.push(cId);
          if (isConflicting) {
            conflictingSet.add(cId);
          } else {
            redundantSet.add(cId);
          }
        }
      }

      modes.push({
        singularValue: 0.0,
        residualProjection: projRes,
        participatingConstraints: participating,
        isConflicting,
      });
    }
  }

  return {
    conflictingConstraints: Array.from(conflictingSet),
    redundantConstraints: Array.from(redundantSet),
    rank: numericalRank,
    nullspaceModes: modes,
  };
}

export class DulmageMendelsohnSolver {
  /**
   * Decomposes the bipartite constraint graph into G_under, G_square, G_over,
   * Tarjan SCC Block Triangular Form (BTF), and computes per-connected-component DOF.
   */
  public static decompose(graph: BipartiteConstraintGraph): DMResult {
    const varNodes: string[] = [];
    const entityVarMap = new Map<string, string[]>();

    for (const [entityId, entity] of graph.entities.entries()) {
      const vars: string[] = [];
      const dof = entity.degreesOfFreedom !== undefined ? entity.degreesOfFreedom : 2;
      for (let d = 0; d < dof; d++) {
        const vName = `${entityId}_d${d}`;
        vars.push(vName);
        varNodes.push(vName);
      }
      entityVarMap.set(entityId, vars);
    }

    const eqNodes: string[] = [];
    const constraintEqMap = new Map<string, string[]>();
    const eqConstraintMap = new Map<string, string>();
    const adj = new Map<string, string[]>(); // eqNode -> varNodes

    for (const [cId, constraint] of graph.constraints.entries()) {
      const eqCount = constraint.equationCount || 1;
      const eqs: string[] = [];
      const incidentVars: string[] = [];

      for (const entId of constraint.entityIds) {
        const ev = entityVarMap.get(entId) || [];
        incidentVars.push(...ev);
      }

      for (let e = 0; e < eqCount; e++) {
        const eqName = `${cId}_eq${e}`;
        eqs.push(eqName);
        eqNodes.push(eqName);
        eqConstraintMap.set(eqName, cId);
        adj.set(eqName, [...incidentVars]);
      }
      constraintEqMap.set(cId, eqs);
    }

    // 1. Hopcroft-Karp Maximum Bipartite Matching: equations (U) to variables (V)
    const pairU = new Map<string, string>(); // eq -> var
    const pairV = new Map<string, string>(); // var -> eq
    const dist = new Map<string, number>();

    const bfs = (): boolean => {
      const queue: string[] = [];
      for (const u of eqNodes) {
        if (!pairU.has(u)) {
          dist.set(u, 0);
          queue.push(u);
        } else {
          dist.set(u, Infinity);
        }
      }
      dist.set("NIL", Infinity);

      while (queue.length > 0) {
        const u = queue.shift()!;
        if (dist.get(u)! < dist.get("NIL")!) {
          const neighbors = adj.get(u) || [];
          for (const v of neighbors) {
            const nextU = pairV.get(v) || "NIL";
            if (dist.get(nextU) === Infinity) {
              dist.set(nextU, dist.get(u)! + 1);
              queue.push(nextU);
            }
          }
        }
      }

      return dist.get("NIL") !== Infinity;
    };

    const dfs = (u: string): boolean => {
      if (u !== "NIL") {
        const neighbors = adj.get(u) || [];
        for (const v of neighbors) {
          const nextU = pairV.get(v) || "NIL";
          if (dist.get(nextU) === dist.get(u)! + 1 && dfs(nextU)) {
            pairV.set(v, u);
            pairU.set(u, v);
            return true;
          }
        }
        dist.set(u, Infinity);
        return false;
      }
      return true;
    };

    while (bfs()) {
      for (const u of eqNodes) {
        if (!pairU.has(u)) {
          dfs(u);
        }
      }
    }

    // 2. Dulmage-Mendelsohn Alternating Reachability
    // Over-constrained: reachable from unmatched equations via alternating paths
    const overEqs = new Set<string>();
    const overVars = new Set<string>();
    const overQueue: string[] = [];

    for (const u of eqNodes) {
      if (!pairU.has(u)) {
        overEqs.add(u);
        overQueue.push(u);
      }
    }

    while (overQueue.length > 0) {
      const u = overQueue.shift()!;
      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (!overVars.has(v)) {
          overVars.add(v);
          const matchedU = pairV.get(v);
          if (matchedU && !overEqs.has(matchedU)) {
            overEqs.add(matchedU);
            overQueue.push(matchedU);
          }
        }
      }
    }

    // Under-constrained: reachable from unmatched variables via alternating paths (reverse)
    const varAdj = new Map<string, string[]>(); // var -> eqs
    for (const [u, neighbors] of adj.entries()) {
      for (const v of neighbors) {
        if (!varAdj.has(v)) varAdj.set(v, []);
        varAdj.get(v)!.push(u);
      }
    }

    const underVars = new Set<string>();
    const underEqs = new Set<string>();
    const underQueue: string[] = [];

    for (const v of varNodes) {
      if (!pairV.has(v)) {
        underVars.add(v);
        underQueue.push(v);
      }
    }

    while (underQueue.length > 0) {
      const v = underQueue.shift()!;
      const neighbors = varAdj.get(v) || [];
      for (const u of neighbors) {
        if (!underEqs.has(u)) {
          underEqs.add(u);
          const matchedV = pairU.get(u);
          if (matchedV && !underVars.has(matchedV)) {
            underVars.add(matchedV);
            underQueue.push(matchedV);
          }
        }
      }
    }

    // Well-constrained: neither over nor under
    const squareVars = new Set<string>();
    const squareEqs = new Set<string>();

    for (const v of varNodes) {
      if (!overVars.has(v) && !underVars.has(v)) {
        squareVars.add(v);
      }
    }

    for (const u of eqNodes) {
      if (!overEqs.has(u) && !underEqs.has(u)) {
        squareEqs.add(u);
      }
    }

    // Map back to original Constraint IDs
    const getConstraintIds = (eqSet: Set<string>): string[] => {
      const cIds = new Set<string>();
      for (const eq of eqSet) {
        const cId = eqConstraintMap.get(eq);
        if (cId) cIds.add(cId);
      }
      return Array.from(cIds);
    };

    const overConstraintIds = getConstraintIds(overEqs);
    const underConstraintIds = getConstraintIds(underEqs);
    const squareConstraintIds = getConstraintIds(squareEqs);

    const unmatchedEqCount = eqNodes.filter((u) => !pairU.has(u)).length;
    const unmatchedVarCount = varNodes.filter((v) => !pairV.has(v)).length;

    let status: DMResult["status"] = "well_constrained";
    if (unmatchedEqCount > 0) {
      status = "over_constrained";
    } else if (unmatchedVarCount > 0) {
      status = "under_constrained";
    }

    // 3. Tarjan SCC on G_square to construct Block Triangular Form (BTF)
    const squareVarList = Array.from(squareVars);
    const squareBlocks: { variables: string[]; constraints: string[] }[] = [];

    if (squareVarList.length > 0) {
      const sccAdj = new Map<string, string[]>();
      for (const v of squareVarList) {
        sccAdj.set(v, []);
      }

      for (const v of squareVarList) {
        const matchedU = pairV.get(v);
        if (matchedU) {
          const neighbors = adj.get(matchedU) || [];
          for (const otherV of neighbors) {
            if (otherV !== v && squareVars.has(otherV)) {
              sccAdj.get(v)!.push(otherV);
            }
          }
        }
      }

      let sccIndex = 0;
      const indices = new Map<string, number>();
      const lowlink = new Map<string, number>();
      const onStack = new Set<string>();
      const stack: string[] = [];

      const strongConnect = (v: string) => {
        indices.set(v, sccIndex);
        lowlink.set(v, sccIndex);
        sccIndex++;
        stack.push(v);
        onStack.add(v);

        for (const w of sccAdj.get(v) || []) {
          if (!indices.has(w)) {
            strongConnect(w);
            lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
          } else if (onStack.has(w)) {
            lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
          }
        }

        if (lowlink.get(v) === indices.get(v)) {
          const sccVars: string[] = [];
          let w = "";
          do {
            w = stack.pop()!;
            onStack.delete(w);
            sccVars.push(w);
          } while (w !== v);

          const blockEqs = new Set<string>();
          for (const sv of sccVars) {
            const mu = pairV.get(sv);
            if (mu) blockEqs.add(mu);
          }

          squareBlocks.push({
            variables: sccVars,
            constraints: getConstraintIds(blockEqs),
          });
        }
      };

      for (const v of squareVarList) {
        if (!indices.has(v)) {
          strongConnect(v);
        }
      }
    }

    // 4. Per-Connected-Component DOF: DOF_k = |V_k| - rank(J_k) - D_anchor,k
    // Eliminates the global -3 rigid-motion bug!
    const components = this.extractComponentDOFs(graph, pairV, overEqs, eqConstraintMap);

    return {
      underConstrained: {
        variables: Array.from(underVars),
        constraints: underConstraintIds,
        dof: underVars.size - underEqs.size,
      },
      wellConstrained: {
        variables: squareVarList,
        constraints: squareConstraintIds,
        blocks: squareBlocks,
      },
      overConstrained: {
        variables: Array.from(overVars),
        constraints: overConstraintIds,
        conflictingConstraints: overConstraintIds,
      },
      totalDof: Math.max(0, unmatchedVarCount),
      status,
      components,
    };
  }

  /**
   * Identifies connected components and computes kinematic degrees of freedom per component:
   * DOF_k = |V_k| - rank(J_k) - D_anchor,k (D_anchor = 0 if anchored, 3 if floating).
   */
  public static extractComponentDOFs(
    graph: BipartiteConstraintGraph,
    pairV: Map<string, string>,
    overEqs?: Set<string>,
    eqConstraintMap?: Map<string, string>
  ): ComponentDOF[] {
    const visitedEntities = new Set<string>();
    const components: ComponentDOF[] = [];
    let compCounter = 1;

    for (const [entId, ent] of graph.entities.entries()) {
      if (visitedEntities.has(entId)) continue;

      const compEntityIds: string[] = [];
      const queue = [entId];
      visitedEntities.add(entId);

      let isAnchored = !!(ent.degreesOfFreedom === 0 || (ent as any).isFixed);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        compEntityIds.push(curr);
        const currEnt = graph.entities.get(curr);
        if (currEnt && (currEnt.degreesOfFreedom === 0 || (currEnt as any).isFixed)) {
          isAnchored = true;
        }

        const linkedConstraints = graph.entityToConstraints.get(curr) || new Set();
        for (const cId of linkedConstraints) {
          const neighborEntities = graph.constraintToEntities.get(cId) || new Set();
          for (const nId of neighborEntities) {
            if (!visitedEntities.has(nId) && graph.entities.has(nId)) {
              visitedEntities.add(nId);
              queue.push(nId);
            }
          }
        }
      }

      // Collect variables for this component
      let varCount = 0;
      let matchedCount = 0;
      for (const eId of compEntityIds) {
        const e = graph.entities.get(eId);
        const dof = e?.degreesOfFreedom !== undefined ? e.degreesOfFreedom : 2;
        varCount += dof;
        for (let d = 0; d < dof; d++) {
          const vName = `${eId}_d${d}`;
          if (pairV.has(vName)) {
            matchedCount++;
          }
        }
      }

      // Rigid body anchor modes D_anchor,k:
      // In 2D, an unanchored body has 3 planar rigid motions (2 translations, 1 rotation).
      // If anchored, D_anchor = 0.
      const dAnchor = isAnchored ? 0 : Math.min(3, varCount);
      const dofK = Math.max(0, varCount - matchedCount - dAnchor);

      let compStatus: ComponentDOF["status"] = "well_constrained";
      const compConflicts: string[] = [];

      if (overEqs && eqConstraintMap) {
        for (const eId of compEntityIds) {
          const cIds = graph.entityToConstraints.get(eId) || new Set();
          for (const cId of cIds) {
            const constraint = graph.constraints.get(cId);
            const eqCount = constraint?.equationCount || 1;
            for (let e = 0; e < eqCount; e++) {
              if (overEqs.has(`${cId}_eq${e}`)) {
                compStatus = "over_constrained";
                if (!compConflicts.includes(cId)) compConflicts.push(cId);
              }
            }
          }
        }
      }

      if (compStatus !== "over_constrained") {
        if (dofK > 0 || varCount > matchedCount) {
          compStatus = "under_constrained";
        }
      }

      components.push({
        componentId: `comp_${compCounter++}`,
        entityIds: compEntityIds,
        variableCount: varCount,
        rank: matchedCount,
        isAnchored,
        dAnchor,
        dof: dofK,
        status: compStatus,
        conflictingConstraints: compConflicts,
      });
    }

    return components;
  }
}
