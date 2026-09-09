/**
 * Curated Civil & Mechanical Engineering Vocabulary Engine
 * UPCE-MASTER-1.0 §86, §35–§38, §57, Gate G7 (§76)
 *
 * Provides authoritative dictionary definitions, standard ranges, unit bindings,
 * and semantic parameter classification for parametric CAD models.
 */

export interface SemanticParameterDefinition {
  name: string;
  displayName: string;
  category: "civil_structural" | "clearance" | "component" | "alignment" | "general";
  defaultUnit: "mm" | "deg" | "m" | "count" | "ratio";
  role: "DRIVING" | "DERIVED" | "FIXED";
  standardRange: {
    min: number;
    max: number;
    recommendedDefault: number;
  };
  description: string;
  standardsReference?: string;
}

/**
 * Curated Civil/Mechanical Engineering Vocabulary Dictionary (§35, §57).
 */
export const CURATED_SEMANTIC_VOCABULARY: Record<string, SemanticParameterDefinition> = {
  WallThickness: {
    name: "WallThickness",
    displayName: "Wall Thickness",
    category: "civil_structural",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 150, max: 2000, recommendedDefault: 300 },
    description: "Structural thickness of exterior or dividing concrete walls",
    standardsReference: "IRC:SP:13 Clause 12.2 / RDSO Standard",
  },
  ClearSpan: {
    name: "ClearSpan",
    displayName: "Clear Span",
    category: "clearance",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 500, max: 30000, recommendedDefault: 2000 },
    description: "Clear horizontal opening distance between inner wall faces",
    standardsReference: "IRC:SP:13 Clause 12.1 / RDSO Drawing Standard",
  },
  ClearHeight: {
    name: "ClearHeight",
    displayName: "Clear Height",
    category: "clearance",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 500, max: 10000, recommendedDefault: 1500 },
    description: "Clear vertical opening height between floor and ceiling slabs",
    standardsReference: "IRC:SP:13 Clause 12.1 / RDSO Drawing Standard",
  },
  HaunchLeg: {
    name: "HaunchLeg",
    displayName: "Haunch Leg",
    category: "civil_structural",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 50, max: 1000, recommendedDefault: 150 },
    description: "Corner haunch or splay leg projection length",
    standardsReference: "IRC:SP:13 Clause 12.3 / RDSO Standard Details",
  },
  TopSlabThickness: {
    name: "TopSlabThickness",
    displayName: "Top Slab Thickness",
    category: "civil_structural",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 150, max: 1500, recommendedDefault: 300 },
    description: "Structural thickness of top deck, roof slab, or bridge superstructure slab",
    standardsReference: "IRC:SP:13 Clause 12.2 / IRS Bridge Rules",
  },
  BottomSlabThickness: {
    name: "BottomSlabThickness",
    displayName: "Bottom Slab Thickness",
    category: "civil_structural",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 150, max: 1500, recommendedDefault: 350 },
    description: "Structural thickness of bottom raft, invert slab, or footing pad",
    standardsReference: "IRC:SP:13 Clause 12.2 / IRS Concrete Bridge Code",
  },
  ParapetHeight: {
    name: "ParapetHeight",
    displayName: "Parapet Height",
    category: "component",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 300, max: 2000, recommendedDefault: 1000 },
    description: "Vertical height of bridge parapet, crash barrier, or railing wall",
    standardsReference: "IRC:5 Clause 109",
  },
  PierWidth: {
    name: "PierWidth",
    displayName: "Pier Width",
    category: "civil_structural",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 300, max: 5000, recommendedDefault: 1200 },
    description: "Transverse structural width of bridge pier column or shaft",
    standardsReference: "IRC:78 Clause 706",
  },
  PierSpacing: {
    name: "PierSpacing",
    displayName: "Pier Spacing",
    category: "clearance",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 1000, max: 50000, recommendedDefault: 8000 },
    description: "Center-to-center or edge-to-edge spacing between adjacent bridge piers",
    standardsReference: "IRC:78 Clause 707",
  },
  // General geometric predicates
  CornerChamfer: {
    name: "CornerChamfer",
    displayName: "Corner Chamfer",
    category: "general",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 10, max: 1000, recommendedDefault: 100 },
    description: "Chamfer leg dimension on corner vertex",
  },
  DraftAngle: {
    name: "DraftAngle",
    displayName: "Draft Angle",
    category: "general",
    defaultUnit: "deg",
    role: "DRIVING",
    standardRange: { min: 0.5, max: 89.5, recommendedDefault: 45 },
    description: "Angular slope or draft taper angle",
  },
  RadialOffset: {
    name: "RadialOffset",
    displayName: "Radial Offset",
    category: "general",
    defaultUnit: "mm",
    role: "DRIVING",
    standardRange: { min: 10, max: 5000, recommendedDefault: 100 },
    description: "Radial clearance between concentric circular boundaries",
  },
  TangentContact: {
    name: "TangentContact",
    displayName: "Tangent Contact",
    category: "alignment",
    defaultUnit: "mm",
    role: "FIXED",
    standardRange: { min: 0, max: 0, recommendedDefault: 0 },
    description: "Tangency contact between line and circle or two circles",
  },
  SymmetryAxis: {
    name: "SymmetryAxis",
    displayName: "Symmetry Axis",
    category: "alignment",
    defaultUnit: "mm",
    role: "FIXED",
    standardRange: { min: 0, max: 0, recommendedDefault: 0 },
    description: "Geometric reflection symmetry constraint across centerline",
  },
  VertexWeld: {
    name: "VertexWeld",
    displayName: "Vertex Weld",
    category: "alignment",
    defaultUnit: "mm",
    role: "FIXED",
    standardRange: { min: 0, max: 0, recommendedDefault: 0 },
    description: "Topological vertex weld coincidence",
  },
};

