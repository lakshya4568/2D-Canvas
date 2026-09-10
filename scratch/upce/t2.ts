import { rebuildSketch } from "../../lib/upce/lower";
import { buildSystem, evaluateSystem, evaluateConstraint } from "../../lib/upce/residuals";
import { evaluateCandidateAdmissibility } from "../../lib/inference/admissibilityFilter";
import type { Shape } from "../../lib/geometry/types";

const shapes: Shape[] = [
  { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
];
const { sketch } = rebuildSketch(shapes);
const sys = buildSystem(sketch);
const { jacobian } = evaluateSystem(sketch, sys, sys.X);
console.log("rows", jacobian.length, "cols", jacobian[0].length);
const cand = {
  id: "x", kind: "parallel" as const, points: [], segments: ["R1:e0", "R1:e2"],
  strength: "soft" as const, driving: true, state: "active" as const, label: "", provenance: { origin: "user" as const, detail: "", createdAt: 0 },
};
const ev = evaluateConstraint(sketch, cand, sys.X, sys.index);
console.log("residual", ev.residuals);
console.log("grad", ev.jacobian[0].map(v=>v.toFixed(1)).join(" "));
const verdict = evaluateCandidateAdmissibility(jacobian, ev.jacobian[0], ev.residuals[0]);
console.log(verdict);
for (const r of jacobian) console.log("J:", r.map(v=>v.toFixed(1)).join(" "));
