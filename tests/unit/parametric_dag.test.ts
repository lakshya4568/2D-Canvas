import { describe, it, expect } from "vitest";
import { ParameterManager } from "../../lib/parametric/parameterManager";
import { detectCyclesTarjan, topologicalSortDAG } from "../../lib/parametric/dag/tarjan";

describe("Parameter Manager & DAG Cycle Detection", () => {
  it("should categorize Driving, Dependent, and Fixed parameters", () => {
    const pm = new ParameterManager();
    pm.setDriving("Span_1", 300);
    pm.setFixed("Origin_X", 0);
    pm.setDependent("Span_2", "Span_1 * 1.5", 450);

    expect(pm.getParameter("Span_1")?.type).toBe("DRIVING");
    expect(pm.getParameter("Origin_X")?.type).toBe("FIXED");
    expect(pm.getParameter("Span_2")?.type).toBe("DEPENDENT");
    expect(pm.getValue("Span_2")).toBe(450);
  });

  it("should sort DAG in topological evaluation order", () => {
    // W -> H -> t -> area
    const edges = new Map<string, string[]>([
      ["W", ["H"]],
      ["H", ["t"]],
      ["t", ["area"]],
      ["area", []],
    ]);

    const order = topologicalSortDAG(edges);
    expect(order.indexOf("W")).toBeLessThan(order.indexOf("H"));
    expect(order.indexOf("H")).toBeLessThan(order.indexOf("t"));
    expect(order.indexOf("t")).toBeLessThan(order.indexOf("area"));
  });

  it("should detect dependency cycles using Tarjan SCC algorithm", () => {
    // A -> B -> C -> A (cycle) and D -> E (no cycle)
    const edges = new Map<string, string[]>([
      ["A", ["B"]],
      ["B", ["C"]],
      ["C", ["A"]],
      ["D", ["E"]],
      ["E", []],
    ]);

    const cycles = detectCyclesTarjan(edges);
    expect(cycles.length).toBe(1);
    expect(cycles[0].sort()).toEqual(["A", "B", "C"].sort());
  });
});
