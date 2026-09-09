/**
 * Template Validation & Diagnostics Engine (UPCE-MASTER-1.0 §86, §5.6, §43, §44, Gate G5 §76)
 *
 * Checks 5 fundamental diagnostic conditions:
 * 1. Unbound ports & cyclic port attachments (Tarjan SCC).
 * 2. Circular expression dependency cycles in DAG via Tarjan SCC.
 * 3. Duplicate driving dimensions / over-driven parameters.
 * 4. Parameter range limits (min <= defaultValue <= max).
 * 5. Solvability & geometric consistency (no dangling primitive or constraint refs).
 */

import { TemplateDefinition } from "../schemaTypes";
import { detectCyclesTarjan } from "../dag/tarjan";
import { parseFormula } from "../expression";
import { TemplateRegistry } from "./templateRegistry";

export interface TemplateDiagnostic {
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  category: "PORTS" | "EXPRESSIONS" | "PARAMETERS" | "GEOMETRY" | "CONSTRAINTS";
  message: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export interface TemplateValidationResult {
  valid: boolean;
  diagnostics: TemplateDiagnostic[];
  errors: TemplateDiagnostic[];
  warnings: TemplateDiagnostic[];
}

export class TemplateValidator {
  /**
   * Validates a TemplateDefinition against all 5 diagnostic conditions.
   */
  public static validate(
    template: TemplateDefinition,
    registry?: TemplateRegistry
  ): TemplateValidationResult {
    const diagnostics: TemplateDiagnostic[] = [];

    // Condition 1: Ports & Port Attachments
    this.checkPortsAndAttachments(template, registry, diagnostics);

    // Condition 2: Circular expression dependencies in DAG
    this.checkExpressionCycles(template, diagnostics);

    // Condition 3: Duplicate driving dimensions & over-driven parameters
    this.checkDuplicateAndOverdrivenParameters(template, diagnostics);

    // Condition 4: Parameter range limits
    this.checkParameterRanges(template, diagnostics);

    // Condition 5: Solvability & geometric consistency
    this.checkGeometricConsistency(template, diagnostics);

    const errors = diagnostics.filter((d) => d.severity === "ERROR");
    const warnings = diagnostics.filter((d) => d.severity === "WARNING");

    return {
      valid: errors.length === 0,
      diagnostics,
      errors,
      warnings,
    };
  }

