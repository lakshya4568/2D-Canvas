/**
 * The deterministic fallback namer.
 * UPCE-MASTER-1.0 §57 — "the system works with AI off".
 *
 *   horizontal inner void distance    → ClearSpan_1
 *   vertical inner void distance      → ClearHeight_1
 *   vertical solid offset             → WallThickness_1
 *   top horizontal solid offset       → TopSlabThickness
 *   bottom horizontal solid offset    → BottomSlabThickness
 *   equal-leg chamfer cluster         → HaunchSize_1
 *   repeated stride                   → Spacing_1 / Count_1
 *   anything else                     → Parameter_N
 *
 * "Rule: the geometry engine MUST NOT depend on AI availability. AI is an
 *  accelerator, never a foundation. Ship the deterministic namer first."
 *
 * This file is that namer. It has no network access, no async dependency, and no
 * model of any kind. It is also the LLM path's fallback, so the whole pipeline
 * degrades to it without a code path change.
 */

import {
  AbstractedCluster,
  AbstractedDescriptor,
  NamingPatch,
  NamingResult,
  Namer,
  ParameterRole,
  ParameterUnit,
  ParameterValueType,
} from "./types";

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** Reserved words a parameter may never be called (§56 semantic validation). */
export const RESERVED_PARAMETER_NAMES = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "if", "else", "for", "while", "return", "function", "class",
  "const", "let", "var", "import", "export", "new", "delete",
  "pi", "PI", "e", "E", "abs", "min", "max", "sin", "cos", "tan", "sqrt", "pow",
]);

interface Classification {
  base: string;
  role: ParameterRole;
  type: ParameterValueType;
  unit: ParameterUnit;
  uiGroup: string;
  semanticTag: string;
  explanation: string;
  confidence: number;
}

function classify(cluster: AbstractedCluster): Classification | null {
  const orientation = (cluster.orientation ?? "").toUpperCase();
  const adjacency = (cluster.adjacency ?? "").toLowerCase();

  if (cluster.kind === "span") {
    if (orientation.includes("HORIZONTAL")) {
      return {
        base: "ClearSpan",
        role: "DRIVING",
        type: "LENGTH",
        unit: "mm",
        uiGroup: "Clearance Dimensions",
        semanticTag: "CLEAR_SPAN",
        explanation: "Horizontal distance across an interior void.",
        confidence: 0.75,
      };
    }
    if (orientation.includes("VERTICAL")) {
      return {
        base: "ClearHeight",
        role: "DRIVING",
        type: "LENGTH",
        unit: "mm",
        uiGroup: "Clearance Dimensions",
        semanticTag: "CLEAR_HEIGHT",
        explanation: "Vertical distance across an interior void.",
        confidence: 0.75,
      };
    }
  }

  if (cluster.kind === "offset_cluster") {
    if (orientation.includes("HORIZONTAL_TOP") || adjacency.includes("top_slab")) {
      return {
        base: "TopSlabThickness",
        role: "DRIVING",
        type: "LENGTH",
        unit: "mm",
        uiGroup: "Structural Thicknesses",
        semanticTag: "SLAB_THICKNESS",
        explanation: "Horizontal solid offset bounding the void from above.",
        confidence: 0.7,
      };
    }
    if (orientation.includes("HORIZONTAL_BOTTOM") || adjacency.includes("bottom_slab")) {
      return {
        base: "BottomSlabThickness",
        role: "DRIVING",
        type: "LENGTH",
        unit: "mm",
        uiGroup: "Structural Thicknesses",
        semanticTag: "SLAB_THICKNESS",
        explanation: "Horizontal solid offset bounding the void from below.",
        confidence: 0.7,
      };
    }
    if (orientation.includes("VERTICAL")) {
      return {
        base: "WallThickness",
        role: "DRIVING",
        type: "LENGTH",
        unit: "mm",
        uiGroup: "Structural Thicknesses",
        semanticTag: "WALL_THICKNESS",
        explanation: "Vertical solid offset repeated between parallel boundaries.",
        confidence: 0.7,
      };
    }
    return {
      base: "Offset",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      uiGroup: "Structural Thicknesses",
      semanticTag: "OFFSET",
      explanation: "Constant perpendicular offset between two parallel boundaries.",
      confidence: 0.55,
    };
  }

  if (cluster.kind === "chamfer") {
    return {
      base: "HaunchSize",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      uiGroup: "Corner Transitions",
      semanticTag: "HAUNCH_SIZE",
      explanation: "Equal-leg chamfer measured at a corner transition.",
      confidence: 0.65,
    };
  }

  if (cluster.kind === "angle") {
    return {
      base: "Angle",
      role: "DRIVING",
      type: "ANGLE",
      unit: "deg",
      uiGroup: "Corner Transitions",
      semanticTag: "SPLAY_ANGLE",
      explanation: "Measured angle between two adjacent boundaries.",
      confidence: 0.6,
    };
  }

  if (cluster.kind === "radius") {
    return {
      base: "Radius",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      uiGroup: "Circular Features",
      semanticTag: "RADIUS",
      explanation: "Radius of a circular or arc boundary.",
      confidence: 0.65,
    };
  }

  if (cluster.kind === "repeat") {
    // A repeat descriptor yields two parameters; the caller expands it.
    return {
      base: "Spacing",
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      uiGroup: "Configuration",
      semanticTag: "SPACING",
      explanation: "Constant stride between repeated features.",
      confidence: 0.6,
    };
  }

  return null;
}

