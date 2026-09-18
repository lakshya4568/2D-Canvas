/**
 * Stable semantic roles (railway guide §2.3, blueprint §3).
 *
 * A controlled vocabulary first; projects may extend it. Roles identify intent
 * even when entities are imported, regenerated, copied or moved, which is what
 * lets a validator ask "is there an HFL line?" instead of guessing from colour.
 */

export const SEMANTIC_ROLES = {
  alignment_and_track: [
    "bridge_centreline",
    "railway_centreline",
    "track_centreline",
    "track_axis",
    "rail_top",
    "rail",
    "sleeper",
    "ballast",
    "formation_line",
    "chainage_marker",
    "direction_of_kilometrage",
    "OHE_axis",
    "clearance_envelope",
  ],
  hydraulic: ["river_centreline", "flow_arrow", "HFL", "LWL", "danger_level", "bed_level", "scour_level", "afflux_line", "floodplain", "waterway", "clear_opening"],
  substructure: ["abutment", "abutment_cap", "pier", "pier_cap", "bed_block", "ballast_wall", "wing_wall", "return_wall", "face_wall", "curtain_wall", "drop_wall", "toe_wall", "apron", "pitching", "weep_hole"],
  foundation: ["open_footing", "raft", "pile", "pile_group", "pile_cap", "well_curb", "cutting_edge", "well_steining", "dredge_hole", "bottom_plug", "sand_hearts", "top_plug", "well_cap", "pcc_levelling"],
  superstructure: ["pipe", "slab", "deck", "arch", "RCC_beam", "PSC_girder", "plate_girder", "cross_girder", "stringer", "truss", "diaphragm", "end_block", "kerb", "concrete_section"],
  bearings: ["bearing", "fixed_bearing", "expansion_bearing", "elastomeric_bearing", "PTFE_bearing", "holding_down_bolt", "expansion_joint"],
  construction: ["survey_control", "reference_pillar", "baseline", "temporary_staging", "cofferdam", "sheet_pile", "launch_nose", "crane_zone", "trestle", "exclusion_zone"],
  earthwork: ["earth_fill", "embankment", "existing_ground", "proposed_ground", "cradle"],
  levels: ["rail_level", "formation_level", "level_marker"],
  axes: ["pier_axis", "abutment_axis", "well_axis", "structure_centreline"],
} as const;

export const ALL_ROLES: string[] = Object.values(SEMANTIC_ROLES).flat();

export function isKnownRole(role: string | undefined): boolean {
  return !!role && ALL_ROLES.includes(role);
}
