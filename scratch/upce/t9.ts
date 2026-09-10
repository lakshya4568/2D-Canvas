import { startAuthoring, regenerate, namesOf } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { solveSketch } from "../../lib/upce/solve";
import type { Shape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
  { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
];
const names = namesOf(shapes);
let { sketch } = startAuthoring(shapes);
for (const [g,t] of [["*","Pin Outer"],["Outer's direction","Hold Outer horizontal"],["control Outer's size","Name the top edge"],["control Outer's size","Name the right edge"],["Opening's direction","lined up with Outer"],["hold Opening in place horizontally","Keep both side gaps"],["hold Opening in place vertically","Keep both top and bottom gaps"]] as [string,string][]) {
  const comp = suggestCompletion(sketch, names);
  const pool = g === "*" ? comp.quickFixes : comp.groups.filter(x=>x.question.includes(g)).flatMap(x=>x.options);
  const a = pool.find(o=>o.title.includes(t)); if (a) sketch = applyAction(sketch, a);
}
for (const v of [2400, 3000, 3600, 4200, 4800, 6000, 1400, 1200]) {
  const probe = { ...sketch, parameters: { ...sketch.parameters, OuterHeight: { ...sketch.parameters.OuterHeight, value: v } } };
  const r = solveSketch(probe);
  console.log(`OuterHeight ${v}: ok=${r.ok} conv=${r.converged} iters=${r.iterations} res=${r.maxResidual.toExponential(1)} ${r.rejection ?? ""}`);
}
