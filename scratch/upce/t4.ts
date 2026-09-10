import { rebuildSketch, liftSketchToShapes } from "../../lib/upce/lower";
import { analyseDof } from "../../lib/upce/dof";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { solveSketch } from "../../lib/upce/solve";
import type { Shape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
  { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
];
const names = { R1: "Outer", R2: "Opening" };
let { sketch } = rebuildSketch(shapes);

function take(titleMatch: string) {
  const comp = suggestCompletion(sketch, names);
  const all = [...comp.quickFixes, ...comp.groups.flatMap(g => g.options)];
  const a = all.find(o => o.title.includes(titleMatch));
  if (!a) { console.log("!! no action matching", titleMatch, all.map(x=>x.title)); return; }
  sketch = applyAction(sketch, a);
  const d = analyseDof(sketch, names);
  console.log(`applied "${a.title}" -> DOF ${d.dof}`);
}

take("Pin Outer");
take("first edge horizontal");
take("Name the top edge");     // Outer width
const comp2 = suggestCompletion(sketch, names);
console.log("remaining questions:", comp2.groups.map(g=>g.question));
take("Name the right edge");   // Outer height  (may target Outer or Opening)
take("Keep both side gaps");
take("Keep both top and bottom gaps");

let d = analyseDof(sketch, names);
console.log("\nFINAL DOF:", d.dof, d.status, "| anchored", d.anchored);
for (const m of d.motions) console.log("  •", m.description);
console.log("\nPARAMETERS");
for (const p of Object.values(sketch.parameters)) console.log(`  ${p.role.padEnd(8)} ${p.name.padEnd(18)} ${p.value} ${p.unit}  <- ${p.provenance.origin}`);
console.log("\nCONSTRAINTS");
for (const c of sketch.constraints) console.log(`  [${c.strength}] ${c.kind.padEnd(20)} ${c.label}${c.paramRef ? ` (= ${c.paramRef})` : ""}`);
