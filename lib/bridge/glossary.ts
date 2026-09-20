/**
 * What the CAD knows about bridge drawings.
 *
 * One entry per thing a railway bridge GAD shows: what it is (in a sentence an
 * engineer would accept), the words drawings use for it, how it usually looks
 * (a level line, a closed region, a member), which layer and hatch it belongs
 * on, and what it tells the checks. This is what lets the editor UNDERSTAND a
 * drawing a person drew line by line — the same knowledge the component
 * library has baked in, made available to free geometry.
 *
 * Definitions are paraphrased from the IRBM-2024 and the Indian Railways
 * Construction Manual where those documents define the term; elsewhere they
 * are standard civil drafting usage.
 */

import type { HatchMaterial, LayerCategory } from "@/lib/cad/types";

export type TermKind =
  /** A horizontal level line; its height IS the value (an RL). */
  | "level"
  /** A closed area of material (fill, concrete, water). */
  | "region"
  /** A structural member drawn as an outline. */
  | "member"
  /** An empty space the structure leaves (opening, cell). */
  | "opening"
  /** A setting-out line. */
  | "axis";

export type TermGroup = "Levels" | "Water" | "Superstructure" | "Substructure" | "Foundation" | "Fill & protection" | "Track" | "Axes" | "Culvert";

export interface BridgeTerm {
  role: string;
  label: string;
  group: TermGroup;
  kind: TermKind;
  definition: string;
  /** Words that name it on drawings (upper-case, dots removed when matching). */
  aliases: string[];
  layer: LayerCategory;
  hatch?: HatchMaterial;
  /** Level marker label written when a level line is identified. */
  levelLabel?: string;
  /** Fact the checks read from it. */
  fact?: string;
  source?: string;
}

