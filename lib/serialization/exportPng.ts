import { Shape } from "../geometry/types";
import { generateSvgString } from "./exportSvg";

/**
 * Exports the current shapes to a crisp high-resolution PNG image
 * via offscreen Canvas rasterization.
 */
export async function exportPng(
  shapes: Shape[],
  options: {
    filename?: string;
    scale?: number;
    backgroundColor?: string;
    showDimensions?: boolean;
  } = {}
): Promise<void> {
  const {
    filename = "drawing.png",
    scale = 2,
    backgroundColor = "#121316",
    showDimensions = true,
  } = options;

  const svgString = generateSvgString(shapes, { backgroundColor, showDimensions });
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const width = img.naturalWidth || 1200;
        const height = img.naturalHeight || 800;

        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Could not initialize 2D canvas context"));
          return;
        }

        // Fill background
        if (backgroundColor && backgroundColor !== "transparent") {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Crisp 2x scale
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);

        URL.revokeObjectURL(blobUrl);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to produce PNG blob"));
              return;
            }
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
            resolve();
          },
          "image/png",
          1.0
        );
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`Failed to load SVG for rasterization: ${err}`));
    };

    img.src = blobUrl;
  });
}
