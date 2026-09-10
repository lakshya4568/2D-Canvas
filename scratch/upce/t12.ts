import { startAuthoring, regenerate, namesOf, addConstraint } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { detectCandidates } from "../../lib/upce/detect";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import { analyseDof } from "../../lib/upce/dof";
import type { Shape, RectangleShape, LineShape } from "../../lib/geometry/types";

const p = {
  tl_top: { x: 165, y: 130 }, tr_top: { x: 345, y: 130 },
  tr_right: { x: 380, y: 165 }, br_right: { x: 380, y: 295 },
  br_bottom: { x: 345, y: 330 }, bl_bottom: { x: 165, y: 330 },
  bl_left: { x: 130, y: 295 }, tl_left: { x: 130, y: 165 },
};
const mk = (id: string, a: {x:number;y:number}, b: {x:number;y:number}): Shape =>
  ({ id, name: id, type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y } as Shape);
const cellIds = ["roof","ch_tr","wall_r","ch_br","floor","ch_bl","wall_l","ch_tl"];
const shapes: Shape[] = [
  { id: "outer", name: "Outer_Frame", type: "rectangle", x: 100, y: 100, width: 400, height: 260 } as Shape,
  mk("roof", p.tl_top, p.tr_top), mk("ch_tr", p.tr_top, p.tr_right),
  mk("wall_r", p.tr_right, p.br_right), mk("ch_br", p.br_right, p.br_bottom),
  mk("floor", p.br_bottom, p.bl_bottom), mk("ch_bl", p.bl_bottom, p.bl_left),
  mk("wall_l", p.bl_left, p.tl_left), mk("ch_tl", p.tl_left, p.tl_top),
];
const names = namesOf(shapes);
let sketch = startAuthoring(shapes).sketch;

// 1. Name the cell as a component FIRST, so every sentence uses "Cell".
sketch = createComponent(sketch, shapes, cellIds, "Cell").sketch;

// 2. Accept detected relationships.
for (let r = 0; r < 6; r++) {
  const cands = detectCandidates(sketch, { shapeNames: names }).filter(c => c.admissible);
  if (!cands.length) break;
  for (const c of cands) sketch = addConstraint(sketch, c.constraint, `c_${c.id}`);
  const res = regenerate(shapes, sketch, { shapeNames: names });
  if (!res.rejection) sketch = res.sketch;
}
// 3. Answer design questions greedily.
for (let r = 0; r < 15; r++) {
  const comp = suggestCompletion(sketch, names);
  const all = [...comp.quickFixes, ...comp.groups.flatMap(g => g.options)];
  const act = all.find(a => a.dofRemoved > 0);
  if (!act) break;
  const next = applyAction(sketch, act);
  const res = regenerate(shapes, next, { shapeNames: names });
  if (res.rejection) break;
  sketch = res.sketch;
  console.log(`  ${act.title} -> DOF ${analyseDof(sketch, names).dof}`);
}
console.log("DOF after authoring:", analyseDof(sketch, names).dof);
console.log("params:", Object.entries(sketch.parameters).map(([k,v])=>`${k}=${v.value.toFixed(0)}`).join(", "));

// 4. Repeat the cell.
const comp = sketch.components.find(c => c.name === "Cell")!;
sketch = createRepeat(sketch, { componentId: comp.id, count: 1, pitch: 280, spacingMode: "driven", direction: { x: 1, y: 0 } }).sketch;
let res = regenerate(shapes, sketch, { shapeNames: names });
sketch = res.rejection ? sketch : res.sketch;

console.log("\n=== CONTAINER QUESTION ===");
const c2 = suggestCompletion(sketch, names);
for (const g of c2.groups) {
  console.log("Q:", g.question);
  console.log("   motion:", g.motion);
  for (const o of g.options) {
    console.log(`   - ${o.title}`);
    for (const e of o.evidence) console.log(`       ${e}`);
  }
}

// 5. Choose "the frame grows to fit", then drive the count.
const grow = c2.groups.flatMap(g => g.options).find(o => o.title.includes("grows to fit"))!;
sketch = applyAction(sketch, grow);
res = regenerate(shapes, sketch, { shapeNames: names });
if (res.rejection) console.log("REJECTED:", res.rejection); else sketch = res.sketch;

console.log("\n=== MULTI-CELL BEHAVIOUR ===");
for (const n of [1, 2, 3, 4, 6]) {
  sketch = { ...sketch, parameters: { ...sketch.parameters, CellCount: { ...sketch.parameters.CellCount, value: n } } };
  const r = regenerate(shapes, sketch, { shapeNames: names });
  if (r.rejection) { console.log(`count ${n}: REJECTED — ${r.rejection}`); continue; }
  sketch = r.sketch;
  const frame = r.shapes.find(s => s.id === "outer") as RectangleShape;
  const roofs = r.shapes.filter(s => s.id === "roof" || s.id.endsWith(":roof")) as LineShape[];
  const cellXs = roofs.map(l => Math.min(l.x1, l.x2)).sort((a,b)=>a-b);
  const gaps = cellXs.slice(1).map((x,i)=> (x - cellXs[i]).toFixed(0));
  const leftGap = (cellXs[0] - frame.x).toFixed(1);
  const rightEdge = Math.max(...roofs.map(l=>Math.max(l.x1,l.x2)));
  // haunch tips reach further than the roof; measure the true cell extent
  const walls = r.shapes.filter(s => s.id === "wall_r" || s.id.endsWith(":wall_r")) as LineShape[];
  const rightMost = Math.max(...walls.map(l=>Math.max(l.x1,l.x2)));
  const rightGap = (frame.x + frame.width - rightMost).toFixed(1);
  console.log(`count ${n}: ${roofs.length} cells | frame ${frame.width.toFixed(1)} wide | pitch ${gaps.join(",") || "-"} | wall gaps L${leftGap} R${rightGap} | DOF ${r.dof.dof} | invariants ${r.invariants.filter(i=>i.ok).length}/${r.invariants.length}`);
}

// 6. And prove a thickness change still behaves.
sketch = { ...sketch, parameters: { ...sketch.parameters, WallThickness: { ...sketch.parameters.WallThickness, value: 120 } } };
const r2 = regenerate(shapes, sketch, { shapeNames: names });
if (r2.rejection) console.log("WallThickness 120 REJECTED:", r2.rejection);
else {
  const frame = r2.shapes.find(s => s.id === "outer") as RectangleShape;
  console.log(`WallThickness -> 120: frame ${frame.width.toFixed(1)} wide | DOF ${r2.dof.dof} | invariants ${r2.invariants.filter(i=>i.ok).length}/${r2.invariants.length}`);
}

console.log("\n=== DIAGNOSES AT COUNT 1 ===");
sketch = { ...sketch, parameters: { ...sketch.parameters, CellCount: { ...sketch.parameters.CellCount, value: 1 }, WallThickness: { ...sketch.parameters.WallThickness, value: 75 } } };
const r3 = regenerate(shapes, sketch, { shapeNames: names });
for (const d of r3.dof.diagnoses.filter(d => d.status !== "active")) {
  console.log(`  [${d.status}] ${d.label} — residual ${d.residual.toExponential(1)}`);
}
