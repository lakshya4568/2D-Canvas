import { begin, acceptAllDetected, answerEverything, commit, setParameter, railingPost } from "../../tests/upce/fixtures";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import { regenerate } from "../../lib/upce/document";

let rp = begin(railingPost());
rp = acceptAllDetected(rp);
rp = answerEverything(rp);
const pc = createComponent(rp.sketch, rp.shapes, ["post"], "Post");
rp = commit(rp, pc.sketch);
rp = commit(rp, createRepeat(rp.sketch, { componentId: pc.component.id, count: 5, pitch: 1200, spacingMode: "driven", direction: {x:1,y:0} }).sketch);
for (const n of [5, 3, 4, 2, 1, 8]) {
  rp = setParameter(rp, "PostCount", n);
  const r = regenerate(rp.shapes, rp.sketch, { shapeNames: rp.names });
  const posts = r.shapes.filter(x=>x.id==="post"||x.id.endsWith(":post"));
  console.log(`PostCount=${n} -> ${posts.length} posts | param now ${r.sketch.parameters.PostCount?.value} | DOF ${r.dof.dof}`);
}
