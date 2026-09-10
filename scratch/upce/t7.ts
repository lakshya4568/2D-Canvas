import { startAuthoring, regenerate, namesOf } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { proposeDerived } from "../../lib/upce/derive";
import { analyseDof } from "../../lib/upce/dof";
import type { Shape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
  { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
];
const names = namesOf(shapes);
let { sketch } = startAuthoring(shapes);
const steps: [string,string][] = [
  ["*","Pin Outer"], ["Outer's direction","Hold Outer horizontal"],
  ["control Outer's size","Name the top edge"], ["control Outer's size","Name the right edge"],
  ["Opening's direction","lined up with Outer"],
  ["hold Opening in place horizontally","Keep both side gaps"],
  ["hold Opening in place vertically","Keep both top and bottom gaps"],
];
for (const [g,t] of steps) {
  const comp = suggestCompletion(sketch, names);
  const pool = g === "*" ? comp.quickFixes : comp.groups.filter(x=>x.question.includes(g)).flatMap(x=>x.options);
  const a = pool.find(o=>o.title.includes(t)); if (!a) { console.log("!!", t); continue; }
  sketch = applyAction(sketch, a);
}
console.log("DOF", analyseDof(sketch, names).dof);
console.time("derive");
const derived = proposeDerived(sketch, shapes, { shapeNames: names });
console.timeEnd("derive");
console.log("\nDERIVED CANDIDATES:", derived.length);
for (const d of derived) {
  console.log(`  ${d.name} = ${d.expr}`);
  for (const e of d.evidence) console.log(`      ${e}`);
}
