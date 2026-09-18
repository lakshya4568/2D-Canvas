/**
 * The bridge project and its design-basis record (railway guide §3).
 *
 * The drawing is only as good as the data it is drawn from, so every
 * drawing-critical input carries WHERE it came from and HOW sure we are, not
 * just a number. A value the agent inferred, or a template default, is never a
 * design fact: it is visible as such in the editor and it blocks issue until
 * someone confirms it against an approved source (guide §3.3).
 *
 * This is a controlled digital copy of the drawing-critical parts of the DBR,
 * not a replacement for the approved DBR.
 */

import type { SourceRecord } from "./sources";

export type InputStatus =
  | "CONFIRMED_APPROVED"
  | "CONFIRMED_SURVEY"
  | "PENDING_CONFIRMATION"
  | "INFERRED"
  | "ASSUMED_FOR_DRAFT"
  | "NOT_AVAILABLE";

export const INPUT_STATUS_LABEL: Record<InputStatus, string> = {
  CONFIRMED_APPROVED: "Confirmed — approved source",
  CONFIRMED_SURVEY: "Confirmed — survey",
  PENDING_CONFIRMATION: "Pending confirmation",
  INFERRED: "Inferred — not a design input",
  ASSUMED_FOR_DRAFT: "Assumed for draft — blocks issue",
  NOT_AVAILABLE: "Not available",
};

export function isConfirmed(s: InputStatus): boolean {
  return s === "CONFIRMED_APPROVED" || s === "CONFIRMED_SURVEY";
}

export interface DbrField<T = number | string> {
  value?: T;
  status: InputStatus;
  sourceId?: string;
  note?: string;
  /** Who last set it. An agent can set a value but never confirm it. */
  setBy?: "user" | "agent" | "import";
}

export type StructureType =
  | "box_culvert"
  | "pipe_culvert"
  | "slab_bridge"
  | "girder_bridge"
  | "steel_girder_bridge"
  | "arch_bridge"
  | "rob"
  | "rub"
  | "fob"
  | "other";

export type Lifecycle = "new_work" | "rebuilding" | "doubling" | "gauge_conversion" | "rehabilitation" | "open_line";

export type DrawingStatus = "DRAFT" | "FOR DESIGN REVIEW" | "FOR APPROVAL" | "APPROVED";

/** Drawing-critical DBR fields. Levels in m (reduced levels), lengths in mm. */
export interface DbrFields {
  railLevel: DbrField<number>;
  formationLevel: DbrField<number>;
  hfl: DbrField<number>;
  lwl: DbrField<number>;
  bedLevel: DbrField<number>;
  dangerLevel: DbrField<number>;
  foundationLevel: DbrField<number>;
  maxScourLevel: DbrField<number>;
  designDischarge: DbrField<number>;
  catchmentArea: DbrField<number>;
  afflux: DbrField<number>;
  foundationType: DbrField<string>;
  boreLogReference: DbrField<string>;
  safeBearingCapacity: DbrField<number>;
  loadingStandard: DbrField<string>;
  seismicZone: DbrField<string>;
  exposureCondition: DbrField<string>;
  electrified: DbrField<string>;
  oheContext: DbrField<string>;
  benchMark: DbrField<string>;
}

export const DBR_FIELD_META: Record<keyof DbrFields, { label: string; unit: string; kind: "level" | "number" | "text"; group: string }> = {
  railLevel: { label: "Rail level", unit: "m", kind: "level", group: "Levels" },
  formationLevel: { label: "Formation level", unit: "m", kind: "level", group: "Levels" },
  hfl: { label: "High flood level (HFL)", unit: "m", kind: "level", group: "Levels" },
  lwl: { label: "Low water level (LWL)", unit: "m", kind: "level", group: "Levels" },
  bedLevel: { label: "Bed level", unit: "m", kind: "level", group: "Levels" },
  dangerLevel: { label: "Danger level", unit: "m", kind: "level", group: "Levels" },
  foundationLevel: { label: "Foundation level", unit: "m", kind: "level", group: "Levels" },
  maxScourLevel: { label: "Maximum scour level", unit: "m", kind: "level", group: "Hydraulics" },
  designDischarge: { label: "Design discharge Q", unit: "cumecs", kind: "number", group: "Hydraulics" },
  catchmentArea: { label: "Catchment area", unit: "km²", kind: "number", group: "Hydraulics" },
  afflux: { label: "Afflux", unit: "mm", kind: "number", group: "Hydraulics" },
  foundationType: { label: "Foundation type", unit: "", kind: "text", group: "Foundation" },
  boreLogReference: { label: "Bore log / trial pit reference", unit: "", kind: "text", group: "Foundation" },
  safeBearingCapacity: { label: "Safe bearing capacity", unit: "t/m²", kind: "number", group: "Foundation" },
  loadingStandard: { label: "Standard of loading", unit: "", kind: "text", group: "Design basis" },
  seismicZone: { label: "Seismic zone", unit: "", kind: "text", group: "Design basis" },
  exposureCondition: { label: "Exposure condition", unit: "", kind: "text", group: "Design basis" },
  electrified: { label: "Electrified section (yes/no)", unit: "", kind: "text", group: "Railway" },
  oheContext: { label: "OHE context", unit: "", kind: "text", group: "Railway" },
  benchMark: { label: "Bench mark and datum", unit: "", kind: "text", group: "Railway" },
};

