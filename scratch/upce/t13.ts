import { regenerate, namesOf } from "../../lib/upce/document";
import { analyseDof } from "../../lib/upce/dof";
import { expandRepeats } from "../../lib/upce/repeat";
import { rebuildSketch, constraintIsResolvable } from "../../lib/upce/lower";
import { solveSketch } from "../../lib/upce/solve";
import { buildSketch, shapes, names } from "./culvertFixture";

let sketch = buildSketch();
sketch = { ...sketch, parameters: { ...sketch.parameters, CellCount: { ...sketch.parameters.CellCount, value: 2 } } };

// Reproduce the pipeline manually so we can see the state that fails.
const expansion = expandRepeats(shapes, sketch);
console.log("expanded shapes:", expansion.shapes.length, "extra constraints:", expansion.constraints.length);
const { sketch: rebuilt } = rebuildSketch(expansion.shapes, sketch);
const withRepeat = { ...rebuilt, constraints: [...rebuilt.constraints, ...expansion.constraints.filter(c => constraintIsResolvable(c, rebuilt))] };
console.log("constraints total:", withRepeat.constraints.length);
const out = solveSketch(withRepeat, { preview: true });
console.log("converged:", out.converged, "maxResidual:", out.maxResidual.toExponential(2));
const d = analyseDof(out.sketch, names);
console.log("DOF:", d.dof, "rank", d.rank, "rows", d.rows, "vars", d.variables, "status", d.status);
console.log("\nCONFLICTS:");
for (const x of d.diagnoses.filter(x => x.status === "conflicting")) console.log(`  ${x.label} — off by ${x.residual.toExponential(2)}`);
