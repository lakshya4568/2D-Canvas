/**
 * Bridge classification — a SUGGESTION from the drawing, per IRBM 1103(3).
 *
 * Important: linear waterway ≥ 300 m or total waterway ≥ 1000 m², or so
 * classified by the Chief Engineer / Chief Bridge Engineer. Major: total
 * waterway ≥ 18 linear m, or a clear opening ≥ 12 m in any span. Otherwise
 * minor. The result is always "requires review": the official classification
 * belongs to the competent authority, not to software (guide §2.1).
 */

export type BridgeClass = "important" | "major" | "minor" | "unclassified";

export interface ClassificationInput {
  linearWaterwayM?: number;
  totalWaterwayAreaM2?: number;
  maxClearOpeningM?: number;
  classifiedImportantByCE?: boolean;
}

export interface ClassificationResult {
  suggested: BridgeClass;
  reason: string;
  sourceId: "irbm-1103-3";
}

export function classifyBridge(i: ClassificationInput): ClassificationResult {
  const lw = i.linearWaterwayM;
  const area = i.totalWaterwayAreaM2;
  const open = i.maxClearOpeningM;
  if (i.classifiedImportantByCE) {
    return { suggested: "important", reason: "Classified important by the CE/CBE.", sourceId: "irbm-1103-3" };
  }
  if ((lw !== undefined && lw >= 300) || (area !== undefined && area >= 1000)) {
    return {
      suggested: "important",
      reason: `Linear waterway ${fmt(lw)} m / waterway area ${fmt(area)} m² reaches the 300 m / 1000 m² threshold.`,
      sourceId: "irbm-1103-3",
    };
  }
  if ((lw !== undefined && lw >= 18) || (open !== undefined && open >= 12)) {
    return {
      suggested: "major",
      reason: `Total waterway ${fmt(lw)} m (≥ 18 m) or largest clear opening ${fmt(open)} m (≥ 12 m).`,
      sourceId: "irbm-1103-3",
    };
  }
  if (lw === undefined && open === undefined) {
    return { suggested: "unclassified", reason: "No waterway or opening has been drawn yet.", sourceId: "irbm-1103-3" };
  }
  return {
    suggested: "minor",
    reason: `Total waterway ${fmt(lw)} m < 18 m and largest clear opening ${fmt(open)} m < 12 m.`,
    sourceId: "irbm-1103-3",
  };
}

function fmt(v: number | undefined): string {
  return v === undefined ? "?" : Number(v.toFixed(2)).toString();
}

/** IRBM 312(1): minimum vertical clearance (mm) above design-discharge water level. */
export function requiredVerticalClearance(dischargeCumecs: number): number {
  if (dischargeCumecs <= 30) return 600;
  if (dischargeCumecs <= 300) return 600 + ((dischargeCumecs - 30) / (300 - 30)) * 600;
  if (dischargeCumecs <= 3000) return 1500;
  return 1800;
}

/** IRBM 313(2): the lowest free board the competent authority may relax to (mm), or null if no relaxation. */
export function relaxedFreeBoard(dischargeCumecs: number | undefined): number | null {
  if (dischargeCumecs === undefined) return null;
  if (dischargeCumecs < 3) return 600;
  if (dischargeCumecs <= 30) return 750;
  return null;
}
