import { DulmageMendelsohnSolver } from "./dulmageMendelsohn";
import type {
  EntityNode,
  ConstraintNode,
  IBipartiteConstraintGraph,
  DMResult,
} from "./types";

export type { EntityNode, ConstraintNode };

export class BipartiteConstraintGraph implements IBipartiteConstraintGraph {
  public entities = new Map<string, EntityNode>();
  public constraints = new Map<string, ConstraintNode>();
  public entityToConstraints = new Map<string, Set<string>>();
  public constraintToEntities = new Map<string, Set<string>>();

  public addEntity(id: string, degreesOfFreedom: number = 2): void {
    const existing = this.entities.get(id);
    this.entities.set(id, {
      id,
      degreesOfFreedom,
      isFixed: existing?.isFixed ?? false,
    });
    if (!this.entityToConstraints.has(id)) {
      this.entityToConstraints.set(id, new Set());
    }
  }

  /**
   * §18 anchor rule. Marks one entity as the datum that removes the component's
   * three global rigid-body degrees of freedom. Idempotent, and safe to call
   * before the entity exists (it is created on demand).
   */
  public setAnchor(id: string): void {
    if (!this.entities.has(id)) this.addEntity(id, 2);
    const node = this.entities.get(id)!;
    this.entities.set(id, { ...node, isFixed: true });
    if (!this.entityToConstraints.has(id)) {
      this.entityToConstraints.set(id, new Set());
    }
  }

  /** Whether any entity has been anchored (§18). */
  public hasAnchor(): boolean {
    for (const e of this.entities.values()) if (e.isFixed) return true;
    return false;
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
