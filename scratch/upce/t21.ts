import { begin, acceptAllDetected, choose, dof } from "../../tests/upce/fixtures";
import { detectCandidates } from "../../lib/upce/detect";
import { suggestCompletion } from "../../lib/upce/completion";
import type { Shape } from "../../lib/geometry/types";

// Two rectangles that touch nothing: no nesting, no shared vertex.
const same: Shape[] = [
  { id:"R1", name:"R1", type:"rectangle", x:0,    y:0, width:2000, height:800 } as Shape,
  { id:"R2", name:"R2", type:"rectangle", x:3000, y:0, width:2000, height:400 } as Shape,
];
const diff: Shape[] = [
  { id:"R1", name:"R1", type:"rectangle", x:0,    y:0, width:2000, height:800 } as Shape,
  { id:"R2", name:"R2", type:"rectangle", x:3000, y:0, width:1400, height:400 } as Shape,
];

for (const [label, shapes] of [["EQUAL widths (2000/2000)", same], ["DIFFERENT widths (2000/1400)", diff]] as const) {
  const s = begin(shapes as Shape[]);
  console.log(`\n=== ${label} ===`);
  const cands = detectCandidates(s.sketch, { shapeNames: s.names });
  for (const c of cands) console.log(`  CARD: ${c.headline}  (-${c.dofRemoved})${c.impliedCount?` +${c.impliedCount}`:""}`);
  const q = suggestCompletion(s.sketch, s.names);
  for (const g of q.groups) {
    console.log(`  Q: ${g.question}`);
    for (const o of g.options) console.log(`      - ${o.title}`);
  }
}
