/**
 * The headless render service — the shared core behind the REST API and the CLI.
 * UPCE-MASTER-1.0 §69.
 *
 *   POST /v1/templates/{id}/instantiate  { params }  -> { sketchId, derived, dof, warnings }
 *   POST /v1/sketches/{sketchId}/solve   { }         -> { status, conflicts, redundant, residual }
 *   POST /v1/templates/{id}/render       { params, format, dxfVersion } -> binary
 *   GET  /v1/templates                   ?query      -> catalogue
 *
 * "The server render path reuses the SAME solver and exporter code as the client,
 *  guaranteeing parity." That is why this module exists at all: one implementation,
 *  consumed by the HTTP route handlers and by `scripts/gad-render.ts` alike.
 */

import { ParametricSketch, TemplateDefinition } from "../parametric/schemaTypes";
import { exportDxf, DxfVersion, DxfExportOptions } from "./dxfExporter";
import { exportPdfSheet, PdfSheetOptions, SheetSize } from "./pdfSheetExporter";
import { exportCanonicalSvg } from "./svgExporter";
import {
  StandardsProfile,
  StandardsEvaluation,
  evaluateAgainstProfile,
} from "../validation/standardsProfile";

export type RenderFormat = "dxf" | "pdf" | "svg" | "json";

export interface TemplateCatalogueEntry {
  id: string;
  name: string;
  category: string;
  schemaVersion: string;
  standardsReference?: string;
  drivingParameters: { name: string; value: number; min?: number; max?: number; unit: string }[];
}

/** The host supplies the template store and the instantiation engine. */
export interface RenderServiceHost {
  listTemplates(query?: string): TemplateDefinition[];
  getTemplate(id: string): TemplateDefinition | undefined;
  /**
   * Instantiates the template with the given DRIVING parameter overrides,
   * running the same solve path the client uses.
   */
  instantiate(
    template: TemplateDefinition,
    params: Record<string, number>
  ): {
    sketch: ParametricSketch;
    derived: Record<string, number>;
    dof: {
      total: number;
      status: "UC" | "FC" | "OC" | "NotSolvable";
      conflicting: string[];
      redundant: string[];
      maxResidual: number;
    };
    warnings: string[];
  };
  getStandardsProfile?(id: string): StandardsProfile | undefined;
}

export interface InstantiateResponse {
  sketchId: string;
  derived: Record<string, number>;
  dof: {
    total: number;
    status: "UC" | "FC" | "OC" | "NotSolvable";
    conflicting: string[];
    redundant: string[];
    maxResidual: number;
  };
  warnings: string[];
  compliance: StandardsEvaluation | null;
}

export interface RenderRequest {
  params: Record<string, number>;
  format: RenderFormat;
  dxfVersion?: DxfVersion;
  sheetSize?: SheetSize;
  scaleDenominator?: number;
  projectName?: string;
  drawingTitle?: string;
  includeConstruction?: boolean;
}

export interface RenderResponse {
  format: RenderFormat;
  contentType: string;
  filename: string;
  body: Uint8Array;
  compliance: StandardsEvaluation | null;
  warnings: string[];
}

export class RenderService {
  constructor(private host: RenderServiceHost) {}

