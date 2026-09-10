import { startAuthoring, regenerate, namesOf } from "../../lib/upce/document";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import { proposeDerived, acceptDerived } from "../../lib/upce/derive";
import { assessReadiness, publish, buildManifest } from "../../lib/upce/template";
import type { Shape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
  { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
];
const names = namesOf(shapes);
let { sketch } = startAuthoring(shapes);
for (const [g,t] of [["*","Pin Outer"],["Outer's direction","Hold Outer horizontal"],["control Outer's size","Name the top edge"],["control Outer's size","Name the right edge"],["Opening's direction","lined up with Outer"],["hold Opening in place horizontally","Keep both side gaps"],["hold Opening in place vertically","Keep both top and bottom gaps"]] as [string,string][]) {
  const comp = suggestCompletion(sketch, names);
  const pool = g === "*" ? comp.quickFixes : comp.groups.filter(x=>x.question.includes(g)).flatMap(x=>x.options);
  const a = pool.find(o=>o.title.includes(t)); if (a) sketch = applyAction(sketch, a);
}
for (const d of proposeDerived(sketch, shapes, { shapeNames: names })) sketch = acceptDerived(sketch, d);
sketch = { ...sketch, meta: { ...sketch.meta, name: "Nested opening frame" } };
// give the published values realistic limits
for (const n of ["OuterWidth","OuterHeight","SideThickness","EndThickness"]) {
  const p = sketch.parameters[n]; if (!p) continue;
  sketch = { ...sketch, parameters: { ...sketch.parameters, [n]: { ...p, min: p.value*0.5, max: p.value*2 } } };
}
console.time("readiness");
const rep = assessReadiness(sketch, shapes, { shapeNames: names });
console.timeEnd("readiness");
console.log("\nTEMPLATE READINESS —", rep.ready ? "READY TO PUBLISH" : "NOT READY");
for (const c of rep.checks) console.log(`  ${c.status === "pass" ? "OK  " : c.status === "warn" ? "WARN" : "FAIL"}  ${c.label.padEnd(28)} ${c.detail}`);
console.log(`  sweep: ${rep.sweep.filter(s=>s.ok).length}/${rep.sweep.length} values re-solved cleanly`);

const pub = publish(sketch, shapes, { shapeNames: names });
if (pub.manifest) {
  console.log("\nPUBLISHED MANIFEST —", pub.manifest.name, "v" + pub.manifest.version);
  console.log("  Driving:"); for (const d of pub.manifest.driving) console.log(`    ${d.name.padEnd(16)} ${d.value} ${d.unit}  [${d.min}–${d.max}]  affects ${d.affects.map(a=>names[a]??a).join(", ")}`);
  console.log("  Derived:"); for (const d of pub.manifest.derived) console.log(`    ${d.name.padEnd(16)} ${d.value.toFixed(1)} ${d.unit}`);
  console.log("  Invariants kept:"); for (const i of pub.manifest.invariants.slice(0,4)) console.log(`    · ${i}`);
}
