import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { begin, acceptAllDetected } from "../../tests/upce/fixtures";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { regenerate } from "../../lib/upce/document";
import { analyseDof } from "../../lib/upce/dof";

const t = BUILTIN_TEMPLATES.find(x=>x.id==="rdso_box_bridge")!;
const params: Record<string,number> = {};
t.parameters.forEach(p=>params[p.name]=p.defaultValue);
let s = begin(t.generator(params).shapes);
s = acceptAllDetected(s);
console.log("after accept, DOF", analyseDof(s.sketch, s.names).dof);
for (let i=0;i<12;i++){
  const comp = suggestCompletion(s.sketch, s.names);
  const act = [...comp.quickFixes, ...comp.groups.flatMap(g=>g.options)].find(o=>o.dofRemoved>0);
  if(!act){ console.log("no more options"); break; }
  const next = applyAction(s.sketch, act);
  const r = regenerate(s.shapes, next, { shapeNames: s.names });
  if (r.rejection) { console.log(`STOPPED at "${act.title}": ${r.rejection}`); break; }
  s = { ...s, sketch: r.sketch };
  console.log(`  ${act.title} -> DOF ${r.dof.dof}`);
}

const d = analyseDof(s.sketch, s.names);
console.log("\nconflicts:", d.diagnoses.filter(x=>x.status==="conflicting").length, "redundant:", d.diagnoses.filter(x=>x.status==="redundant").length);
const r = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
console.log("plain re-solve: converged", r.converged, "maxResidual", r.maxResidual.toExponential(2), "rejection:", r.rejection ?? "-");
console.log("reference shapes:", t.generator(params).shapes.filter((x:any)=>x.isReference).map((x:any)=>x.name).join(", "));
