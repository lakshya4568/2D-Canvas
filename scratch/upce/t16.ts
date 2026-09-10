import { begin, acceptAllDetected, answerEverything, commit, setParameter, dof, haunchedCellInFrame, HAUNCHED_CELL_SHAPE_IDS, railingPost } from "../../tests/upce/fixtures";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { regenerate } from "../../lib/upce/document";
import { detectCandidates } from "../../lib/upce/detect";
import { nestedRectangles } from "../../tests/upce/fixtures";

console.log("=== candidate count ===");
const n = begin(nestedRectangles());
for (const c of detectCandidates(n.sketch, { shapeNames: n.names })) console.log("  ", c.headline, `(-${c.dofRemoved})`, c.impliedCount ? `+${c.impliedCount} implied` : "");

console.log("\n=== haunched cell ===");
let s = begin(haunchedCellInFrame());
s = { ...s, sketch: createComponent(s.sketch, s.shapes, HAUNCHED_CELL_SHAPE_IDS, "Cell").sketch };
s = acceptAllDetected(s);
s = answerEverything(s);
console.log("DOF", dof(s), "| params:", Object.entries(s.sketch.parameters).map(([k,v])=>`${k}=${v.value.toFixed(2)}`).join(", "));
const comp = s.sketch.components.find(c=>c.name==="Cell")!;
s = commit(s, createRepeat(s.sketch, { componentId: comp.id, count: 1, pitch: 280, spacingMode: "driven", direction: {x:1,y:0} }).sketch);
const grow = suggestCompletion(s.sketch, s.names).groups.flatMap(g=>g.options).find(o=>o.title.includes("grows to fit"));
console.log("grow?", grow?.convertToDerived);
if (grow) s = commit(s, applyAction(s.sketch, grow));
for (const c of [1,2,3,4]) {
  s = setParameter(s, "CellCount", c);
  const r = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
  const roofs = r.shapes.filter(x => x.id === "roof" || x.id.endsWith(":roof"));
  console.log(`  count ${c}: roofs ${roofs.length} | CellCount=${r.sketch.parameters.CellCount?.value} | rejection ${r.rejection ?? "-"}`);
}

console.log("\n=== railing ===");
let rp = begin(railingPost());
rp = acceptAllDetected(rp);
rp = answerEverything(rp);
console.log("DOF", dof(rp), "params:", Object.keys(rp.sketch.parameters).join(", "));
const pc = createComponent(rp.sketch, rp.shapes, ["post"], "Post");
rp = commit(rp, pc.sketch);
rp = commit(rp, createRepeat(rp.sketch, { componentId: pc.component.id, count: 5, pitch: 1200, spacingMode: "driven", direction: {x:1,y:0} }).sketch);
const rr = regenerate(rp.shapes, rp.sketch, { shapeNames: rp.names });
console.log("posts:", rr.shapes.filter(x=>x.id==="post"||x.id.endsWith(":post")).length, "rejection:", rr.rejection ?? "-");