  /** GET /v1/templates */
  public listTemplates(query?: string): TemplateCatalogueEntry[] {
    return this.host.listTemplates(query).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      schemaVersion: t.schemaVersion,
      standardsReference: t.standardsReference,
      drivingParameters: (t.parameters ?? [])
        .filter((p) => p.role === "DRIVING")
        .map((p) => ({
          name: p.name,
          value: p.value,
          min: typeof p.minValue === "number" ? p.minValue : undefined,
          max: typeof p.maxValue === "number" ? p.maxValue : undefined,
          unit: String(p.unit),
        })),
    }));
  }

  /** POST /v1/templates/{id}/instantiate */
  public instantiate(templateId: string, params: Record<string, number>): InstantiateResponse {
    const template = this.requireTemplate(templateId);
    const result = this.host.instantiate(template, params);
    return {
      sketchId: result.sketch.sketchId,
      derived: result.derived,
      dof: result.dof,
      warnings: result.warnings,
      compliance: this.evaluateCompliance(template, { ...params, ...result.derived }),
    };
  }

  /** POST /v1/templates/{id}/render */
  public render(templateId: string, request: RenderRequest): RenderResponse {
    const template = this.requireTemplate(templateId);
    const result = this.host.instantiate(template, request.params);
    const compliance = this.evaluateCompliance(template, {
      ...request.params,
      ...result.derived,
    });

    const metadata: Record<string, string> = {
      Template: `${template.name} (${template.id})`,
      Engine: template.engineVersion ?? "UPCE-MASTER-1.0",
      Solved: result.dof.status,
      MaxResidual: result.dof.maxResidual.toExponential(2),
    };
    if (compliance) {
      metadata.Standard = `${compliance.profileId} rev ${compliance.profileRevision}`;
      metadata.Compliance = compliance.compliant ? "COMPLIANT" : "NON-COMPLIANT (see notes)";
      if (!compliance.verified) metadata.StandardStatus = "UNVERIFIED PROFILE";
    }

    const base = `${template.id}`;
    switch (request.format) {
      case "dxf": {
        const options: DxfExportOptions = {
          version: request.dxfVersion ?? "R2010",
          includeConstruction: request.includeConstruction,
          metadata,
        };
        return {
          format: "dxf",
          contentType: "application/dxf",
          filename: `${base}.dxf`,
          body: new TextEncoder().encode(exportDxf(result.sketch, options)),
          compliance,
          warnings: result.warnings,
        };
      }
      case "pdf": {
        const options: PdfSheetOptions = {
          size: request.sheetSize ?? "A3",
          scaleDenominator: request.scaleDenominator,
          includeConstruction: request.includeConstruction,
          titleBlock: {
            projectName: request.projectName ?? "Untitled Project",
            drawingTitle: request.drawingTitle ?? template.name,
            drawingNumber: template.id,
            revision: template.schemaVersion,
            standardsProfile: template.standardsReference,
            complianceStatus: compliance
              ? compliance.compliant
                ? "COMPLIANT"
                : "SEE NOTES"
              : undefined,
          },
          metadata,
        };
        return {
          format: "pdf",
          contentType: "application/pdf",
          filename: `${base}.pdf`,
          body: exportPdfSheet(result.sketch, options),
          compliance,
          warnings: result.warnings,
        };
      }
      case "svg": {
        const svg = exportCanonicalSvg(result.sketch, {
          includeConstruction: request.includeConstruction,
          title: template.name,
        });
        return {
          format: "svg",
          contentType: "image/svg+xml",
          filename: `${base}.svg`,
          body: new TextEncoder().encode(svg),
          compliance,
          warnings: result.warnings,
        };
      }
      case "json": {
        return {
          format: "json",
          contentType: "application/json",
          filename: `${base}.json`,
          body: new TextEncoder().encode(JSON.stringify(result.sketch, null, 2)),
          compliance,
          warnings: result.warnings,
        };
      }
      default:
        throw new Error(`Unsupported render format '${request.format}'.`);
    }
  }

  private requireTemplate(id: string): TemplateDefinition {
    const t = this.host.getTemplate(id);
    if (!t) throw new Error(`No template with id '${id}'.`);
    return t;
  }

  private evaluateCompliance(
    template: TemplateDefinition,
    parameters: Record<string, number>
  ): StandardsEvaluation | null {
    if (!template.standardsReference || !this.host.getStandardsProfile) return null;
    const profile = this.host.getStandardsProfile(template.standardsReference);
    if (!profile) return null;
    return evaluateAgainstProfile(profile, parameters);
  }
}