export interface ProjectIdentity {
  railway: string;
  division: string;
  projectName: string;
  bridgeNumber: string;
  /** "km 123/4-5" or plain km. */
  chainage: string;
  line: string;
  drawingTitle: string;
  drawingNumber: string;
  revision: string;
  sanctionReference: string;
  consultant: string;
  riverName: string;
}

export interface Assumption {
  id: string;
  text: string;
  scope: string;
  createdBy: "user" | "agent";
  createdAt: number;
}

export interface Approval {
  role: string;
  name: string;
  signed: boolean;
}

export interface BridgeProject {
  identity: ProjectIdentity;
  structureType: StructureType;
  lifecycle: Lifecycle;
  /** Set only by a person: the CE/CBE may classify a bridge as important (IRBM 1103(3)(a)). */
  classifiedImportantByCE: boolean;
  dbr: DbrFields;
  sources: SourceRecord[];
  assumptions: Assumption[];
  approvals: Approval[];
  drawingStatus: DrawingStatus;
  /** General notes for the sheet, in order. */
  notes: string[];
}

const na = <T,>(): DbrField<T> => ({ status: "NOT_AVAILABLE" });

export function emptyProject(): BridgeProject {
  return {
    identity: {
      railway: "",
      division: "",
      projectName: "",
      bridgeNumber: "",
      chainage: "",
      line: "",
      drawingTitle: "General Arrangement Drawing",
      drawingNumber: "",
      revision: "0",
      sanctionReference: "",
      consultant: "",
      riverName: "",
    },
    structureType: "other",
    lifecycle: "new_work",
    classifiedImportantByCE: false,
    dbr: {
      railLevel: na(),
      formationLevel: na(),
      hfl: na(),
      lwl: na(),
      bedLevel: na(),
      dangerLevel: na(),
      foundationLevel: na(),
      maxScourLevel: na(),
      designDischarge: na(),
      catchmentArea: na(),
      afflux: na(),
      foundationType: na(),
      boreLogReference: na(),
      safeBearingCapacity: na(),
      loadingStandard: na(),
      seismicZone: na(),
      exposureCondition: na(),
      electrified: na(),
      oheContext: na(),
      benchMark: na(),
    },
    sources: [],
    assumptions: [],
    approvals: [
      { role: "Prepared by", name: "", signed: false },
      { role: "Checked by", name: "", signed: false },
      { role: "Approved by", name: "", signed: false },
    ],
    drawingStatus: "DRAFT",
    notes: [
      "All dimensions are in millimetres and levels in metres unless noted otherwise.",
      "Do not scale dimensions from this drawing.",
      "Field engineers shall verify rail level, formation level, HFL, bed level, scour level, foundation level and bore log data at site before execution.",
    ],
  };
}

/** Fields whose DBR value and drawing value must agree, keyed to the drawing parameter names. */
export const LEVEL_PARAMETER_MAP: { field: keyof DbrFields; parameter: string }[] = [
  { field: "railLevel", parameter: "RailLevel" },
  { field: "formationLevel", parameter: "FormationLevel" },
  { field: "hfl", parameter: "HFL" },
  { field: "lwl", parameter: "LWL" },
  { field: "bedLevel", parameter: "BedLevel" },
  { field: "foundationLevel", parameter: "FoundationLevel" },
];
