/**
 * Procedural Repeat Rules Engine (UPCE-MASTER-1.0 §86, §5.6, §43, §44, Gate G5 §76)
 *
 * Implements linear_array, polar_array, mirror, and path_array.
 * Invariant: Repeat count is a TOPOLOGICAL MUTATION (creating/deleting child instances
 * and wiring port attachments), NOT a continuous solver variable (§5.6, §44).
 *
 * Evaluates parameter overrides with index variable substitution (e.g. i).
 */

import { Point2D } from "../../geometry/topology/types";
import { TemplateDefinition } from "../schemaTypes";
import { evaluateFormula } from "../expression";
import { TemplateRegistry, templateRegistry } from "../templates/templateRegistry";

export interface ExpandedRepeatInstance {
  instanceId: string;
  templateId: string;
  index: number;
  parameterOverrides: Record<string, string>;
  attachedVia?: {
    parentInstanceId: string;
    parentPortId: string;
    ownPortId: string;
    offsetExpr?: {
      along?: string;
      normal?: string;
      rotate?: string;
      mate?: string;
    };
  };
  placement?: {
    origin: Point2D;
    angleDeg: number;
  };
}

export class RepeatExpander {
  /**
   * Evaluates a mathematical expression or numeric string against a parameter dictionary.
   */
  public static evaluateNumeric(
    expr: string | number | undefined,
    symbols: Record<string, number>,
    fallback: number = 0
  ): number {
    if (expr === undefined || expr === null) return fallback;
    if (typeof expr === "number") return expr;
    const trimmed = expr.trim();
    if (!trimmed) return fallback;

    const num = Number(trimmed);
    if (!isNaN(num)) return num;

    const res = evaluateFormula(trimmed, symbols);
    if (res.error || isNaN(res.value)) {
      return fallback;
    }
    return res.value;
  }

  /**
   * Expands a procedural repeat rule into concrete component instances.
   */
  public static expandRepeatRule(
    rule: NonNullable<TemplateDefinition["repeats"]>[number],
    parameters: Record<string, number>,
    pathPoints?: Point2D[],
    registry?: TemplateRegistry
  ): ExpandedRepeatInstance[] {
    const fallbackCount = rule.type === "mirror" ? 2 : 1;
    const rawCount = this.evaluateNumeric(rule.countParamRef, parameters, fallbackCount);
    const count = Math.max(1, Math.round(rawCount));
    const indexVar = rule.indexVariable || "i";
    const instances: ExpandedRepeatInstance[] = [];

    const buildOverrides = (i: number): Record<string, string> => {
      const currentSymbols = { ...parameters, [indexVar]: i };
      const overrides: Record<string, string> = {
        [indexVar]: String(i),
      };
      if (rule.parameterOverrides) {
        for (const [key, expr] of Object.entries(rule.parameterOverrides)) {
          overrides[key] = String(this.evaluateNumeric(expr, currentSymbols, 0));
        }
      }
      return overrides;
    };

    switch (rule.type) {
      case "linear_array": {
        const dx = rule.direction[0] ?? 1;
        const dy = rule.direction[1] ?? 0;
        const mag = Math.hypot(dx, dy) || 1;
        const ux = dx / mag;
        const uy = dy / mag;

        // Obtain anchor port angle from source template if available
        let portAngleRad = 0;
        const sourceTmpl = (registry || templateRegistry).getTemplate(rule.sourceComponent);
        if (sourceTmpl) {
          const anchorPortDef = sourceTmpl.ports?.find((p) => p.id === rule.anchorPortId);
          if (anchorPortDef) {
            const portAngleDeg = this.evaluateNumeric(anchorPortDef.localFrame.angle, parameters, 0);
            portAngleRad = (portAngleDeg * Math.PI) / 180;
          }
        }

        for (let i = 0; i < count; i++) {
          const instanceId = `${rule.id}_${i}`;
          const currentSymbols = { ...parameters, [indexVar]: i };
          const spacing = this.evaluateNumeric(rule.spacingExpr, currentSymbols, 0);

          const totalDist = i * spacing;
          const origin: Point2D = {
            x: totalDist * ux,
            y: totalDist * uy,
          };

          const instance: ExpandedRepeatInstance = {
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin,
              angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
            },
          };

          // Wire port attachments: if i > 0, wire to previous instance (i - 1)
          if (i > 0) {
            const stepX = spacing * ux;
            const stepY = spacing * uy;
            const along = stepX * Math.cos(portAngleRad) + stepY * Math.sin(portAngleRad);
            const normal = -stepX * Math.sin(portAngleRad) + stepY * Math.cos(portAngleRad);

            instance.attachedVia = {
              parentInstanceId: `${rule.id}_${i - 1}`,
              parentPortId: rule.anchorPortId,
              ownPortId: rule.anchorPortId,
              offsetExpr: {
                along: String(along),
                normal: String(normal),
                rotate: "0",
                mate: "0",
              },
            };
          }

          instances.push(instance);
        }
        break;
      }

      case "polar_array": {
        const cx = rule.direction[0] ?? 0;
        const cy = rule.direction[1] ?? 0;

        for (let i = 0; i < count; i++) {
          const instanceId = `${rule.id}_${i}`;
          const currentSymbols = { ...parameters, [indexVar]: i };
          const stepAngleDeg = this.evaluateNumeric(rule.spacingExpr, currentSymbols, count > 1 ? 360 / count : 0);
          const currentAngleDeg = i * stepAngleDeg;

          instances.push({
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin: { x: cx, y: cy },
              angleDeg: currentAngleDeg,
            },
            attachedVia: i > 0 ? {
              parentInstanceId: `${rule.id}_0`,
              parentPortId: rule.anchorPortId,
              ownPortId: rule.anchorPortId,
              offsetExpr: {
                along: "0",
                normal: "0",
                rotate: String(currentAngleDeg),
                mate: "0",
              },
            } : undefined,
          });
        }
        break;
      }

