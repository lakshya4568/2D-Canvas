"use client";

/**
 * One place for the editor's CAD-document operations, so the ribbon, the
 * panels, the command line and the catalog all do the same thing the same way.
 */

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { Point } from "@/lib/geometry/types";
import { componentRegistry } from "@/lib/components/library";
import { runAudit, type AuditReport } from "@/lib/bridge/audit";
import { LEVEL_PARAMETER_MAP } from "@/lib/bridge/project";
import type { BridgeProject } from "@/lib/bridge/project";
import { defaultSheet, download, exportDrawingDxf, exportDrawingSvg, exportSheetsPdf, exportSheetSvg, safeFileStem } from "@/lib/cad/export";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import type { PaperSize } from "@/lib/cad/sheet";

export function useCad() {
  const { state, dispatch } = useDrawing();
  const cad = state.cad;

  const audit: AuditReport = React.useMemo(() => runAudit(state.shapes, cad), [state.shapes, cad]);

  /** Where a new component should go: to the right of what is already drawn. */
  const freeSpot = React.useCallback((): Point => {
    const b = computeMultiShapeBounds(state.shapes);
    if (!b) return { x: 0, y: 0 };
    return { x: b.maxX + Math.max(2000, b.width * 0.15), y: b.maxY };
  }, [state.shapes]);

  const insertComponent = React.useCallback(
    (definitionId: string, values: Record<string, number> = {}, at?: Point, name?: string) => {
      dispatch({ type: "CAD_INSERT_COMPONENT", definitionId, values, at: at ?? freeSpot(), name });
    },
    [dispatch, freeSpot]
  );

  const setComponentValues = React.useCallback(
    (instanceId: string, values: Record<string, number>) => dispatch({ type: "CAD_SET_COMPONENT_VALUES", instanceId, values }),
    [dispatch]
  );

  const setProject = React.useCallback((project: BridgeProject, description?: string) => dispatch({ type: "CAD_SET_PROJECT", project, description }), [dispatch]);

  /** Push the design-basis levels into every component that draws them (one undoable step each). */
  const applyDbrLevels = React.useCallback(() => {
    let count = 0;
    for (const inst of cad.components) {
      const def = componentRegistry.get(inst.definitionId);
      if (!def) continue;
      const values: Record<string, number> = {};
      for (const { field, parameter } of LEVEL_PARAMETER_MAP) {
        const v = cad.project.dbr[field].value;
        if (typeof v === "number" && def.parameters.some((p) => p.name === parameter)) values[parameter] = v;
      }
      if (Object.keys(values).length) {
        dispatch({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst.id, values, description: `Apply design levels to ${inst.name}` });
        count++;
      }
    }
    return count;
  }, [cad.components, cad.project.dbr, dispatch]);

  const newSheet = React.useCallback(
    (size?: PaperSize) => {
      const cls = audit.classification.suggested;
      const s = defaultSheet(state.shapes, cad, size ?? (cls === "important" || cls === "major" ? "A0" : "A1"));
      dispatch({ type: "CAD_SET_SHEETS", sheets: [...cad.sheets, s] });
      return s;
    },
    [audit.classification.suggested, state.shapes, cad, dispatch]
  );

  const exportDxf = React.useCallback(() => download(`${safeFileStem(cad)}.dxf`, exportDrawingDxf(state.shapes, cad), "application/dxf"), [state.shapes, cad]);
  const exportSvg = React.useCallback(() => download(`${safeFileStem(cad)}.svg`, exportDrawingSvg(state.shapes, cad), "image/svg+xml"), [state.shapes, cad]);
  const exportPdf = React.useCallback(() => download(`${safeFileStem(cad)}.pdf`, exportSheetsPdf(state.shapes, cad), "application/pdf"), [state.shapes, cad]);
  const exportSheetSvgFile = React.useCallback(
    (index = 0) => {
      const s = cad.sheets[index] ?? defaultSheet(state.shapes, cad);
      download(`${safeFileStem(cad)}_sheet${index + 1}.svg`, exportSheetSvg(s, state.shapes, cad), "image/svg+xml");
    },
    [state.shapes, cad]
  );

  return {
    state,
    cad,
    dispatch,
    audit,
    insertComponent,
    setComponentValues,
    setProject,
    applyDbrLevels,
    newSheet,
    exportDxf,
    exportSvg,
    exportPdf,
    exportSheetSvgFile,
  };
}
