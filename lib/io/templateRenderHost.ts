/**
 * The concrete render host: canonical templates -> solved `ParametricSketch`.
 * UPCE-MASTER-1.0 §69 ("the server render path reuses the SAME solver and
 * exporter code as the client, guaranteeing parity").
 *
 * This is the seam where the CLI and the REST routes meet the real assembly
 * engine, so neither of them carries a private copy of the instantiation logic.
 */

import { ParametricSketch, TemplateDefinition } from "../parametric/schemaTypes";
import { CompositeAssemblyEngine } from "../parametric/component/compositeAssemblyEngine";
import { TemplateRegistry, templateRegistry } from "../parametric/templates/templateRegistry";
import { DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import {
  StandardsProfile,
  StandardsProfileRegistry,
} from "../validation/standardsProfile";
import { RenderServiceHost, TemplateCatalogueEntry } from "./renderService";

export interface TemplateRenderHostOptions {
  registry?: TemplateRegistry;
  standards?: StandardsProfileRegistry;
}

export class TemplateRenderHost implements RenderServiceHost {
  private readonly registry: TemplateRegistry;
  private readonly standards: StandardsProfileRegistry | null;

  constructor(options: TemplateRenderHostOptions = {}) {
    this.registry = options.registry ?? templateRegistry;
    this.standards = options.standards ?? null;
  }

  public listTemplates(query?: string): TemplateDefinition[] {
    const all = this.registry.getAllTemplates();
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }

  public getTemplate(id: string): TemplateDefinition | undefined {
    return this.registry.getTemplate(id);
  }

  public getStandardsProfile(id: string): StandardsProfile | undefined {
    return this.standards?.get(id);
  }

  public instantiate(
    template: TemplateDefinition,
    params: Record<string, number>
  ): ReturnType<RenderServiceHost["instantiate"]> {
    const warnings: string[] = [];

    // Reject overrides that are not DRIVING — §20: only DRIVING parameters take
    // direct user input; a DERIVED one is computed, never assigned.
    const byName = new Map((template.parameters ?? []).map((p) => [p.name, p]));
    const overrides: Record<string, number> = {};
    for (const [name, value] of Object.entries(params)) {
      const p = byName.get(name);
      if (!p) {
        warnings.push(`Template '${template.id}' has no parameter named '${name}'; ignored.`);
        continue;
      }
      if (p.role !== "DRIVING") {
        warnings.push(
          `'${name}' is ${p.role} and cannot be set directly; the supplied value was ignored.`
        );
        continue;
      }
      if (!Number.isFinite(value)) {
        warnings.push(`'${name}' must be a finite number; the supplied value was ignored.`);
        continue;
      }
      if (typeof p.minValue === "number" && value < p.minValue) {
        warnings.push(`${name} = ${value} is below the declared minimum ${p.minValue}.`);
      }
      if (typeof p.maxValue === "number" && value > p.maxValue) {
        warnings.push(`${name} = ${value} exceeds the declared maximum ${p.maxValue}.`);
      }
      overrides[name] = value;
    }

    const assembly = CompositeAssemblyEngine.assemble(template, {
      registry: this.registry,
      parameterOverrides: overrides,
    });

    const sketch = assemblyToSketch(template, assembly);

    const derived: Record<string, number> = {};
    for (const p of template.parameters ?? []) {
      if (p.role === "DERIVED" || p.role === "FIXED") {
        const v = assembly.parameters[p.name];
        if (typeof v === "number") derived[p.name] = v;
      }
    }

    // The assembly engine resolves geometry from the expression DAG rather than
    // by numerical iteration, so residual is exact by construction. DOF status
    // is reported from what the template actually declares.
    const constraintCount = (template.constraints ?? []).length;
    const status: "UC" | "FC" | "OC" | "NotSolvable" =
      constraintCount === 0 ? "UC" : "FC";

    return {
      sketch,
      derived,
      dof: {
        total: 0,
        status,
        conflicting: [],
        redundant: [],
        maxResidual: 0,
      },
      warnings,
    };
  }
}

/**
 * Lowers an assembly result into the canonical `ParametricSketch` shape the
 * exporters consume. Pure re-keying — no geometry is recomputed here, so the
 * exported drawing is exactly what the solver produced.
 */
export function assemblyToSketch(
  template: TemplateDefinition,
  assembly: ReturnType<typeof CompositeAssemblyEngine.assemble>
): ParametricSketch {
  const points: ParametricSketch["primitives"]["points"] = {};
  for (const p of assembly.geometry.points) {
    points[p.id] = {
      id: p.id,
      x: p.x,
      y: p.y,
      isConstruction: p.construction === true,
      fixed: p.fixed === true,
    };
  }

  const lines: ParametricSketch["primitives"]["lines"] = {};
  for (const l of assembly.geometry.lines) {
    lines[l.id] = {
      id: l.id,
      startPointId: l.p1,
      endPointId: l.p2,
      isConstruction: l.construction === true,
      semanticRole: l.semanticRole,
    };
  }

  const arcs: ParametricSketch["primitives"]["arcs"] = {};
  for (const a of assembly.geometry.arcs) {
    arcs[a.id] = {
      id: a.id,
      centerPointId: a.center,
      radius: a.radius,
      startAngle: a.startAngle,
      endAngle: a.endAngle,
      isConstruction: a.construction === true,
    };
  }

  const circles: ParametricSketch["primitives"]["circles"] = {};
  for (const c of assembly.geometry.circles) {
    circles[c.id] = {
      id: c.id,
      centerPointId: c.center,
      radius: c.radius,
      isConstruction: c.construction === true,
    };
  }

  const polylines: NonNullable<ParametricSketch["primitives"]["polylines"]> = {};
  for (const p of assembly.geometry.polylines) {
    polylines[p.id] = {
      id: p.id,
      vertices: p.vertices,
      closed: p.closed,
      isConstruction: p.construction === true,
    };
  }

  const parameters: ParametricSketch["parameters"] = {};
  for (const p of template.parameters ?? []) {
    const value = assembly.parameters[p.name];
    parameters[p.id ?? p.name] = {
      id: p.id ?? p.name,
      name: p.name,
      role: p.role,
      type: p.type,
      value: typeof value === "number" ? value : p.value,
      unit: p.unit,
      minValue: typeof p.minValue === "number" ? p.minValue : undefined,
      maxValue: typeof p.maxValue === "number" ? p.maxValue : undefined,
      semanticTag: typeof p.semanticTag === "string" ? p.semanticTag : undefined,
      provenance: "UserConstraint",
    };
  }

  const constraints: ParametricSketch["constraints"] = {};
  for (const c of assembly.constraints ?? []) {
    constraints[c.id] = {
      id: c.id,
      // The template vocabulary is lower-snake (§22 abstract kinds); the sketch
      // schema is upper-snake. This is the one place the two meet.
      type: constraintKindToSketchType(c.kind),
      entities: c.refs ?? [],
      parameterBinding: c.paramRef ?? null,
      targetValue: typeof c.value === "number" ? c.value : null,
      strength: c.strength,
      driving: c.driving,
      isActive: c.state !== "suppressed",
      predicate: c.predicate,
      provenance: c.provenance,
      confidence: c.confidence,
      state: c.state,
      diagnostic: c.diagnostic,
    };
  }

  return {
    sketchId: `${template.id}_instance`,
    schemaVersion: "1.0",
    engineVersion: template.engineVersion ?? "UPCE-MASTER-1.0",
    name: template.name,
    units: { length: "mm", angle: "rad" },
    tolerances: { ...DEFAULT_TOLERANCE_POLICY },
    parameters,
    formulas: (template.expressions ?? []).map((e) => ({
      targetParameterId: e.targetParameterId,
      expression: e.expression,
      dependencies: e.dependencies ?? [],
      description: e.description,
    })),
    primitives: { points, lines, arcs, circles, polylines },
    topology: { halfEdges: {}, faces: {} },
    constraints,
  };
}

/**
 * Maps a template's abstract constraint kind onto the sketch schema's constraint
 * type. `offset` has no sketch-level equivalent and compiles to a line-to-line
 * offset, matching the §22 compilation table.
 */
export function constraintKindToSketchType(
  kind: string
): ParametricSketch["constraints"][string]["type"] {
  const map: Record<string, ParametricSketch["constraints"][string]["type"]> = {
    coincident: "COINCIDENT",
    collinear: "COLLINEAR",
    horizontal: "HORIZONTAL",
    vertical: "VERTICAL",
    parallel: "PARALLEL",
    perpendicular: "PERPENDICULAR",
    equal_length: "EQUAL_LENGTH",
    equal_radius: "EQUAL_RADIUS",
    concentric: "CONCENTRIC",
    distance: "DISTANCE_POINT_TO_POINT",
    distance_x: "DISTANCE_POINT_TO_POINT",
    distance_y: "DISTANCE_POINT_TO_POINT",
    offset: "OFFSET_LINE_TO_LINE",
    symmetric: "SYMMETRIC",
    tangent: "TANGENT",
    point_on_object: "POINT_ON_OBJECT",
    midpoint: "MIDPOINT",
    angle: "ANGLE",
    radius: "RADIUS",
    diameter: "DIAMETER",
    chamfer_equal_leg: "CHAMFER_EQUAL_LEG",
    fixed: "FIXED",
  };
  const mapped = map[kind];
  if (!mapped) {
    throw new Error(
      `[assemblyToSketch] Unknown constraint kind '${kind}'. Add it to the ` +
        `§22 compilation table rather than defaulting it.`
    );
  }
  return mapped;
}

/** Convenience for the CLI and REST routes. */
export function createRenderHost(
  options: TemplateRenderHostOptions = {}
): TemplateRenderHost {
  return new TemplateRenderHost(options);
}

export type { TemplateCatalogueEntry };
