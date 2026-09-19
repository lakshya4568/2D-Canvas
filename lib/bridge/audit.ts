/**
 * The drawing audit — "what is wrong with this drawing?" (blueprint §15,
 * railway guide §7 and §10).
 *
 * Every result names the rule, the gate it belongs to, its severity, whether
 * it passed, and the source it rests on. A result says REQUIRES REVIEW when the
 * software can compute a number but cannot establish that the rule applies to
 * this project — the drafting tool never certifies a bridge (guide §1.2).
 */

import type { Shape } from "@/lib/geometry/types";
import type { CadDocState } from "@/lib/cad/document";
import { componentIdOf, definitionFor, evaluateInstance } from "@/lib/cad/document";
import type { Annotation, DimensionAnnotation, LevelAnnotation } from "@/lib/cad/types";
import { findLayer } from "@/lib/cad/layers";
import { indexShapes } from "@/lib/cad/geometry";
import { hatchRegion, measureDimension } from "@/lib/cad/annotationPrims";
import { resolveAnchor } from "@/lib/cad/geometry";
import type { EvalFact } from "@/lib/components/evaluate";
import { classifyBridge, relaxedFreeBoard, requiredVerticalClearance, type BridgeClass } from "./classification";
import { DBR_FIELD_META, INPUT_STATUS_LABEL, LEVEL_PARAMETER_MAP, isConfirmed, type DbrFields } from "./project";
import { BUILTIN_SOURCES, citation, findSource } from "./sources";
import { sheetLayout } from "@/lib/cad/sheet";
import { drawnFacts } from "./drawnFacts";

export type Severity = "blocker" | "error" | "warning" | "info";
export type RuleStatus = "pass" | "fail" | "requires_review" | "not_evaluated";
export type Gate = "data" | "geometry" | "parameter" | "consistency" | "annotation" | "railway" | "standard" | "sheet" | "approval";

export const GATE_LABEL: Record<Gate, string> = {
  data: "Design data",
  geometry: "Geometry",
  parameter: "Parameters",
  consistency: "Cross-view consistency",
  annotation: "GAD content",
  railway: "Railway & hydraulic",
  standard: "Drawing standard",
  sheet: "Sheet",
  approval: "Approval",
};

export interface AuditResult {
  ruleId: string;
  gate: Gate;
  severity: Severity;
  status: RuleStatus;
  message: string;
  sourceIds: string[];
  entityIds?: string[];
  parameterNames?: string[];
  hint?: string;
}

export interface AuditReport {
  results: AuditResult[];
  counts: Record<Severity, number>;
  /** Failing blockers and errors — the drawing cannot be issued. */
  issueBlocked: boolean;
  classification: { suggested: BridgeClass; reason: string };
  facts: EvalFact[];
  at: number;
}

const DEFAULT_REFERENCE = ["Indian Railways Bridge Manual", "IRS", "Code"];

function fact(facts: EvalFact[], key: string): number | undefined {
  const f = facts.find((x) => x.key === key);
  return f?.value;
}

function allFacts(facts: EvalFact[], key: string): EvalFact[] {
  return facts.filter((x) => x.key === key);
}

function levelLabelMatches(a: LevelAnnotation, words: string[]): boolean {
  const l = a.label.toUpperCase().replace(/\./g, "");
  return words.some((w) => l.includes(w));
}

