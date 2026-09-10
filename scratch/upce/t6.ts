import { startAuthoring, regenerate, namesOf } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import { analyseDof } from "../../lib/upce/dof";
import type { Shape, RectangleShape } from "../../lib/geometry/types";

// Scenario B: draftsman draws ONE reusable unit (a cell), makes it a component,
// arrays it. Nothing bridge-specific anywhere.
let shapes: Shape[] = [
  { id: "CELL", name: "Cell", type: "rectangle", x: 350, y: 350, width: 2000, height: 1500 } as Shape,
];
let { sketch } = startAuthoring(shapes);
let names = namesOf(shapes);

// Constrain the unit so it is a real design, not a floating box.
for (const [g, t] of [["*","Pin Cell"],["Cell's direction","Hold Cell horizontal"],["control Cell's size","Name the top edge"],["control Cell's size","Name the right edge"]] as [string,string][]) {
  const comp = suggestCompletion(sketch, names);
  const pool = g === "*" ? comp.quickFixes : comp.groups.filter(x=>x.question.includes(g)).flatMap(x=>x.options);
  const a = pool.find(o=>o.title.includes(t));
  if (!a) { console.log("!! missing", t, pool.map(p=>p.title)); continue; }
  sketch = applyAction(sketch, a);
}
console.log("unit DOF:", analyseDof(sketch, names).dof);
console.log("unit params:", Object.values(sketch.parameters).map(p=>`${p.name}=${p.value}`).join(", "));

// Make component + repeat
const c = createComponent(sketch, shapes, ["CELL"], "Cell");
sketch = c.sketch;
const r = createRepeat(sketch, {
  componentId: c.component.id, count: 3, pitch: 2350, spacingMode: "driven", direction: { x: 1, y: 0 },
});
sketch = r.sketch;

for (const n of [1,2,3,4,6]) {
  sketch = { ...sketch, parameters: { ...sketch.parameters, CellCount: { ...sketch.parameters.CellCount, value: n } } };
  const res = regenerate(shapes, sketch, { shapeNames: names });
  if (res.rejection) { console.log(`count ${n}: REJECTED ${res.rejection}`); continue; }
  sketch = res.sketch;
  const rects = res.shapes.filter(s=>s.type==="rectangle") as RectangleShape[];
  console.log(`count ${n}: ${rects.length} cells | x = ${rects.map(x=>x.x.toFixed(0)).join(", ")} | w = ${rects.map(x=>x.width.toFixed(0)).join(",")} | DOF ${res.dof.dof} | residual ${res.maxResidual.toExponential(1)}`);
}

// Now change the pitch and the cell width and confirm everything follows
sketch = { ...sketch, parameters: { ...sketch.parameters, CellPitch: { ...sketch.parameters.CellPitch, value: 3000 } } };
let res = regenerate(shapes, sketch, { shapeNames: names });
sketch = res.sketch;
console.log("pitch 3000 ->", (res.shapes.filter(s=>s.type==="rectangle") as RectangleShape[]).map(x=>x.x.toFixed(0)).join(", "));
const wName = Object.keys(sketch.parameters).find(k=>k.includes("Width"))!;
sketch = { ...sketch, parameters: { ...sketch.parameters, [wName]: { ...sketch.parameters[wName], value: 2600 } } };
res = regenerate(shapes, sketch, { shapeNames: names });
console.log(`${wName} 2600 ->`, (res.shapes.filter(s=>s.type==="rectangle") as RectangleShape[]).map(x=>`${x.x.toFixed(0)}w${x.width.toFixed(0)}`).join(", "), "| DOF", res.dof.dof);
