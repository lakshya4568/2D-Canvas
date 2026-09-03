import { ParameterManager } from "./parameterManager";
import { BipartiteConstraintGraph } from "./graph/bipartiteGraph";
import { extractConnectedSubgraphsBFS, ConnectedSubgraph } from "./graph/bfsPartition";
import { evaluateFormula } from "./expression";
import { topologicalSortDAG, detectCyclesTarjan } from "./dag/tarjan";

export interface DualGraphExecutionReport {
  cyclesDetected: string[][];
  subgraphsSolved: number;
  evaluatedParameters: Record<string, number>;
}

export class DualGraphOrchestrator {
  public parameterManager: ParameterManager;
  public constraintGraph: BipartiteConstraintGraph;

  constructor(
    parameterManager: ParameterManager = new ParameterManager(),
    constraintGraph: BipartiteConstraintGraph = new BipartiteConstraintGraph()
  ) {
    this.parameterManager = parameterManager;
    this.constraintGraph = constraintGraph;
  }

  public preSolveDAGPass(): { values: Record<string, number>; cycles: string[][] } {
    const dependent = this.parameterManager.getDependentParameters();
    const driving = this.parameterManager.getDrivingParameters();
    const fixed = this.parameterManager.getFixedParameters();

    const currentValues: Record<string, number> = {};
    for (const p of driving) currentValues[p.name] = p.value;
    for (const p of fixed) currentValues[p.name] = p.value;
    for (const p of dependent) currentValues[p.name] = p.value;

    const dependencyEdges = new Map<string, string[]>();
    for (const p of this.parameterManager.getAll()) {
      dependencyEdges.set(p.name, []);
    }

    for (const dep of dependent) {
      if (!dep.formula) continue;
      for (const other of this.parameterManager.getAll()) {
        if (other.name !== dep.name && dep.formula.includes(other.name)) {
          dependencyEdges.get(other.name)!.push(dep.name);
        }
      }
    }

    const cycles = detectCyclesTarjan(dependencyEdges);
    if (cycles.length > 0) {
      return { values: currentValues, cycles };
    }

    const evalOrder = topologicalSortDAG(dependencyEdges);
    for (const paramName of evalOrder) {
      const param = this.parameterManager.getParameter(paramName);
      if (param && param.type === "DEPENDENT" && param.formula) {
        try {
          const res = evaluateFormula(param.formula, currentValues);
          if (res.error === undefined) {
            currentValues[paramName] = res.value;
            this.parameterManager.updateValue(paramName, res.value);
          }
        } catch {
          // Keep current fallback value if evaluation fails
        }
      }
    }

    return { values: currentValues, cycles: [] };
  }

  public partitionDirtySubgraphs(dirtyEntityIds: string[]): ConnectedSubgraph[] {
    return extractConnectedSubgraphsBFS(this.constraintGraph, dirtyEntityIds);
  }
}
