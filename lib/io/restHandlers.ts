/**
 * Framework-agnostic REST handlers for the §69 contract.
 * UPCE-MASTER-1.0 §69, §88 ("the render/solve API is stateless — document in,
 * result out — and scales horizontally behind a load balancer").
 *
 *   GET  /v1/templates                    ?query    -> catalogue
 *   POST /v1/templates/{id}/instantiate   { params } -> { sketchId, derived, dof, warnings }
 *   POST /v1/templates/{id}/render        { params, format, dxfVersion } -> binary
 *
 * These functions take plain values and return plain values, so the Next.js
 * route files are three lines each and the same handlers are directly testable
 * without an HTTP server.
 */

import { RenderService, RenderFormat, RenderRequest } from "./renderService";
import { TemplateRenderHost } from "./templateRenderHost";
import { TemplateRegistry } from "../parametric/templates/templateRegistry";
import { StandardsProfileRegistry } from "../validation/standardsProfile";
import { DxfVersion } from "./dxfExporter";
import { SheetSize } from "./pdfSheetExporter";

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T | { error: string };
}

export interface BinaryApiResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | { error: string };
}

let sharedService: RenderService | null = null;

/**
 * Process-wide service. Stateless per request; the registry it holds is
 * read-only catalogue data, which is what makes horizontal scaling safe.
 */
export function getRenderService(): RenderService {
  if (!sharedService) {
    sharedService = new RenderService(
      new TemplateRenderHost({
        registry: new TemplateRegistry(),
        standards: new StandardsProfileRegistry(),
      })
    );
  }
  return sharedService;
}

/** Test seam: replace the shared service, e.g. with a fixture-backed host. */
export function setRenderService(service: RenderService | null): void {
  sharedService = service;
}

const JSON_HEADERS = { "content-type": "application/json" };

/** GET /v1/templates?query= */
export function handleListTemplates(query?: string): ApiResponse {
  try {
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: { templates: getRenderService().listTemplates(query) },
    };
  } catch (error) {
    return errorResponse(500, error);
  }
}

/** POST /v1/templates/{id}/instantiate */
export function handleInstantiate(id: string, body: unknown): ApiResponse {
  const params = extractParams(body);
  if ("error" in params) return { status: 400, headers: JSON_HEADERS, body: params };

  try {
    return {
      status: 200,
      headers: JSON_HEADERS,
      body: getRenderService().instantiate(id, params.value),
    };
  } catch (error) {
    return errorResponse(notFound(error) ? 404 : 500, error);
  }
}

/** POST /v1/templates/{id}/render */
export function handleRender(id: string, body: unknown): BinaryApiResponse {
  const params = extractParams(body);
  if ("error" in params) return { status: 400, headers: JSON_HEADERS, body: params };

  const o = (body ?? {}) as Record<string, unknown>;
  const format = typeof o.format === "string" ? o.format : "dxf";
  if (!["dxf", "pdf", "svg", "json"].includes(format)) {
    return {
      status: 400,
      headers: JSON_HEADERS,
      body: { error: `Unsupported format '${format}'. Use dxf, pdf, svg, or json.` },
    };
  }

  const request: RenderRequest = {
    params: params.value,
    format: format as RenderFormat,
    dxfVersion: o.dxfVersion === "R12" ? "R12" : ("R2010" as DxfVersion),
    sheetSize:
      typeof o.sheetSize === "string" && ["A1", "A2", "A3", "A4"].includes(o.sheetSize)
        ? (o.sheetSize as SheetSize)
        : "A3",
    scaleDenominator: typeof o.scale === "number" ? o.scale : undefined,
    projectName: typeof o.projectName === "string" ? o.projectName : undefined,
    drawingTitle: typeof o.drawingTitle === "string" ? o.drawingTitle : undefined,
    includeConstruction: o.includeConstruction === true,
  };

  try {
    const result = getRenderService().render(id, request);
    const headers: Record<string, string> = {
      "content-type": result.contentType,
      "content-disposition": `attachment; filename="${result.filename}"`,
    };
    // Compliance travels in headers so a binary download still carries its
    // status (§26: flagged non-compliant in its metadata header).
    if (result.compliance) {
      headers["x-gad-compliance"] = result.compliance.compliant ? "compliant" : "non-compliant";
      headers["x-gad-standards-profile"] =
        `${result.compliance.profileId}@${result.compliance.profileRevision}` +
        (result.compliance.verified ? "" : " (unverified)");
    }
    if (result.warnings.length > 0) {
      headers["x-gad-warnings"] = String(result.warnings.length);
    }
    return { status: 200, headers, body: result.body };
  } catch (error) {
    return errorResponse(notFound(error) ? 404 : 500, error);
  }
}

function extractParams(
  body: unknown
): { value: Record<string, number> } | { error: string } {
  if (body === undefined || body === null) return { value: {} };
  if (typeof body !== "object") return { error: "Request body must be a JSON object." };

  const raw = (body as Record<string, unknown>).params;
  if (raw === undefined) return { value: {} };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "'params' must be an object of parameter name to number." };
  }

  const value: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { error: `Parameter '${k}' must be a finite number.` };
    }
    value[k] = v;
  }
  return { value };
}

function notFound(error: unknown): boolean {
  return error instanceof Error && /No template with id/.test(error.message);
}

function errorResponse(status: number, error: unknown): ApiResponse & BinaryApiResponse {
  return {
    status,
    headers: JSON_HEADERS,
    body: { error: error instanceof Error ? error.message : String(error) },
  };
}
