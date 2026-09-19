/**
 * Dev helper: change values of a saved drawing's own component (the agent's
 * construction, or a Make parametric result) exactly as Run Mode does, and plot
 * the regenerated drawing — to see that an edit regenerates everything, or is
 * refused whole with the reason.
 *
 *   bun run scripts/dev/edit-state.ts <state.json> <out.svg> Name=value …
 *
 * Also lists the values, what each is worked out from, and which dimensions
 * drive which value.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { definitionFor, evaluateInstance } from "@/lib/cad/document";
import { exportDrawingSvg } from "@/lib/cad/export";
import type { Shape } from "@/lib/geometry/types";

const [statePath, out, ...edits] = process.argv.slice(2);
const ws = new DraftingWorkspace(JSON.parse(readFileSync(statePath, "utf8")));
const inst = ws.cad.components.find((c) => definitionFor(ws.cad, c.definitionId)?.origin?.kind === "drawn");
if (!inst) throw new Error("No drawing-owned component in this state.");
const def = definitionFor(ws.cad, inst.definitionId)!;

const values: Record<string, number> = {};
for (const e of edits) {
  const [k, v] = e.split("=");
  values[k] = Number(v);
}
if (Object.keys(values).length) {
  const r = ws.applyCad({ type: "CAD_SET_COMPONENT_VALUES", instanceId: inst.id, values });
  console.log(r.ok ? `Regenerated: ${r.message}` : `REFUSED: ${r.message}`);
}
const ev = evaluateInstance(ws.cad.components.find((c) => c.id === inst.id)!, ws.cad)!.evaluation;
const f = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
console.log(`\n${def.name}: ${def.parameters.length} values, ${def.formulas?.length ?? 0} formulas, ${def.invariants?.length ?? 0} constraints`);
console.log("Values:", def.parameters.map((p) => `${p.name}=${f(ev.scope[p.name])}`).join(", "));
console.log("Worked out:", (def.formulas ?? []).map((x) => `${x.name} = ${x.expr} = ${f(ev.scope[x.name])}`).join("; "));
console.log("Driving dimensions:", (def.dimensions ?? []).filter((d) => d.drives).map((d) => `${d.id}→${d.drives}`).join(", ") || "none");
const errors = ev.issues.filter((i) => i.severity === "error");
if (errors.length) console.log("Errors:", errors.map((e) => e.message).join(" "));
writeFileSync(out, exportDrawingSvg([...ws.allShapes()] as Shape[], ws.cad, "white"));
console.log(`\nPlotted ${out}`);
