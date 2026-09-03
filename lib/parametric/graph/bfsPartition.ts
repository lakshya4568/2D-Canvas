import { BipartiteConstraintGraph } from "./bipartiteGraph";

export interface ConnectedSubgraph {
  entityIds: Set<string>;
  constraintIds: Set<string>;
}

export function extractConnectedSubgraphsBFS(
  graph: BipartiteConstraintGraph,
  dirtyEntityIds: string[]
): ConnectedSubgraph[] {
  const visitedEntities = new Set<string>();
  const visitedConstraints = new Set<string>();
  const subgraphs: ConnectedSubgraph[] = [];

  for (const startEntityId of dirtyEntityIds) {
    if (visitedEntities.has(startEntityId) || !graph.entities.has(startEntityId)) {
      continue;
    }

    const currentSubgraph: ConnectedSubgraph = {
      entityIds: new Set(),
      constraintIds: new Set(),
    };

    const queue: string[] = [startEntityId];
    visitedEntities.add(startEntityId);
    currentSubgraph.entityIds.add(startEntityId);

    while (queue.length > 0) {
      const currentEntityId = queue.shift()!;
      const linkedConstraints = graph.entityToConstraints.get(currentEntityId) || new Set();

      for (const constraintId of linkedConstraints) {
        if (!visitedConstraints.has(constraintId)) {
          visitedConstraints.add(constraintId);
          currentSubgraph.constraintIds.add(constraintId);

          const neighborEntities = graph.constraintToEntities.get(constraintId) || new Set();
          for (const neighborId of neighborEntities) {
            if (!visitedEntities.has(neighborId)) {
              visitedEntities.add(neighborId);
              currentSubgraph.entityIds.add(neighborId);
              queue.push(neighborId);
            }
          }
        }
      }
    }

    subgraphs.push(currentSubgraph);
  }

  return subgraphs;
}
