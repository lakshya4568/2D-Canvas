export interface ConstraintEvaluationResult {
  residuals: number[];
  jacobian: number[][]; // rows = residual count, cols = full state vector length
}

export type ConstraintType =
  | "COINCIDENT"
  | "HORIZONTAL"
  | "VERTICAL"
  | "DISTANCE"
  | "POINT_ON_LINE"
  | "PARALLEL"
  | "PERPENDICULAR"
  | "HAUNCH_45"
  | "WALL_THICKNESS";

export interface ConstraintDescriptor {
  id: string;
  type: ConstraintType;
  pointIndices: number[]; // Indices of points in the state vector (point i has coordinates at 2*i, 2*i+1)
  targetValue?: number;
  signX?: number; // For haunches (+1 or -1)
  signY?: number; // For haunches (+1 or -1)
  isActive?: boolean;
}
