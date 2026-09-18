/**
 * Railway domain rules and the GAD audit. Every threshold here is the one
 * read from the IRBM-2024 / IRCM text (see lib/bridge/sources.ts).
 */

import { describe, it, expect } from "vitest";
import { classifyBridge, relaxedFreeBoard, requiredVerticalClearance } from "@/lib/bridge/classification";
import { runAudit, auditToText } from "@/lib/bridge/audit";
import { drawingReducer, initialDrawingState, type DrawingAction, type DrawingState } from "@/lib/state/drawingReducer";
import type { BridgeProject, DbrField } from "@/lib/bridge/project";

function run(actions: DrawingAction[], from: DrawingState = initialDrawingState): DrawingState {
  return actions.reduce((s, a) => drawingReducer(s, a), from);
}

const confirmed = (value: number | string): DbrField<never> => ({ value: value as never, status: "CONFIRMED_APPROVED", sourceId: "irbm-313" });

function completeProject(p: BridgeProject): BridgeProject {
  return {
    ...p,
    identity: { ...p.identity, railway: "Northern Railway", projectName: "Doubling A–B", drawingNumber: "NR/BR/123", bridgeNumber: "123", chainage: "km 45/6-7", sanctionReference: "PB 2025-26 item 12" },
    approvals: p.approvals.map((a) => ({ ...a, name: "X" })),
    dbr: {
      ...p.dbr,
      railLevel: confirmed(106.5),
      formationLevel: confirmed(105.6),
      hfl: confirmed(102.6),
      lwl: confirmed(100.8),
      bedLevel: confirmed(100),
      foundationLevel: confirmed(97),
      boreLogReference: confirmed("BH-1 to BH-4"),
      safeBearingCapacity: confirmed(25),
      designDischarge: confirmed(250),
      loadingStandard: confirmed("25 t Loading-2008"),
      seismicZone: confirmed("III"),
      exposureCondition: confirmed("Moderate"),
    },
    notes: [...p.notes, "Codes: IRS Bridge Substructure & Foundation Code and IRBM."],
  };
}

describe("IRBM 1103(3) classification", () => {
  it("important by waterway length or area, or by CE", () => {
    expect(classifyBridge({ linearWaterwayM: 300 }).suggested).toBe("important");
    expect(classifyBridge({ linearWaterwayM: 50, totalWaterwayAreaM2: 1000 }).suggested).toBe("important");
    expect(classifyBridge({ linearWaterwayM: 5, classifiedImportantByCE: true }).suggested).toBe("important");
  });
  it("major by total waterway ≥ 18 m or any clear opening ≥ 12 m", () => {
    expect(classifyBridge({ linearWaterwayM: 18 }).suggested).toBe("major");
    expect(classifyBridge({ linearWaterwayM: 12, maxClearOpeningM: 12 }).suggested).toBe("major");
  });
  it("otherwise minor", () => {
    expect(classifyBridge({ linearWaterwayM: 6, maxClearOpeningM: 3 }).suggested).toBe("minor");
  });
});

describe("IRBM 312 / 313 tables", () => {
  it("vertical clearance by discharge, pro-rata between 31 and 300 cumecs", () => {
    expect(requiredVerticalClearance(20)).toBe(600);
    expect(requiredVerticalClearance(165)).toBeCloseTo(900, 6);
    expect(requiredVerticalClearance(300)).toBe(1200);
    expect(requiredVerticalClearance(1000)).toBe(1500);
    expect(requiredVerticalClearance(5000)).toBe(1800);
  });
  it("free board relaxations only up to 30 cumecs", () => {
    expect(relaxedFreeBoard(2)).toBe(600);
    expect(relaxedFreeBoard(20)).toBe(750);
    expect(relaxedFreeBoard(40)).toBeNull();
  });
});