/**
 * Assigns unique, suffixed names. The suffix is only added when a base name is
 * genuinely reused, so the common single-cell case reads "ClearSpan", not
 * "ClearSpan_1" — while a two-cell drawing still gets distinct names.
 */
function uniquify(patches: { base: string; patch: Omit<NamingPatch, "name"> }[]): NamingPatch[] {
  const counts = new Map<string, number>();
  for (const p of patches) counts.set(p.base, (counts.get(p.base) ?? 0) + 1);

  const used = new Map<string, number>();
  return patches.map(({ base, patch }) => {
    const total = counts.get(base) ?? 1;
    let name = base;
    if (total > 1) {
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      name = `${base}_${n}`;
    }
    return { ...patch, name };
  });
}

/**
 * §57 deterministic namer. Synchronous under the hood; async only to satisfy the
 * shared `Namer` interface so callers cannot tell which path ran.
 */
export class DeterministicFallbackNamer implements Namer {
  public nameSync(descriptor: AbstractedDescriptor): NamingResult {
    const t0 = Date.now();
    const staged: { base: string; patch: Omit<NamingPatch, "name"> }[] = [];
    let unclassified = 0;

    for (const cluster of descriptor.clusters) {
      const c = classify(cluster);
      if (!c) {
        unclassified += 1;
        staged.push({
          base: `Parameter_${unclassified}`,
          patch: {
            candidateId: cluster.rawId,
            role: "DRIVING",
            type: "LENGTH",
            unit: "mm",
            uiGroup: "Other Dimensions",
            confidence: 0.3,
            explanation: "Detected dimension with no recognised structural role.",
          },
        });
        continue;
      }

      staged.push({
        base: c.base,
        patch: {
          candidateId: cluster.rawId,
          role: c.role,
          type: c.type,
          unit: c.unit,
          uiGroup: c.uiGroup,
          semanticTag: c.semanticTag,
          confidence: c.confidence,
          explanation: c.explanation,
        },
      });

      // A repeat cluster also yields its integer count.
      if (cluster.kind === "repeat") {
        staged.push({
          base: "Count",
          patch: {
            candidateId: `${cluster.rawId}_count`,
            role: "DRIVING",
            type: "COUNT",
            unit: "count",
            uiGroup: "Configuration",
            semanticTag: "REPEAT_COUNT",
            confidence: 0.6,
            explanation: "Number of repeated instances along the detected stride.",
          },
        });
      }
    }

    const names = uniquify(staged).filter((p) => isValidParameterName(p.name));

    return {
      structureType: descriptor.drawingType,
      names,
      source: "deterministic-fallback",
      elapsedMs: Date.now() - t0,
    };
  }

  public async name(descriptor: AbstractedDescriptor): Promise<NamingResult> {
    return this.nameSync(descriptor);
  }
}

export function isValidParameterName(name: string): boolean {
  return NAME_PATTERN.test(name) && !RESERVED_PARAMETER_NAMES.has(name);
}
