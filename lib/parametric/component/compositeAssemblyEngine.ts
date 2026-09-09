/**
 * Composite Assembly Engine (UPCE-MASTER-1.0 §86, §5.6, §43, §44, Gate G5 §76)
 *
 * High-level orchestrator for parametric CAD assemblies:
 * 1. Evaluates expression DAG in topological order.
 * 2. Expands procedural repeat rules into concrete child instances.
 * 3. Topologically sorts port attachment DAG.
 * 4. Resolves SE(2) LCS transforms via 3x3 affine port mating.
 * 5. Emits composite world-coordinate geometry, constraints, and CAD shapes.
 */

import { AffineMatrix3x3, LocalFrame } from "../../geometry/lcs";
import { Point2D } from "../../geometry/topology/types";
import { Shape } from "../../geometry/types";
import { TemplateDefinition } from "../schemaTypes";
import { topologicalSortDAG } from "../dag/tarjan";
import { evaluateFormula } from "../expression";
import { TemplateRegistry, templateRegistry } from "../templates/templateRegistry";
import { PortMatingSolver, PortEvaluation } from "./portMatingSolver";
import { RepeatExpander, ExpandedRepeatInstance } from "./repeatExpander";

export interface CompositeAssemblyOptions {
  rootOrigin?: Point2D;
  rootAngleDeg?: number;
  parameterOverrides?: Record<string, number>;
  registry?: TemplateRegistry;
}

export interface InstancePlacementInfo {
  instanceId: string;
  templateId: string;
  worldMatrix: AffineMatrix3x3;
  worldFrame: LocalFrame;
  origin: Point2D;
  angleDeg: number;
  parameters: Record<string, number>;
}

export interface CompositeAssemblyResult {
  shapes: Shape[];
  geometry: {
    points: { id: string; x: number; y: number; fixed?: boolean; construction?: boolean }[];
    lines: { id: string; p1: string; p2: string; construction?: boolean; semanticRole?: string }[];
    arcs: { id: string; center: string; radius: number; startAngle: number; endAngle: number; construction?: boolean }[];
    circles: { id: string; center: string; radius: number; construction?: boolean }[];
    polylines: { id: string; vertices: string[]; closed: boolean; construction?: boolean }[];
  };
  constraints: TemplateDefinition["constraints"];
  instances: Map<string, InstancePlacementInfo>;
  resolvedPorts: Map<string, { origin: Point2D; angleDeg: number; matrix: AffineMatrix3x3 }>;
  parameters: Record<string, number>;
}

