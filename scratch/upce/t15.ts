import { startAuthoring, regenerate, namesOf, addConstraint } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { detectCandidates } from "../../lib/upce/detect";
import { createComponent } from "../../lib/upce/repeat";
import { analyseDof } from "../../lib/upce/dof";
import { shapes, names, cellIds } from "./culvertFixture";

let sketch = startAuthoring(shapes).sketch;
sketch = createComponent(sketch, shapes, cellIds, "Cell").sketch;
for (let r = 0; r < 6; r++) {
  const cands = detectCandidates(sketch, { shapeNames: names }).filter(c => c.admissible);
  if (!cands.length) break;
  for (const c of cands) sketch = addConstraint(sketch, c.constraint, `c_${c.id}`);
  const res = regenerate(shapes, sketch, { shapeNames: names });
  if (!res.rejection) sketch = res.sketch;
}
const comp = suggestCompletion(sketch, names);
console.log("DOF", analyseDof(sketch, names).dof);
console.log("quickFixes:", comp.quickFixes.map(q=>`${q.title} (-${q.dofRemoved})`));
for (const g of comp.groups) {
  console.log("Q:", g.question);
  for (const o of g.options) console.log(`    (-${o.dofRemoved}) ${o.title}`);
}
