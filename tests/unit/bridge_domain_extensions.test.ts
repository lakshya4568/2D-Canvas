/**
 * Verification test suite for bridge-domain extensions:
 * - 6 new modular drafting skills (substructure, foundations, seismic, river training, skew, GAD assembly)
 * - Corpus lookups across new sections (SUB-*, FDN-*, SEI-*, RTW-*, SKW-*, GAD-*)
 * - New codal audit checks (SEISMIC-MIN-SEATING, IRBM-BOULDER-BACKING, SKEW-ROB-DIAPHRAGM)
 */

import { describe, it, expect } from "vitest";
import { findSkill, DRAFTING_SKILLS } from "@/lib/agent/drafter/skills";
import { findKnowledge, searchKnowledge } from "@/lib/bridge/knowledge";
import { runAudit } from "@/lib/bridge/audit";
import { drawingReducer, initialDrawingState, type DrawingAction, type DrawingState } from "@/lib/state/drawingReducer";
import type { BridgeProject, DbrField } from "@/lib/bridge/project";

function run(actions: DrawingAction[], from: DrawingState = initialDrawingState): DrawingState {
  return actions.reduce((s, a) => drawingReducer(s, a), from);
}

const confirmed = (value: number | string): DbrField<never> => ({
  value: value as never,
  status: "CONFIRMED_APPROVED",
  sourceId: "irbm-313",
});

function baseProject(p: BridgeProject): BridgeProject {
  return {
    ...p,
    identity: {
      ...p.identity,
      railway: "Western Railway",
      projectName: "Doubling X–Y",
      drawingNumber: "WR/BR/2026/01",
      bridgeNumber: "42",
      chainage: "km 120/4-5",
      sanctionReference: "Pink Book 2025-26 Item 4",
    },
    approvals: p.approvals.map((a) => ({ ...a, name: "Chief Bridge Engineer" })),
    dbr: {
      ...p.dbr,
      railLevel: confirmed(105.0),
      formationLevel: confirmed(104.2),
      hfl: confirmed(101.5),
      lwl: confirmed(99.0),
      bedLevel: confirmed(98.0),
      foundationLevel: confirmed(93.0),
      boreLogReference: confirmed("BH-01 to BH-04"),
      safeBearingCapacity: confirmed(300),
      designDischarge: confirmed(150),
      loadingStandard: confirmed("25 t Loading-2008"),
      seismicZone: confirmed("IV"),
      exposureCondition: confirmed("Severe"),
    },
    notes: [
      "Codes: IRS Bridge Substructure & Foundation Code, IRBM-2024, RDSO BS-118.",
      "Field engineers must verify bed level and founding strata against bore log BH-01.",
    ],
  };
}

describe("Bridge Domain Skills", () => {
  const NEW_SKILLS = [
    "substructure-piers-abutments",
    "foundations-well-pile-open",
    "seismic-detailing-bearings",
    "river-training-protection",
    "skew-bridge-drafting",
    "gad-assembly-workflow",
  ];

  it("registers all 6 new modular skills", () => {
    for (const name of NEW_SKILLS) {
      const skill = findSkill(name);
      expect(skill, `Skill "${name}" must be found`).toBeDefined();
      expect(skill?.name).toBe(name);
      expect(skill?.title.length).toBeGreaterThan(10);
      expect(skill?.when.length).toBeGreaterThan(10);
      expect(skill?.body.length).toBeGreaterThan(100);
    }
  });

  it("skills strictly follow zero-library-component invariant", () => {
    for (const name of NEW_SKILLS) {
      const skill = findSkill(name)!;
      expect(skill.body).not.toMatch(/insert_component/);
      expect(skill.body).not.toMatch(/list_components/);
      expect(skill.body).not.toMatch(/\bir\.[a-z_]+\.[a-z_]+/);
    }
  });

  it("every cited formula exists in the compiled knowledge corpus", () => {
    for (const name of NEW_SKILLS) {
      const skill = findSkill(name)!;
      const matches = [...skill.body.matchAll(/\b([A-Z]{2,4}-[A-Z]{2,4}-\d{3})\b/g)];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const formulaId = m[1];
        const entry = findKnowledge(formulaId);
        expect(entry, `Formula ${formulaId} cited by ${name} must exist in knowledge corpus`).toBeDefined();
      }
    }
  });
});