export class CompositeAssemblyEngine {
  /**
   * Assembles a template or assembly definition into concrete geometry and constraints.
   */
  public static assemble(
    templateOrId: TemplateDefinition | string,
    options: CompositeAssemblyOptions = {}
  ): CompositeAssemblyResult {
    const registry = options.registry || templateRegistry;

    const rootTemplate: TemplateDefinition =
      typeof templateOrId === "string"
        ? registry.getTemplate(templateOrId) ||
          (() => {
            throw new Error(`Template '${templateOrId}' not found in registry`);
          })()
        : templateOrId;

    const rootOrigin = options.rootOrigin || { x: 0, y: 0 };
    const rootAngleDeg = options.rootAngleDeg || 0;
    const rootAngleRad = (rootAngleDeg * Math.PI) / 180;

    const rootMatrix = AffineMatrix3x3.translation(rootOrigin.x, rootOrigin.y).multiply(
      AffineMatrix3x3.rotation(rootAngleRad)
    );

    // 1. Evaluate root parameters and expression DAG
    const resolvedParameters = this.evaluateParameters(rootTemplate, options.parameterOverrides || {});

    // 2. Expand procedural repeat rules
    const allInstances: ExpandedRepeatInstance[] = [];

    // First collect explicit components from template definition
    for (const comp of rootTemplate.components || []) {
      allInstances.push({
        instanceId: comp.instanceId,
        templateId: comp.templateId,
        index: 0,
        parameterOverrides: comp.parameterOverrides || {},
        attachedVia: comp.attachedVia as any,
      });
    }

    // Expand repeat rules
    for (const rule of rootTemplate.repeats || []) {
      let pathPoints: Point2D[] | undefined = undefined;
      if (rule.type === "path_array") {
        const geom = rootTemplate.geometry;
        if (geom) {
          const pointMap = new Map<string, Point2D>();
          for (const pt of geom.points || []) {
            pointMap.set(pt.id, { x: pt.x, y: pt.y });
          }

          if (rule.pathGeometryId) {
            const poly = geom.polylines?.find((p) => p.id === rule.pathGeometryId);
            if (poly) {
              pathPoints = poly.vertices.map((v) => pointMap.get(v)).filter(Boolean) as Point2D[];
            } else {
              const line = geom.lines?.find((l) => l.id === rule.pathGeometryId);
              if (line && pointMap.has(line.p1) && pointMap.has(line.p2)) {
                pathPoints = [pointMap.get(line.p1)!, pointMap.get(line.p2)!];
              }
            }
          }

          if (!pathPoints && geom.polylines && geom.polylines.length > 0) {
            pathPoints = geom.polylines[0].vertices.map((v) => pointMap.get(v)).filter(Boolean) as Point2D[];
          } else if (!pathPoints && geom.lines && geom.lines.length > 0) {
            pathPoints = [pointMap.get(geom.lines[0].p1)!, pointMap.get(geom.lines[0].p2)!];
          }
        }
      }

      const expanded = RepeatExpander.expandRepeatRule(rule, resolvedParameters, pathPoints, registry);
      allInstances.push(...expanded);
    }

    // 3. Build instance map & topologically sort port attachment DAG
    const instanceMap = new Map<string, ExpandedRepeatInstance>();
    const adjList = new Map<string, string[]>();

    for (const inst of allInstances) {
      instanceMap.set(inst.instanceId, inst);
      adjList.set(inst.instanceId, []);
    }

    for (const inst of allInstances) {
      if (inst.attachedVia) {
        const parentId = inst.attachedVia.parentInstanceId;
        if (parentId && parentId !== "root" && parentId !== rootTemplate.id && instanceMap.has(parentId)) {
          // Edge: parent must be resolved before child
          adjList.get(parentId)!.push(inst.instanceId);
        }
      }
    }

    const sortedOrder = topologicalSortDAG(adjList);
    if (sortedOrder.length < allInstances.length) {
      throw new Error(`Cyclic dependency detected in component attachment DAG`);
    }

    // 4. Resolve LCS transforms for each instance
    const resolvedInstances = new Map<string, InstancePlacementInfo>();
    const resolvedPorts = new Map<string, { origin: Point2D; angleDeg: number; matrix: AffineMatrix3x3 }>();

    // Evaluate and record root template's own ports
    for (const p of rootTemplate.ports || []) {
      const evalPort = PortMatingSolver.evaluatePort(p, resolvedParameters);
      const worldPortMatrix = rootMatrix.multiply(evalPort.localMatrix);
      const origin: Point2D = { x: worldPortMatrix.m[2], y: worldPortMatrix.m[5] };
      const angleRad = Math.atan2(worldPortMatrix.m[3], worldPortMatrix.m[0]);
      resolvedPorts.set(`root:${p.id}`, {
        origin,
        angleDeg: (angleRad * 180) / Math.PI,
        matrix: worldPortMatrix,
      });
      resolvedPorts.set(`${rootTemplate.id}:${p.id}`, {
        origin,
        angleDeg: (angleRad * 180) / Math.PI,
        matrix: worldPortMatrix,
      });
    }

    for (const instanceId of sortedOrder) {
      const inst = instanceMap.get(instanceId);
      if (!inst) continue;

      const childTemplate = registry.getTemplate(inst.templateId);
      if (!childTemplate) {
        throw new Error(`Child template '${inst.templateId}' for instance '${instanceId}' not found in registry`);
      }

      // Compute child instance's evaluated parameters
      const rawOverrides: Record<string, number> = {};
      // Inherit matching parameter values from parent assembly if present
      for (const [k, v] of Object.entries(resolvedParameters)) {
        if (childTemplate.parameters?.some((p) => p.id === k)) {
          rawOverrides[k] = v;
        }
      }
      // Apply instance parameter overrides
      for (const [k, v] of Object.entries(inst.parameterOverrides || {})) {
        rawOverrides[k] = PortMatingSolver.evaluateNumeric(v, { ...resolvedParameters, ...rawOverrides });
      }
      const childParameters = this.evaluateParameters(childTemplate, rawOverrides);

      let childWorldMatrix: AffineMatrix3x3;
      let childOrigin: Point2D;
      let childAngleDeg: number;

      if (inst.attachedVia) {
        const { parentInstanceId, parentPortId, ownPortId, offsetExpr } = inst.attachedVia;
        const isParentRoot = parentInstanceId === "root" || parentInstanceId === rootTemplate.id;

        let parentMatrix = rootMatrix;
        let parentTemplateDef = rootTemplate;
        let parentParams = resolvedParameters;

        if (!isParentRoot) {
          const parentPlacement = resolvedInstances.get(parentInstanceId);
          if (!parentPlacement) {
            throw new Error(`Parent instance '${parentInstanceId}' not yet resolved when placing '${instanceId}'`);
          }
          parentMatrix = parentPlacement.worldMatrix;
          parentTemplateDef = registry.getTemplate(parentPlacement.templateId)!;
          parentParams = parentPlacement.parameters;
        }

        const parentPortDef = parentTemplateDef.ports.find((p) => p.id === parentPortId);
        if (!parentPortDef) {
          throw new Error(`Parent port '${parentPortId}' not found on template '${parentTemplateDef.id}'`);
        }
        const parentPort = PortMatingSolver.evaluatePort(parentPortDef, parentParams);

        const childPortDef = childTemplate.ports.find((p) => p.id === ownPortId);
        if (!childPortDef) {
          throw new Error(`Child port '${ownPortId}' not found on template '${childTemplate.id}'`);
        }
        const childPort = PortMatingSolver.evaluatePort(childPortDef, childParameters);

        const mating = PortMatingSolver.resolvePortMating(
          parentMatrix,
          parentPort,
          childPort,
          offsetExpr,
          resolvedParameters
        );

        childWorldMatrix = mating.childWorldMatrix;
        childOrigin = mating.childOrigin;
        childAngleDeg = mating.childAngleDeg;
      } else if (inst.placement) {
        // Direct placement (relative to root)
        const localT = AffineMatrix3x3.translation(inst.placement.origin.x, inst.placement.origin.y);
        const localR = AffineMatrix3x3.rotation((inst.placement.angleDeg * Math.PI) / 180);
        childWorldMatrix = rootMatrix.multiply(localT.multiply(localR));
        childOrigin = { x: childWorldMatrix.m[2], y: childWorldMatrix.m[5] };
        childAngleDeg = (Math.atan2(childWorldMatrix.m[3], childWorldMatrix.m[0]) * 180) / Math.PI;
      } else {
        childWorldMatrix = rootMatrix;
        childOrigin = { x: rootMatrix.m[2], y: rootMatrix.m[5] };
        childAngleDeg = rootAngleDeg;
      }

      const childFrame = new LocalFrame(
        instanceId,
        childOrigin,
        (childAngleDeg * Math.PI) / 180
      );

      resolvedInstances.set(instanceId, {
        instanceId,
        templateId: inst.templateId,
        worldMatrix: childWorldMatrix,
        worldFrame: childFrame,
        origin: childOrigin,
        angleDeg: childAngleDeg,
        parameters: childParameters,
      });

      // Record child ports in world coordinates
      for (const p of childTemplate.ports || []) {
        const evalPort = PortMatingSolver.evaluatePort(p, childParameters);
        const worldPortMatrix = childWorldMatrix.multiply(evalPort.localMatrix);
        const portOrigin: Point2D = { x: worldPortMatrix.m[2], y: worldPortMatrix.m[5] };
        const portAngleRad = Math.atan2(worldPortMatrix.m[3], worldPortMatrix.m[0]);
        resolvedPorts.set(`${instanceId}:${p.id}`, {
          origin: portOrigin,
          angleDeg: (portAngleRad * 180) / Math.PI,
          matrix: worldPortMatrix,
        });
      }
    }

    // 5. Emit composite geometry and constraints
    const compositePoints: CompositeAssemblyResult["geometry"]["points"] = [];
    const compositeLines: CompositeAssemblyResult["geometry"]["lines"] = [];
    const compositeArcs: CompositeAssemblyResult["geometry"]["arcs"] = [];
    const compositeCircles: CompositeAssemblyResult["geometry"]["circles"] = [];
    const compositePolylines: CompositeAssemblyResult["geometry"]["polylines"] = [];
    const compositeConstraints: TemplateDefinition["constraints"] = [];
    const allShapes: Shape[] = [];

    // First transform root template's own geometry
    if (rootTemplate.geometry) {
      const rootParametricGeom = PortMatingSolver.evaluateTemplateGeometry(rootTemplate, resolvedParameters);
      const transformedRoot = PortMatingSolver.transformTemplateGeometry(
        rootParametricGeom,
        rootMatrix,
        rootTemplate.id
      );
      compositePoints.push(...transformedRoot.points);
      compositeLines.push(...transformedRoot.lines);
      compositeArcs.push(...transformedRoot.arcs);
      compositeCircles.push(...transformedRoot.circles);
      compositePolylines.push(...transformedRoot.polylines);

      const rootShapes = PortMatingSolver.geometryToShapes(
        transformedRoot,
        rootTemplate.id
      );
      allShapes.push(...rootShapes);

      for (const c of rootTemplate.constraints || []) {
        compositeConstraints.push({
          ...c,
          id: `${rootTemplate.id}_${c.id}`,
          refs: c.refs.map((r) => `${rootTemplate.id}_${r}`),
        });
      }
    }

    // Transform child instances geometry
    for (const [instanceId, placement] of resolvedInstances.entries()) {
      const childTemplate = registry.getTemplate(placement.templateId)!;
      const childParametricGeom = PortMatingSolver.evaluateTemplateGeometry(childTemplate, placement.parameters);
      const transformed = PortMatingSolver.transformTemplateGeometry(
        childParametricGeom,
        placement.worldMatrix,
        instanceId
      );

      compositePoints.push(...transformed.points);
      compositeLines.push(...transformed.lines);
      compositeArcs.push(...transformed.arcs);
      compositeCircles.push(...transformed.circles);
      compositePolylines.push(...transformed.polylines);

      const shapes = PortMatingSolver.geometryToShapes(
        transformed,
        instanceId
      );
      allShapes.push(...shapes);

      for (const c of childTemplate.constraints || []) {
        compositeConstraints.push({
          ...c,
          id: `${instanceId}_${c.id}`,
          refs: c.refs.map((r) => `${instanceId}_${r}`),
        });
      }
    }

    return {
      shapes: allShapes,
      geometry: {
        points: compositePoints,
        lines: compositeLines,
        arcs: compositeArcs,
        circles: compositeCircles,
        polylines: compositePolylines,
      },
      constraints: compositeConstraints,
      instances: resolvedInstances,
      resolvedPorts,
      parameters: resolvedParameters,
    };
  }