export function runAudit(shapes: Shape[], doc: CadDocState): AuditReport {
  const results: AuditResult[] = [];
  const push = (r: AuditResult) => results.push(r);
  const P = doc.project;
  const shapeIndex = indexShapes(shapes);
  const ctx = { shapes: shapeIndex, settings: doc.settings };

  // ---------------------------------------------------------------- facts
  const facts: EvalFact[] = [];
  const outputs = doc.components.map((inst) => ({ inst, out: evaluateInstance(inst, doc) }));
  for (const { inst, out } of outputs) {
    if (!out) {
      push({ ruleId: "COMP-MISSING", gate: "parameter", severity: "error", status: "fail", message: `${inst.name} refers to an unknown component "${inst.definitionId}".`, sourceIds: [] });
      continue;
    }
    for (const f of out.evaluation.facts) facts.push({ ...f, path: `${inst.id}${f.path ? "/" + f.path : ""}` });
  }
  // Facts from geometry a person drew and tagged (bed level line, openings, cushion…).
  const drawnInstances = new Set(doc.components.filter((c) => definitionFor(doc, c.definitionId)?.origin?.kind === "drawn").map((c) => c.id));
  const drawn = drawnFacts(shapes, doc.settings, (s) => drawnInstances.has(s.componentInstanceId ?? ""));
  facts.push(...drawn);
  const isCulvert = allFacts(facts, "culvert_exempt_clearance").some((f) => f.value > 0) || P.structureType === "box_culvert" || P.structureType === "pipe_culvert";
  const isRiver = !["rob", "rub", "fob"].includes(P.structureType);

  // ---------------------------------------------------------------- parameter gate
  for (const { inst, out } of outputs) {
    if (!out) continue;
    for (const i of out.evaluation.issues) {
      push({
        ruleId: `COMP-${i.code}`,
        gate: "parameter",
        severity: i.severity === "error" ? "error" : "warning",
        status: "fail",
        message: `${inst.name}${i.path ? " › " + i.path : ""}: ${i.message}`,
        sourceIds: i.source ? [i.source] : [],
        entityIds: [inst.id],
      });
    }
    const def = definitionFor(doc, inst.definitionId);
    // A value that follows a relationship or its own formula is not a default;
    // one typed equal to the default still is.
    const src = out.evaluation.sources;
    const defaults = (def?.parameters ?? []).filter((p) => p.sourceRequired && (src[p.name] === "default" || (src[p.name] === "typed" && inst.values[p.name] === p.default)));
    if (defaults.length && def?.origin?.kind === "drawn") {
      // A drawing made parametric: its levels are what the person drew, not a template's.
      push({
        ruleId: "PARAM-DRAWN-UNCONFIRMED",
        gate: "parameter",
        severity: "warning",
        status: "requires_review",
        message: `${inst.name}: ${defaults.length} site level(s) are read from the drawing — ${defaults.map((p) => p.label ?? p.name).slice(0, 6).join(", ")}${defaults.length > 6 ? "…" : ""}. Confirm them against the design basis.`,
        sourceIds: [],
        entityIds: [inst.id],
        parameterNames: defaults.map((p) => p.name),
        hint: "Enter the approved levels in the design basis and apply them to the drawing.",
      });
    } else if (defaults.length) {
      push({
        ruleId: "PARAM-TEMPLATE-DEFAULT",
        gate: "parameter",
        severity: "warning",
        status: "requires_review",
        message: `${inst.name}: ${defaults.length} design value(s) are still template defaults — ${defaults.map((p) => p.label ?? p.name).slice(0, 6).join(", ")}${defaults.length > 6 ? "…" : ""}. A default is a drafting aid, not a sanctioned value.`,
        sourceIds: ["template-default"],
        entityIds: [inst.id],
        parameterNames: defaults.map((p) => p.name),
        hint: "Enter the approved values from the DBR / design, or record an assumption.",
      });
    }
  }

  // ---------------------------------------------------------------- data gate
  const need: (keyof DbrFields)[] = isRiver
    ? ["railLevel", "formationLevel", "hfl", "bedLevel", "foundationLevel", "boreLogReference", "safeBearingCapacity"]
    : ["railLevel", "formationLevel", "foundationLevel", "boreLogReference", "safeBearingCapacity"];
  for (const key of need) {
    const fld = P.dbr[key];
    const meta = DBR_FIELD_META[key];
    if (fld.status === "NOT_AVAILABLE" || fld.value === undefined || fld.value === "") {
      push({ ruleId: `DATA-${key}`, gate: "data", severity: "blocker", status: "fail", message: `${meta.label} is not available. A GAD must show it (IRCM 402(1)).`, sourceIds: ["ircm-402", "ircm-t403"], hint: "Enter it in Bridge › Design basis with its source." });
    } else if (!isConfirmed(fld.status)) {
      push({ ruleId: `DATA-${key}`, gate: "data", severity: fld.status === "PENDING_CONFIRMATION" ? "warning" : "blocker", status: "requires_review", message: `${meta.label} = ${fld.value}${meta.unit ? " " + meta.unit : ""} is ${INPUT_STATUS_LABEL[fld.status].toLowerCase()}.`, sourceIds: fld.sourceId ? [fld.sourceId] : ["template-default"], hint: "Confirm against the approved DBR or survey before issue." });
    } else {
      push({ ruleId: `DATA-${key}`, gate: "data", severity: "info", status: "pass", message: `${meta.label} confirmed${fld.sourceId ? " (" + citation(findSource(P.sources, fld.sourceId)) + ")" : ""}.`, sourceIds: fld.sourceId ? [fld.sourceId] : [] });
    }
  }
  for (const key of ["designDischarge", "loadingStandard", "seismicZone", "exposureCondition"] as (keyof DbrFields)[]) {
    if (key === "designDischarge" && !isRiver) continue;
    if (P.dbr[key].status === "NOT_AVAILABLE") {
      push({ ruleId: `DATA-${key}`, gate: "data", severity: "warning", status: "fail", message: `${DBR_FIELD_META[key].label} is missing from the technical data table (RDSO GAD checklist B-12).`, sourceIds: ["ircm-t403"] });
    }
  }
  if (P.dbr.electrified.value && /^y/i.test(String(P.dbr.electrified.value)) && !isConfirmed(P.dbr.oheContext.status)) {
    push({ ruleId: "DATA-OHE", gate: "data", severity: "warning", status: "requires_review", message: "The section is electrified but the OHE context is not confirmed. Clearance must come from an approved SOD record, never a generic value.", sourceIds: ["irsod"] });
  }
  for (const a of P.assumptions) {
    push({ ruleId: `DATA-ASSUMPTION-${a.id}`, gate: "data", severity: "blocker", status: "requires_review", message: `Open assumption (${a.createdBy}): ${a.text}`, sourceIds: [], hint: "Close it against a source before issue." });
  }

  // ---------------------------------------------------------------- consistency
  for (const { inst } of outputs) {
    for (const { field, parameter } of LEVEL_PARAMETER_MAP) {
      const def = definitionFor(doc, inst.definitionId);
      if (!def?.parameters.some((p) => p.name === parameter)) continue;
      const drawn = inst.values[parameter] ?? def.parameters.find((p) => p.name === parameter)!.default;
      const fld = P.dbr[field];
      if (fld.value === undefined || typeof fld.value !== "number") continue;
      const diff = Math.abs(drawn - fld.value);
      if (diff > 0.0005) {
        push({ ruleId: `CONS-${parameter}`, gate: "consistency", severity: "error", status: "fail", message: `${DBR_FIELD_META[field].label}: drawing ${inst.name} uses ${drawn.toFixed(3)} m but the design basis says ${fld.value.toFixed(3)} m.`, sourceIds: fld.sourceId ? [fld.sourceId] : [], entityIds: [inst.id], parameterNames: [parameter], hint: "Use “Apply design levels to drawing” or correct the DBR entry." });
      }
    }
  }
  // Drawn level lines against the design basis.
  const DRAWN_LEVEL_FIELD: Record<string, keyof DbrFields> = {
    hfl_m: "hfl",
    lwl_m: "lwl",
    bed_level_m: "bedLevel",
    formation_level_m: "formationLevel",
    rail_level_m: "railLevel",
    foundation_level_m: "foundationLevel",
    danger_level_m: "dangerLevel",
    scour_level_m: "maxScourLevel",
  };
  for (const f of drawn) {
    const field = DRAWN_LEVEL_FIELD[f.key];
    if (!field) continue;
    const v = P.dbr[field].value;
    if (typeof v !== "number") continue;
    if (Math.abs(v - f.value) > 0.0005) {
      push({ ruleId: `CONS-DRAWN-${field}`, gate: "consistency", severity: "error", status: "fail", message: `The line drawn as ${DBR_FIELD_META[field].label} sits at ${f.value.toFixed(3)} m, but the design basis says ${v.toFixed(3)} m.`, sourceIds: P.dbr[field].sourceId ? [P.dbr[field].sourceId!] : [], entityIds: [f.path.replace(/^drawn:/, "")] });
    }
  }

  for (const a of doc.annotations) {
    if (a.type === "dimension") {
      const m = measureDimension(a as DimensionAnnotation, ctx);
      if (!m) push({ ruleId: "DIM-DISASSOCIATED", gate: "consistency", severity: "error", status: "fail", message: `A dimension lost the geometry it measured.`, sourceIds: [], entityIds: [a.id] });
      else if (m.overridden) push({ ruleId: "DIM-OVERRIDE", gate: "consistency", severity: "error", status: "fail", message: `Dimension text "${(a as DimensionAnnotation).textOverride}" contradicts the measured ${m.value.toFixed(0)}.`, sourceIds: ["ircm-t403"], entityIds: [a.id] });
    }
    if (a.type === "level" && (a as LevelAnnotation).declaredValue !== undefined) {
      const p = resolveAnchor((a as LevelAnnotation).at, shapeIndex);
      if (p) {
        const rl = doc.settings.datumRL - p.y / 1000;
        if (Math.abs(rl - (a as LevelAnnotation).declaredValue!) > 0.0005) push({ ruleId: "LEVEL-MISMATCH", gate: "consistency", severity: "error", status: "fail", message: `Level marker "${(a as LevelAnnotation).label}" says ${(a as LevelAnnotation).declaredValue!.toFixed(3)} but sits at ${rl.toFixed(3)}.`, sourceIds: [], entityIds: [a.id] });
      }
    }
    if (a.type === "hatch" && !hatchRegion(a, ctx)) {
      push({ ruleId: "HATCH-OPEN", gate: "geometry", severity: "error", status: "fail", message: `A hatch boundary no longer closes — it would leak.`, sourceIds: [], entityIds: [a.id] });
    }
  }

  // ---------------------------------------------------------------- railway & hydraulic
  const lw = fact(facts, "linear_waterway_mm");
  const area = fact(facts, "waterway_area_m2");
  const maxOpen = fact(facts, "max_clear_opening_mm") ?? Math.max(...allFacts(facts, "clear_opening_mm").map((f) => f.value), -Infinity);
  const cls = classifyBridge({
    linearWaterwayM: lw !== undefined ? lw / 1000 : undefined,
    totalWaterwayAreaM2: area,
    maxClearOpeningM: Number.isFinite(maxOpen) ? maxOpen / 1000 : undefined,
    classifiedImportantByCE: P.classifiedImportantByCE,
  });
  push({ ruleId: "RLY-CLASS", gate: "railway", severity: "info", status: "requires_review", message: `Suggested classification: ${cls.suggested.toUpperCase()}. ${cls.reason} Official classification rests with the competent authority.`, sourceIds: ["irbm-1103-3"] });

  const newWork = P.lifecycle === "new_work" || P.lifecycle === "rebuilding" || P.lifecycle === "doubling" || P.lifecycle === "gauge_conversion";
  for (const f of allFacts(facts, "clear_opening_mm")) {
    if (newWork && f.value < 1000) push({ ruleId: "RLY-MIN-SPAN", gate: "railway", severity: "warning", status: "requires_review", message: `Clear opening ${f.value.toFixed(0)} mm (${f.path}) is below the 1 m minimum for new and rebuilt bridges.`, sourceIds: ["irbm-311-3"], hint: "Needs PCE/CBE decision." });
  }
  const heads = [...allFacts(facts, "headroom_mm"), ...allFacts(facts, "clear_height_mm")];
  for (const f of heads) {
    if (P.lifecycle === "new_work" && f.value < 1200) push({ ruleId: "RLY-HEADROOM", gate: "railway", severity: "warning", status: "requires_review", message: `Headroom ${f.value.toFixed(0)} mm (${f.path}) is below the 1.2 m needed for inspection in new bridges; relaxation needs PCE/CBE approval.`, sourceIds: ["irbm-311-3"] });
  }
  const q = typeof P.dbr.designDischarge.value === "number" ? P.dbr.designDischarge.value : undefined;
  const afflux = typeof P.dbr.afflux.value === "number" ? P.dbr.afflux.value : 0;
  for (const f of allFacts(facts, "vertical_clearance_mm")) {
    if (isCulvert) break;
    const provided = f.value - afflux;
    if (q === undefined) {
      push({ ruleId: "RLY-VERT-CLEAR", gate: "railway", severity: "warning", status: "not_evaluated", message: `Vertical clearance soffit − HFL = ${f.value.toFixed(0)} mm. Cannot check against IRBM 312 without the design discharge.`, sourceIds: ["irbm-312"], hint: "Enter design discharge Q in the design basis." });
    } else {
      const req = requiredVerticalClearance(q);
      push({
        ruleId: "RLY-VERT-CLEAR",
        gate: "railway",
        severity: provided >= req ? "info" : "error",
        status: provided >= req ? "requires_review" : "fail",
        message: `Vertical clearance ${provided.toFixed(0)} mm${afflux ? " (after afflux)" : ""} vs ${req.toFixed(0)} mm for Q = ${q} cumecs.${provided >= req ? " Meets the tabulated value; confirm HFL is the design-discharge level." : " Short — condonation from the competent authority must be noted on the GAD (RDSO checklist C-11)."}`,
        sourceIds: ["irbm-312", "ircm-t403"],
      });
    }
  }
  if (isCulvert && allFacts(facts, "culvert_exempt_clearance").length) {
    push({ ruleId: "RLY-VERT-CLEAR", gate: "railway", severity: "info", status: "pass", message: "Box and pipe culverts are designed as pressure conduits — no vertical clearance is required.", sourceIds: ["irbm-312"] });
  }
  for (const f of allFacts(facts, "freeboard_mm")) {
    const relax = relaxedFreeBoard(q);
    if (f.value >= 1000) {
      push({ ruleId: "RLY-FREEBOARD", gate: "railway", severity: "info", status: "requires_review", message: `Free board ${f.value.toFixed(0)} mm ≥ 1000 mm. Confirm HFL is the design-discharge level including afflux.`, sourceIds: ["irbm-313"] });
    } else {
      push({
        ruleId: "RLY-FREEBOARD",
        gate: "railway",
        severity: "error",
        status: "fail",
        message: `Free board ${f.value.toFixed(0)} mm is below 1000 mm.${relax !== null ? ` PCE/CBE may relax it to ${relax} mm for Q = ${q} cumecs${f.value >= relax ? " — this value would qualify." : " — even the relaxed value is not met."}` : q !== undefined ? ` No relaxation is permissible for Q = ${q} cumecs.` : " Enter the design discharge to see whether a relaxation is possible."}`,
        sourceIds: ["irbm-313"],
      });
    }
  }
  for (const d of allFacts(facts, "pile_diameter_mm")) {
    const base = d.path;
    const minS = facts.find((x) => x.key === "pile_min_spacing_mm" && x.path === base)?.value;
    const maxS = facts.find((x) => x.key === "pile_max_spacing_mm" && x.path === base)?.value;
    const type = facts.find((x) => x.key === "pile_type" && x.path === base)?.value ?? 1;
    const k = type === 2 ? 3 : type === 3 ? 2 : 2.5;
    const label = type === 2 ? "friction" : type === 3 ? "driven in loose sand/fill" : "end-bearing";
    if (minS !== undefined && minS > 0 && minS < k * d.value) push({ ruleId: "RLY-PILE-SPACING-MIN", gate: "railway", severity: "warning", status: "requires_review", message: `Pile spacing ${minS.toFixed(0)} mm < ${k} d = ${(k * d.value).toFixed(0)} mm for ${label} piles.`, sourceIds: ["irbm-409"] });
    if (maxS !== undefined && maxS > 4 * d.value) push({ ruleId: "RLY-PILE-SPACING-MAX", gate: "railway", severity: "warning", status: "requires_review", message: `Pile spacing ${maxS.toFixed(0)} mm > 4 d = ${(4 * d.value).toFixed(0)} mm (normally the upper limit).`, sourceIds: ["irbm-409"] });
  }
  const ft = String(P.dbr.foundationType.value ?? "").toLowerCase();
  if (ft) {
    const drawnPile = facts.some((f) => f.key === "foundation_pile");
    const drawnWell = facts.some((f) => f.key === "foundation_well");
    const drawnOpen = facts.some((f) => f.key === "foundation_open");
    const mismatch = (ft.includes("pile") && !drawnPile) || (ft.includes("well") && !drawnWell) || (ft.includes("open") && !drawnOpen && (drawnPile || drawnWell));
    if (mismatch) push({ ruleId: "RLY-FOUNDATION-TYPE", gate: "consistency", severity: "warning", status: "fail", message: `Design basis says "${P.dbr.foundationType.value}" foundation, but the drawing shows ${[drawnOpen && "open", drawnPile && "pile", drawnWell && "well"].filter(Boolean).join(", ") || "no"} foundations.`, sourceIds: ["irbm-316"] });
  }
  push({
    ruleId: "RLY-APPROVAL-AUTHORITY",
    gate: "approval",
    severity: "info",
    status: "requires_review",
    message:
      P.lifecycle === "open_line"
        ? "GAD approval: Chief Bridge Engineer of the zonal railway (open line)."
        : "GAD approval: CBE of the zonal railway where linear waterway is reduced, vertical clearance is inadequate or existing bridges are affected; otherwise CE/Construction.",
    sourceIds: ["irbm-317"],
  });

  // ---------------------------------------------------------------- GAD content
  const levels = doc.annotations.filter((a): a is LevelAnnotation => a.type === "level");
  const want: [string, string[], boolean][] = [
    ["Rail level", ["RAIL", "RL "], true],
    ["Formation level", ["FORMATION", "FL "], true],
    ["HFL", ["HFL", "HIGH FLOOD"], isRiver],
    ["Bed level", ["BED"], isRiver],
  ];
  for (const [name, words, required] of want) {
    if (!required) continue;
    if (!levels.some((l) => levelLabelMatches(l, words))) push({ ruleId: `GAD-LEVEL-${name}`, gate: "annotation", severity: "error", status: "fail", message: `${name} is not marked on the drawing.`, sourceIds: ["ircm-402"], hint: "Add a level marker or a level set." });
  }
  const markers = doc.annotations.filter((a) => a.type === "marker");
  if (!markers.some((m) => m.type === "marker" && m.kind === "north")) push({ ruleId: "GAD-NORTH", gate: "annotation", severity: "error", status: "fail", message: "North direction is not shown.", sourceIds: ["ircm-t403"], hint: "Annotate › North arrow." });
  if (!markers.some((m) => m.type === "marker" && m.kind === "kilometrage")) push({ ruleId: "GAD-KM", gate: "annotation", severity: "warning", status: "fail", message: "Direction of increasing kilometrage is not shown.", sourceIds: ["ircm-t403"] });
  if (isRiver && !markers.some((m) => m.type === "marker" && m.kind === "flow")) push({ ruleId: "GAD-FLOW", gate: "annotation", severity: "warning", status: "fail", message: "Direction of flow is not shown (confirm it at site).", sourceIds: ["ircm-t403"] });
  const noteText = P.notes.join(" ").toLowerCase();
  if (!/code|manual|irs|irbm/.test(noteText)) push({ ruleId: "GAD-NOTE-CODES", gate: "annotation", severity: "warning", status: "fail", message: "Notes do not list the codes and manuals the work follows.", sourceIds: ["ircm-t403"] });
  if (!/field|site|verify|verified/.test(noteText)) push({ ruleId: "GAD-NOTE-FIELD", gate: "annotation", severity: "warning", status: "fail", message: "Notes do not give directions to field engineers (verify levels, bore log, bearing capacity).", sourceIds: ["ircm-t403"] });
  const id = P.identity;
  const idFields: [keyof typeof id, string, Severity][] = [
    ["projectName", "Name of work", "blocker"],
    ["drawingNumber", "Drawing number", "blocker"],
    ["railway", "Railway", "error"],
    ["bridgeNumber", "Bridge number", "error"],
    ["chainage", "Chainage", "error"],
    ["sanctionReference", "Sanction reference (Pink Book item)", "warning"],
  ];
  for (const [k, label, sev] of idFields) {
    if (!String(id[k] ?? "").trim()) push({ ruleId: `GAD-ID-${k}`, gate: "annotation", severity: sev, status: "fail", message: `${label} is missing from the title block.`, sourceIds: ["ircm-t403"] });
  }
  if (P.approvals.some((a) => !a.name.trim())) push({ ruleId: "GAD-SIGNATURES", gate: "approval", severity: "warning", status: "fail", message: "Names for the signature boxes are incomplete.", sourceIds: ["ircm-t403"] });

  // ---------------------------------------------------------------- sheet
  if (doc.sheets.length === 0) {
    push({ ruleId: "SHEET-NONE", gate: "sheet", severity: "error", status: "fail", message: "No sheet has been laid out.", sourceIds: ["ircm-t403"], hint: "Output › New GAD sheet." });
  }
  const wantSize = cls.suggested === "important" || cls.suggested === "major" ? "A0" : "A1";
  for (const s of doc.sheets) {
    if (s.size !== wantSize && !(wantSize === "A1" && s.size === "A0")) push({ ruleId: "SHEET-SIZE", gate: "sheet", severity: "warning", status: "fail", message: `${s.name} is ${s.size}; a ${cls.suggested} bridge GAD is normally ${wantSize}.`, sourceIds: ["ircm-t403"] });
    for (const vp of s.viewports) {
      if (!vp.locked) push({ ruleId: "SHEET-VP-UNLOCKED", gate: "sheet", severity: "error", status: "fail", message: `${s.name}: viewport scale 1:${vp.scale} is not locked.`, sourceIds: [] });
    }
    if (s.viewports.length === 0) push({ ruleId: "SHEET-EMPTY", gate: "sheet", severity: "error", status: "fail", message: `${s.name} has no viewports.`, sourceIds: [] });
    void sheetLayout;
  }

  // ---------------------------------------------------------------- drawing standard
  const onZero = shapes.filter((s) => {
    const l = (s as { layerId?: string }).layerId;
    return !l || l === "0";
  });
  if (onZero.length) push({ ruleId: "STD-LAYER-0", gate: "standard", severity: "warning", status: "fail", message: `${onZero.length} entit${onZero.length === 1 ? "y is" : "ies are"} on layer 0 — move ${onZero.length === 1 ? "it" : "them"} to a standard layer.`, sourceIds: [], entityIds: onZero.slice(0, 50).map((s) => s.id) });
  const unknown = [...shapes, ...doc.annotations].filter((e) => {
    const l = (e as { layerId?: string }).layerId;
    return l && l !== "0" && !findLayer(doc.layers, l);
  });
  if (unknown.length) push({ ruleId: "STD-LAYER-UNKNOWN", gate: "standard", severity: "warning", status: "fail", message: `${unknown.length} entities use layers that are not in the layer table.`, sourceIds: [] });
  for (const l of doc.layers) {
    if (l.category === "construction" && l.plot) push({ ruleId: "STD-CONSTRUCTION-PLOT", gate: "standard", severity: "error", status: "fail", message: `Construction layer ${l.name} is set to plot.`, sourceIds: [] });
  }
  const tempOnPerm = shapes.filter((s) => {
    const sr = (s as { semanticRole?: string }).semanticRole ?? "";
    const layer = findLayer(doc.layers, (s as { layerId?: string }).layerId);
    return /staging|trestle|cofferdam|launch|crane/.test(sr) && layer?.category !== "temporary";
  });
  if (tempOnPerm.length) push({ ruleId: "STD-TEMP-WORKS", gate: "standard", severity: "error", status: "fail", message: `${tempOnPerm.length} temporary-works entities are on permanent layers.`, sourceIds: [], entityIds: tempOnPerm.map((s) => s.id) });
  const zero = shapes.filter((s) => s.type === "line" && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 1e-6);
  if (zero.length) push({ ruleId: "GEOM-ZERO-LENGTH", gate: "geometry", severity: "warning", status: "fail", message: `${zero.length} zero-length line(s).`, sourceIds: [], entityIds: zero.map((s) => s.id) });

  // ---------------------------------------------------------------- approval
  const failing = results.filter((r) => r.status !== "pass" && (r.severity === "blocker" || r.severity === "error"));
  if (P.drawingStatus === "APPROVED" && P.approvals.some((a) => !a.signed)) {
    push({ ruleId: "APPR-UNSIGNED", gate: "approval", severity: "blocker", status: "fail", message: "Marked APPROVED but not every signature box is signed.", sourceIds: ["irbm-317"] });
  }
  if (P.drawingStatus !== "DRAFT" && failing.length) {
    push({ ruleId: "APPR-OPEN-ISSUES", gate: "approval", severity: "blocker", status: "fail", message: `Status is ${P.drawingStatus} with ${failing.length} unresolved blocker/error finding(s).`, sourceIds: [] });
  }

  const counts: Record<Severity, number> = { blocker: 0, error: 0, warning: 0, info: 0 };
  for (const r of results) if (r.status !== "pass") counts[r.severity]++;
  const issueBlocked = results.some((r) => r.status !== "pass" && (r.severity === "blocker" || r.severity === "error"));
  void DEFAULT_REFERENCE;
  void BUILTIN_SOURCES;
  return { results, counts, issueBlocked, classification: { suggested: cls.suggested, reason: cls.reason }, facts, at: Date.now() };
}

/** Plain-text report, for the agent and for export. */
export function auditToText(r: AuditReport): string {
  const order: Severity[] = ["blocker", "error", "warning", "info"];
  const lines = [`Audit: ${r.counts.blocker} blocker, ${r.counts.error} error, ${r.counts.warning} warning, ${r.counts.info} info. ${r.issueBlocked ? "ISSUE BLOCKED." : "No blocking findings."}`];
  for (const sev of order) {
    for (const x of r.results.filter((y) => y.severity === sev && y.status !== "pass")) {
      const src = x.sourceIds.map((id) => citation(findSource([], id))).join("; ");
      lines.push(`${sev.toUpperCase().padEnd(7)} [${x.gate}] ${x.message}${src ? ` — ${src}` : ""}${x.hint ? ` → ${x.hint}` : ""}`);
    }
  }
  return lines.join("\n");
}

export function componentOf(entity: Shape | Annotation): string | undefined {
  return componentIdOf(entity);
}
