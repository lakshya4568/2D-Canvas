/**
 * CAD Agent v2 — Tool Execution Registry & State Manager
 * Evaluates symbolic parametric expressions and tracks sketch entities.
 */

import { CAD_TOOL_SCHEMAS } from "./toolSchemas";
import type {
  ToolCall,
  ToolResult,
  SceneGraphNode,
  SceneGraphLayer,
  ParameterSpec,
  FormulaSpec,
  ConstraintSpec,
  RelationSpec,
  SymbolicValue,
} from "../types";
import { evaluateFormula, parseFormula } from "../../parametric/expression";

export interface ToolExecutionContext {
  parameters: Map<string, ParameterSpec>;
  formulas: Map<string, FormulaSpec>;
  constraints: Map<string, ConstraintSpec>;
  relations: Map<string, RelationSpec>;
  nodes: Map<string, SceneGraphNode>;
  layers: Map<string, SceneGraphLayer>;
}

export class ToolRegistry {
  private ctx: ToolExecutionContext;

  constructor() {
    this.ctx = {
      parameters: new Map(),
      formulas: new Map(),
      constraints: new Map(),
      relations: new Map(),
      nodes: new Map(),
      layers: new Map(),
    };
    this.initDefaultLayers();
  }

  private initDefaultLayers(): void {
    const defaults: SceneGraphLayer[] = [
      { name: "CONCRETE_OUTLINE", color: "#00E5FF", lineType: "CONTINUOUS", description: "Primary concrete structural boundary" },
      { name: "CONCRETE_SECTION", color: "#FFD600", lineType: "CONTINUOUS", description: "Cut section profiles & haunches" },
      { name: "CENTERLINE", color: "#FF1744", lineType: "CENTER", description: "Structural axis & symmetry line" },
      { name: "EARTH_CUSHION", color: "#00E676", lineType: "CONTINUOUS", description: "Earth cushion & embankment" },
      { name: "BACKFILL", color: "#FFD600", lineType: "CONTINUOUS", description: "Boulder lining and backfill slopes" },
      { name: "FOUNDATION", color: "#E040FB", lineType: "CONTINUOUS", description: "Base slab, wearing course & PCC" },
      { name: "STEPS_WING", color: "#00E5FF", lineType: "CONTINUOUS", description: "Wing wall steps & drainage" },
      { name: "REBAR", color: "#FF9100", lineType: "CONTINUOUS", description: "Reinforcement bars & stirrups" },
      { name: "DIMENSIONS", color: "#FFFFFF", lineType: "CONTINUOUS", description: "Engineering dimension lines & witnesses" },
      { name: "LEVELS", color: "#00E5FF", lineType: "DASHED", description: "Datum levels & elevation lines" },
      { name: "ANNOTATIONS", color: "#ECEFF1", lineType: "CONTINUOUS", description: "Title block & notes" },
    ];
    for (const l of defaults) {
      this.ctx.layers.set(l.name, l);
    }
  }

  public getContext(): ToolExecutionContext {
    return this.ctx;
  }

  /**
   * Resets the active context.
   */
  public reset(): void {
    this.ctx.parameters.clear();
    this.ctx.formulas.clear();
    this.ctx.constraints.clear();
    this.ctx.relations.clear();
    this.ctx.nodes.clear();
    this.ctx.layers.clear();
    this.initDefaultLayers();
  }

  /**
   * Builds the current symbol table for evaluating mathematical expressions.
   */
  public getSymbolTable(): Record<string, number> {
    const symbols: Record<string, number> = {};
    // Add parameters
    for (const [name, p] of this.ctx.parameters.entries()) {
      symbols[name] = p.value;
    }
    return symbols;
  }

