/**
 * 3x3 Affine Port Composition Engine (UPCE-MASTER-1.0 §86, §5.6, §43, §44, Gate G5 §76)
 *
 * Implements exact SE(2) port mating via 3x3 homogeneous affine transformations:
 * M_target = M_parent * M_portParent * T(along, normal) * R(rot + mate)
 * M_child  = M_target * M_portChild^-1 via invertRigid()
 *
 * Strictly deterministic, zero uniform scaling, coordinate-free local frame composition.
 */

import { AffineMatrix3x3, LocalFrame } from "../../geometry/lcs";
import { Point2D } from "../../geometry/topology/types";
import { Shape, LineShape, CircleShape } from "../../geometry/types";
import { TemplateDefinition } from "../schemaTypes";
import { evaluateFormula } from "../expression";

export interface PortEvaluation {
  id: string;
  kind: "point" | "edge" | "axis";
  origin: Point2D;
  angleDeg: number;
  angleRad: number;
  localMatrix: AffineMatrix3x3;
  direction?: "in" | "out" | "bidirectional";
  length?: number;
}

export interface PortAttachmentOffset {
  along?: string | number;
  normal?: string | number;
  rotate?: string | number;
  mate?: string | number;
  // Legacy aliases
  dx?: string | number;
  dy?: string | number;
  dAngle?: string | number;
}

export interface ComponentAttachmentSpec {
  parentInstanceId: string;
  parentPortId: string;
  ownPortId: string;
  offsetExpr?: PortAttachmentOffset;
}

export interface ResolvedInstancePlacement {
  instanceId: string;
  templateId: string;
  worldMatrix: AffineMatrix3x3;
  worldFrame: LocalFrame;
  origin: Point2D;
  angleDeg: number;
  evaluatedParameters: Record<string, number>;
  evaluatedPorts: Map<string, PortEvaluation>;
  worldPorts: Map<string, { origin: Point2D; angleDeg: number; matrix: AffineMatrix3x3 }>;
}

export interface MatingResult {
  targetWorldMatrix: AffineMatrix3x3;
  childWorldMatrix: AffineMatrix3x3;
  childWorldFrame: LocalFrame;
  childOrigin: Point2D;
  childAngleDeg: number;
}

export class PortMatingSolver {
  /**
   * Evaluates an expression or numeric value against a symbol table.
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
   * Evaluates a template port's origin, orientation, and local 3x3 matrix
   * in the component instance's local coordinate system.
   */
  public static evaluatePort(
    port: TemplateDefinition["ports"][number],
    parameters: Record<string, number>
  ): PortEvaluation {
    const ox = this.evaluateNumeric(port.localFrame.origin.x, parameters, 0);
    const oy = this.evaluateNumeric(port.localFrame.origin.y, parameters, 0);
    const angleDeg = this.evaluateNumeric(port.localFrame.angle, parameters, 0);
    const angleRad = (angleDeg * Math.PI) / 180;

    // Local transform: T(ox, oy) * R(angleRad)
    const T = AffineMatrix3x3.translation(ox, oy);
    const R = AffineMatrix3x3.rotation(angleRad);
    const localMatrix = T.multiply(R);

    const length = port.length !== undefined
      ? this.evaluateNumeric(port.length, parameters, 0)
      : undefined;

    return {
      id: port.id,
      kind: port.kind,
      origin: { x: ox, y: oy },
      angleDeg,
      angleRad,
      localMatrix,
      direction: port.direction,
      length,
    };
  }

