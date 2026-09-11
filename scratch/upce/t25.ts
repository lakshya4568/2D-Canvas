import { begin, acceptAllDetected, choose, setParameter, dof } from "../../tests/upce/fixtures";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { regenerate, removeConstraint } from "../../lib/upce/document";
import { assessReadiness } from "../../lib/upce/template";
import type { Shape, RectangleShape } from "../../lib/geometry/types";

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

function build(keepEdgeLengths: boolean) {
  let s = begin(shapes);
  s = acceptAllDetected(s);
  s = choose(s, "Pin culvert_outer");
  s = choose(s, "Name Profile A's width");     // CellWidth equivalent
  s = choose(s, "Name Profile A's height");
  s = choose(s, "Name culvert_outer's width");
  s = choose(s, "Name culvert_outer's height");
  s = choose(s, "Keep both left and right gaps equal");
  s = choose(s, "Keep both top and bottom gaps equal");
  if (keepEdgeLengths) {
    // What you did: also name the roof pair and the wall pair.
    for (let i=0;i<4;i++) {
      const r = suggestCompletion(s.sketch, s.names);
      const opts = r.groups.flatMap(g=>g.options).filter(o=>o.title.includes("matching edges equal"));
      const a = opts[0];
      if (!a) break;
      const next = applyAction(s.sketch, a);
      const res = regenerate(s.shapes, next, { shapeNames: s.names });
      if (res.rejection) break;
      s = { ...s, sketch: res.sketch };
    }
  } else {
    // Only the haunch set, which locks the chamfer length without also pinning
    // the roof and the wall.
    const r = suggestCompletion(s.sketch, s.names);
    const a = r.groups.flatMap(g=>g.options).find(o=>o.title.includes("Keep 4 matching edges"));
    if (a) {
      const res = regenerate(s.shapes, applyAction(s.sketch, a), { shapeNames: s.names });
      if (!res.rejection) s = { ...s, sketch: res.sketch };
    }
  }
  return s;
}

for (const keep of [true, false]) {
  const s = build(keep);
  const names = Object.entries(s.sketch.parameters).map(([k,v])=>`${k}=${v.value.toFixed(1)}`).join(", ");
  console.log(`\n=== ${keep ? "WITH roof+wall lengths named (your setup)" : "WITHOUT them (recommended)"} ===`);
  console.log("  DOF", dof(s), "|", names);
  const rep = assessReadiness(s.sketch, s.shapes, { shapeNames: s.names });
  const edgeParams = Object.values(s.sketch.parameters).filter(x=>x.uiGroup==="Edge lengths").map(x=>x.name);
  console.log("  edge-length parameters:", edgeParams.join(", ") || "(none)");
  const beh = rep.checks.find(c=>c.label==="Behaviour under change")!;
  console.log(`  sweep: ${rep.sweep.filter(x=>x.ok).length}/${rep.sweep.length}  -> ${beh.status.toUpperCase()}`);
  if (beh.status !== "pass") console.log("   ", beh.detail.slice(0,150));
}
