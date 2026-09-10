import { startAuthoring, regenerate, namesOf, addConstraint } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { detectCandidates } from "../../lib/upce/detect";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import type { Shape } from "../../lib/geometry/types";

const p = {
  tl_top: { x: 165, y: 130 }, tr_top: { x: 345, y: 130 },
  tr_right: { x: 380, y: 165 }, br_right: { x: 380, y: 295 },
  br_bottom: { x: 345, y: 330 }, bl_bottom: { x: 165, y: 330 },
  bl_left: { x: 130, y: 295 }, tl_left: { x: 130, y: 165 },
};
const mk = (id: string, a: {x:number;y:number}, b: {x:number;y:number}): Shape =>
  ({ id, name: id, type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y } as Shape);
export const cellIds = ["roof","ch_tr","wall_r","ch_br","floor","ch_bl","wall_l","ch_tl"];
export const shapes: Shape[] = [
  { id: "outer", name: "Outer_Frame", type: "rectangle", x: 100, y: 100, width: 400, height: 260 } as Shape,
  mk("roof", p.tl_top, p.tr_top), mk("ch_tr", p.tr_top, p.tr_right),
  mk("wall_r", p.tr_right, p.br_right), mk("ch_br", p.br_right, p.br_bottom),
  mk("floor", p.br_bottom, p.bl_bottom), mk("ch_bl", p.bl_bottom, p.bl_left),
  mk("wall_l", p.bl_left, p.tl_left), mk("ch_tl", p.tl_left, p.tl_top),
];
export const names = namesOf(shapes);

export function buildSketch(applyGrow = true) {
  let sketch = startAuthoring(shapes).sketch;
  sketch = createComponent(sketch, shapes, cellIds, "Cell").sketch;
  for (let r = 0; r < 6; r++) {
    const cands = detectCandidates(sketch, { shapeNames: names }).filter(c => c.admissible);
    if (!cands.length) break;
    for (const c of cands) sketch = addConstraint(sketch, c.constraint, `c_${c.id}`);
    const res = regenerate(shapes, sketch, { shapeNames: names });
    if (!res.rejection) sketch = res.sketch;
  }
  for (let r = 0; r < 15; r++) {
    const comp = suggestCompletion(sketch, names);
    const act = [...comp.quickFixes, ...comp.groups.flatMap(g => g.options)].find(a => a.dofRemoved > 0);
    if (!act) break;
    const next = applyAction(sketch, act);
    const res = regenerate(shapes, next, { shapeNames: names });
    if (res.rejection) break;
    sketch = res.sketch;
  }
  const comp = sketch.components.find(c => c.name === "Cell")!;
  sketch = createRepeat(sketch, { componentId: comp.id, count: 1, pitch: 280, spacingMode: "driven", direction: { x: 1, y: 0 } }).sketch;
  let res = regenerate(shapes, sketch, { shapeNames: names });
  sketch = res.rejection ? sketch : res.sketch;
  if (applyGrow) {
    const grow = suggestCompletion(sketch, names).groups.flatMap(g => g.options).find(o => o.title.includes("grows to fit"));
    if (grow) {
      sketch = applyAction(sketch, grow);
      res = regenerate(shapes, sketch, { shapeNames: names });
      sketch = res.rejection ? sketch : res.sketch;
    }
  }
  return sketch;
}
