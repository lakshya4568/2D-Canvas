import { Shape } from "../geometry/types";
import {
  computeMultiShapeBounds,
  lineMetrics,
  formatDimension,
  getShapeCenter,
  getPolygonPoints,
  getStarPoints,
  pointsToSvgString,
} from "../geometry/metrics";

/**
 * Generates a clean, standalone SVG XML string for the current shapes.
 */
export function generateSvgString(
  shapes: Shape[],
  options: {
    backgroundColor?: string;
    showDimensions?: boolean;
    padding?: number;
  } = {}
): string {
  const {
    backgroundColor = "#121316",
    showDimensions = true,
    padding = 40,
  } = options;

  let minX = 0;
  let minY = 0;
  let width = 1200;
  let height = 800;

  if (shapes.length > 0) {
    const bounds = computeMultiShapeBounds(shapes);
    if (bounds) {
      minX = Math.floor(bounds.minX - padding);
      minY = Math.floor(bounds.minY - padding);
      width = Math.ceil(bounds.width + padding * 2);
      height = Math.ceil(bounds.height + padding * 2);
    }
  }

  // Generate SVG elements
  const shapeElements = shapes
    .filter((s) => s.isVisible !== false)
    .map((shape) => {
      const stroke = shape.strokeColor || "#f8fafc";
      const strokeWidth = shape.strokeWidth || 1.5;
      const opacity = shape.opacity ?? 1;
      const dash = shape.strokeDasharray ? ` stroke-dasharray="${shape.strokeDasharray}"` : "";
      const rotation = shape.rotation || 0;
      const center = getShapeCenter(shape);

      let elemStr = "";

      switch (shape.type) {
        case "line": {
          let dimensionMarkup = "";
          if (showDimensions) {
            const m = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
            dimensionMarkup = `
    <g transform="translate(${m.midpoint.x}, ${m.midpoint.y - 12})">
      <rect x="-35" y="-10" width="70" height="18" rx="3" fill="#1e212b" stroke="#3b82f6" stroke-width="1"/>
      <text x="0" y="3" fill="#f8fafc" font-size="10" font-family="JetBrains Mono, monospace" font-weight="600" text-anchor="middle">${formatDimension(m.length)}</text>
    </g>`;
          }
          elemStr = `  <line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"${dash}/>${dimensionMarkup}`;
          break;
        }
        case "arrow": {
          const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
          const headLen = 12;
          const x3 = shape.x2 - headLen * Math.cos(angle - Math.PI / 6);
          const y3 = shape.y2 - headLen * Math.sin(angle - Math.PI / 6);
          const x4 = shape.x2 - headLen * Math.cos(angle + Math.PI / 6);
          const y4 = shape.y2 - headLen * Math.sin(angle + Math.PI / 6);

          elemStr = `  <g>
    <line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"${dash}/>
    <polygon points="${shape.x2},${shape.y2} ${x3},${y3} ${x4},${y4}" fill="${stroke}"/>
  </g>`;
          break;
        }
        case "rectangle": {
          const fill = shape.fillColor || "none";
          let dimensionMarkup = "";
          if (showDimensions) {
            dimensionMarkup = `
    <g transform="translate(${shape.x + shape.width / 2}, ${shape.y - 12})">
      <rect x="-45" y="-10" width="90" height="18" rx="3" fill="#1e212b" stroke="#3b82f6" stroke-width="1"/>
      <text x="0" y="3" fill="#f8fafc" font-size="10" font-family="JetBrains Mono, monospace" font-weight="600" text-anchor="middle">${formatDimension(shape.width)} × ${formatDimension(shape.height)}</text>
    </g>`;
          }
          elemStr = `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}/>${dimensionMarkup}`;
          break;
        }
        case "circle": {
          const fill = shape.fillColor || "none";
          let dimensionMarkup = "";
          if (showDimensions) {
            dimensionMarkup = `
    <g transform="translate(${shape.cx}, ${shape.cy - shape.r - 12})">
      <rect x="-35" y="-10" width="70" height="18" rx="3" fill="#1e212b" stroke="#3b82f6" stroke-width="1"/>
      <text x="0" y="3" fill="#f8fafc" font-size="10" font-family="JetBrains Mono, monospace" font-weight="600" text-anchor="middle">R: ${formatDimension(shape.r)}</text>
    </g>`;
          }
          elemStr = `  <circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}/>${dimensionMarkup}`;
          break;
        }
        case "ellipse": {
          const fill = shape.fillColor || "none";
          elemStr = `  <ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}/>`;
          break;
        }
        case "polygon": {
          const fill = shape.fillColor || "none";
          const pts = pointsToSvgString(getPolygonPoints(shape.cx, shape.cy, shape.r, shape.sides));
          elemStr = `  <polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}/>`;
          break;
        }
        case "star": {
          const fill = shape.fillColor || "none";
          const pts = pointsToSvgString(getStarPoints(shape.cx, shape.cy, shape.innerR, shape.outerR, shape.points));
          elemStr = `  <polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}/>`;
          break;
        }
      }

      if (rotation !== 0) {
        return `  <g transform="rotate(${rotation} ${center.x} ${center.y})">\n  ${elemStr}\n  </g>`;
      }
      return elemStr;
    })
    .join("\n");

  const bgRect = backgroundColor && backgroundColor !== "transparent"
    ? `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${backgroundColor}"/>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
${bgRect}
  <g id="shapes">
${shapeElements}
  </g>
</svg>`;
}

/**
 * Downloads a standalone .svg vector file.
 */
export function exportSvg(
  shapes: Shape[],
  options: {
    filename?: string;
    backgroundColor?: string;
    showDimensions?: boolean;
  } = {}
): void {
  const {
    filename = "drawing.svg",
    backgroundColor = "#121316",
    showDimensions = true,
  } = options;

  const svgContent = generateSvgString(shapes, { backgroundColor, showDimensions });
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
