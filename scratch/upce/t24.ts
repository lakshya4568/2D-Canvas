import { begin, acceptAllDetected } from "../../tests/upce/fixtures";
import { detectCandidates } from "../../lib/upce/detect";
import type { Shape } from "../../lib/geometry/types";
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
// Accept the obvious ones first, then look at what the SECOND pass says —
// that is when the "contradicts by 1.638" cards appeared for you.
let s = begin(shapes);
s = acceptAllDetected(s, 1);
const cands = detectCandidates(s.sketch, { shapeNames: s.names });
console.log("second-pass candidates:", cands.length);
for (const c of cands) {
  console.log(`  ${c.admissible ? "OK " : "RED"}  ${c.headline}`);
  console.log(`        evidence: ${c.evidence[0]}`);
  if (!c.admissible) console.log(`        note:     ${c.admissibilityNote}`);
}