  /**
   * Condition 1: Unbound ports and cyclic port attachments.
   */
  private static checkPortsAndAttachments(
    template: TemplateDefinition,
    registry: TemplateRegistry | undefined,
    diagnostics: TemplateDiagnostic[]
  ): void {
    const portIds = new Set<string>();
    for (const port of template.ports || []) {
      if (portIds.has(port.id)) {
        diagnostics.push({
          code: "DUPLICATE_PORT_ID",
          severity: "ERROR",
          category: "PORTS",
          entityId: port.id,
          message: `Port with duplicate id '${port.id}' defined on template '${template.id}'`,
        });
      }
      portIds.add(port.id);

      if (!port.localFrame || !port.localFrame.origin || port.localFrame.angle === undefined) {
        diagnostics.push({
          code: "MALFORMED_PORT_FRAME",
          severity: "ERROR",
          category: "PORTS",
          entityId: port.id,
          message: `Port '${port.id}' must specify valid localFrame with origin and angle`,
        });
      }
    }

    const instanceIds = new Set<string>();
    const instanceTemplateMap = new Map<string, string>();

    if (template.components && template.components.length > 0) {
      for (const comp of template.components) {
        if (instanceIds.has(comp.instanceId)) {
          diagnostics.push({
            code: "DUPLICATE_INSTANCE_ID",
            severity: "ERROR",
            category: "PORTS",
            entityId: comp.instanceId,
            message: `Duplicate component instanceId '${comp.instanceId}' in template '${template.id}'`,
          });
        }
        instanceIds.add(comp.instanceId);
        instanceTemplateMap.set(comp.instanceId, comp.templateId);
      }

      // Check attachment validity & build directed graph for Tarjan cycle check
      const adjList = new Map<string, string[]>();
      for (const id of instanceIds) {
        adjList.set(id, []);
      }

      for (const comp of template.components) {
        if (!comp.attachedVia) continue;

        const { parentInstanceId, parentPortId, ownPortId } = comp.attachedVia;

        // Check if parent instance exists (or refers to root assembly)
        const isParentRoot = parentInstanceId === "root" || parentInstanceId === template.id;
        if (!isParentRoot && !instanceIds.has(parentInstanceId)) {
          diagnostics.push({
            code: "UNBOUND_PARENT_INSTANCE",
            severity: "ERROR",
            category: "PORTS",
            entityId: comp.instanceId,
            message: `Component instance '${comp.instanceId}' attached to non-existent parent instance '${parentInstanceId}'`,
          });
        } else if (!isParentRoot) {
          adjList.get(comp.instanceId)!.push(parentInstanceId);
        }

        // Check port bindings in registry if available
        if (registry) {
          const ownTemplateDef = registry.getTemplate(comp.templateId);
          if (ownTemplateDef) {
            const hasOwnPort = ownTemplateDef.ports.some((p) => p.id === ownPortId);
            if (!hasOwnPort) {
              diagnostics.push({
                code: "UNBOUND_OWN_PORT",
                severity: "ERROR",
                category: "PORTS",
                entityId: comp.instanceId,
                message: `Port '${ownPortId}' does not exist on child template '${comp.templateId}' for instance '${comp.instanceId}'`,
              });
            }
          }

          if (isParentRoot) {
            const hasParentPort = template.ports.some((p) => p.id === parentPortId);
            if (!hasParentPort) {
              diagnostics.push({
                code: "UNBOUND_PARENT_PORT",
                severity: "ERROR",
                category: "PORTS",
                entityId: comp.instanceId,
                message: `Port '${parentPortId}' does not exist on root template '${template.id}'`,
              });
            }
          } else {
            const parentTemplateId = instanceTemplateMap.get(parentInstanceId);
            if (parentTemplateId) {
              const parentTemplateDef = registry.getTemplate(parentTemplateId);
              if (parentTemplateDef) {
                const hasParentPort = parentTemplateDef.ports.some((p) => p.id === parentPortId);
                if (!hasParentPort) {
                  diagnostics.push({
                    code: "UNBOUND_PARENT_PORT",
                    severity: "ERROR",
                    category: "PORTS",
                    entityId: comp.instanceId,
                    message: `Port '${parentPortId}' does not exist on parent template '${parentTemplateId}' for parent instance '${parentInstanceId}'`,
                  });
                }
              }
            }
          }
        }
      }

      // Detect cyclic attachments
      const cycles = detectCyclesTarjan(adjList);
      if (cycles.length > 0) {
        for (const cycle of cycles) {
          diagnostics.push({
            code: "CYCLIC_PORT_ATTACHMENT",
            severity: "ERROR",
            category: "PORTS",
            message: `Cyclic port attachment detected in components: ${cycle.join(" -> ")} -> ${cycle[0]}`,
            details: { cycle },
          });
        }
      }
    }

    // Validate procedural repeat rules
    if (template.repeats && template.repeats.length > 0) {
      const repeatIds = new Set<string>();
      const paramIds = new Set(template.parameters?.map((p) => p.id) || []);

      for (const rep of template.repeats) {
        if (repeatIds.has(rep.id)) {
          diagnostics.push({
            code: "DUPLICATE_REPEAT_ID",
            severity: "ERROR",
            category: "PORTS",
            entityId: rep.id,
            message: `Duplicate repeat rule id '${rep.id}' in template '${template.id}'`,
          });
        }
        repeatIds.add(rep.id);

        if (!paramIds.has(rep.countParamRef)) {
          diagnostics.push({
            code: "UNDEFINED_REPEAT_COUNT_PARAM",
            severity: "ERROR",
            category: "PORTS",
            entityId: rep.id,
            message: `Repeat rule '${rep.id}' references undefined count parameter '${rep.countParamRef}'`,
          });
        }

        const parsedSpacing = parseFormula(rep.spacingExpr);
        if (parsedSpacing.error) {
          diagnostics.push({
            code: "INVALID_REPEAT_SPACING_EXPR",
            severity: "ERROR",
            category: "EXPRESSIONS",
            entityId: rep.id,
            message: `Repeat rule '${rep.id}' has invalid spacing expression: ${parsedSpacing.error}`,
          });
        } else {
          const indexVar = rep.indexVariable || "i";
          for (const dep of parsedSpacing.dependencies) {
            if (!paramIds.has(dep) && dep !== indexVar && dep.toLowerCase() !== "pi" && dep.toLowerCase() !== "e") {
              diagnostics.push({
                code: "UNDEFINED_REPEAT_SPACING_VARIABLE",
                severity: "ERROR",
                category: "EXPRESSIONS",
                entityId: rep.id,
                message: `Spacing expression in repeat '${rep.id}' references undefined parameter '${dep}'`,
              });
            }
          }
        }

        if (registry) {
          const sourceTmpl = registry.getTemplate(rep.sourceComponent);
          if (!sourceTmpl) {
            diagnostics.push({
              code: "UNBOUND_REPEAT_SOURCE_COMPONENT",
              severity: "ERROR",
              category: "PORTS",
              entityId: rep.id,
              message: `Repeat rule '${rep.id}' references non-existent source template '${rep.sourceComponent}'`,
            });
          } else {
            const hasAnchorPort = sourceTmpl.ports?.some((p) => p.id === rep.anchorPortId);
            if (!hasAnchorPort) {
              diagnostics.push({
                code: "UNBOUND_REPEAT_ANCHOR_PORT",
                severity: "ERROR",
                category: "PORTS",
                entityId: rep.id,
                message: `Anchor port '${rep.anchorPortId}' does not exist on source template '${rep.sourceComponent}' for repeat '${rep.id}'`,
              });
            }

            if (rep.parameterOverrides) {
              const childParamIds = new Set(sourceTmpl.parameters.map((p) => p.id));
              const indexVar = rep.indexVariable || "i";
              for (const [key, expr] of Object.entries(rep.parameterOverrides)) {
                if (!childParamIds.has(key)) {
                  diagnostics.push({
                    code: "INVALID_REPEAT_OVERRIDE_PARAM",
                    severity: "ERROR",
                    category: "PARAMETERS",
                    entityId: rep.id,
                    message: `Parameter override '${key}' is not a parameter on child template '${rep.sourceComponent}'`,
                  });
                }
                const parsedOverride = parseFormula(expr);
                for (const dep of parsedOverride.dependencies) {
                  if (!paramIds.has(dep) && dep !== indexVar && dep.toLowerCase() !== "pi" && dep.toLowerCase() !== "e") {
                    diagnostics.push({
                      code: "UNDEFINED_REPEAT_OVERRIDE_DEP",
                      severity: "ERROR",
                      category: "EXPRESSIONS",
                      entityId: rep.id,
                      message: `Override expression for '${key}' in repeat '${rep.id}' references undefined parameter '${dep}'`,
                    });
                  }
                }
              }
            }
          }
        }

        if (rep.type === "path_array" && rep.pathGeometryId) {
          const geom = template.geometry;
          const hasPoly = geom.polylines?.some((p) => p.id === rep.pathGeometryId);
          const hasLine = geom.lines?.some((l) => l.id === rep.pathGeometryId);
          if (!hasPoly && !hasLine) {
            diagnostics.push({
              code: "UNBOUND_REPEAT_PATH_GEOMETRY",
              severity: "ERROR",
              category: "GEOMETRY",
              entityId: rep.id,
              message: `Path array repeat '${rep.id}' references non-existent path geometry '${rep.pathGeometryId}'`,
            });
          }
        }
      }
    }
  }

