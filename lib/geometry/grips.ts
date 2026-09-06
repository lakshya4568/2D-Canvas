import { Shape, CadGrip } from "./types";

export function computeEntityGrips(shape: Shape): CadGrip[] {
  const grips: CadGrip[] = [];

  switch (shape.type) {
    case "line":
    case "arrow": {
      grips.push({
        id: `grip_${shape.id}_v0`,
        shapeId: shape.id,
        type: "vertex",
        vertexIndex: 0,
        x: shape.x1,
        y: shape.y1,
        state: "warm",
        cursor: "crosshair",
        tooltip: "Stretch Endpoint 1",
      });
      grips.push({
        id: `grip_${shape.id}_v1`,
        shapeId: shape.id,
        type: "vertex",
        vertexIndex: 1,
        x: shape.x2,
        y: shape.y2,
        state: "warm",
        cursor: "crosshair",
        tooltip: "Stretch Endpoint 2",
      });
      grips.push({
        id: `grip_${shape.id}_mid`,
        shapeId: shape.id,
        type: "midpoint",
        segmentIndex: 0,
        x: (shape.x1 + shape.x2) / 2,
        y: (shape.y1 + shape.y2) / 2,
        state: "warm",
        cursor: "move",
        tooltip: "Move Segment",
      });
      break;
    }

    case "rectangle": {
      const { x, y, width: w, height: h } = shape;
      grips.push({
        id: `grip_${shape.id}_v0`,
        shapeId: shape.id,
        type: "vertex",
        vertexIndex: 0,
        x,
        y,
        state: "warm",
        cursor: "crosshair",
        tooltip: "Stretch Corner (Top-Left)",
      });
      grips.push({
        id: `grip_${shape.id}_v1`,
        shapeId: shape.id,
        type: "vertex",
        vertexIndex: 1,
        x: x + w,
        y,
        state: "warm",
        cursor: "crosshair",
        tooltip: "Stretch Corner (Top-Right)",
      });
      grips.push({
        id: `grip_${shape.id}_v2`,
        shapeId: shape.id,
        type: "vertex",
        vertexIndex: 2,
        x: x + w,
        y: y + h,
        state: "warm",
        cursor: "crosshair",
        tooltip: "Stretch Corner (Bottom-Right)",
      });
      grips.push({
        id: `grip_${shape.id}_v3`,
        shapeId: shape.id,
        type: "vertex",
        vertexIndex: 3,
        x,
        y: y + h,
        state: "warm",
        cursor: "crosshair",
        tooltip: "Stretch Corner (Bottom-Left)",
      });

      grips.push({
        id: `grip_${shape.id}_m0`,
        shapeId: shape.id,
        type: "midpoint",
        segmentIndex: 0,
        x: x + w / 2,
        y,
        state: "warm",
        cursor: "ns-resize",
        tooltip: "Offset Top Edge",
      });
      grips.push({
        id: `grip_${shape.id}_m1`,
        shapeId: shape.id,
        type: "midpoint",
        segmentIndex: 1,
        x: x + w,
        y: y + h / 2,
        state: "warm",
        cursor: "ew-resize",
        tooltip: "Offset Right Edge",
      });
      grips.push({
        id: `grip_${shape.id}_m2`,
        shapeId: shape.id,
        type: "midpoint",
        segmentIndex: 2,
        x: x + w / 2,
        y: y + h,
        state: "warm",
        cursor: "ns-resize",
        tooltip: "Offset Bottom Edge",
      });
      grips.push({
        id: `grip_${shape.id}_m3`,
        shapeId: shape.id,
        type: "midpoint",
        segmentIndex: 3,
        x,
        y: y + h / 2,
        state: "warm",
        cursor: "ew-resize",
        tooltip: "Offset Left Edge",
      });

      grips.push({
        id: `grip_${shape.id}_center`,
        shapeId: shape.id,
        type: "center",
        x: x + w / 2,
        y: y + h / 2,
        state: "warm",
        cursor: "move",
        tooltip: "Move Rectangle",
      });
      break;
    }

    case "circle": {
      const { cx, cy, r } = shape;
      grips.push({
        id: `grip_${shape.id}_center`,
        shapeId: shape.id,
        type: "center",
        x: cx,
        y: cy,
        state: "warm",
        cursor: "move",
        tooltip: "Move Center",
      });
      grips.push({
        id: `grip_${shape.id}_q0`,
        shapeId: shape.id,
        type: "quadrant",
        vertexIndex: 0,
        x: cx + r,
        y: cy,
        state: "warm",
        cursor: "ew-resize",
        tooltip: "Adjust Radius (East)",
      });
      grips.push({
        id: `grip_${shape.id}_q1`,
        shapeId: shape.id,
        type: "quadrant",
        vertexIndex: 1,
        x: cx,
        y: cy - r,
        state: "warm",
        cursor: "ns-resize",
        tooltip: "Adjust Radius (North)",
      });
      grips.push({
        id: `grip_${shape.id}_q2`,
        shapeId: shape.id,
        type: "quadrant",
        vertexIndex: 2,
        x: cx - r,
        y: cy,
        state: "warm",
        cursor: "ew-resize",
        tooltip: "Adjust Radius (West)",
      });
      grips.push({
        id: `grip_${shape.id}_q3`,
        shapeId: shape.id,
        type: "quadrant",
        vertexIndex: 3,
        x: cx,
        y: cy + r,
        state: "warm",
        cursor: "ns-resize",
        tooltip: "Adjust Radius (South)",
      });
      break;
    }

    case "ellipse": {
      const { cx, cy, rx, ry } = shape;
      grips.push({
        id: `grip_${shape.id}_center`,
        shapeId: shape.id,
        type: "center",
        x: cx,
        y: cy,
        state: "warm",
        cursor: "move",
        tooltip: "Move Center",
      });
      grips.push({
        id: `grip_${shape.id}_q0`,
        shapeId: shape.id,
        type: "quadrant",
        vertexIndex: 0,
        x: cx + rx,
        y: cy,
        state: "warm",
        cursor: "ew-resize",
        tooltip: "Adjust Rx",
      });
      grips.push({
        id: `grip_${shape.id}_q1`,
        shapeId: shape.id,
        type: "quadrant",
        vertexIndex: 1,
        x: cx,
        y: cy - ry,
        state: "warm",
        cursor: "ns-resize",
        tooltip: "Adjust Ry",
      });
      break;
    }

    case "polygon": {
      const n = Math.max(3, shape.sides || 3);
      for (let i = 0; i < n; i++) {
        const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
        const vx = shape.cx + shape.r * Math.cos(angle);
        const vy = shape.cy + shape.r * Math.sin(angle);
        grips.push({
          id: `grip_${shape.id}_v${i}`,
          shapeId: shape.id,
          type: "vertex",
          vertexIndex: i,
          x: vx,
          y: vy,
          state: "warm",
          cursor: "crosshair",
          tooltip: `Stretch Vertex ${i + 1}`,
        });
      }
      grips.push({
        id: `grip_${shape.id}_center`,
        shapeId: shape.id,
        type: "center",
        x: shape.cx,
        y: shape.cy,
        state: "warm",
        cursor: "move",
        tooltip: "Move Polygon",
      });
      break;
    }
  }

  return grips;
}
