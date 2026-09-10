import { startAuthoring, regenerate, namesOf } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { detectCandidates } from "../../lib/upce/detect";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import { analyseDof } from "../../lib/upce/dof";
import { addConstraint } from "../../lib/upce/document";
import type { Shape, RectangleShape } from "../../lib/geometry/types";

// The user's actual case: an outer frame with an 8-segment haunched cell inside.
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
let { sketch } = startAuthoring(shapes);
console.log("points", sketch.pointOrder.length, "segments", Object.keys(sketch.segments).length);
console.log("initial DOF", analyseDof(sketch, names).dof);

// Accept every admissible detected relationship, repeatedly until nothing new.
for (let round = 0; round < 8; round++) {
  const cands = detectCandidates(sketch, { shapeNames: names }).filter(c => c.admissible);
  if (cands.length === 0) break;
  for (const c of cands) sketch = addConstraint(sketch, c.constraint, `c_${c.id}`);
  const r = regenerate(shapes, sketch, { shapeNames: names });
  if (!r.rejection) sketch = r.sketch;
  console.log(`  round ${round}: accepted ${cands.length} -> DOF ${analyseDof(sketch, names).dof}`);
}

// Apply every completion action that removes DOF, greedily.
for (let round = 0; round < 12; round++) {
  const comp = suggestCompletion(sketch, names);
  const all = [...comp.quickFixes, ...comp.groups.map(g => g.options[0]).filter(Boolean)];
  const act = all.find(a => a && a.dofRemoved > 0);
  if (!act) break;
  const next = applyAction(sketch, act);
  const r = regenerate(shapes, next, { shapeNames: names });
  if (r.rejection) { console.log(`  SKIP (would not solve): ${act.title}`); break; }
  sketch = r.sketch;
  console.log(`  fix: ${act.title} -> DOF ${analyseDof(sketch, names).dof}`);
}
console.log("after constraining, DOF =", analyseDof(sketch, names).dof);
console.log("params:", Object.entries(sketch.parameters).map(([k,v])=>`${k}=${v.value.toFixed(0)}`).join(", "));

const d = analyseDof(sketch, names);
console.log("\nremaining motions:");
for (const m of d.motions) console.log("  •", m.description);
const comp = suggestCompletion(sketch, names);
console.log("\nremaining questions:");
for (const g of comp.groups) {
  console.log("  Q:", g.question);
  for (const o of g.options) console.log(`     (-${o.dofRemoved}) ${o.title}`);
}
for (const q of comp.quickFixes) console.log(`  QUICK (-${q.dofRemoved}) ${q.title}`);
