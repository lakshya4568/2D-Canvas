import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { begin, acceptAllDetected, answerEverything, dof } from "../../tests/upce/fixtures";
import { findProfiles } from "../../lib/upce/profile";
import { suggestCompletion } from "../../lib/upce/completion";
import { analyseDof } from "../../lib/upce/dof";

for (const id of ["single_cell_box_culvert","two_span_box_culvert","rdso_box_bridge","rcc_bridge"]) {
  const t = BUILTIN_TEMPLATES.find(x=>x.id===id)!;
  const params: Record<string,number> = {};
  t.parameters.forEach(p=>params[p.name]=p.defaultValue);
  const inst = t.generator(params);
  const declaredConstraints = inst.constraints.length;
  let s = begin(inst.shapes);
  const profiles = findProfiles(s.sketch, s.names);
  const before = dof(s);
  s = acceptAllDetected(s);
  s = answerEverything(s, 40);
  const after = analyseDof(s.sketch, s.names);
  const open = suggestCompletion(s.sketch, s.names).groups.length;
  console.log(`${t.name}`);
  console.log(`   shapes ${inst.shapes.length} | declared constraints ${declaredConstraints} | declared params ${t.parameters.length}`);
  console.log(`   profiles ${profiles.length} (${profiles.map(p=>`${p.label}:${p.shapeIds.length}${p.closed?"c":"o"}`).join(", ").slice(0,110)})`);
  console.log(`   DOF ${before} -> ${after.dof} | params created ${Object.keys(s.sketch.parameters).length} | questions still open ${open}`);
}