export const BRIDGE_TERMS: BridgeTerm[] = [
  // ------------------------------------------------------------- levels
  { role: "bed_level", label: "Bed level", group: "Levels", kind: "level", definition: "Level of the stream or river bed at the bridge — the bottom of the waterway. Clearances, scour depth and foundation depth are measured from it.", aliases: ["BED LEVEL", "BED LVL", "BL", "B L", "RIVER BED", "NALLAH BED", "EXISTING BED"], layer: "ground", levelLabel: "BED LEVEL", fact: "bed_level_m", source: "ircm-402" },
  { role: "ground_level", label: "Ground level (NGL / EGL)", group: "Levels", kind: "level", definition: "Natural or existing ground level at the site, before any fill or excavation.", aliases: ["GROUND LEVEL", "GL", "NGL", "EGL", "N G L", "E G L", "EXISTING GROUND"], layer: "ground", levelLabel: "G.L.", fact: "ground_level_m", source: "ircm-402" },
  { role: "formation_level", label: "Formation level", group: "Levels", kind: "level", definition: "Top of the railway embankment on which the ballast rests. Free board is measured from the design flood level up to it (IRBM 313).", aliases: ["FORMATION LEVEL", "FORMATION", "FL", "F L", "FRL"], layer: "level", levelLabel: "FORMATION", fact: "formation_level_m", source: "irbm-313" },
  { role: "rail_level", label: "Rail level", group: "Levels", kind: "level", definition: "Level of the top of the rail. The bridge's vertical arrangement is set from it downwards through track, ballast and deck.", aliases: ["RAIL LEVEL", "RL OF RAIL", "TOP OF RAIL", "TOR", "RAIL LVL"], layer: "level", levelLabel: "RAIL LEVEL", fact: "rail_level_m", source: "ircm-402" },
  { role: "foundation_level", label: "Foundation level", group: "Levels", kind: "level", definition: "Level of the underside of the foundation (founding level) — where the load passes to the soil or rock. Must be below the maximum scour level with a margin.", aliases: ["FOUNDATION LEVEL", "FOUNDING LEVEL", "FDN LEVEL", "BOTTOM OF FOUNDATION", "BOF"], layer: "level", levelLabel: "FOUNDATION LEVEL", fact: "foundation_level_m", source: "ircm-t403" },
  { role: "scour_level", label: "Maximum scour level", group: "Levels", kind: "level", definition: "Deepest level the bed can scour to in the design flood at a pier or abutment. Foundations are taken below it.", aliases: ["SCOUR LEVEL", "MAX SCOUR", "MSL SCOUR", "MAXIMUM SCOUR LEVEL"], layer: "water", levelLabel: "MAX. SCOUR LEVEL", fact: "scour_level_m", source: "ircm-t403" },
  { role: "soffit_level", label: "Soffit level", group: "Levels", kind: "level", definition: "Underside of the superstructure (bottom of deck or girders). Vertical clearance is soffit minus the design flood level (IRBM 312).", aliases: ["SOFFIT", "SOFFIT LEVEL", "BOTTOM OF DECK", "BOTTOM OF SLAB", "UNDERSIDE OF DECK"], layer: "level", levelLabel: "SOFFIT", fact: "soffit_level_m", source: "irbm-312" },
  { role: "bed_block_level", label: "Bed block / bearing level", group: "Levels", kind: "level", definition: "Top of the bed block (pedestal) on which the bearings sit.", aliases: ["BED BLOCK LEVEL", "BEARING LEVEL", "TOP OF BED BLOCK", "TOP OF PEDESTAL"], layer: "level", levelLabel: "BED BLOCK", fact: "bed_block_level_m" },
  // ------------------------------------------------------------- water
  { role: "HFL", label: "High flood level (HFL)", group: "Water", kind: "level", definition: "Highest recorded or design flood level at the bridge. Vertical clearance (312) and free board (313) are measured from the design-discharge water level, usually shown as HFL.", aliases: ["HFL", "H F L", "HIGH FLOOD LEVEL", "HIGHEST FLOOD LEVEL", "DFL", "DESIGN FLOOD LEVEL"], layer: "water", levelLabel: "H.F.L.", fact: "hfl_m", source: "irbm-312" },
  { role: "LWL", label: "Low water level (LWL)", group: "Water", kind: "level", definition: "Ordinary low-water level in the dry season.", aliases: ["LWL", "L W L", "LOW WATER LEVEL", "OLWL"], layer: "water", levelLabel: "L.W.L.", fact: "lwl_m", source: "ircm-402" },
  { role: "danger_level", label: "Danger level", group: "Water", kind: "level", definition: "Water level at which the safety of the bridge is likely to be affected; traffic is stopped when it is reached. Fixed for each bridge by the Divisional Engineer (IRBM 703).", aliases: ["DANGER LEVEL", "DL", "D L"], layer: "water", levelLabel: "D.L.", fact: "danger_level_m", source: "irbm-703" },
  { role: "waterway", label: "Waterway / water body", group: "Water", kind: "region", definition: "The water area through the bridge up to the flood level.", aliases: ["WATERWAY", "WATER", "STREAM", "RIVER"], layer: "water", hatch: "water" },
  // ------------------------------------------------------------- culvert
  { role: "clear_opening", label: "Clear opening / cell", group: "Culvert", kind: "opening", definition: "The clear space through a culvert cell or between piers — its width is the clear span, its height the clear headroom. Minimum 1 m clear span and 1.2 m headroom for new bridges (IRBM 311(3)).", aliases: ["CELL", "OPENING", "CLEAR OPENING", "VENT", "BARREL"], layer: "outline", fact: "clear_opening_mm", source: "irbm-311-3" },
  { role: "top_slab", label: "Top slab", group: "Culvert", kind: "member", definition: "The roof slab of a box culvert, carrying the earth cushion and track load.", aliases: ["TOP SLAB", "ROOF SLAB"], layer: "outline", hatch: "rcc" },
  { role: "base_slab", label: "Bottom (base) slab", group: "Culvert", kind: "member", definition: "The floor slab of a box culvert, on which water flows.", aliases: ["BOTTOM SLAB", "BASE SLAB", "FLOOR SLAB", "RAFT"], layer: "outline", hatch: "rcc" },
  { role: "side_wall", label: "Side wall", group: "Culvert", kind: "member", definition: "An outer vertical wall of a box culvert.", aliases: ["SIDE WALL", "OUTER WALL"], layer: "outline", hatch: "rcc" },
  { role: "interior_wall", label: "Intermediate wall", group: "Culvert", kind: "member", definition: "The wall between two cells of a multi-cell box.", aliases: ["INTERMEDIATE WALL", "MIDDLE WALL", "INTERIOR WALL", "PARTITION WALL"], layer: "outline", hatch: "rcc" },
  { role: "haunch", label: "Haunch", group: "Culvert", kind: "member", definition: "The splayed thickening at an inside corner of a box, where slab meets wall (e.g. 150 × 150).", aliases: ["HAUNCH"], layer: "outline" },
  { role: "concrete_section", label: "Concrete section (box outline)", group: "Culvert", kind: "member", definition: "The whole concrete cross-section of a structure, openings excluded.", aliases: ["BOX", "RCC BOX", "BOX CULVERT"], layer: "outline", hatch: "rcc" },
  { role: "wearing_course", label: "Wearing course", group: "Culvert", kind: "region", definition: "A thin protective concrete layer over the base slab where water flows.", aliases: ["WEARING COURSE", "WEARING COAT"], layer: "outline", hatch: "pcc" },
  // ------------------------------------------------------------- fill & protection
  { role: "earth_cushion", label: "Earth cushion", group: "Fill & protection", kind: "region", definition: "The earth fill between the top of a buried structure (box or pipe) and the formation — it spreads the track load. Its depth is formation level minus top of slab.", aliases: ["EARTH CUSHION", "CUSHION", "EARTH FILL ABOVE", "FILL OVER BOX"], layer: "ground", hatch: "earth", fact: "cushion_mm" },
  { role: "earth_fill", label: "Earth fill / embankment", group: "Fill & protection", kind: "region", definition: "Railway embankment or other compacted earth fill.", aliases: ["EARTH FILL", "EMBANKMENT", "BANK", "FILLING"], layer: "ground", hatch: "earth" },
  { role: "backfill", label: "Backfill", group: "Fill & protection", kind: "region", definition: "Free-draining granular fill placed behind abutments, wing walls and boxes (IRS Sub-structure Code 7.5).", aliases: ["BACKFILL", "BACK FILL", "GRANULAR FILL", "FILTER MEDIA"], layer: "ground", hatch: "backfill", source: "irs-substructure" },
  { role: "boulder_backing", label: "Boulder backing", group: "Fill & protection", kind: "region", definition: "Hand-packed stone boulders placed behind abutments and wing walls (IRBM Para 605), min 600 mm thick.", aliases: ["BOULDER BACKING", "BOULDERS", "BOULDER PACKING", "HAND PACKED BOULDERS", "BOULDER BACK FILL"], layer: "ground", hatch: "boulder", fact: "boulder_backing_mm", source: "irbm-605" },
  { role: "pcc_levelling", label: "PCC levelling course", group: "Fill & protection", kind: "region", definition: "Plain cement concrete layer under a footing or box, levelling the ground for construction.", aliases: ["PCC", "P C C", "LEAN CONCRETE", "LEVELLING COURSE", "M15", "M10"], layer: "outline", hatch: "pcc" },
  { role: "apron", label: "Apron / flooring", group: "Fill & protection", kind: "region", definition: "Protective flooring at the bed, upstream and downstream, against scour (IRBM Chapter VIII).", aliases: ["APRON", "FLOORING", "BOULDER APRON", "LAUNCHING APRON"], layer: "outline", hatch: "masonry" },
  { role: "pitching", label: "Pitching", group: "Fill & protection", kind: "region", definition: "Stone lining on slopes of banks and cones against erosion.", aliases: ["PITCHING", "STONE PITCHING", "BOULDER PITCHING"], layer: "outline", hatch: "masonry" },
  { role: "curtain_wall", label: "Curtain / drop wall", group: "Fill & protection", kind: "member", definition: "Vertical cut-off wall at the end of the flooring that stops scour undermining it.", aliases: ["CURTAIN WALL", "DROP WALL", "TOE WALL", "CUT OFF WALL"], layer: "outline", hatch: "concrete" },
  // ------------------------------------------------------------- superstructure
  { role: "deck", label: "Deck slab / superstructure", group: "Superstructure", kind: "member", definition: "The spanning member that carries the track — solid slab, or slab on girders.", aliases: ["DECK", "DECK SLAB", "SLAB", "SUPERSTRUCTURE", "SPAN"], layer: "outline", hatch: "rcc" },
  { role: "PSC_girder", label: "Girder", group: "Superstructure", kind: "member", definition: "A beam spanning between bearings (RCC, PSC or steel).", aliases: ["GIRDER", "PSC GIRDER", "I GIRDER", "BEAM", "T BEAM"], layer: "outline", hatch: "rcc" },
  { role: "diaphragm", label: "Diaphragm / cross frame", group: "Superstructure", kind: "member", definition: "Transverse bracing or diaphragm between bridge girders (RDSO/B-11778).", aliases: ["DIAPHRAGM", "CROSS FRAME", "INTERMEDIATE DIAPHRAGM", "END DIAPHRAGM"], layer: "outline", source: "rdso-b-11778" },
  { role: "kerb", label: "Ballast retainer / kerb", group: "Superstructure", kind: "member", definition: "Upstand at the deck edges that holds the ballast in.", aliases: ["BALLAST RETAINER", "KERB", "PARAPET", "RAILING"], layer: "outline", hatch: "rcc" },
  { role: "bearing", label: "Bearing", group: "Superstructure", kind: "member", definition: "The device that transfers the span's load to the substructure and allows its movement (fixed or free).", aliases: ["BEARING", "ELASTOMERIC BEARING", "FIXED BEARING", "FREE BEARING"], layer: "outline" },
  // ------------------------------------------------------------- substructure
  { role: "abutment", label: "Abutment", group: "Substructure", kind: "member", definition: "The end support of a bridge — it carries the end span and retains the approach embankment.", aliases: ["ABUTMENT", "ABUT", "A1", "A2"], layer: "outline", hatch: "rcc" },
  { role: "pier", label: "Pier", group: "Substructure", kind: "member", definition: "An intermediate support between two spans.", aliases: ["PIER", "P1", "P2", "P3", "SHAFT"], layer: "outline", hatch: "rcc" },
  { role: "pier_cap", label: "Pier / abutment cap", group: "Substructure", kind: "member", definition: "The head of a pier or abutment carrying the bearings; sized for bearings, jacks and seating (RDSO checklist 16).", aliases: ["PIER CAP", "ABUTMENT CAP", "CAP", "COPING"], layer: "outline", hatch: "rcc", source: "ircm-t403" },
  { role: "bearing_shelf", label: "Bearing shelf / seating", group: "Substructure", kind: "member", definition: "Horizontal shelf on pier/abutment cap providing minimum unseating prevention width W (RDSO BS-118 Cl. 14.3).", aliases: ["SEATING WIDTH", "BEARING SHELF", "SEATING SHELF", "SEISMIC SEATING", "BEARING SEAT"], layer: "outline", fact: "seating_width_mm", source: "rdso-bs-118" },
  { role: "bed_block", label: "Bed block / pedestal", group: "Substructure", kind: "member", definition: "The block on the cap directly under a bearing.", aliases: ["BED BLOCK", "PEDESTAL", "BEARING PEDESTAL"], layer: "outline", hatch: "rcc" },
  { role: "ballast_wall", label: "Ballast (dirt) wall", group: "Substructure", kind: "member", definition: "The wall at the back of an abutment cap, up to formation, that keeps the ballast and fill off the bearings.", aliases: ["BALLAST WALL", "DIRT WALL", "BACK WALL"], layer: "outline", hatch: "rcc" },
  { role: "wing_wall", label: "Wing wall", group: "Substructure", kind: "member", definition: "A wall splayed from the abutment that retains the embankment slope.", aliases: ["WING WALL", "WINGWALL"], layer: "outline", hatch: "rcc" },
  { role: "return_wall", label: "Return wall", group: "Substructure", kind: "member", definition: "A wall running back from the abutment parallel to the track, retaining the embankment.", aliases: ["RETURN WALL"], layer: "outline", hatch: "rcc" },
  { role: "weep_hole", label: "Weep hole", group: "Substructure", kind: "member", definition: "Drainage hole through abutment or wing wall (IRBM Para 605(2)), 100-150 mm dia at 1.0-1.5 m spacing.", aliases: ["WEEP HOLE", "WEEP HOLES", "WEEPHOLE", "WEEPHOLES"], layer: "outline", source: "irbm-605" },
  // ------------------------------------------------------------- foundation
  { role: "open_footing", label: "Open foundation / footing", group: "Foundation", kind: "member", definition: "A spread footing on firm strata at shallow depth — suitable where scour is small (IRBM 316(2)).", aliases: ["FOOTING", "OPEN FOUNDATION", "RAFT", "FOUNDATION"], layer: "outline", hatch: "rcc", source: "irbm-316" },
  { role: "pile", label: "Pile", group: "Foundation", kind: "member", definition: "A column driven or bored into the ground; spacing 2.5 d (end bearing) to 3 d (friction), normally not over 4 d (IRBM 409).", aliases: ["PILE", "BORED PILE", "DRIVEN PILE"], layer: "hidden", source: "irbm-409" },
  { role: "pile_cap", label: "Pile cap", group: "Foundation", kind: "member", definition: "The block that ties a group of piles and carries the pier or abutment.", aliases: ["PILE CAP"], layer: "outline", hatch: "rcc" },
  { role: "well_steining", label: "Well (steining, curb, plugs, cap)", group: "Foundation", kind: "member", definition: "A caisson foundation sunk through scourable bed: cutting edge and curb, steining walls, bottom plug, sand filling, top plug and well cap (IRBM 417–432).", aliases: ["WELL", "STEINING", "WELL CURB", "WELL CAP", "BOTTOM PLUG", "TOP PLUG"], layer: "outline", hatch: "concrete" },
  // ------------------------------------------------------------- track
  { role: "ballast", label: "Ballast", group: "Track", kind: "region", definition: "Crushed stone bed under the sleepers; the cushion below sleeper bottom is specified for ballasted decks.", aliases: ["BALLAST", "BALLAST CUSHION"], layer: "secondary", hatch: "ballast" },
  { role: "sleeper", label: "Sleeper", group: "Track", kind: "member", definition: "Transverse track member that holds the rails to gauge.", aliases: ["SLEEPER"], layer: "secondary" },
  { role: "rail", label: "Rail", group: "Track", kind: "member", definition: "The running rail on which the wheels bear; its top is the rail level.", aliases: ["RAIL"], layer: "outline" },
  // ------------------------------------------------------------- axes
  { role: "track_centreline", label: "Track centre line", group: "Axes", kind: "axis", definition: "Centre line of the track — the principal longitudinal reference (IRBM 401).", aliases: ["TRACK CENTRE LINE", "CL OF TRACK", "C/L OF TRACK", "TRACK CL"], layer: "centre", source: "irbm-401" },
  { role: "bridge_centreline", label: "Bridge / structure centre line", group: "Axes", kind: "axis", definition: "Centre line of the bridge or culvert.", aliases: ["CENTRE LINE", "CL", "C/L", "CL OF BRIDGE", "CL OF CULVERT"], layer: "centre", source: "irbm-401" },
  { role: "pier_axis", label: "Pier / abutment axis", group: "Axes", kind: "axis", definition: "Transverse centre line of a pier or abutment — a principal setting-out line (IRBM 401).", aliases: ["PIER AXIS", "CL OF PIER", "C/L OF PIER", "ABUTMENT AXIS"], layer: "centre", source: "irbm-401" },
];

const BY_ROLE = new Map(BRIDGE_TERMS.map((t) => [t.role, t]));

export function termFor(role: string | undefined): BridgeTerm | undefined {
  return role ? BY_ROLE.get(role) : undefined;
}

/** Normalises a drawing label for matching: upper case, dots and punctuation to spaces. */
export function normaliseLabel(text: string): string {
  return ` ${text.toUpperCase().replace(/[.,:;()/\\-]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * The term a piece of drawing text names, if any — the longest alias that
 * appears as whole words wins ("BED LEVEL" beats "BL", "HFL" beats "FL").
 */
export function termFromText(text: string): BridgeTerm | undefined {
  const n = normaliseLabel(text);
  let best: { term: BridgeTerm; len: number } | undefined;
  for (const t of BRIDGE_TERMS) {
    for (const a of t.aliases) {
      const needle = ` ${normaliseLabel(a).trim()} `;
      if (n.includes(needle) && (!best || needle.length > best.len)) best = { term: t, len: needle.length };
    }
  }
  return best?.term;
}

export const TERM_GROUPS: TermGroup[] = ["Levels", "Water", "Culvert", "Superstructure", "Substructure", "Foundation", "Fill & protection", "Track", "Axes"];