  /**
   * Condition 2: Circular expression dependency cycles in DAG via Tarjan SCC.
   */
  private static checkExpressionCycles(
    template: TemplateDefinition,
    diagnostics: TemplateDiagnostic[]
  ): void {
    if (!template.expressions || template.expressions.length === 0) return;

    const paramIds = new Set(template.parameters?.map((p) => p.id) || []);
    const adjList = new Map<string, string[]>();

    for (const expr of template.expressions) {
      if (!paramIds.has(expr.targetParameterId)) {
        diagnostics.push({
          code: "UNDEFINED_EXPRESSION_TARGET",
          severity: "ERROR",
          category: "EXPRESSIONS",
          entityId: expr.targetParameterId,
          message: `Expression targets undefined parameter '${expr.targetParameterId}'`,
        });
      }

      if (!adjList.has(expr.targetParameterId)) {
        adjList.set(expr.targetParameterId, []);
      }

      // Collect dependencies from expression formula
      const parsed = parseFormula(expr.expression);
      const allDeps = new Set<string>([...expr.dependencies, ...parsed.dependencies]);

      for (const dep of allDeps) {
        if (!adjList.has(dep)) {
          adjList.set(dep, []);
        }
        // Dependency edge: target depends on dep
        adjList.get(expr.targetParameterId)!.push(dep);
      }
    }

    const cycles = detectCyclesTarjan(adjList);
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        diagnostics.push({
          code: "CIRCULAR_EXPRESSION_CYCLE",
          severity: "ERROR",
          category: "EXPRESSIONS",
          message: `Circular expression dependency cycle detected: ${cycle.join(" -> ")} -> ${cycle[0]}`,
          details: { cycle },
        });
      }
    }
  }

  /**
   * Condition 3: Duplicate driving dimensions & over-driven parameters.
   */
  private static checkDuplicateAndOverdrivenParameters(
    template: TemplateDefinition,
    diagnostics: TemplateDiagnostic[]
  ): void {
    const paramIds = new Set<string>();
    const paramNames = new Set<string>();
    const nonDerivedParams = new Set<string>();

    for (const param of template.parameters || []) {
      if (paramIds.has(param.id)) {
        diagnostics.push({
          code: "DUPLICATE_PARAMETER_ID",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: param.id,
          message: `Duplicate parameter id '${param.id}' in template '${template.id}'`,
        });
      }
      paramIds.add(param.id);

      if (paramNames.has(param.name)) {
        diagnostics.push({
          code: "DUPLICATE_PARAMETER_NAME",
          severity: "WARNING",
          category: "PARAMETERS",
          entityId: param.name,
          message: `Duplicate parameter name '${param.name}' in template '${template.id}'`,
        });
      }
      paramNames.add(param.name);

      if (param.role === "DRIVING" || param.role === "FIXED") {
        nonDerivedParams.add(param.id);
      }
    }

    const targetedExpressions = new Set<string>();
    for (const expr of template.expressions || []) {
      if (targetedExpressions.has(expr.targetParameterId)) {
        diagnostics.push({
          code: "DUPLICATE_TARGET_EXPRESSION",
          severity: "ERROR",
          category: "EXPRESSIONS",
          entityId: expr.targetParameterId,
          message: `Multiple expressions targeting identical parameter '${expr.targetParameterId}'`,
        });
      }
      targetedExpressions.add(expr.targetParameterId);

      // Over-driven check: parameter is marked DRIVING/FIXED but also targeted by formula
      if (nonDerivedParams.has(expr.targetParameterId)) {
        diagnostics.push({
          code: "OVERDRIVEN_PARAMETER",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: expr.targetParameterId,
          message: `Parameter '${expr.targetParameterId}' is declared DRIVING/FIXED but is over-driven by expression`,
        });
      }
    }

    // Check for duplicate driving constraints targeting identical parameters or entity sets
    const drivingParamConstraints = new Set<string>();
    const drivingEntityConstraints = new Set<string>();
    for (const c of template.constraints || []) {
      if (c.driving) {
        if (c.paramRef) {
          if (drivingParamConstraints.has(c.paramRef)) {
            diagnostics.push({
              code: "DUPLICATE_DRIVING_PARAM_CONSTRAINT",
              severity: "ERROR",
              category: "CONSTRAINTS",
              entityId: c.id,
              message: `Multiple driving constraints bound to identical parameter '${c.paramRef}'`,
            });
          }
          drivingParamConstraints.add(c.paramRef);
        }

        const sortedRefsKey = `${c.kind}:${[...c.refs].sort().join(",")}`;
        if (drivingEntityConstraints.has(sortedRefsKey)) {
          diagnostics.push({
            code: "DUPLICATE_DRIVING_ENTITY_CONSTRAINT",
            severity: "ERROR",
            category: "CONSTRAINTS",
            entityId: c.id,
            message: `Multiple driving constraints of kind '${c.kind}' targeting identical entities [${c.refs.join(", ")}]`,
          });
        }
        drivingEntityConstraints.add(sortedRefsKey);
      }
    }
  }

  /**
   * Condition 4: Parameter range limits (min <= defaultValue <= max).
   */
  private static checkParameterRanges(
    template: TemplateDefinition,
    diagnostics: TemplateDiagnostic[]
  ): void {
    for (const param of template.parameters || []) {
      const { min, max, value, id, step, type } = param;

      if (min !== undefined && max !== undefined && min > max) {
        diagnostics.push({
          code: "INVALID_PARAMETER_RANGE",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: id,
          message: `Parameter '${id}' has invalid range: min (${min}) > max (${max})`,
        });
      }

      if (min !== undefined && value < min) {
        diagnostics.push({
          code: "PARAMETER_OUT_OF_RANGE_MIN",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: id,
          message: `Parameter '${id}' value (${value}) is below allowed minimum (${min})`,
        });
      }

      if (max !== undefined && value > max) {
        diagnostics.push({
          code: "PARAMETER_OUT_OF_RANGE_MAX",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: id,
          message: `Parameter '${id}' value (${value}) exceeds allowed maximum (${max})`,
        });
      }

      if (step !== undefined && step <= 0) {
        diagnostics.push({
          code: "INVALID_PARAMETER_STEP",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: id,
          message: `Parameter '${id}' has invalid step (${step}): must be greater than zero`,
        });
      }

      if (type === "COUNT" && (value <= 0 || !Number.isInteger(value))) {
        diagnostics.push({
          code: "INVALID_COUNT_PARAMETER_VALUE",
          severity: "ERROR",
          category: "PARAMETERS",
          entityId: id,
          message: `COUNT parameter '${id}' must be a positive integer, got ${value}`,
        });
      }
    }
  }

  /**
   * Condition 5: Solvability & geometric consistency (no dangling primitive or constraint refs).
   */
  private static checkGeometricConsistency(
    template: TemplateDefinition,
    diagnostics: TemplateDiagnostic[]
  ): void {
    const pointIds = new Set<string>();
    const primitiveIds = new Set<string>();

    const checkDuplicatePrimitiveId = (id: string) => {
      if (primitiveIds.has(id)) {
        diagnostics.push({
          code: "DUPLICATE_PRIMITIVE_ID",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: id,
          message: `Duplicate primitive id '${id}' in template '${template.id}'`,
        });
      }
      primitiveIds.add(id);
    };

    for (const pt of template.geometry.points || []) {
      checkDuplicatePrimitiveId(pt.id);
      pointIds.add(pt.id);
    }

    for (const ln of template.geometry.lines || []) {
      checkDuplicatePrimitiveId(ln.id);
      if (!pointIds.has(ln.p1)) {
        diagnostics.push({
          code: "DANGLING_POINT_REF",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: ln.id,
          message: `Line '${ln.id}' references dangling point p1 '${ln.p1}'`,
        });
      }
      if (!pointIds.has(ln.p2)) {
        diagnostics.push({
          code: "DANGLING_POINT_REF",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: ln.id,
          message: `Line '${ln.id}' references dangling point p2 '${ln.p2}'`,
        });
      }
    }

    for (const arc of template.geometry.arcs || []) {
      checkDuplicatePrimitiveId(arc.id);
      if (!pointIds.has(arc.center)) {
        diagnostics.push({
          code: "DANGLING_POINT_REF",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: arc.id,
          message: `Arc '${arc.id}' references dangling center point '${arc.center}'`,
        });
      }
      if (arc.startPoint && !pointIds.has(arc.startPoint)) {
        diagnostics.push({
          code: "DANGLING_POINT_REF",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: arc.id,
          message: `Arc '${arc.id}' references dangling startPoint '${arc.startPoint}'`,
        });
      }
      if (arc.endPoint && !pointIds.has(arc.endPoint)) {
        diagnostics.push({
          code: "DANGLING_POINT_REF",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: arc.id,
          message: `Arc '${arc.id}' references dangling endPoint '${arc.endPoint}'`,
        });
      }
    }

    for (const circ of template.geometry.circles || []) {
      checkDuplicatePrimitiveId(circ.id);
      if (!pointIds.has(circ.center)) {
        diagnostics.push({
          code: "DANGLING_POINT_REF",
          severity: "ERROR",
          category: "GEOMETRY",
          entityId: circ.id,
          message: `Circle '${circ.id}' references dangling center point '${circ.center}'`,
        });
      }
    }

    for (const poly of template.geometry.polylines || []) {
      checkDuplicatePrimitiveId(poly.id);
      for (const v of poly.vertices) {
        if (!pointIds.has(v)) {
          diagnostics.push({
            code: "DANGLING_POINT_REF",
            severity: "ERROR",
            category: "GEOMETRY",
            entityId: poly.id,
            message: `Polyline '${poly.id}' references dangling vertex point '${v}'`,
          });
        }
      }
    }

    // Check constraints referencing primitives and parameters
    const paramIds = new Set(template.parameters.map((p) => p.id));
    for (const c of template.constraints || []) {
      for (const ref of c.refs) {
        if (!primitiveIds.has(ref)) {
          diagnostics.push({
            code: "DANGLING_CONSTRAINT_REF",
            severity: "ERROR",
            category: "CONSTRAINTS",
            entityId: c.id,
            message: `Constraint '${c.id}' references dangling entity '${ref}'`,
          });
        }
      }

      if (c.paramRef && !paramIds.has(c.paramRef)) {
        diagnostics.push({
          code: "DANGLING_PARAM_REF",
          severity: "ERROR",
          category: "CONSTRAINTS",
          entityId: c.id,
          message: `Constraint '${c.id}' references undefined parameter '${c.paramRef}'`,
        });
      }
    }

    // Check expression variables against defined parameters
    for (const expr of template.expressions || []) {
      const parsed = parseFormula(expr.expression);
      for (const dep of parsed.dependencies) {
        if (!paramIds.has(dep) && dep.toLowerCase() !== "pi" && dep.toLowerCase() !== "e") {
          diagnostics.push({
            code: "UNDEFINED_EXPRESSION_VARIABLE",
            severity: "ERROR",
            category: "EXPRESSIONS",
            entityId: expr.targetParameterId,
            message: `Expression for '${expr.targetParameterId}' references undefined parameter '${dep}'`,
          });
        }
      }
    }

    // Check semantics consistency
    for (const sem of template.semantics || []) {
      for (const edge of sem.edges) {
        if (!primitiveIds.has(edge)) {
          diagnostics.push({
            code: "DANGLING_SEMANTIC_EDGE_REF",
            severity: "ERROR",
            category: "GEOMETRY",
            entityId: sem.id,
            message: `Semantic block '${sem.id}' references non-existent edge '${edge}'`,
          });
        }
      }
      for (const p of sem.params) {
        if (!paramIds.has(p)) {
          diagnostics.push({
            code: "DANGLING_SEMANTIC_PARAM_REF",
            severity: "ERROR",
            category: "PARAMETERS",
            entityId: sem.id,
            message: `Semantic block '${sem.id}' references non-existent parameter '${p}'`,
          });
        }
      }
    }
  }
}

export function validateTemplate(
  template: TemplateDefinition,
  registry?: TemplateRegistry
): TemplateValidationResult {
  return TemplateValidator.validate(template, registry);
}