      case "mirror": {
        // Mirror produces 2 instances: index 0 (original) and index 1 (mirrored)
        const mirrorCount = Math.min(count, 2);
        for (let i = 0; i < mirrorCount; i++) {
          const instanceId = `${rule.id}_${i}`;
          instances.push({
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin: { x: 0, y: 0 },
              angleDeg: i === 1 ? 180 : 0,
            },
            attachedVia: i === 1 ? {
              parentInstanceId: `${rule.id}_0`,
              parentPortId: rule.anchorPortId,
              ownPortId: rule.anchorPortId,
              offsetExpr: {
                along: "0",
                normal: "0",
                rotate: "180",
                mate: "180",
              },
            } : undefined,
          });
        }
        break;
      }

      case "path_array": {
        const pts = pathPoints && pathPoints.length >= 2 ? pathPoints : [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
        ];

        // Compute cumulative arc length along path
        const cumulativeLengths: number[] = [0];
        let totalPathLength = 0;
        for (let j = 0; j < pts.length - 1; j++) {
          const segLen = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
          totalPathLength += segLen;
          cumulativeLengths.push(totalPathLength);
        }

        for (let i = 0; i < count; i++) {
          const instanceId = `${rule.id}_${i}`;
          const currentSymbols = { ...parameters, [indexVar]: i };
          const defaultSpacing = count > 1 ? totalPathLength / (count - 1) : 0;
          const spacing = this.evaluateNumeric(rule.spacingExpr, currentSymbols, defaultSpacing);
          const targetDist = Math.min(i * spacing, totalPathLength);

          // Locate segment along path
          let segIdx = 0;
          for (let j = 0; j < cumulativeLengths.length - 1; j++) {
            if (targetDist >= cumulativeLengths[j] && targetDist <= cumulativeLengths[j + 1]) {
              segIdx = j;
              break;
            }
          }

          const segStartDist = cumulativeLengths[segIdx];
          const segLen = cumulativeLengths[segIdx + 1] - segStartDist;
          const t = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

          const pStart = pts[segIdx];
          const pEnd = pts[segIdx + 1];
          const ptOnPath: Point2D = {
            x: pStart.x + t * (pEnd.x - pStart.x),
            y: pStart.y + t * (pEnd.y - pStart.y),
          };

          const tangentAngleRad = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
          const tangentAngleDeg = (tangentAngleRad * 180) / Math.PI;

          instances.push({
            instanceId,
            templateId: rule.sourceComponent,
            index: i,
            parameterOverrides: buildOverrides(i),
            placement: {
              origin: ptOnPath,
              angleDeg: tangentAngleDeg,
            },
          });
        }
        break;
      }
    }

    return instances;
  }
}