  /**
   * Evaluates an expression string or returns the literal number.
   */
  public evaluateSymbolic(val: SymbolicValue, localSymbols?: Record<string, number>): number {
    if (typeof val === "number") return val;
    if (!val || typeof val !== "string") return 0;

    const trimmed = val.trim();
    if (!trimmed) return 0;

    // Check if simple number literal
    const num = Number(trimmed);
    if (!isNaN(num)) return num;

    const symbols = { ...this.getSymbolTable(), ...(localSymbols || {}) };

    try {
      const evalRes = evaluateFormula(trimmed, symbols);
      if (!evalRes.error && typeof evalRes.value === "number" && !isNaN(evalRes.value)) {
        return evalRes.value;
      }
      // Fallback: evaluate basic arithmetic safely
      const sanitized = trimmed.replace(/([a-zA-Z_][a-zA-Z0-9_]*)/g, (match) => {
        return String(symbols[match] ?? 0);
      });
      const fn = new Function(`return (${sanitized});`);
      const res = fn();
      return typeof res === "number" && !isNaN(res) ? res : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Updates all derived formulas in the parameter list using multi-pass fixed-point iteration.
   */
  public evaluateAllFormulas(): void {
    const symbols = this.getSymbolTable();
    const maxPasses = Math.max(1, this.ctx.formulas.size + 1);

    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      for (const formula of this.ctx.formulas.values()) {
        const val = this.evaluateSymbolic(formula.expression, symbols);
        if (symbols[formula.target] !== val) {
          symbols[formula.target] = val;
          changed = true;
        }
        const existing = this.ctx.parameters.get(formula.target);
        if (existing) {
          existing.value = val;
        } else {
          this.ctx.parameters.set(formula.target, {
            name: formula.target,
            value: val,
            unit: "mm",
            role: "DERIVED",
            expr: formula.expression,
            description: formula.description,
          });
        }
      }
      if (!changed) break;
    }
  }

  /**
   * Computes the bounding box for a single scene graph node.
   */
  public getNodeBounds(node: SceneGraphNode): { minX: number; minY: number; maxX: number; maxY: number } {
    if (node.type === "line") {
      return {
        minX: Math.min(node.evaluated.x1, node.evaluated.x2),
        minY: Math.min(node.evaluated.y1, node.evaluated.y2),
        maxX: Math.max(node.evaluated.x1, node.evaluated.x2),
        maxY: Math.max(node.evaluated.y1, node.evaluated.y2),
      };
    }
    if (node.type === "rectangle") {
      const x = node.evaluated.x ?? 0;
      const y = node.evaluated.y ?? 0;
      const w = node.evaluated.width ?? 0;
      const h = node.evaluated.height ?? 0;
      return { minX: x, minY: y, maxX: x + w, maxY: y + h };
    }
    if (node.type === "circle" || node.type === "arc") {
      const cx = node.evaluated.cx ?? 0;
      const cy = node.evaluated.cy ?? 0;
      const r = node.evaluated.r ?? node.evaluated.radius ?? 0;
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    if (node.points && node.points.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of node.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    }
    const x = node.evaluated.x ?? 0;
    const y = node.evaluated.y ?? 0;
    return { minX: x, minY: y, maxX: x, maxY: y };
  }

  /**
   * Executes an individual tool call against the registry.
   */
  public execute(call: ToolCall): ToolResult {
    const schema = CAD_TOOL_SCHEMAS[call.tool];
    if (!schema) {
      return {
        callId: call.id,
        tool: call.tool,
        success: false,
        error: `Unknown tool "${call.tool}"`,
      };
    }

    try {
      const result = this.dispatchTool(call.tool, call.args);
      return {
        callId: call.id,
        tool: call.tool,
        success: true,
        result,
      };
    } catch (err: any) {
      return {
        callId: call.id,
        tool: call.tool,
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  private dispatchTool(tool: string, args: Record<string, any>): unknown {
    switch (tool) {
      case "create_parameter": {
        const { name, value, unit, role = "DRIVING", minValue, maxValue, description } = args;
        const p: ParameterSpec = {
          name,
          value: Number(value),
          unit,
          role,
          minValue,
          maxValue,
          description,
        };
        this.ctx.parameters.set(name, p);
        return { parameter: p };
      }

      case "bind_formula": {
        const { property, expression, description } = args;
        const parsed = parseFormula(expression);
        const dependencies = parsed.dependencies || [];

        const formula: FormulaSpec = {
          target: property,
          expression,
          dependencies,
          description,
        };
        this.ctx.formulas.set(property, formula);
        this.evaluateAllFormulas();
        return { formula };
      }

      case "add_constraint": {
        const { id, type, entityA, entityB, value, params } = args;
        const constraint: ConstraintSpec = {
          id: id || `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type,
          entityA,
          entityB,
          value: value !== undefined ? Number(value) : undefined,
          params,
        };
        this.ctx.constraints.set(constraint.id, constraint);
        return { constraint };
      }

      case "add_relation": {
        const { entity_a, entity_b, relation, params } = args;
        const rel: RelationSpec = {
          id: `rel_${this.ctx.relations.size + 1}`,
          entityA: entity_a,
          entityB: entity_b,
          relation,
          params,
        };
        this.ctx.relations.set(rel.id, rel);
        return { relation: rel };
      }

      case "draw_line": {
        const { id, x1, y1, x2, y2, isReference, layer = "CONCRETE_OUTLINE", strokeColor, strokeWidth } = args;
        const evalX1 = this.evaluateSymbolic(x1);
        const evalY1 = this.evaluateSymbolic(y1);
        const evalX2 = this.evaluateSymbolic(x2);
        const evalY2 = this.evaluateSymbolic(y2);

        const node: SceneGraphNode = {
          id,
          type: "line",
          layer,
          style: {
            strokeColor: strokeColor || (layer === "CENTERLINE" ? "#FF1744" : "#00E5FF"),
            strokeWidth: strokeWidth || (isReference ? 1 : 2),
            strokeDash: isReference ? "center" : undefined,
          },
          symbolic: { x1, y1, x2, y2 },
          evaluated: { x1: evalX1, y1: evalY1, x2: evalX2, y2: evalY2 },
        };
        this.ctx.nodes.set(id, node);
        return { node };
      }

      case "draw_circle": {
        const { id, cx, cy, r, layer = "REBAR", strokeColor, fillColor } = args;
        const evalCx = this.evaluateSymbolic(cx);
        const evalCy = this.evaluateSymbolic(cy);
        const evalR = this.evaluateSymbolic(r);

        const node: SceneGraphNode = {
          id,
          type: "circle",
          layer,
          style: {
            strokeColor: strokeColor || (layer === "REBAR" ? "#FF9100" : "#00E5FF"),
            fillColor: fillColor || (layer === "REBAR" ? "#FF9100" : undefined),
            strokeWidth: 2,
          },
          symbolic: { cx, cy, r },
          evaluated: { cx: evalCx, cy: evalCy, r: evalR },
        };
        this.ctx.nodes.set(id, node);
        return { node };
      }

      case "draw_arc": {
        const { id, cx, cy, radius, startAngle, endAngle, layer = "CONCRETE_OUTLINE", strokeColor } = args;
        const evalCx = this.evaluateSymbolic(cx);
        const evalCy = this.evaluateSymbolic(cy);
        const evalRadius = this.evaluateSymbolic(radius);

        const node: SceneGraphNode = {
          id,
          type: "arc",
          layer,
          style: {
            strokeColor: strokeColor || "#00E5FF",
            strokeWidth: 2,
          },
          symbolic: { cx, cy, radius, startAngle, endAngle },
          evaluated: {
            cx: evalCx,
            cy: evalCy,
            radius: evalRadius,
            startAngle: Number(startAngle),
            endAngle: Number(endAngle),
          },
        };
        this.ctx.nodes.set(id, node);
        return { node };
      }

      case "draw_rectangle": {
        const { id, x, y, width, height, layer = "CONCRETE_OUTLINE", strokeColor, fillColor } = args;
        const evalX = this.evaluateSymbolic(x);
        const evalY = this.evaluateSymbolic(y);
        const evalW = this.evaluateSymbolic(width);
        const evalH = this.evaluateSymbolic(height);

        const node: SceneGraphNode = {
          id,
          type: "rectangle",
          layer,
          style: {
            strokeColor: strokeColor || (layer === "EARTH_CUSHION" ? "#00E676" : "#00E5FF"),
            fillColor,
            strokeWidth: 2,
          },
          symbolic: { x, y, width, height },
          evaluated: { x: evalX, y: evalY, width: evalW, height: evalH },
        };
        this.ctx.nodes.set(id, node);
        return { node };
      }

      case "draw_polyline": {
        const { id, points, closed = true, layer = "CONCRETE_SECTION", strokeColor, fillColor } = args;
        const evaluatedPoints: Array<{ x: number; y: number }> = [];
        if (Array.isArray(points)) {
          for (const pt of points) {
            evaluatedPoints.push({
              x: this.evaluateSymbolic(pt.x),
              y: this.evaluateSymbolic(pt.y),
            });
          }
        }

        const node: SceneGraphNode = {
          id,
          type: "polyline",
          layer,
          style: {
            strokeColor: strokeColor || "#00E5FF",
            fillColor,
            strokeWidth: 2,
          },
          symbolic: { closed: closed ? 1 : 0 },
          evaluated: { closed: closed ? 1 : 0 },
          points: evaluatedPoints,
        };
        this.ctx.nodes.set(id, node);
        return { node };
      }

      case "draw_text": {
        const { id, x, y, text, height = 250, layer = "ANNOTATIONS", rotation = 0, color } = args;
        const evalX = this.evaluateSymbolic(x);
        const evalY = this.evaluateSymbolic(y);

        const node: SceneGraphNode = {
          id,
          type: "text",
          layer,
          style: {
            strokeColor: color || "#ECEFF1",
            fontSize: Number(height),
          },
          symbolic: { x, y, text },
          evaluated: { x: evalX, y: evalY, height: Number(height), rotation: Number(rotation) },
        };
        this.ctx.nodes.set(id, node);
        return { node };
      }

      case "set_position": {
        const { entityId, x, y } = args;
        const node = this.ctx.nodes.get(entityId);
        if (!node) throw new Error(`Entity "${entityId}" not found for set_position`);
        const evalX = this.evaluateSymbolic(x);
        const evalY = this.evaluateSymbolic(y);
        node.symbolic.x = x;
        node.symbolic.y = y;

        if (node.type === "circle" || node.type === "arc") {
          node.symbolic.cx = x;
          node.symbolic.cy = y;
          node.evaluated.cx = evalX;
          node.evaluated.cy = evalY;
        } else if (node.type === "line") {
          const dx = evalX - (node.evaluated.x1 ?? 0);
          const dy = evalY - (node.evaluated.y1 ?? 0);
          node.evaluated.x1 = evalX;
          node.evaluated.y1 = evalY;
          node.evaluated.x2 = (node.evaluated.x2 ?? 0) + dx;
          node.evaluated.y2 = (node.evaluated.y2 ?? 0) + dy;
        } else if (node.type === "rectangle" || node.type === "text") {
          node.evaluated.x = evalX;
          node.evaluated.y = evalY;
        } else if (node.points && node.points.length > 0) {
          const bounds = this.getNodeBounds(node);
          const dx = evalX - bounds.minX;
          const dy = evalY - bounds.minY;
          for (const p of node.points) {
            p.x += dx;
            p.y += dy;
          }
        }
        return { node };
      }

      case "move": {
        const { entityId, dx, dy } = args;
        const node = this.ctx.nodes.get(entityId);
        if (!node) throw new Error(`Entity "${entityId}" not found for move`);
        const evalDx = this.evaluateSymbolic(dx);
        const evalDy = this.evaluateSymbolic(dy);

        if (node.type === "rectangle" || node.type === "text") {
          node.evaluated.x = (node.evaluated.x ?? 0) + evalDx;
          node.evaluated.y = (node.evaluated.y ?? 0) + evalDy;
        } else if (node.type === "circle" || node.type === "arc") {
          node.evaluated.cx = (node.evaluated.cx ?? 0) + evalDx;
          node.evaluated.cy = (node.evaluated.cy ?? 0) + evalDy;
        } else if (node.type === "line") {
          node.evaluated.x1 = (node.evaluated.x1 ?? 0) + evalDx;
          node.evaluated.y1 = (node.evaluated.y1 ?? 0) + evalDy;
          node.evaluated.x2 = (node.evaluated.x2 ?? 0) + evalDx;
          node.evaluated.y2 = (node.evaluated.y2 ?? 0) + evalDy;
        } else if (node.type === "dimension") {
          node.evaluated.x1 = (node.evaluated.x1 ?? 0) + evalDx;
          node.evaluated.y1 = (node.evaluated.y1 ?? 0) + evalDy;
          node.evaluated.x2 = (node.evaluated.x2 ?? 0) + evalDx;
          node.evaluated.y2 = (node.evaluated.y2 ?? 0) + evalDy;
          node.evaluated.textX = (node.evaluated.textX ?? 0) + evalDx;
          node.evaluated.textY = (node.evaluated.textY ?? 0) + evalDy;
          if (node.points) {
            for (const p of node.points) {
              p.x += evalDx;
              p.y += evalDy;
            }
          }
        } else if (node.points) {
          for (const p of node.points) {
            p.x += evalDx;
            p.y += evalDy;
          }
        }
        return { node };
      }

      case "offset": {
        const { entityId, distance, side = "outside" } = args;
        const node = this.ctx.nodes.get(entityId);
        if (!node) throw new Error(`Entity "${entityId}" not found for offset`);
        const evalDist = this.evaluateSymbolic(distance);
        const sign = side === "inside" || side === "left" ? -1 : 1;

        const offsetId = `${entityId}_offset_${Date.now()}`;
        const offsetNode: SceneGraphNode = JSON.parse(JSON.stringify(node));
        offsetNode.id = offsetId;

        if (node.type === "circle") {
          offsetNode.evaluated.r = Math.max(1, (node.evaluated.r ?? 0) + sign * evalDist);
        } else if (node.type === "arc") {
          offsetNode.evaluated.radius = Math.max(1, (node.evaluated.radius ?? 0) + sign * evalDist);
        } else if (node.type === "rectangle") {
          offsetNode.evaluated.x = (node.evaluated.x ?? 0) - sign * evalDist;
          offsetNode.evaluated.y = (node.evaluated.y ?? 0) - sign * evalDist;
          offsetNode.evaluated.width = Math.max(1, (node.evaluated.width ?? 0) + 2 * sign * evalDist);
          offsetNode.evaluated.height = Math.max(1, (node.evaluated.height ?? 0) + 2 * sign * evalDist);
        } else if (node.type === "line") {
          const dx = node.evaluated.x2 - node.evaluated.x1;
          const dy = node.evaluated.y2 - node.evaluated.y1;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const nx = (-dy / len) * sign * evalDist;
            const ny = (dx / len) * sign * evalDist;
            offsetNode.evaluated.x1 = node.evaluated.x1 + nx;
            offsetNode.evaluated.y1 = node.evaluated.y1 + ny;
            offsetNode.evaluated.x2 = node.evaluated.x2 + nx;
            offsetNode.evaluated.y2 = node.evaluated.y2 + ny;
          }
        } else if (offsetNode.points && offsetNode.points.length > 0) {
          const bounds = this.getNodeBounds(node);
          const cx = (bounds.minX + bounds.maxX) / 2;
          const cy = (bounds.minY + bounds.maxY) / 2;
          for (const p of offsetNode.points) {
            const vx = p.x - cx;
            const vy = p.y - cy;
            const vlen = Math.hypot(vx, vy);
            if (vlen > 0) {
              p.x += (vx / vlen) * sign * evalDist;
              p.y += (vy / vlen) * sign * evalDist;
            }
          }
        }
        this.ctx.nodes.set(offsetId, offsetNode);
        return { node: offsetNode };
      }

      case "mirror": {
        const { entityId, axisP1, axisP2 } = args;
        const node = this.ctx.nodes.get(entityId);
        if (!node) throw new Error(`Entity "${entityId}" not found for mirror`);
        const x1 = this.evaluateSymbolic(axisP1.x);
        const y1 = this.evaluateSymbolic(axisP1.y);
        const x2 = this.evaluateSymbolic(axisP2.x);
        const y2 = this.evaluateSymbolic(axisP2.y);

        // Compute reflection
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) throw new Error("Mirror axis points are identical");

        const mirrorPoint = (px: number, py: number) => {
          const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
          const projX = x1 + t * dx;
          const projY = y1 + t * dy;
          return {
            x: 2 * projX - px,
            y: 2 * projY - py,
          };
        };

        const mirroredId = `${entityId}_mirrored`;
        const mirroredNode: SceneGraphNode = JSON.parse(JSON.stringify(node));
        mirroredNode.id = mirroredId;

        if (node.type === "line") {
          const p1 = mirrorPoint(node.evaluated.x1, node.evaluated.y1);
          const p2 = mirrorPoint(node.evaluated.x2, node.evaluated.y2);
          mirroredNode.evaluated.x1 = p1.x;
          mirroredNode.evaluated.y1 = p1.y;
          mirroredNode.evaluated.x2 = p2.x;
          mirroredNode.evaluated.y2 = p2.y;
        } else if (node.type === "circle" || node.type === "arc") {
          const c = mirrorPoint(node.evaluated.cx, node.evaluated.cy);
          mirroredNode.evaluated.cx = c.x;
          mirroredNode.evaluated.cy = c.y;
        } else if (node.type === "rectangle") {
          const rx = node.evaluated.x;
          const ry = node.evaluated.y;
          const rw = node.evaluated.width;
          const rh = node.evaluated.height;
          const c1 = mirrorPoint(rx, ry);
          const c2 = mirrorPoint(rx + rw, ry);
          const c3 = mirrorPoint(rx + rw, ry + rh);
          const c4 = mirrorPoint(rx, ry + rh);
          const minRx = Math.min(c1.x, c2.x, c3.x, c4.x);
          const minRy = Math.min(c1.y, c2.y, c3.y, c4.y);
          const maxRx = Math.max(c1.x, c2.x, c3.x, c4.x);
          const maxRy = Math.max(c1.y, c2.y, c3.y, c4.y);
          mirroredNode.evaluated.x = minRx;
          mirroredNode.evaluated.y = minRy;
          mirroredNode.evaluated.width = maxRx - minRx;
          mirroredNode.evaluated.height = maxRy - minRy;
        } else if (node.type === "text") {
          const p = mirrorPoint(node.evaluated.x, node.evaluated.y);
          mirroredNode.evaluated.x = p.x;
          mirroredNode.evaluated.y = p.y;
        } else if (node.points) {
          mirroredNode.points = node.points.map((p) => mirrorPoint(p.x, p.y));
        }
        this.ctx.nodes.set(mirroredId, mirroredNode);
        return { node: mirroredNode };
      }

      case "add_dimension": {
        const {
          id,
          type,
          entityA,
          entityB,
          value,
          expression,
          text,
          placement = "top",
          direction = "horizontal",
        } = args;

        let evalVal = value !== undefined ? Number(value) : expression ? this.evaluateSymbolic(expression) : 0;

        // Resolve reference geometry
        const nodeA = entityA ? this.ctx.nodes.get(entityA) : undefined;
        const nodeB = entityB ? this.ctx.nodes.get(entityB) : undefined;

        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        const offsetDistance = 300;

        if (nodeA) {
          const boundsA = this.getNodeBounds(nodeA);
          if (nodeB) {
            const boundsB = this.getNodeBounds(nodeB);
            if (direction === "vertical") {
              x1 = boundsA.maxX;
              y1 = (boundsA.minY + boundsA.maxY) / 2;
              x2 = boundsB.minX;
              y2 = (boundsB.minY + boundsB.maxY) / 2;
              if (evalVal === 0) evalVal = Math.abs(y2 - y1);
            } else {
              x1 = (boundsA.minX + boundsA.maxX) / 2;
              y1 = boundsA.maxY;
              x2 = (boundsB.minX + boundsB.maxX) / 2;
              y2 = boundsB.maxY;
              if (evalVal === 0) evalVal = Math.abs(x2 - x1);
            }
          } else {
            // Unary entity dimension (e.g. width/height/span of chamber)
            if (type === "radial" && (nodeA.type === "circle" || nodeA.type === "arc")) {
              x1 = nodeA.evaluated.cx ?? 0;
              y1 = nodeA.evaluated.cy ?? 0;
              const r = evalVal > 0 ? evalVal : (nodeA.evaluated.r ?? nodeA.evaluated.radius ?? 50);
              if (evalVal === 0) evalVal = r;
              x2 = x1 + r * 0.7071;
              y2 = y1 + r * 0.7071;
            } else if (direction === "vertical") {
              if (placement === "left") {
                x1 = boundsA.minX - offsetDistance;
                x2 = boundsA.minX - offsetDistance;
              } else if (placement === "interior") {
                x1 = (boundsA.minX + boundsA.maxX) / 2;
                x2 = (boundsA.minX + boundsA.maxX) / 2;
              } else {
                x1 = boundsA.maxX + offsetDistance;
                x2 = boundsA.maxX + offsetDistance;
              }
              y1 = boundsA.minY;
              y2 = boundsA.maxY;
              if (evalVal === 0) evalVal = boundsA.maxY - boundsA.minY;
            } else {
              // horizontal
              x1 = boundsA.minX;
              x2 = boundsA.maxX;
              if (placement === "bottom") {
                y1 = boundsA.minY - offsetDistance;
                y2 = boundsA.minY - offsetDistance;
              } else if (placement === "interior") {
                y1 = (boundsA.minY + boundsA.maxY) / 2;
                y2 = (boundsA.minY + boundsA.maxY) / 2;
              } else {
                y1 = boundsA.maxY + offsetDistance;
                y2 = boundsA.maxY + offsetDistance;
              }
              if (evalVal === 0) evalVal = boundsA.maxX - boundsA.minX;
            }
          }
        } else {
          // Default baseline dimension
          x1 = 0;
          x2 = evalVal || 1000;
          y1 = placement === "bottom" ? -offsetDistance : 1000 + offsetDistance;
          y2 = y1;
        }

        const textX = (x1 + x2) / 2;
        const textY = (y1 + y2) / 2 + (direction === "horizontal" ? 120 : 0);
        const dimText = text || `${evalVal.toFixed(0)} mm`;

        const node: SceneGraphNode = {
          id,
          type: "dimension",
          layer: "DIMENSIONS",
          style: {
            strokeColor: "#FFFFFF",
            strokeWidth: 2,
            fontSize: 220,
          },
          symbolic: { entityA: entityA || "", entityB: entityB || "", expression: expression || "", placement, direction },
          evaluated: {
            value: evalVal,
            x1,
            y1,
            x2,
            y2,
            textX,
            textY,
          },
          points: [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ],
          name: dimText,
        };
        this.ctx.nodes.set(id, node);
        return { dimension: node };
      }

      default:
        throw new Error(`Unimplemented tool handler: ${tool}`);
    }
  }
}