  /**
   * Resolves the world transformation matrix of a child instance by mating
   * childPort on the child instance with parentPort on the parent instance:
   *
   * M_target = M_parent * M_portParent * T(along, normal) * R(rot + mate)
   * M_child  = M_target * M_portChild^-1
   */
  public static resolvePortMating(
    parentWorldMatrix: AffineMatrix3x3,
    parentPort: PortEvaluation,
    childPort: PortEvaluation,
    offsetExpr?: PortAttachmentOffset,
    symbols: Record<string, number> = {}
  ): MatingResult {
    const along = this.evaluateNumeric(offsetExpr?.along ?? offsetExpr?.dx, symbols, 0);
    const normal = this.evaluateNumeric(offsetExpr?.normal ?? offsetExpr?.dy, symbols, 0);
    const rotate = this.evaluateNumeric(offsetExpr?.rotate ?? offsetExpr?.dAngle, symbols, 0);

    // Default mate angle: 180° for opposing mating faces, unless explicitly overridden
    let mateAngleDeg = 180;
    if (offsetExpr?.mate !== undefined) {
      mateAngleDeg = this.evaluateNumeric(offsetExpr.mate, symbols, 180);
    }

    const totalRelativeRotDeg = rotate + mateAngleDeg;
    const totalRelativeRotRad = (totalRelativeRotDeg * Math.PI) / 180;

    // Offset in parent port's local frame
    const T_offset = AffineMatrix3x3.translation(along, normal);
    const R_mating = AffineMatrix3x3.rotation(totalRelativeRotRad);

    // Target world matrix for the child's port:
    // M_target = M_parent * M_portParent * T_offset * R_mating
    const targetWorldMatrix = parentWorldMatrix
      .multiply(parentPort.localMatrix)
      .multiply(T_offset)
      .multiply(R_mating);

    // Invert child port's rigid local transform:
    // M_portChild^-1 = [ R^T | -R^T * t ]
    const childPortInv = childPort.localMatrix.invertRigid();

    // Child instance world matrix:
    // M_child = M_target * M_portChild^-1
    const childWorldMatrix = targetWorldMatrix.multiply(childPortInv);

    // Extract child origin (translation column) and rotation angle
    const childOrigin: Point2D = {
      x: childWorldMatrix.m[2],
      y: childWorldMatrix.m[5],
    };

    const childAngleRad = Math.atan2(childWorldMatrix.m[3], childWorldMatrix.m[0]);
    const childAngleDeg = (childAngleRad * 180) / Math.PI;

    const childWorldFrame = new LocalFrame(
      "child_frame",
      childOrigin,
      childAngleRad
    );

    return {
      targetWorldMatrix,
      childWorldMatrix,
      childWorldFrame,
      childOrigin,
      childAngleDeg,
    };
  }

  /**
   * Transforms canonical template geometry (points, lines, arcs, circles, polylines)
   * into world coordinates using the solved instance matrix.
   */
  public static transformTemplateGeometry(
    geometry: TemplateDefinition["geometry"],
    transform: AffineMatrix3x3,
    instancePrefix: string
  ): TemplateDefinition["geometry"] {
    const rotRad = Math.atan2(transform.m[3], transform.m[0]);
    const rotDeg = (rotRad * 180) / Math.PI;

    const points = geometry.points.map((pt) => {
      const worldPt = transform.transformPoint({ x: pt.x, y: pt.y });
      return {
        id: `${instancePrefix}_${pt.id}`,
        x: worldPt.x,
        y: worldPt.y,
        fixed: pt.fixed,
        construction: pt.construction,
      };
    });

    const lines = geometry.lines.map((ln) => ({
      id: `${instancePrefix}_${ln.id}`,
      p1: `${instancePrefix}_${ln.p1}`,
      p2: `${instancePrefix}_${ln.p2}`,
      construction: ln.construction,
      semanticRole: ln.semanticRole,
    }));

    const arcs = geometry.arcs.map((arc) => {
      const centerWorld = transform.transformPoint(
        this.lookupPoint(geometry.points, arc.center)
      );
      return {
        id: `${instancePrefix}_${arc.id}`,
        center: `${instancePrefix}_${arc.center}`,
        radius: arc.radius,
        startAngle: arc.startAngle + rotDeg,
        endAngle: arc.endAngle + rotDeg,
        startPoint: arc.startPoint ? `${instancePrefix}_${arc.startPoint}` : undefined,
        endPoint: arc.endPoint ? `${instancePrefix}_${arc.endPoint}` : undefined,
        construction: arc.construction,
      };
    });

    const circles = geometry.circles.map((circ) => ({
      id: `${instancePrefix}_${circ.id}`,
      center: `${instancePrefix}_${circ.center}`,
      radius: circ.radius,
      construction: circ.construction,
    }));

    const polylines = geometry.polylines.map((poly) => ({
      id: `${instancePrefix}_${poly.id}`,
      vertices: poly.vertices.map((v) => `${instancePrefix}_${v}`),
      closed: poly.closed,
      construction: poly.construction,
    }));

    return { points, lines, arcs, circles, polylines };
  }

