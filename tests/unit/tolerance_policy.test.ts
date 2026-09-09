import { describe, it, expect } from "vitest";
import {
  DEFAULT_TOLERANCE_POLICY,
  createTolerancePolicy,
  getScaleAwareDistanceTolerance,
  TolerancePolicy,
} from "../../lib/geometry/tolerance";

describe("TolerancePolicy (§17 & §2 Constraint 4)", () => {
  it("enforces canonical mm units and frozen default policy", () => {
    expect(DEFAULT_TOLERANCE_POLICY.units).toBe("mm");
    expect(DEFAULT_TOLERANCE_POLICY.weld_mm).toBe(0.5);
    expect(DEFAULT_TOLERANCE_POLICY.geometry_mm).toBe(0.5);
    expect(DEFAULT_TOLERANCE_POLICY.cluster_mm).toBe(1.0);
    expect(DEFAULT_TOLERANCE_POLICY.angle_rad).toBeCloseTo(0.0087266, 6);
    expect(DEFAULT_TOLERANCE_POLICY.collinear_rad).toBe(0.05);
    expect(DEFAULT_TOLERANCE_POLICY.solver_residual).toBe(1e-8);
    expect(DEFAULT_TOLERANCE_POLICY.singular_value_eps).toBe(1e-10);
    expect(DEFAULT_TOLERANCE_POLICY.independence_eps).toBe(1e-6);
    expect(DEFAULT_TOLERANCE_POLICY.snap_import_mm).toBe(2.0);

    // Assert immutability
    expect(Object.isFrozen(DEFAULT_TOLERANCE_POLICY)).toBe(true);
    expect(() => {
      // @ts-expect-error mutating frozen object
      DEFAULT_TOLERANCE_POLICY.weld_mm = 1.0;
    }).toThrow();
  });

  it("allows valid overrides and returns an immutable policy", () => {
    const custom = createTolerancePolicy({
      weld_mm: 0.25,
      cluster_mm: 2.0,
    });

    expect(custom.weld_mm).toBe(0.25);
    expect(custom.cluster_mm).toBe(2.0);
    expect(custom.geometry_mm).toBe(0.5); // Preserved from default
    expect(custom.units).toBe("mm");
    expect(Object.isFrozen(custom)).toBe(true);
  });

  it("rejects invalid, negative, zero, or non-finite tolerances", () => {
    expect(() => createTolerancePolicy({ weld_mm: -0.5 })).toThrow();
    expect(() => createTolerancePolicy({ weld_mm: 0 })).toThrow();
    expect(() => createTolerancePolicy({ geometry_mm: NaN })).toThrow();
    expect(() => createTolerancePolicy({ angle_rad: Infinity })).toThrow();
  });

  it("computes scale-aware distance tolerances deterministically", () => {
    // For small or undefined extents, defaults to geometry_mm (0.5 mm)
    expect(getScaleAwareDistanceTolerance(DEFAULT_TOLERANCE_POLICY)).toBe(0.5);
    expect(getScaleAwareDistanceTolerance(DEFAULT_TOLERANCE_POLICY, 100)).toBe(0.5);

    // For large bridge GAD drawing extent (e.g. 20,000 mm = 20 m), 0.1% relTol is 20 mm
    const largeExtent = 20000;
    expect(getScaleAwareDistanceTolerance(DEFAULT_TOLERANCE_POLICY, largeExtent, 0.001)).toBe(20.0);
  });
});
