import { describe, it, expect } from "vitest";
import { DualGraphOrchestrator } from "../../lib/parametric/dualGraphOrchestrator";
import { ParameterManager } from "../../lib/parametric/parameterManager";

describe("Dual Graph AST Dependency Extraction (Substring Bug Immunity)", () => {
  it("should not falsely link parameter 'W' to formulas referencing 'WallThickness'", () => {
    const pm = new ParameterManager();
    pm.setDriving("W", 100);
    pm.setDriving("WallThickness", 30);
    pm.setDependent("InnerW", "WallThickness * 2"); // Contains 'W' in 'WallThickness'

    const orchestrator = new DualGraphOrchestrator(pm);
    const report = orchestrator.preSolveDAGPass();

    expect(report.cycles).toHaveLength(0);
    expect(report.values["InnerW"]).toBe(60);
  });

  it("should correctly resolve genuine multi-hop AST formula chains", () => {
    const pm = new ParameterManager();
    pm.setDriving("Span", 400);
    pm.setDriving("WallThickness", 30);
    pm.setDependent("ClearSpan", "Span - 2 * WallThickness");
    pm.setDependent("HalfClearSpan", "ClearSpan / 2");

    const orchestrator = new DualGraphOrchestrator(pm);
    const report = orchestrator.preSolveDAGPass();

    expect(report.cycles).toHaveLength(0);
    expect(report.values["ClearSpan"]).toBe(340);
    expect(report.values["HalfClearSpan"]).toBe(170);
  });

  it("should detect true circular dependency cycles", () => {
    const pm = new ParameterManager();
    pm.setDependent("A", "B + 10");
    pm.setDependent("B", "A + 5");

    const orchestrator = new DualGraphOrchestrator(pm);
    const report = orchestrator.preSolveDAGPass();

    expect(report.cycles.length).toBeGreaterThan(0);
  });
});
