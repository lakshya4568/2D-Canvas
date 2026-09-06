import { BipartiteConstraintGraph } from "./bipartiteGraph";

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
}

export class DulmageMendelsohnSolver {
  public static decompose(graph: BipartiteConstraintGraph): DMResult {
    const varNodes: string[] = [];
    const entityVarMap = new Map<string, string[]>();

    for (const [entityId, entity] of graph.entities.entries()) {
      const vars: string[] = [];
      const dof = entity.degreesOfFreedom || 2;
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
    const netDof = Math.max(0, unmatchedVarCount);

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
      totalDof: netDof,
      status,
    };
  }
}
