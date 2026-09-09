import { DulmageMendelsohnSolver, DMResult } from "./dulmageMendelsohn";

export interface EntityNode {
  id: string;
  degreesOfFreedom: number;
}

export interface ConstraintNode {
  id: string;
  entityIds: string[];
  equationCount: number;
}

export class BipartiteConstraintGraph {
  public entities = new Map<string, EntityNode>();
  public constraints = new Map<string, ConstraintNode>();
  public entityToConstraints = new Map<string, Set<string>>();
  public constraintToEntities = new Map<string, Set<string>>();

  public addEntity(id: string, degreesOfFreedom: number = 2): void {
    this.entities.set(id, { id, degreesOfFreedom });
    if (!this.entityToConstraints.has(id)) {
      this.entityToConstraints.set(id, new Set());
    }
  }

  public addConstraint(
    id: string,
    entityIds: string[],
    equationCount: number = 1
  ): void {
    this.constraints.set(id, { id, entityIds, equationCount });
    this.constraintToEntities.set(id, new Set(entityIds));

    for (const entityId of entityIds) {
      if (!this.entities.has(entityId)) {
        this.addEntity(entityId, 2);
      }
      this.entityToConstraints.get(entityId)!.add(id);
    }
  }

  public calculateDegreesOfFreedom(): number {
    const dm = this.decomposeDM();
    let totalDof = 0;
    for (const comp of dm.components) {
      totalDof += comp.dof;
    }
    return totalDof;
  }

  public decomposeDM(): DMResult {
    return DulmageMendelsohnSolver.decompose(this);
  }
}
