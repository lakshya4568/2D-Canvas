import { rebuildSketch, liftSketchToShapes } from "../../lib/upce/lower";
import { analyseDof } from "../../lib/upce/dof";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { solveSketch } from "../../lib/upce/solve";
import type { Shape, RectangleShape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
  { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
];
const names = { R1: "Outer", R2: "Opening" };
let { sketch } = rebuildSketch(shapes);

function take(groupMatch: string, titleMatch: string) {
  const comp = suggestCompletion(sketch, names);
  const pool = groupMatch === "*"
    ? comp.quickFixes
    : comp.groups.filter(g => g.question.includes(groupMatch) || g.id.includes(groupMatch)).flatMap(g => g.options);
  const a = pool.find(o => o.title.includes(titleMatch));
  if (!a) { console.log("!! not found", groupMatch, titleMatch, "|", pool.map(x=>x.title)); return; }
  sketch = applyAction(sketch, a);
  console.log(`applied "${a.title}" -> DOF ${analyseDof(sketch, names).dof}`);
}

take("*", "Pin Outer");
take("Outer's direction", "Hold Outer horizontal");
take("control Outer's size", "Name the top edge");
take("control Outer's size", "Name the right edge");
take("Opening's direction", "lined up with Outer");
take("hold Opening in place horizontally", "Keep both side gaps");
take("hold Opening in place vertically", "Keep both top and bottom gaps");

let d = analyseDof(sketch, names);
console.log("\nFINAL DOF:", d.dof, d.status);
for (const m of d.motions) console.log("  •", m.description);
console.log("params:", Object.values(sketch.parameters).map(p=>`${p.name}=${p.value}`).join(", "));

// ---- THE ACCEPTANCE TEST: change a driving parameter --------------------
function show(tag: string, sk = sketch) {
  const { shapes: out } = liftSketchToShapes(sk, shapes);
  const r1 = out.find(s=>s.id==="R1") as RectangleShape;
  const r2 = out.find(s=>s.id==="R2") as RectangleShape;
  console.log(`${tag.padEnd(28)} Outer ${r1.x.toFixed(0)},${r1.y.toFixed(0)} ${r1.width.toFixed(1)}x${r1.height.toFixed(1)} | Opening ${r2.x.toFixed(1)},${r2.y.toFixed(1)} ${r2.width.toFixed(1)}x${r2.height.toFixed(1)}`);
  return { r1, r2 };
}
show("baseline");

for (const [name, val] of [["SideThickness", 500], ["OuterWidth", 6000], ["EndThickness", 150]] as [string, number][]) {
  sketch = { ...sketch, parameters: { ...sketch.parameters, [name]: { ...sketch.parameters[name], value: val } } };
  const res = solveSketch(sketch);
  if (!res.ok) { console.log("REJECTED:", res.rejection); continue; }
  sketch = res.sketch;
  const { r1, r2 } = show(`${name} -> ${val}`);
  const gapL = r2.x - r1.x, gapR = (r1.x+r1.width)-(r2.x+r2.width);
  const gapT = r2.y - r1.y, gapB = (r1.y+r1.height)-(r2.y+r2.height);
  console.log(`   gaps L${gapL.toFixed(2)} R${gapR.toFixed(2)} T${gapT.toFixed(2)} B${gapB.toFixed(2)} | residual ${res.maxResidual.toExponential(1)} | invariants ${res.invariants.filter(i=>i.ok).length}/${res.invariants.length}`);
}
