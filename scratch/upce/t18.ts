import { begin, acceptAllDetected, answerEverything, commit, setParameter, haunchedCellInFrame, HAUNCHED_CELL_SHAPE_IDS } from "../../tests/upce/fixtures";
import { createComponent, createRepeat, expandRepeats } from "../../lib/upce/repeat";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { regenerate } from "../../lib/upce/document";
import type { LineShape } from "../../lib/geometry/types";

let s = begin(haunchedCellInFrame());
s = { ...s, sketch: createComponent(s.sketch, s.shapes, HAUNCHED_CELL_SHAPE_IDS, "Cell").sketch };
s = acceptAllDetected(s);
s = answerEverything(s);
const comp = s.sketch.components.find(c=>c.name==="Cell")!;
s = commit(s, createRepeat(s.sketch, { componentId: comp.id, count: 1, pitch: 280, spacingMode: "driven", direction: {x:1,y:0} }).sketch);
const grow = suggestCompletion(s.sketch, s.names).groups.flatMap(g=>g.options).find(o=>o.title.includes("grows to fit"))!;
s = commit(s, applyAction(s.sketch, grow));
s = setParameter(s, "CellCount", 3);

const exp = expandRepeats(s.shapes, s.sketch);
console.log("generated constraints:", exp.constraints.length);
const byKind = new Map<string, number>();
for (const c of exp.constraints) byKind.set(c.kind, (byKind.get(c.kind)??0)+1);
console.log("  by kind:", [...byKind].map(([k,v])=>`${k}:${v}`).join(", "));
console.log("  anchor point:", comp.ports[0]?.pointId);

const r = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
console.log("DOF", r.dof.dof, "| rejection", r.rejection ?? "-");
const roofs = r.shapes.filter(x=>x.id==="roof"||x.id.endsWith(":roof")) as LineShape[];
for (const rf of roofs) console.log(`  ${rf.id}: x ${Math.min(rf.x1,rf.x2).toFixed(2)} len ${Math.abs(rf.x2-rf.x1).toFixed(2)}`);
console.log("motions:", r.dof.motions.map(m=>m.description).join(" | "));
