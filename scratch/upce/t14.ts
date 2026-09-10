import { suggestCompletion, findOffsets } from "../../lib/upce/completion";
import { buildSketch, names, shapes } from "./culvertFixture";
const sketch = buildSketch(false);
console.log("clearance constraints:");
for (const c of sketch.constraints.filter(c => c.kind === "point_line_distance")) {
  console.log(`  ${c.id} | seg=${c.segments[0]} pt=${c.points[0]} param=${c.paramRef} sign=${c.sign} state=${c.state}`);
}
const offs = findOffsets(sketch, undefined, names);
console.log("\noffsets inner=Cell:");
for (const o of offs) console.log(`  outer=${o.outer.label} inner=${o.inner.label} edge=${o.outerEdgeId} side=${o.sideLabel} d=${o.distance.toFixed(1)} sign=${o.sign}`);
const grow = suggestCompletion(sketch, names).groups.flatMap(g=>g.options).find(o=>o.title.includes("grows to fit"));
console.log("\ngrow action suppresses:", grow?.suppressConstraints);
console.log("grow expr:", grow?.convertToDerived);
