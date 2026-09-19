/** Dev check: insert a library component, explode it, make it parametric again, report. */
import { emptyCadDoc } from "@/lib/cad/document";
import { applyCadAction, parametricSelection, planFor } from "@/lib/state/cadActions";
import { describePlan } from "@/lib/components/fromDrawing";
import { writeFileSync } from "node:fs";
import { exportDrawingSvg } from "@/lib/cad/export";

const id = process.argv[2] ?? "ir.rcc_box.half_section";
const r0 = applyCadAction([], emptyCadDoc(), { type: "CAD_INSERT_COMPONENT", definitionId: id, at: { x: 0, y: 0 } })!;
const ex = applyCadAction(r0.shapes, r0.cad, { type: "CAD_EXPLODE_COMPONENT", instanceId: r0.cad.components[0].id })!;
const plan = planFor(ex.shapes, ex.cad, parametricSelection(ex.shapes, ex.cad), { name: "Round trip" });
console.log(describePlan(plan));
const again = applyCadAction(ex.shapes, ex.cad, { type: "CAD_MAKE_PARAMETRIC", options: { name: "Round trip" } })!;
console.log(again.cad.componentNotice?.message);
if (process.argv[3]) writeFileSync(process.argv[3], exportDrawingSvg(again.shapes, again.cad, "white"));