describe("Bridge Knowledge Retrieval across new domains", () => {
  it("retrieves substructure pier and abutment formulas", () => {
    const batter = findKnowledge("SUB-BAT-001");
    expect(batter).toBeDefined();
    expect(batter?.title).toMatch(/Batter/i);

    const bck = findKnowledge("SUB-BCK-001");
    expect(bck).toBeDefined();
    expect(bck?.body).toMatch(/600 mm/);
  });

  it("retrieves foundation formulas (open, well, pile)", () => {
    const fdn = findKnowledge("FDN-OPN-001");
    expect(fdn).toBeDefined();
    expect(fdn?.body).toMatch(/1\.75 m/);

    const pile = findKnowledge("FDN-PIL-001");
    expect(pile).toBeDefined();
    expect(pile?.body).toMatch(/2\.5/);
  });

  it("retrieves seismic design and seating width formulas (RDSO BS-118)", () => {
    const seat = findKnowledge("SEI-SEAT-001");
    expect(seat).toBeDefined();
    expect(seat?.body).toMatch(/300 \+ 1\.5 \* L/);
    expect(seat?.body).toMatch(/500 \+ 2\.5 \* L/);

    const exemp = findKnowledge("SEI-COE-002");
    expect(exemp).toBeDefined();
    expect(exemp?.body).toMatch(/Box culverts and pipe culverts NEED NOT be analysed/);
  });

  it("retrieves river training and protection formulas (IRBM Chapter VIII)", () => {
    const gb = findKnowledge("RTW-GB-001");
    expect(gb).toBeDefined();
    expect(gb?.body).toMatch(/1\.0 \* L/);

    const apron = findKnowledge("RTW-APR-001");
    expect(apron).toBeDefined();
    expect(apron?.body).toMatch(/1\.5 \* \(D_scour/);
  });

  it("retrieves skew composite girder formulas (RDSO/B-11778/14 & 15)", () => {
    const skew = findKnowledge("SKW-GEO-001");
    expect(skew).toBeDefined();
    expect(skew?.body).toMatch(/cos\(theta\)/);

    const dph = findKnowledge("SKW-DPH-001");
    expect(dph).toBeDefined();
    expect(dph?.body).toMatch(/perpendicular/i);
  });

  it("retrieves GAD composition and numbering conventions", () => {
    const num = findKnowledge("GAD-NUM-001");
    expect(num).toBeDefined();
    expect(num?.body).toMatch(/A1/);

    const hfl = findKnowledge("GAD-HFL-001");
    expect(hfl).toBeDefined();
    expect(hfl?.body).toMatch(/50 mm/);
  });

  it("searches knowledge corpus with semantic queries", () => {
    const resSeismic = searchKnowledge("minimum seating width seismic zone", 3);
    expect(resSeismic.map((r) => r.id)).toContain("SEI-SEAT-001");

    const resBoulder = searchKnowledge("hand-packed boulder backing abutment", 3);
    expect(resBoulder.map((r) => r.id)).toContain("SUB-BCK-001");

    const resSkew = searchKnowledge("intermediate diaphragm perpendicular skew", 3);
    expect(resSkew.map((r) => r.id)).toContain("SKW-DPH-001");
  });
});

describe("Codal Audit Checks", () => {
  describe("SEISMIC-MIN-SEATING (RDSO BS-118 Cl. 14.3)", () => {
    it("exempts box culverts per Clause 4.4", () => {
      let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.box_culvert.gad", at: { x: 0, y: 0 } }]);
      s = run([{ type: "CAD_SET_PROJECT", project: baseProject(s.cad.project) }], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "SEISMIC-MIN-SEATING");
      expect(result).toBeDefined();
      expect(result?.status).toBe("pass");
      expect(result?.message).toMatch(/exempt/i);
      expect(result?.sourceIds).toContain("rdso-bs-118");
    });

    it("evaluates required seating shelf on girder bridge and fails when too narrow", () => {
      let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } }]);
      const p = baseProject(s.cad.project);
      // Zone IV: W_req = 500 + 2.5 * 30 + 10 * 0 = 575 mm
      // If we provide 400 mm shelf:
      s = run([
        { type: "CAD_SET_PROJECT", project: p },
        {
          type: "ADD_SHAPE",
          shape: {
            id: "SHELF1",
            type: "line",
            x1: 0,
            y1: 0,
            x2: 400,
            y2: 0,
            semanticRole: "bearing_shelf",
            layerId: "BRG-OUTLINE",
          },
        },
      ], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "SEISMIC-MIN-SEATING");
      expect(result).toBeDefined();
      expect(result?.status).toBe("fail");
      expect(result?.severity).toBe("error");
      expect(result?.message).toMatch(/less than required/);
    });

    it("passes when provided seating shelf meets minimum requirement", () => {
      let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 } }]);
      const p = baseProject(s.cad.project);
      // Provide 700 mm shelf (> 529 mm):
      s = run([
        { type: "CAD_SET_PROJECT", project: p },
        {
          type: "ADD_SHAPE",
          shape: {
            id: "SHELF1",
            type: "line",
            x1: 0,
            y1: 0,
            x2: 700,
            y2: 0,
            semanticRole: "bearing_shelf",
            layerId: "BRG-OUTLINE",
          },
        },
      ], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "SEISMIC-MIN-SEATING");
      expect(result).toBeDefined();
      expect(result?.status).toBe("pass");
      expect(result?.message).toMatch(/≥ minimum/);
    });
  });

  describe("IRBM-BOULDER-BACKING (IRBM Para 605)", () => {
    it("warns when retaining structure is drawn without boulder backing or note", () => {
      let s = run([
        {
          type: "ADD_SHAPE",
          shape: {
            id: "ABUT1",
            type: "line",
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 4000,
            semanticRole: "abutment",
            layerId: "BRG-OUTLINE",
          },
        },
      ]);
      const p = { ...baseProject(s.cad.project), notes: ["Basic bridge note."] };
      s = run([{ type: "CAD_SET_PROJECT", project: p }], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "IRBM-BOULDER-BACKING");
      expect(result).toBeDefined();
      expect(result?.status).toBe("requires_review");
      expect(result?.message).toMatch(/boulder backing/i);
    });

    it("fails when drawn boulder backing thickness is less than 600 mm", () => {
      let s = run([
        {
          type: "ADD_SHAPE",
          shape: {
            id: "ABUT1",
            type: "line",
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 4000,
            semanticRole: "abutment",
            layerId: "BRG-OUTLINE",
          },
        },
        {
          type: "ADD_SHAPE",
          shape: {
            id: "BCK1",
            type: "rectangle",
            x: -450,
            y: 0,
            width: 450,
            height: 3500,
            semanticRole: "boulder_backing",
            layerId: "BRG-FILL",
          },
        },
      ]);
      s = run([{ type: "CAD_SET_PROJECT", project: baseProject(s.cad.project) }], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "IRBM-BOULDER-BACKING");
      expect(result).toBeDefined();
      expect(result?.status).toBe("fail");
      expect(result?.severity).toBe("error");
      expect(result?.message).toMatch(/less than the 600 mm minimum/);
    });

    it("passes when boulder backing >= 600 mm is provided", () => {
      let s = run([
        {
          type: "ADD_SHAPE",
          shape: {
            id: "ABUT1",
            type: "line",
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 4000,
            semanticRole: "abutment",
            layerId: "BRG-OUTLINE",
          },
        },
        {
          type: "ADD_SHAPE",
          shape: {
            id: "BCK1",
            type: "rectangle",
            x: -600,
            y: 0,
            width: 600,
            height: 3500,
            semanticRole: "boulder_backing",
            layerId: "BRG-FILL",
          },
        },
      ]);
      s = run([{ type: "CAD_SET_PROJECT", project: baseProject(s.cad.project) }], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "IRBM-BOULDER-BACKING");
      expect(result).toBeDefined();
      expect(result?.status).toBe("pass");
      expect(result?.message).toMatch(/≥ 600 mm/);
    });
  });

  describe("SKEW-ROB-DIAPHRAGM (RDSO/B-11778/14 & 15)", () => {
    it("passes without restriction when skew <= 20 degrees", () => {
      let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 }, values: { SkewAngle: 15 } }]);
      s = run([{ type: "CAD_SET_PROJECT", project: baseProject(s.cad.project) }], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "SKEW-ROB-DIAPHRAGM");
      expect(result).toBeDefined();
      expect(result?.status).toBe("pass");
      expect(result?.message).toMatch(/≤ 20°/);
    });

    it("requires review for intermediate cross-frames when skew > 20 degrees on girder bridge", () => {
      let s = run([{ type: "CAD_INSERT_COMPONENT", definitionId: "ir.bridge.gad", at: { x: 0, y: 0 }, values: { SkewAngle: 30 } }]);
      const p = {
        ...baseProject(s.cad.project),
        structureType: "rob" as const,
      };
      s = run([{ type: "CAD_SET_PROJECT", project: p }], s);
      const audit = runAudit(s.shapes, s.cad);
      const result = audit.results.find((r) => r.ruleId === "SKEW-ROB-DIAPHRAGM");
      expect(result).toBeDefined();
      expect(result?.status).toBe("requires_review");
      expect(result?.message).toMatch(/strictly perpendicular/i);
    });
  });
});
