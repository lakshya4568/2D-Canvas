/**
 * Exports an SVG element to a high-resolution PNG image via offscreen Canvas rasterization.
 * Note: Pure native canvas rasterization with zero third-party canvas libraries.
 */
export async function exportSvgToPng(
  svgElement: SVGSVGElement,
  options: {
    filename?: string;
    scale?: number;
    backgroundColor?: string;
  } = {}
): Promise<void> {
  const {
    filename = "drawing.png",
    scale = 2,
    backgroundColor = "#121316",
  } = options;

  const bbox = svgElement.getBoundingClientRect();
  const width = bbox.width || 1200;
  const height = bbox.height || 800;

  // Clone SVG to modify export styling cleanly without altering live DOM
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", `${width}`);
  clone.setAttribute("height", `${height}`);

  // Create an XML serializer
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);

  // Fix namespace if missing
  if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
    svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Could not get 2D canvas context for export"));
          return;
        }

        // Fill background
        if (backgroundColor && backgroundColor !== "transparent") {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Scale for high DPI
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
