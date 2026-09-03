import { Point2D } from "../geometry/topology/types";
import { ParameterEntry } from "../parametric/parameterManager";
import { ConstraintDescriptor } from "../solver/jacobians/types";
import { ConstructionLine } from "../inference/datum/constructionLine";

export interface SegmentRecord {
  id: string;
  p1: Point2D;
  p2: Point2D;
}

export interface PersistentState {
  segments: SegmentRecord[];
  parameters: ParameterEntry[];
  constraints: ConstraintDescriptor[];
  constructionLines: ConstructionLine[];
}

export function createInitialPersistentState(): PersistentState {
  return {
    segments: [],
    parameters: [],
    constraints: [],
    constructionLines: [],
  };
}
