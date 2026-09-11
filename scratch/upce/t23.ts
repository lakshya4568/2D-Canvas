import { begin } from "../../tests/upce/fixtures";
import { detectCandidates } from "../../lib/upce/detect";
import type { Shape } from "../../lib/geometry/types";

// Your cell: roof 230 long, walls 130, haunches 49.5 at 45 degrees, inside a frame.
const p = {
  tlTop:{x:65,y:30}, trTop:{x:295,y:30}, trRight:{x:330,y:65}, brRight:{x:330,y:195},
  brBottom:{x:295,y:230}, blBottom:{x:65,y:230}, blLeft:{x:30,y:195}, tlLeft:{x:30,y:65},
};
const L = (id:string,a:{x:number;y:number},b:{x:number;y:number}):Shape =>
  ({id,name:id,type:"line",x1:a.x,y1:a.y,x2:b.x,y2:b.y} as Shape);
const shapes: Shape[] = [
  { id:"culvert_outer", name:"culvert_outer", type:"rectangle", x:0, y:0, width:360, height:260 } as Shape,
  L("roof",p.tlTop,p.trTop), L("haunch_tr",p.trTop,p.trRight), L("right_wall",p.trRight,p.brRight),
  L("haunch_br",p.brRight,p.brBottom), L("floor",p.brBottom,p.blBottom), L("haunch_bl",p.blBottom,p.blLeft),
  L("left_wall",p.blLeft,p.tlLeft), L("haunch_tl",p.tlLeft,p.tlTop),
];
// Nudge one corner by 0.003 degrees' worth, the way a hand-drawn line lands.
const tilt = Math.tan(0.003 * Math.PI / 180) * 230;
(shapes[5] as any).y1 += tilt; (shapes[5] as any).y2 += tilt * 0.5;
const s = begin(shapes);
const cands = detectCandidates(s.sketch, { shapeNames: s.names });
console.log("candidates:", cands.length);
for (const c of cands) {
  const tag = c.admissible ? `OK  (-${c.dofRemoved})` : `RED ${c.admissibilityNote}`;
  console.log(`  ${tag}\n      ${c.headline}  |  ${c.evidence[0]}`);
}
