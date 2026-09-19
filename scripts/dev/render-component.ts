/**
 * Dev helper: place a library component on an empty drawing and write its SVG
 * (white paper), printing the evaluation's problems and reported values.
 *
 *   bun run scripts/dev/render-component.ts <definitionId> <out.svg> [Name=value ...]
 */
import { writeFileSync } from "node:fs";
import { emptyCadDoc, evaluateInstance } from "@/lib/cad/document";
import { applyCadAction } from "@/lib/state/cadActions";
import { exportDrawingSvg } from "@/lib/cad/export";
import { componentRegistry } from "@/lib/components/library";

const [id, out, ...kv] = process.argv.slice(2);
const values: Record<string, number> = {};
for (const a of kv) {
  const [k, v] = a.split("=");
  values[k] = Number(v);
}
const r = applyCadAction([], emptyCadDoc(), { type: "CAD_INSERT_COMPONENT", definitionId: id, at: { x: 0, y: 0 }, values });
if (!r) throw new Error("insert returned null");
console.log(r.cad.componentNotice?.message);
const inst = r.cad.components[0];
if (inst) {
  const ev = evaluateInstance(inst, r.cad)!.evaluation;
  for (const i of ev.issues) console.log(`${i.severity}: ${i.path} ${i.message}`);
  const def = componentRegistry.get(id)!;
  for (const f of def.formulas ?? []) if (f.report) console.log(`${f.name} = ${ev.scope[f.name]}`);
  console.log(`shapes ${r.shapes.length}, annotations ${r.cad.annotations.length}, scale 1:${r.cad.settings.annotationScale}`);
}
writeFileSync(out, exportDrawingSvg(r.shapes, r.cad, "white"));
