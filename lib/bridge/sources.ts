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
  | "reference"
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
    id: "irbm-605",
    ...IRBM,
    clause: "Para 605",
    summary: "Weep holes at 1 m x 1 m staggered; hand-packed boulder backing >= 600 mm thick with granular backfill (GW, GP, SW).",
  },
  {
    id: "irbm-810",
    ...IRBM,
    clause: "Para 810",
    summary: "Guide bunds: upstream shank 1.0-1.5L, downstream 0.25-0.4L, curved mole head radius 0.45L, launching apron width 1.5 * scour depth.",
  },
  {
    id: "rdso-bs-118",
    kind: "rdso_standard" as const,
    title: "RDSO Guidelines on Seismic Design of Railway Bridges",
    documentNumber: "Report No. BS - 118 (Version 1.0, Nov 2015)",
    issuingAuthority: "RDSO Bridge & Structures Directorate",
    clause: "Cl. 4.4 (culverts exempt), Cl. 7.1 (Ah), Cl. 11.3 (restrainers), Cl. 14.3 (minimum seating width W)",
    projectApplicability: "pending_review" as const,
    summary: "Seismic acceleration, zone factors, elastomeric bearings, restrainer forces, and minimum seating widths.",
  },
  {
    id: "rdso-b-11778",
    kind: "rdso_standard" as const,
    title: "RDSO 36 m Span Composite Welded ROB Girders Skew Details",
    documentNumber: "RDSO/B-11778/14 & RDSO/B-11778/15",
    issuingAuthority: "RDSO Bridge & Structures Directorate",
    clause: "Notes 1-15, Tables 1-3, Fig 1-5",
    projectApplicability: "pending_review" as const,
    summary: "Skew ROB girders, longitudinal shift S_shift = W_g * tan(theta), end diaphragms along skew, intermediate diaphragms normal to girders.",
  },
  // The team's own formula documentation (docs/bridge-formulas). It restates
  // IRS/RDSO practice as formulas and checks; it is a working reference, not a
  // code, so every rule citing it still says "requires review".
  ...(
    [
      ["aagento-rcr", "01-rcc-box-railway.txt", "RCC box culvert (railway)", "IRS, RDSO 10152"],
      ["aagento-hwb", "02-highway-rcc-box.txt", "RCC box culvert (highway)", "IRC, IRC:SP:13"],
      ["aagento-hpc", "03-hume-pipe-culvert.txt", "Hume pipe culvert", "IRS, IS:458"],
      ["aagento-psc", "04-psc-slab-bridge.txt", "PSC slab bridge", "IRS T-39, IRS Bridge Rules, RDSO/B-10271R, IS:1343"],
      ["aagento-cg", "05-composite-girder.txt", "Composite girder bridge", "RDSO, IS:1343, IS:800"],
      ["aagento-owg", "06-open-web-girder.txt", "Open web girder", "RDSO/B-10022"],
      ["aagento-tpe", "07-parametric-template-engine.txt", "Parametric template engine", "—"],
      ["aagento-sub", "12-substructure-piers-abutments.txt", "Substructures (piers, abutments, wing walls)", "IRBM-2024, IRS Substructure Code"],
      ["aagento-fdn", "13-foundations-well-pile-open.txt", "Foundations (well, pile, open)", "IRBM-2024, IS:2911"],
      ["aagento-sei", "14-seismic-design-bearings-restrainers.txt", "Seismic design, bearings & restrainers", "RDSO BS-118, IS:1893, IRC:6"],
      ["aagento-rtw", "15-river-training-protection-works.txt", "River training & protection works", "IRBM-2024, IS:10751, IRC:89"],
      ["aagento-skw", "16-skew-bridges-composite-girders.txt", "Skew bridges & composite ROB girders", "RDSO/B-11778/14 & 15, IRS SBC"],
      ["aagento-gad", "17-gad-drafting-composition-checklists.txt", "GAD drafting composition & checklists", "IRBM-2024, IRCM Table 4.03"],
    ] as const
  ).map(([id, file, title, refs]) => ({
    id,
    kind: "reference" as const,
    title: `Aagento bridge formula documentation — ${title}`,
    documentNumber: `docs/bridge-formulas/${file}`,
    issuingAuthority: "Project engineering reference",
    projectApplicability: "pending_review" as const,
    summary: `Formulas, level chains and checks as practised on the project; cites ${refs}. Not a code — confirm the clause before relying on a limit.`,
  })),
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
