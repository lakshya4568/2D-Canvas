import { begin, acceptAllDetected, choose, commit } from "../../tests/upce/fixtures";
import { uniqueParameterName, validateExpression } from "../../lib/upce/parameters";
import { regenerate } from "../../lib/upce/document";
import type { Shape, RectangleShape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id:"R1", name:"R1", type:"rectangle", x:0,    y:0, width:2000, height:800 } as Shape,
  { id:"R2", name:"R2", type:"rectangle", x:3000, y:0, width:1400, height:400 } as Shape,
];
let s = begin(shapes);
// skip accept-all: see note on the coincidental symmetry candidate
s = choose(s, "Pin R1");
s = choose(s, "Name R1's width");
s = choose(s, "Name R2's width");
console.log("params:", Object.entries(s.sketch.parameters).map(([k,v])=>`${k}(${v.role})=${v.value} bound:${v.boundConstraints.length}`).join(", "));

// What the "Write a relationship myself" box does with a name that already exists:
const taken = uniqueParameterName("R2Width", s.sketch.parameters);
console.log(`\ntyping name "R2Width" -> actually creates: "${taken}"`);
const check = validateExpression("R1Width - 600", taken, s.sketch.parameters);
console.log("expression valid:", check.ok, "| deps:", check.dependencies);

// Simulate what the editor does: add a DERIVED param, bound to nothing.
const next = { ...s.sketch, parameters: { ...s.sketch.parameters,
  [taken]: { name: taken, role: "DERIVED" as const, type: "LENGTH" as const, unit: "mm" as const,
    value: 0, expr: "R1Width - 600", dependencies: check.dependencies,
    provenance: { origin: "user" as const, detail: "typed", createdAt: 0 },
    boundConstraints: [], published: false } } };
const before = (regenerate(shapes, s.sketch, {shapeNames:s.names}).shapes.find(x=>x.id==="R2") as RectangleShape).width;
const r = regenerate(shapes, { ...next, parameters: { ...next.parameters,
  R1Width: { ...next.parameters.R1Width, value: 3000 } } }, { shapeNames: s.names });
const after = (r.shapes.find(x=>x.id==="R2") as RectangleShape).width;
console.log(`\nR1Width 2000 -> 3000 :  R2 width ${before} -> ${after}   (${taken} computed = ${r.sketch.parameters[taken].value})`);
console.log("=> the derived value is computed, but nothing in the geometry reads it.");
