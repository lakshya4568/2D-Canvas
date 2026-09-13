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
  | "DRAG_TARGET"
  // UPCE-ADDENDUM-2.0 additions. Each is an exact analytical row; none of them
  // is a finite-difference stand-in.
  | "CENTROID_DISTANCE"
  | "RELATIVE_OFFSET_X"
  | "RELATIVE_OFFSET_Y"
  | "DIRECTED_NORMAL_OFFSET"
  | "HAUNCH_LEG"
  | "CHIRALITY_BARRIER";

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
  /**
   * Ordered boundary point indices, for constraints written on a whole loop
   * rather than on a fixed number of points — the centroid pair needs one of
   * these per shape, and there is no upper bound on how many vertices a shape
   * has.
   */
  loopA?: number[];
  loopB?: number[];
  /** Barrier stiffness for CHIRALITY_BARRIER. */
  mu?: number;
  /** Which way the corner winds, for CHIRALITY_BARRIER and HAUNCH_LEG. */
  orientation?: 1 | -1;
  /** Second leg target, for HAUNCH_LEG. */
  targetValueB?: number;
}
