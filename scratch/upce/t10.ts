import { startAuthoring, namesOf } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { solveSketch } from "../../lib/upce/solve";
import { analyseDof } from "../../lib/upce/dof";
import type { Shape } from "../../lib/geometry/types";

// The seeded template's own numbers: small drawing, 30 mm walls.
const shapes: Shape[] = [
  { id: "o", name: "Outer_Frame", type: "rectangle", x: 100, y: 100, width: 400, height: 240 } as Shape,
  { id: "i", name: "Inner_Cutout", type: "rectangle", x: 130, y: 130, width: 340, height: 180 } as Shape,
];
const names = namesOf(shapes);
let { sketch } = startAuthoring(shapes);
for (const [g,t] of [["*","Pin Outer_Frame"],["Outer_Frame's direction","Hold Outer_Frame horizontal"],["control Outer_Frame's size","Name the top edge"],["control Outer_Frame's size","Name the right edge"],["Inner_Cutout's direction","lined up with Outer_Frame"],["hold Inner_Cutout in place horizontally","Keep both side gaps"],["hold Inner_Cutout in place vertically","Keep both top and bottom gaps"]] as [string,string][]) {
  const comp = suggestCompletion(sketch, names);
  const pool = g === "*" ? comp.quickFixes : comp.groups.filter(x=>x.question.includes(g)).flatMap(x=>x.options);
  const a = pool.find(o=>o.title.includes(t)); if (!a) { console.log("!!", t); continue; }
  sketch = applyAction(sketch, a);
}
console.log("DOF", analyseDof(sketch, names).dof, "|", Object.keys(sketch.parameters).join(", "));
for (const [n, v] of [["SideThickness",27],["SideThickness",22.5],["SideThickness",37.5],["SideThickness",60],["EndThickness",22.5],["Outer_FrameWidth",300],["Outer_FrameWidth",800],["Outer_FrameHeight",180],["Outer_FrameHeight",480]] as [string,number][]) {
  const probe = { ...sketch, parameters: { ...sketch.parameters, [n]: { ...sketch.parameters[n], value: v } } };
  const r = solveSketch(probe);
  console.log(`${n} -> ${v}: ok=${r.ok} conv=${r.converged} iters=${r.iterations} res=${r.maxResidual.toExponential(1)} ${r.rejection ?? ""}`);
}

console.time("20 solves");
for (let i = 0; i < 20; i++) {
  const v = 300 + i * 20;
  solveSketch({ ...sketch, parameters: { ...sketch.parameters, Outer_FrameWidth: { ...sketch.parameters.Outer_FrameWidth, value: v } } });
}
console.timeEnd("20 solves");
