/**
 * Unified Tolerance Policy for the Parametric CAD Engine
 * UPCE-MASTER-1.0 §17: "Five conflicting vertex-weld tolerances across five files
 * was a confirmed latent correctness bug in the existing code. It is fixed by a
 * single shared policy object, and no module may define its own."
 *
 * All tolerances are expressed in absolute real-world model-space millimetres,
 * NEVER in pixels and NEVER scaled by viewport zoom.
 */

export interface TolerancePolicy {
  /** Internal canonical length unit. Must ALWAYS be 'mm'. */
  readonly units: 'mm';

  /** Topological vertex welding radius (union-find) in model-space mm. Default: 0.5 mm */
  readonly weld_mm: number;

  /** Predicate distance comparisons (P3, P7, P8, etc.) in model-space mm. Default: 0.5 mm */
  readonly geometry_mm: number;

  /** 1-D parameter value clustering bin size (DBSCAN/histogram) in mm. Default: 1.0 mm */
  readonly cluster_mm: number;

  /** Predicate angular comparison threshold in radians. Default: 0.008726 rad (~0.5°) */
  readonly angle_rad: number;

  /** Collinearity angular threshold in radians. Default: 0.05 rad (~2.86°) */
  readonly collinear_rad: number;

  /** Solver convergence threshold: ‖F(X)‖∞ < solver_residual. Default: 1e-8 */
  readonly solver_residual: number;

  /** Numerical SVD rank determination threshold (singular values < eps are null). Default: 1e-10 */
  readonly singular_value_eps: number;

  /** SVD row-space admissibility threshold ‖g⊥‖. Default: 1e-6 */
  readonly independence_eps: number;

  /** Endpoint snapping tolerance during vector PDF/DXF ingestion. Default: 2.0 mm */
  readonly snap_import_mm: number;
}

/**
 * The standard, immutable default tolerance policy.
 */
export const DEFAULT_TOLERANCE_POLICY: Readonly<TolerancePolicy> = Object.freeze({
  units: 'mm',
  weld_mm: 0.5,
  geometry_mm: 0.5,
  cluster_mm: 1.0,
  angle_rad: 0.008726646259971648, // 0.5 * Math.PI / 180
  collinear_rad: 0.05,
  solver_residual: 1e-8,
  singular_value_eps: 1e-10,
  independence_eps: 1e-6,
  snap_import_mm: 2.0,
});

/**
 * Creates a validated TolerancePolicy with optional overrides.
 * Guarantees all tolerance values are strictly positive and finite.
 */
export function createTolerancePolicy(
  overrides?: Partial<Omit<TolerancePolicy, 'units'>>
): Readonly<TolerancePolicy> {
  const candidate: TolerancePolicy = {
    ...DEFAULT_TOLERANCE_POLICY,
    ...overrides,
    units: 'mm', // Non-negotiable canonical unit
  };

  const numericKeys: (keyof Omit<TolerancePolicy, 'units'>)[] = [
    'weld_mm',
    'geometry_mm',
    'cluster_mm',
    'angle_rad',
    'collinear_rad',
    'solver_residual',
    'singular_value_eps',
    'independence_eps',
    'snap_import_mm',
  ];

  for (const key of numericKeys) {
    const val = candidate[key];
    if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
      throw new Error(
        `[TolerancePolicy] Invalid tolerance for '${key}': ${val}. Must be a finite positive number.`
      );
    }
  }

  return Object.freeze(candidate);
}

/**
 * Optional scale-aware distance tolerance variant (UPCE-MASTER-1.0 §17):
 * ε_d = max(abs_tol, rel_tol * drawingExtent)
 * Owned exclusively by the policy; call sites NEVER hand-roll this calculation.
 */
export function getScaleAwareDistanceTolerance(
  policy: TolerancePolicy,
  drawingExtent?: number,
  relTol: number = 0.001 // 0.1%
): number {
  if (drawingExtent === undefined || drawingExtent <= 0) {
    return policy.geometry_mm;
  }
  return Math.max(policy.geometry_mm, relTol * drawingExtent);
}