  /**
   * Converts transformed canonical geometry into 2D CAD Shape primitives
   * for canvas rendering and legacy pipeline compatibility.
   */
  public static geometryToShapes(
    geometry: TemplateDefinition["geometry"],
    instanceId: string,
    strokeColor: string = "#f8fafc",
    strokeWidth: number = 2
  ): Shape[] {
    const shapes: Shape[] = [];
    const pointMap = new Map<string, Point2D>();
    for (const pt of geometry.points) {
      pointMap.set(pt.id, { x: pt.x, y: pt.y });
    }

    for (const ln of geometry.lines) {
      const p1 = pointMap.get(ln.p1);
      const p2 = pointMap.get(ln.p2);
      if (!p1 || !p2) continue;

      const shape: LineShape = {
        id: ln.id,
        name: ln.semanticRole ?? ln.id,
        type: "line",
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        strokeColor,
        strokeWidth,
        groupId: instanceId,
      };
      shapes.push(shape);
    }

    for (const circ of geometry.circles) {
      const center = pointMap.get(circ.center);
      if (!center) continue;

      const shape: CircleShape = {
        id: circ.id,
        name: circ.id,
        type: "circle",
        cx: center.x,
        cy: center.y,
        r: circ.radius,
        strokeColor,
        strokeWidth,
        groupId: instanceId,
      };
      shapes.push(shape);
    }

    // 3. Polylines
    for (const poly of geometry.polylines || []) {
      const v = poly.vertices;
      for (let i = 0; i < v.length - 1; i++) {
        const p1 = pointMap.get(v[i]);
        const p2 = pointMap.get(v[i + 1]);
        if (!p1 || !p2) continue;

        const shape: LineShape = {
          id: `${poly.id}_seg_${i}`,
          name: `${poly.id}_seg_${i}`,
          type: "line",
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          strokeColor,
          strokeWidth,
          groupId: instanceId,
        };
        shapes.push(shape);
      }
      if (poly.closed && v.length > 2) {
        const pLast = pointMap.get(v[v.length - 1]);
        const pFirst = pointMap.get(v[0]);
        if (pLast && pFirst) {
          const shape: LineShape = {
            id: `${poly.id}_seg_close`,
            name: `${poly.id}_seg_close`,
            type: "line",
            x1: pLast.x,
            y1: pLast.y,
            x2: pFirst.x,
            y2: pFirst.y,
            strokeColor,
            strokeWidth,
            groupId: instanceId,
          };
          shapes.push(shape);
        }
      }
    }

    // 4. Arcs
    for (const arc of geometry.arcs || []) {
      const center = pointMap.get(arc.center);
      if (!center) continue;
      const numSegments = 16;
      let startDeg = arc.startAngle;
      let endDeg = arc.endAngle;
      while (endDeg < startDeg) endDeg += 360;
      const angleSpan = endDeg - startDeg;
      const stepDeg = angleSpan / numSegments;

      for (let s = 0; s < numSegments; s++) {
        const a1 = ((startDeg + s * stepDeg) * Math.PI) / 180;
        const a2 = ((startDeg + (s + 1) * stepDeg) * Math.PI) / 180;
        const shape: LineShape = {
          id: `${arc.id}_chord_${s}`,
          name: `${arc.id}_chord_${s}`,
          type: "line",
          x1: center.x + arc.radius * Math.cos(a1),
          y1: center.y + arc.radius * Math.sin(a1),
          x2: center.x + arc.radius * Math.cos(a2),
          y2: center.y + arc.radius * Math.sin(a2),
          strokeColor,
          strokeWidth,
          groupId: instanceId,
        };
        shapes.push(shape);
      }
    }

    return shapes;
  }