/**
 * Checks if a parameter name is part of the curated vocabulary.
 */
export function isValidSemanticParameter(name: string): boolean {
  return name in CURATED_SEMANTIC_VOCABULARY;
}

/**
 * Retrieves the definition for a curated parameter name.
 */
export function getSemanticParameterDefinition(
  name: string
): SemanticParameterDefinition | undefined {
  return CURATED_SEMANTIC_VOCABULARY[name];
}

export interface SemanticClassificationContext {
  orientation?: "horizontal" | "vertical" | "oblique";
  role?: string;
  context?: string;
  measuredValue?: number;
  faceCategory?: string;
  sourceTags?: string[];
}

/**
 * Maps geometric predicate and context to curated civil/mechanical terminology.
 */
export function classifySemanticParameter(
  predicate: string,
  ctx: SemanticClassificationContext = {}
): { parameterName: string; displayName: string } {
  const { orientation, context, faceCategory, sourceTags } = ctx;

  // Direct tag matching
  if (sourceTags && sourceTags.length > 0) {
    for (const tag of sourceTags) {
      if (tag === "deck_slab" || tag === "top_slab") {
        return { parameterName: "TopSlabThickness", displayName: "Top Slab Thickness" };
      }
      if (tag === "bottom_slab" || tag === "raft") {
        return { parameterName: "BottomSlabThickness", displayName: "Bottom Slab Thickness" };
      }
      if (tag === "parapet_barrier" || tag === "parapet") {
        return { parameterName: "ParapetHeight", displayName: "Parapet Height" };
      }
      if (tag === "pier_column" || tag === "pier") {
        return { parameterName: "PierWidth", displayName: "Pier Width" };
      }
      if (tag === "culvert_wall" || tag === "outer_wall") {
        return { parameterName: "WallThickness", displayName: "Wall Thickness" };
      }
      if (tag === "internal_cavity_void" || tag === "culvert_barrel") {
        if (orientation === "vertical") {
          return { parameterName: "ClearHeight", displayName: "Clear Height" };
        }
        return { parameterName: "ClearSpan", displayName: "Clear Span" };
      }
    }
  }

  // Face category hint
  if (faceCategory) {
    if (faceCategory === "TOP_SLAB" || faceCategory === "DECK") {
      return { parameterName: "TopSlabThickness", displayName: "Top Slab Thickness" };
    }
    if (faceCategory === "BOTTOM_SLAB" || faceCategory === "FOOTING") {
      return { parameterName: "BottomSlabThickness", displayName: "Bottom Slab Thickness" };
    }
    if (faceCategory === "BARRIER") {
      return { parameterName: "ParapetHeight", displayName: "Parapet Height" };
    }
    if (faceCategory === "PIER") {
      return { parameterName: "PierWidth", displayName: "Pier Width" };
    }
    if (faceCategory === "OUTER_WALL" || faceCategory === "INTERNAL_WEB") {
      return { parameterName: "WallThickness", displayName: "Wall Thickness" };
    }
  }

  // Context string matching
  if (context) {
    const cLower = context.toLowerCase();
    if (cLower.includes("deck") || cLower.includes("top_slab")) {
      return { parameterName: "TopSlabThickness", displayName: "Top Slab Thickness" };
    }
    if (cLower.includes("bottom_slab") || cLower.includes("invert") || cLower.includes("raft")) {
      return { parameterName: "BottomSlabThickness", displayName: "Bottom Slab Thickness" };
    }
    if (cLower.includes("parapet") || cLower.includes("barrier")) {
      return { parameterName: "ParapetHeight", displayName: "Parapet Height" };
    }
    if (cLower.includes("pier")) {
      if (predicate === "DISTANCE" && orientation === "horizontal") {
        return { parameterName: "PierSpacing", displayName: "Pier Spacing" };
      }
      return { parameterName: "PierWidth", displayName: "Pier Width" };
    }
    if (cLower.includes("haunch") || cLower.includes("splay")) {
      return { parameterName: "HaunchLeg", displayName: "Haunch Leg" };
    }
    if (cLower.includes("culvert") || cLower.includes("barrel") || cLower.includes("span")) {
      if (orientation === "vertical") {
        return { parameterName: "ClearHeight", displayName: "Clear Height" };
      }
      return { parameterName: "ClearSpan", displayName: "Clear Span" };
    }
  }

  // Predicate-based mapping
  switch (predicate) {
    case "P3_PARALLEL_OFFSET":
      if (orientation === "horizontal") {
        return { parameterName: "TopSlabThickness", displayName: "Top Slab Thickness" };
      }
      return { parameterName: "WallThickness", displayName: "Wall Thickness" };

    case "P4_CORNER_CHAMFER":
      return { parameterName: "HaunchLeg", displayName: "Haunch Leg" };

    case "DISTANCE":
      if (orientation === "vertical") {
        return { parameterName: "ClearHeight", displayName: "Clear Height" };
      }
      return { parameterName: "ClearSpan", displayName: "Clear Span" };

    case "P5_CONCENTRIC_RADIAL_OFFSET":
      return { parameterName: "RadialOffset", displayName: "Radial Offset" };

    case "P6_TANGENT":
      return { parameterName: "TangentContact", displayName: "Tangent Contact" };

    case "P9_SYMMETRY":
      return { parameterName: "SymmetryAxis", displayName: "Symmetry Axis" };

    case "SIGNED_ANGLE":
      return { parameterName: "DraftAngle", displayName: "Draft Angle" };

    case "P8_COINCIDENCE":
      return { parameterName: "VertexWeld", displayName: "Vertex Weld" };

    case "P1_PARALLEL":
      return { parameterName: "ParallelAlignment", displayName: "Parallel Alignment" };

    case "P2_PERPENDICULAR":
      return { parameterName: "SquareCorner", displayName: "Square Corner" };

    case "EQUAL_LENGTH":
      return { parameterName: "EqualLength", displayName: "Equal Length" };

    default:
      return { parameterName: "Dimension", displayName: "Dimension" };
  }
}
