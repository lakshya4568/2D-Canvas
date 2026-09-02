/**
 * Dependency Graph Engine for Parametric CAD
 * Manages DAG relationships between Variables, Formulas, Constraints, and Geometry.
 * Provides cycle detection, topological sorting, and downstream dirty propagation.
 */

export interface GraphNode {
  id: string;
  name: string;
  type: "variable" | "shape_param" | "constraint";
  dependencies: Set<string>; // Nodes this node depends ON
  dependents: Set<string>;   // Nodes that depend ON this node
}

export interface CycleReport {
  hasCycle: boolean;
  cyclePath?: string[];
  message?: string;
}

export class DependencyGraph {
  private nodes = new Map<string, GraphNode>();

  /**
   * Registers or gets an existing node
   */
  public addNode(id: string, name = id, type: GraphNode["type"] = "variable"): GraphNode {
    let node = this.nodes.get(id);
    if (!node) {
      node = {
        id,
        name,
        type,
        dependencies: new Set<string>(),
        dependents: new Set<string>(),
      };
      this.nodes.set(id, node);
    } else {
      node.name = name;
      node.type = type;
    }
    return node;
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  public getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Removes a node and all associated dependency edges
   */
  public removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove from dependencies of other nodes
    for (const depId of node.dependencies) {
      const depNode = this.nodes.get(depId);
      depNode?.dependents.delete(id);
    }

    // Remove from dependents
    for (const depId of node.dependents) {
      const depNode = this.nodes.get(depId);
      depNode?.dependencies.delete(id);
    }

    this.nodes.delete(id);
  }

  /**
   * Sets dependencies for a given node: 'nodeId' depends on 'dependsOnIds'
   */
  public setDependencies(nodeId: string, dependsOnIds: string[]): void {
    const node = this.addNode(nodeId);

    // Clear old dependencies
    for (const oldDep of node.dependencies) {
      const depNode = this.nodes.get(oldDep);
      depNode?.dependents.delete(nodeId);
    }
    node.dependencies.clear();

    // Add new dependencies
    for (const depId of dependsOnIds) {
      if (depId === nodeId) continue; // Avoid trivial self-loop
      this.addNode(depId);
      node.dependencies.add(depId);
      this.nodes.get(depId)!.dependents.add(nodeId);
    }
  }

  /**
   * Detects circular dependencies across the graph using DFS with recursion stack
   */
  public detectCycles(): CycleReport {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (currId: string): boolean => {
      visited.add(currId);
      recStack.add(currId);
      path.push(currId);

      const node = this.nodes.get(currId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recStack.has(depId)) {
            path.push(depId);
            return true;
          }
        }
      }

      recStack.delete(currId);
      path.pop();
      return false;
    };

    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) {
        if (dfs(id)) {
          // Extract the loop part of the cycle
          const startIdx = path.indexOf(path[path.length - 1]);
          const cycle = path.slice(startIdx);
          return {
            hasCycle: true,
            cyclePath: cycle,
            message: `Circular dependency detected: ${cycle.join(" -> ")}`,
          };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Computes topological sort of all nodes using Kahn's algorithm
   * Returns evaluation order where dependencies come before dependents.
   */
  public getEvaluationOrder(): { order: string[]; error?: string } {
    const cycleCheck = this.detectCycles();
    if (cycleCheck.hasCycle) {
      return { order: [], error: cycleCheck.message };
    }

    // In-degree: number of dependencies a node has
    const inDegree = new Map<string, number>();
    for (const [id, node] of this.nodes.entries()) {
      inDegree.set(id, node.dependencies.size);
    }

    // Queue nodes with 0 dependencies
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      order.push(curr);

      const node = this.nodes.get(curr);
      if (node) {
        for (const dependentId of node.dependents) {
          const currentDeg = inDegree.get(dependentId)! - 1;
          inDegree.set(dependentId, currentDeg);
          if (currentDeg === 0) {
            queue.push(dependentId);
          }
        }
      }
    }

    if (order.length !== this.nodes.size) {
      return { order: [], error: "Graph contains unresolved dependencies or cycles" };
    }

    return { order };
  }

  /**
   * Alias for getEvaluationOrder().order, falls back to all node keys if cycle exists.
   */
  public topologicalSort(): string[] {
    const res = this.getEvaluationOrder();
    return res.order.length > 0 ? res.order : Array.from(this.nodes.keys());
  }

  /**
   * Given a list of changed/dirty variable IDs, returns all affected downstream nodes in topological order.
   */
  public getDownstreamOrder(changedIds: string[]): { order: string[]; error?: string } {
    const cycleCheck = this.detectCycles();
    if (cycleCheck.hasCycle) {
      return { order: [], error: cycleCheck.message };
    }

    // Find all reachable downstream nodes
    const affected = new Set<string>();
    const queue = [...changedIds];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const node = this.nodes.get(curr);
      if (node) {
        for (const depId of node.dependents) {
          if (!affected.has(depId)) {
            affected.add(depId);
            queue.push(depId);
          }
        }
      }
    }

    // Filter full topological order to only affected nodes
    const fullOrder = this.getEvaluationOrder();
    if (fullOrder.error) return { order: [], error: fullOrder.error };

    const filtered = fullOrder.order.filter((id) => affected.has(id));
    return { order: filtered };
  }

  /**
   * Resets and clears the graph
   */
  public clear(): void {
    this.nodes.clear();
  }
}
