import { Shape, RectangleShape, CircleShape, LineShape, PolygonShape } from "./types";

export interface DerivedPoint {
  x: number;
  y: number;
}

export interface DerivedLineProps {
  length: number;
  angleDeg: number;
  angleRad: number;
  direction: { dx: number; dy: number };
  midpoint: DerivedPoint;
  start: DerivedPoint;
  end: DerivedPoint;
  normal: { nx: number; ny: number };
}

export interface DerivedRectProps {
  width: number;
  height: number;
  center: DerivedPoint;
  corners: {
    tl: DerivedPoint;
    tr: DerivedPoint;
    br: DerivedPoint;
    bl: DerivedPoint;
  };
  area: number;
  perimeter: number;
  aspectRatio: number;
  edges: {
    top: { length: number; angleDeg: number };
    right: { length: number; angleDeg: number };
    bottom: { length: number; angleDeg: number };
    left: { length: number; angleDeg: number };
  };
}

export interface DerivedCircleProps {
  center: DerivedPoint;
  radius: number;
  diameter: number;
  circumference: number;
  area: number;
}

export interface DerivedPolygonProps {
  vertices: DerivedPoint[];
  edgeLengths: number[];
  edgeAnglesDeg: number[];
  area: number;
  perimeter: number;
  centroid: DerivedPoint;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
}

export type DerivedGeometryProps =
  | { kind: "line"; props: DerivedLineProps }
  | { kind: "rectangle"; props: DerivedRectProps }
  | { kind: "circle"; props: DerivedCircleProps }
  | { kind: "polygon"; props: DerivedPolygonProps };

/**
 * Computes all derived mathematical properties for a given shape.
 */
export function computeDerivedProperties(shape: Shape): DerivedGeometryProps {
  switch (shape.type) {
    case "line":
    case "arrow": {
      const s = shape as LineShape;
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy);
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;
      const unitX = len > 1e-6 ? dx / len : 1;
      const unitY = len > 1e-6 ? dy / len : 0;

      return {
        kind: "line",
        props: {
          length: len,
          angleDeg,
          angleRad,
          direction: { dx: unitX, dy: unitY },
          midpoint: { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 },
          start: { x: s.x1, y: s.y1 },
          end: { x: s.x2, y: s.y2 },
          normal: { nx: -unitY, ny: unitX },
        },
      };
    }

    case "rectangle": {
      const s = shape as RectangleShape;
      const w = Math.abs(s.width);
      const h = Math.abs(s.height);
      const cx = s.x + w / 2;
      const cy = s.y + h / 2;

      return {
        kind: "rectangle",
        props: {
          width: w,
          height: h,
          center: { x: cx, y: cy },
          corners: {
            tl: { x: s.x, y: s.y },
            tr: { x: s.x + w, y: s.y },
            br: { x: s.x + w, y: s.y + h },
            bl: { x: s.x, y: s.y + h },
          },
          area: w * h,
          perimeter: 2 * (w + h),
          aspectRatio: h > 0 ? w / h : 1,
          edges: {
            top: { length: w, angleDeg: 0 },
            right: { length: h, angleDeg: 90 },
            bottom: { length: w, angleDeg: 180 },
            left: { length: h, angleDeg: 270 },
          },
        },
      };
    }

    case "circle": {
      const s = shape as CircleShape;
      const r = Math.abs(s.r);
      return {
        kind: "circle",
        props: {
          center: { x: s.cx, y: s.cy },
          radius: r,
          diameter: 2 * r,
          circumference: 2 * Math.PI * r,
          area: Math.PI * r * r,
        },
      };
    }

    case "polygon":
    default: {
      const s = shape as PolygonShape;
      const sides = Math.max(3, s.sides || 3);
      const r = Math.abs(s.r || 50);
      const vertices: DerivedPoint[] = [];

      for (let i = 0; i < sides; i++) {
        const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
        vertices.push({
          x: s.cx + r * Math.cos(a),
          y: s.cy + r * Math.sin(a),
        });
      }

      // Edge lengths & angles
      const edgeLengths: number[] = [];
      const edgeAnglesDeg: number[] = [];
      let perimeter = 0;
      let area = 0;
      let cx = 0;
      let cy = 0;

      for (let i = 0; i < sides; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % sides];
        const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        edgeLengths.push(d);
        edgeAnglesDeg.push(((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI + 360) % 360);
        perimeter += d;

        // Shoelace area
        const cross = p1.x * p2.y - p2.x * p1.y;
        area += cross;
        cx += (p1.x + p2.x) * cross;
        cy += (p1.y + p2.y) * cross;
      }

      area = Math.abs(area) / 2;
      if (Math.abs(area) > 1e-6) {
        cx = cx / (6 * area);
        cy = cy / (6 * area);
      } else {
        cx = s.cx;
        cy = s.cy;
      }

      const xs = vertices.map((v) => v.x);
      const ys = vertices.map((v) => v.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      return {
        kind: "polygon",
        props: {
          vertices,
          edgeLengths,
          edgeAnglesDeg,
          area,
          perimeter,
          centroid: { x: cx, y: cy },
          boundingBox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
        },
      };
    }
  }
}

/**
 * Evaluates function calls like length(Line_1), area(R1), centroid(Poly_1)
 */
export function evaluateDerivedPropertyExpression(
  expression: string,
  shapes: Shape[]
): number | null {
  const trimmed = expression.trim();
  const match = trimmed.match(/^([a-zA-Z_]+)\(([a-zA-Z0-9_\-]+)\)$/);
  if (!match) return null;

  const fn = match[1].toLowerCase();
  const shapeIdOrName = match[2];

  const shape = shapes.find(
    (s) => s.id === shapeIdOrName || (s as any).name?.toLowerCase() === shapeIdOrName.toLowerCase()
  );
  if (!shape) return null;

  const derived = computeDerivedProperties(shape);

  switch (fn) {
    case "length":
      return derived.kind === "line" ? derived.props.length : null;
    case "area":
      if (derived.kind === "rectangle") return derived.props.area;
      if (derived.kind === "circle") return derived.props.area;
      if (derived.kind === "polygon") return derived.props.area;
      return null;
    case "perimeter":
    case "circumference":
      if (derived.kind === "rectangle") return derived.props.perimeter;
      if (derived.kind === "circle") return derived.props.circumference;
      if (derived.kind === "polygon") return derived.props.perimeter;
      return null;
    case "radius":
      return derived.kind === "circle" ? derived.props.radius : null;
    case "diameter":
      return derived.kind === "circle" ? derived.props.diameter : null;
    case "width":
      return derived.kind === "rectangle" ? derived.props.width : null;
    case "height":
      return derived.kind === "rectangle" ? derived.props.height : null;
    default:
      return null;
  }
}