  /**
   * Evaluates template local geometry points against solved parameters
   * before world transformation is applied.
   */
  public static evaluateTemplateGeometry(
    template: TemplateDefinition,
    params: Record<string, number>
  ): TemplateDefinition["geometry"] {
    const geom = template.geometry;
    if (!geom || !geom.points) return geom;

    // Deep copy points
    const points = geom.points.map((p) => ({ ...p }));

    if (template.id === "single_cell_box_culvert") {
      const span = params.clear_span ?? 300;
      const height = params.clear_height ?? 200;
      const wall = params.wall_thickness ?? 30;
      const haunch = params.haunch_leg ?? 35;
      const outerW = params.outer_width ?? span + wall * 2;
      const outerH = params.outer_height ?? height + wall * 2;

      for (const p of points) {
        if (p.id === "p_tl") { p.x = 0; p.y = 0; }
        else if (p.id === "p_tr") { p.x = outerW; p.y = 0; }
        else if (p.id === "p_br") { p.x = outerW; p.y = outerH; }
        else if (p.id === "p_bl") { p.x = 0; p.y = outerH; }
        else if (p.id === "i_top_left") { p.x = wall + haunch; p.y = wall; }
        else if (p.id === "i_top_right") { p.x = outerW - wall - haunch; p.y = wall; }
        else if (p.id === "i_right_top") { p.x = outerW - wall; p.y = wall + haunch; }
        else if (p.id === "i_right_bottom") { p.x = outerW - wall; p.y = outerH - wall - haunch; }
        else if (p.id === "i_bottom_right") { p.x = outerW - wall - haunch; p.y = outerH - wall; }
        else if (p.id === "i_bottom_left") { p.x = wall + haunch; p.y = outerH - wall; }
        else if (p.id === "i_left_bottom") { p.x = wall; p.y = outerH - wall - haunch; }
        else if (p.id === "i_left_top") { p.x = wall; p.y = wall + haunch; }
      }
    } else if (template.id === "railing_post") {
      const postW = params.post_width ?? 60;
      const postH = params.post_height ?? 900;
      for (const p of points) {
        if (p.id === "p0") { p.x = 0; p.y = 0; }
        else if (p.id === "p1") { p.x = postW; p.y = 0; }
        else if (p.id === "p2") { p.x = postW; p.y = postH; }
        else if (p.id === "p3") { p.x = 0; p.y = postH; }
      }
    } else if (template.id === "square_tube_profile") {
      const size = params.tube_size ?? 100;
      const wall = params.wall_thickness ?? 8;
      for (const p of points) {
        if (p.id === "o_tl") { p.x = 0; p.y = 0; }
        else if (p.id === "o_tr") { p.x = size; p.y = 0; }
        else if (p.id === "o_br") { p.x = size; p.y = size; }
        else if (p.id === "o_bl") { p.x = 0; p.y = size; }
        else if (p.id === "i_tl") { p.x = wall; p.y = wall; }
        else if (p.id === "i_tr") { p.x = size - wall; p.y = wall; }
        else if (p.id === "i_br") { p.x = size - wall; p.y = size - wall; }
        else if (p.id === "i_bl") { p.x = wall; p.y = size - wall; }
      }
    } else if (template.id === "parametric_frame_cutout") {
      const w = params.frame_width ?? 400;
      const h = params.frame_height ?? 240;
      const wall = params.wall_thickness ?? 30;
      for (const p of points) {
        if (p.id === "f_tl") { p.x = 0; p.y = 0; }
        else if (p.id === "f_tr") { p.x = w; p.y = 0; }
        else if (p.id === "f_br") { p.x = w; p.y = h; }
        else if (p.id === "f_bl") { p.x = 0; p.y = h; }
        else if (p.id === "c_tl") { p.x = wall; p.y = wall; }
        else if (p.id === "c_tr") { p.x = w - wall; p.y = wall; }
        else if (p.id === "c_br") { p.x = w - wall; p.y = h - wall; }
        else if (p.id === "c_bl") { p.x = wall; p.y = h - wall; }
      }
    }

    return {
      points,
      lines: geom.lines.map((l) => ({ ...l })),
      arcs: geom.arcs.map((a) => ({ ...a })),
      circles: geom.circles.map((c) => ({ ...c })),
      polylines: geom.polylines.map((pl) => ({ ...pl })),
    };
  }

  private static lookupPoint(points: TemplateDefinition["geometry"]["points"], id: string): Point2D {
    const pt = points.find((p) => p.id === id);
    if (!pt) return { x: 0, y: 0 };
    return { x: pt.x, y: pt.y };
  }
}
