import { Shape } from "../geometry/types";
import { documentExportSchema, shapeExportSchema } from "./schema";

export interface ImportResult {
  success: boolean;
  shapes?: Shape[];
  error?: string;
}

/**
 * Parses and validates an uploaded JSON text string or File into Shape objects with unique IDs.
 */
export function parseAndValidateJson(jsonString: string): ImportResult {
  try {
    const rawData = JSON.parse(jsonString);

    // Normalize: Handle both `{ shapes: [...] }` and raw `[...]` shape array
    let candidate = rawData;
    if (Array.isArray(rawData)) {
      candidate = { shapes: rawData };
    }

    const parseResult = documentExportSchema.safeParse(candidate);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const issuePath = issue?.path.join(".") || "root";
      const issueMsg = issue?.message || "Invalid schema structure";
      return {
        success: false,
        error: `Validation error at "${issuePath}": ${issueMsg}`,
      };
    }

    const importedShapes: Shape[] = parseResult.data.shapes.map((item) => {
      const id = "shape_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
      return {
        ...item,
        id,
      } as Shape;
    });

    return {
      success: true,
      shapes: importedShapes,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Malformed JSON file";
    return {
      success: false,
      error: `Failed to parse JSON: ${message}`,
    };
  }
}

/**
 * Reads a File object and validates its JSON content.
 */
export async function importJsonFile(file: File): Promise<ImportResult> {
  try {
    const text = await file.text();
    return parseAndValidateJson(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not read file";
    return {
      success: false,
      error: message,
    };
  }
}
