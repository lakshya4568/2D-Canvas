export interface ConstraintEvaluationResult {
  residuals: number[];
  jacobian: number[][]; // rows = residual count, cols = full state vector length
}

export type ConstraintType =
  | "COINCIDENT"
  | "HORIZONTAL"
  | "VERTICAL"
  | "DISTANCE"
  | "SQUARED_DISTANCE"
  | "POINT_ON_LINE"
  | "PARALLEL"
  | "PERPENDICULAR"
  | "HAUNCH_45"
  | "HAUNCH_LEG_EQUALITY"
  | "WALL_THICKNESS"
  | "DIRECTED_WALL_OFFSET"
  | "ANGLE"
  | "CONCENTRIC"
  | "RADIAL_OFFSET"
  | "TANGENCY"
  | "POINT_ON_ARC"
  | "SYMMETRY"
  | "DRAG_TARGET";

export interface ConstraintDescriptor {
  id: string;
  type: ConstraintType;
  pointIndices: number[]; // Indices of points in the state vector (point i has coordinates at 2*i, 2*i+1)
  targetValue?: number;
  targetRadius?: number;
  targetAngleRad?: number;
  targetX?: number;
  targetY?: number;
  signX?: number; // For haunches (+1 or -1)
  signY?: number; // For haunches (+1 or -1)
  isActive?: boolean;
}
