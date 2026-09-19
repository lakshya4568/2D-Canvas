/** Dev helper: place a library component and plot it on an A1 sheet (PDF). */
import { writeFileSync } from "node:fs";
import { emptyCadDoc } from "@/lib/cad/document";
import { applyCadAction } from "@/lib/state/cadActions";
import { defaultSheet, exportSheetsPdf } from "@/lib/cad/export";

const [id, out] = process.argv.slice(2);
const r = applyCadAction([], emptyCadDoc(), { type: "CAD_INSERT_COMPONENT", definitionId: id, at: { x: 0, y: 0 } })!;
const sheet = defaultSheet(r.shapes, r.cad, "A1");
console.log(`sheet at 1:${sheet.viewports[0].scale}, annotation 1:${r.cad.settings.annotationScale}`);
writeFileSync(out, exportSheetsPdf(r.shapes, { ...r.cad, sheets: [sheet] }));
