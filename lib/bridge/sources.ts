/**
 * Source register (railway integration guide §1.3).
 *
 * Every rule result points at a record here; "according to Indian Railways" is
 * not a citation. Paragraph numbers were read from the documents supplied with
 * the project (IRBM-2024, incorporating ACS up to No. 45; Indian Railways
 * Construction Manual, Table 4.03). Anything this register calls a code clause
 * (IRS Sub-structure Code, IRSOD) is referenced, not reproduced — the project
 * must confirm the edition that applies.
 */

export type SourceKind =
  | "approved_drawing"
  | "dbr"
  | "code"
  | "manual"
  | "rdso_standard"
  | "survey"
  | "hydrology"
  | "geotechnical"
  | "site_record"
  | "template";

export type Applicability = "confirmed" | "pending_review" | "unknown";

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  title: string;
  issuingAuthority?: string;
  documentNumber?: string;
  /** Paragraph, clause or table within the document. */
  clause?: string;
  revision?: string;
  issueDate?: string;
  projectApplicability: Applicability;
  /** One-line gist, in our words (not a quotation). */
  summary?: string;
}

const IRBM = {
  kind: "manual" as const,
  title: "Indian Railways Bridge Manual",
  issuingAuthority: "Railway Board (published by IRICEN, Pune)",
  revision: "2024 (incorporates A&C slips up to ACS-45)",
  projectApplicability: "pending_review" as const,
};

const IRCM = {
  kind: "manual" as const,
  title: "Indian Railways Construction Manual",
  issuingAuthority: "Railway Board",
  projectApplicability: "pending_review" as const,
};

export const BUILTIN_SOURCES: SourceRecord[] = [
  {
    id: "irbm-1103-3",
    ...IRBM,
    clause: "Para 1103(3)",
    summary:
      "Important: linear waterway ≥ 300 m or total waterway ≥ 1000 m², or so classified by CE/CBE. Major: total waterway ≥ 18 linear m or any clear opening ≥ 12 m. Otherwise minor.",
  },
  {
    id: "irbm-311-3",
    ...IRBM,
    clause: "Para 311(3)",
    summary:
      "Minimum clear span 1 m in new and rebuilt bridges; minimum headroom 1.2 m in new bridges for inspection, relaxable by PCE/CBE.",
  },
  {
    id: "irbm-312",
    ...IRBM,
    clause: "Para 312",
    summary:
      "Minimum vertical clearance above design-discharge water level (incl. afflux) by discharge: 0–30 cumecs 600 mm, 31–300 pro-rata 600–1200, 301–3000 1500, >3000 1800. Pipe/box culverts and syphons exempt (312(3)).",
  },
  {
    id: "irbm-313",
    ...IRBM,
    clause: "Para 313",
    summary:
      "Free board from design-discharge water level (incl. afflux) to formation not less than 1 m; relaxation only by PCE/CBE (≥600 mm below 3 cumecs, ≥750 mm for 3–30, none above 30).",
  },
  {
    id: "irbm-316",
    ...IRBM,
    clause: "Para 316",
    summary: "Choice of open, pile or well foundations depends on site conditions; wells suit heavy scour.",
  },
  {
    id: "irbm-317",
    ...IRBM,
    clause: "Para 317",
    summary:
      "GAD approval authority: CBE of the zonal railway for open line and where waterway is reduced/clearance inadequate; otherwise CE/Construction.",
  },
  {
    id: "irbm-401",
    ...IRBM,
    clause: "Para 401",
    summary: "Principal reference lines: longitudinal centre line and transverse centre lines of abutments and piers.",
  },
  {
    id: "irbm-409",
    ...IRBM,
    clause: "Para 409",
    summary:
      "Pile spacing: end-bearing ≥ 2.5 d, friction ≥ 3 d, driven piles in loose sand ≥ 2 d; normally not more than 4 d centre to centre.",
  },
  {
    id: "irbm-703",
    ...IRBM,
    clause: "Para 703",
    summary: "Danger level fixed per bridge by the Divisional Engineer considering clearance, free board, afflux and scour.",
  },
  {
    id: "ircm-t403",
    ...IRCM,
    clause: "Table 4.03 (RDSO checklist, letter CBS/DBR/IMP/Policy dt 04.02.2022)",
    summary:
      "Checklist for preparation of GAD for railway bridges: sheet size, title block, notes, levels, bore log, codes, north direction, signatures and alteration boxes.",
  },
  {
    id: "ircm-402",
    ...IRCM,
    clause: "Para 402(1)",
    summary:
      "A GAD normally includes key plan, chainages, reduced levels, overall dimensions, ground/rail/HFL/bed/formation levels, scale, signature boxes, approving authority, codes, and bore log with bearing capacity.",
  },
  {
    id: "irs-substructure",
    kind: "code",
    title: "IRS Bridge Substructure & Foundation Code",
    issuingAuthority: "RDSO",
    clause: "Cl. 4.5 (waterway), 4.6 (scour), 4.8/4.9 (clearance/free board), 7.5/7.6 (backfill, weep holes)",
    projectApplicability: "pending_review",
    summary: "Referenced by the RDSO GAD checklist; edition to be confirmed for the project.",
  },
  {
    id: "irsod",
    kind: "code",
    title: "Indian Railways Schedule of Dimensions",
    issuingAuthority: "Railway Board",
    projectApplicability: "unknown",
    summary: "Moving and fixed dimensions; required for any clearance claim. Not encoded — must be supplied per project.",
  },
  {
    id: "template-default",
    kind: "template",
    title: "Component template default",
    projectApplicability: "unknown",
    summary: "A drafting aid only. Never a sanctioned design value.",
  },
];

export function findSource(sources: SourceRecord[], id: string | undefined): SourceRecord | undefined {
  if (!id) return undefined;
  return sources.find((s) => s.id === id) ?? BUILTIN_SOURCES.find((s) => s.id === id);
}

export function citation(src: SourceRecord | undefined): string {
  if (!src) return "unsourced";
  return [src.title, src.clause].filter(Boolean).join(", ");
}
