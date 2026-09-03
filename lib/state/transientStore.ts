import { Point2D } from "../geometry/topology/types";
import { CompositeProperties } from "../geometry/metrics/polygonMoments";

export interface TransientState {
  coordinates: Map<string, Point2D>;
  degreesOfFreedom: number;
  isConverged: boolean;
  activeConstraintIds: string[];
  metrics: CompositeProperties | null;
}

export function createInitialTransientState(): TransientState {
  return {
    coordinates: new Map(),
    degreesOfFreedom: 0,
    isConverged: true,
    activeConstraintIds: [],
    metrics: null,
  };
}
