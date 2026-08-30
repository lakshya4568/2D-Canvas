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
