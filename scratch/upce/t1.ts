import { rebuildSketch, liftSketchToShapes } from "../../lib/upce/lower";
import { analyseDof } from "../../lib/upce/dof";
import { detectCandidates } from "../../lib/upce/detect";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { solveSketch } from "../../lib/upce/solve";
import type { Shape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
  { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
];
const names = { R1: "Outer", R2: "Opening" };

let { sketch } = rebuildSketch(shapes);
console.log("points", sketch.pointOrder.length, "segments", Object.keys(sketch.segments).length, "facts", sketch.constraints.length);

let dof = analyseDof(sketch, names);
console.log("\n== DOF ==", dof.variables, "vars, rank", dof.rank, "-> DOF", dof.dof, dof.status);
for (const m of dof.motions) console.log("  •", m.description);

const cands = detectCandidates(sketch, { shapeNames: names });
console.log("\n== CANDIDATES ==", cands.length);
for (const c of cands.slice(0, 10)) console.log(`  [${c.dofRemoved}] ${c.headline} | ${c.evidence[0]}`);

const comp = suggestCompletion(sketch, names);
console.log("\n== COMPLETION == dof", comp.dof, "anchored", comp.anchored);
for (const q of comp.quickFixes) console.log(`  QUICK (-${q.dofRemoved}) ${q.title}`);
for (const g of comp.groups) {
  console.log(`  Q: ${g.question}`);
  for (const o of g.options) console.log(`     (-${o.dofRemoved}) ${o.title}`);
}