  /**
   * Evaluates template parameters by applying default values, overriding user values,
   * and evaluating the expression DAG in topological order.
   */
  private static evaluateParameters(
    template: TemplateDefinition,
    overrides: Record<string, number>
  ): Record<string, number> {
    const symbols: Record<string, number> = {};

    // Initial defaults
    for (const p of template.parameters || []) {
      symbols[p.id] = p.value;
      if (p.name && p.name !== p.id) {
        symbols[p.name] = p.value;
      }
    }

    // Apply overrides
    for (const [k, v] of Object.entries(overrides)) {
      symbols[k] = v;
    }

    if (!template.expressions || template.expressions.length === 0) {
      return symbols;
    }

    // Build expression DAG
    const adjList = new Map<string, string[]>();
    const exprMap = new Map<string, TemplateDefinition["expressions"][number]>();

    for (const expr of template.expressions) {
      exprMap.set(expr.targetParameterId, expr);
      if (!adjList.has(expr.targetParameterId)) {
        adjList.set(expr.targetParameterId, []);
      }
      for (const dep of expr.dependencies) {
        if (!adjList.has(dep)) {
          adjList.set(dep, []);
        }
        // dep must be evaluated before target
        adjList.get(dep)!.push(expr.targetParameterId);
      }
    }

    const order = topologicalSortDAG(adjList);

    for (const id of order) {
      const expr = exprMap.get(id);
      if (!expr) continue;

      // If this parameter was explicitly overridden in overrides, skip re-evaluating expression
      if (id in overrides) continue;

      const evalRes = evaluateFormula(expr.expression, symbols);
      if (!evalRes.error && !isNaN(evalRes.value)) {
        symbols[id] = evalRes.value;
        const paramDef = template.parameters.find((p) => p.id === id);
        if (paramDef && paramDef.name && paramDef.name !== id) {
          symbols[paramDef.name] = evalRes.value;
        }
      }
    }

    return symbols;
  }
}
