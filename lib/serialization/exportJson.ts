import { Shape } from "../geometry/types";
import { DocumentExportData, ShapeExportData } from "./schema";

/**
 * Serializes the current shapes array into the specification-compliant JSON document payload.
 * Strips internal tracking IDs so exported JSON is pure geometry.
 */
export function serializeShapesToJson(shapes: Shape[]): DocumentExportData {
  const exportShapes: ShapeExportData[] = shapes.map((shape) => {
    switch (shape.type) {
      case "line": {
        const item: ShapeExportData = {
          type: "line",
          x1: Number(shape.x1.toFixed(2)),
          y1: Number(shape.y1.toFixed(2)),
          x2: Number(shape.x2.toFixed(2)),
          y2: Number(shape.y2.toFixed(2)),
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
      case "arrow": {
        const item: ShapeExportData = {
          type: "arrow",
          x1: Number(shape.x1.toFixed(2)),
          y1: Number(shape.y1.toFixed(2)),
          x2: Number(shape.x2.toFixed(2)),
          y2: Number(shape.y2.toFixed(2)),
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
      case "rectangle": {
        const item: ShapeExportData = {
          type: "rectangle",
          x: Number(shape.x.toFixed(2)),
          y: Number(shape.y.toFixed(2)),
          width: Number(shape.width.toFixed(2)),
          height: Number(shape.height.toFixed(2)),
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.fillColor) item.fillColor = shape.fillColor;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
      case "circle": {
        const item: ShapeExportData = {
          type: "circle",
          cx: Number(shape.cx.toFixed(2)),
          cy: Number(shape.cy.toFixed(2)),
          r: Number(shape.r.toFixed(2)),
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.fillColor) item.fillColor = shape.fillColor;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
      case "ellipse": {
        const item: ShapeExportData = {
          type: "ellipse",
          cx: Number(shape.cx.toFixed(2)),
          cy: Number(shape.cy.toFixed(2)),
          rx: Number(shape.rx.toFixed(2)),
          ry: Number(shape.ry.toFixed(2)),
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.fillColor) item.fillColor = shape.fillColor;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
      case "polygon": {
        const item: ShapeExportData = {
          type: "polygon",
          cx: Number(shape.cx.toFixed(2)),
          cy: Number(shape.cy.toFixed(2)),
          r: Number(shape.r.toFixed(2)),
          sides: shape.sides,
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.fillColor) item.fillColor = shape.fillColor;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
      case "star": {
        const item: ShapeExportData = {
          type: "star",
          cx: Number(shape.cx.toFixed(2)),
          cy: Number(shape.cy.toFixed(2)),
          innerR: Number(shape.innerR.toFixed(2)),
          outerR: Number(shape.outerR.toFixed(2)),
          points: shape.points,
        };
        if (shape.strokeColor) item.strokeColor = shape.strokeColor;
        if (shape.strokeWidth) item.strokeWidth = shape.strokeWidth;
        if (shape.fillColor) item.fillColor = shape.fillColor;
        if (shape.opacity !== undefined) item.opacity = shape.opacity;
        if (shape.strokeDasharray) item.strokeDasharray = shape.strokeDasharray;
        if (shape.rotation) item.rotation = shape.rotation;
        return item;
      }
    }
  });

  return {
    shapes: exportShapes,
  };
}

/**
 * Generates and triggers the browser download of drawing.json.
 */
export function exportJson(shapes: Shape[], filename = "drawing.json"): void {
  const data = serializeShapesToJson(shapes);
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