describe("GAD audit", () => {
  it("guide acceptance test 5: a missing bore-log reference blocks issue", () => {
    let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } }]);
    const p = completeProject(s.cad.project);
    s = run([{ type: "CAD_SET_PROJECT", project: { ...p, dbr: { ...p.dbr, boreLogReference: { status: "NOT_AVAILABLE" } } } }], s);
    const r = runAudit(s.shapes, s.cad);
    expect(r.issueBlocked).toBe(true);
    const f = r.results.find((x) => x.ruleId === "DATA-boreLogReference")!;
    expect(f.severity).toBe("blocker");
    expect(f.sourceIds).toContain("ircm-t403");
  });

  it("a drawing level that disagrees with the design basis is an error", () => {
    let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 }, values: { HFL: 102.9 } }]);
    s = run([{ type: "CAD_SET_PROJECT", project: completeProject(s.cad.project) }], s);
    const r = runAudit(s.shapes, s.cad);
    const f = r.results.find((x) => x.ruleId === "CONS-HFL");
    expect(f?.severity).toBe("error");
    expect(f?.message).toMatch(/102\.900.*102\.600/);
  });

  it("free board below 1 m fails with the relaxation that would apply", () => {
    let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 }, values: { HFL: 104.9 } }]);
    const p = completeProject(s.cad.project);
    s = run([{ type: "CAD_SET_PROJECT", project: { ...p, dbr: { ...p.dbr, hfl: confirmed(104.9), designDischarge: confirmed(20) } } }], s);
    const r = runAudit(s.shapes, s.cad);
    const f = r.results.find((x) => x.ruleId === "RLY-FREEBOARD")!;
    expect(f.status).toBe("fail");
    expect(f.message).toMatch(/750 mm/);
  });

  it("vertical clearance is checked against the discharge, and culverts are exempt", () => {
    let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } }]);
    s = run([{ type: "CAD_SET_PROJECT", project: completeProject(s.cad.project) }], s);
    const f = runAudit(s.shapes, s.cad).results.find((x) => x.ruleId === "RLY-VERT-CLEAR")!;
    expect(f.message).toMatch(/Q = 250 cumecs/);
    const c = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.gad", at: { x: 0, y: 0 } }]);
    const fc = runAudit(c.shapes, c.cad).results.find((x) => x.ruleId === "RLY-VERT-CLEAR")!;
    expect(fc.status).toBe("pass");
    expect(fc.sourceIds).toContain("irbm-312");
  });

  it("pile spacing is reviewed against 409 for the pile type", () => {
    const s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.pile_group.plan", at: { x: 0, y: 0 }, values: { PileDiameter: 1200, SpacingX: 3000, SpacingY: 3000, PileType: 2 } }]);
    const r = runAudit(s.shapes, s.cad);
    const f = r.results.find((x) => x.ruleId === "RLY-PILE-SPACING-MIN")!;
    expect(f.message).toMatch(/3 d = 3600/);
    expect(f.status).toBe("requires_review");
  });

  it("template defaults for design values are flagged, never passed as design facts", () => {
    const s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.section", at: { x: 0, y: 0 } }]);
    const f = runAudit(s.shapes, s.cad).results.find((x) => x.ruleId === "PARAM-TEMPLATE-DEFAULT")!;
    expect(f.status).toBe("requires_review");
    expect(f.parameterNames).toContain("ClearSpan");
  });

  it("guide acceptance test 7: temporary works on a permanent layer are an error", () => {
    const s = run([{ type: "ADD_SHAPE", shape: { id: "T1", type: "line", x1: 0, y1: 0, x2: 1000, y2: 0, semanticRole: "temporary_staging", layerId: "BRG-OUTLINE" } }]);
    expect(runAudit(s.shapes, s.cad).results.some((x) => x.ruleId === "STD-TEMP-WORKS" && x.severity === "error")).toBe(true);
    const ok = run([{ type: "CAD_SET_ENTITY_LAYER", ids: ["T1"], layerId: "TEMP-WORKS" }], s);
    expect(runAudit(ok.shapes, ok.cad).results.some((x) => x.ruleId === "STD-TEMP-WORKS")).toBe(false);
  });

  it("APPROVED with unsigned boxes is a blocker; the text report names sources", () => {
    let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.gad", at: { x: 0, y: 0 } }]);
    s = run([{ type: "CAD_SET_PROJECT", project: { ...completeProject(s.cad.project), drawingStatus: "APPROVED" } }], s);
    const r = runAudit(s.shapes, s.cad);
    expect(r.results.some((x) => x.ruleId === "APPR-UNSIGNED")).toBe(true);
    expect(auditToText(r)).toMatch(/Indian Railways Bridge Manual, Para 317/);
  });
});
