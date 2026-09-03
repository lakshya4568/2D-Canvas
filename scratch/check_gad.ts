import { readFileSync } from "fs";
import { resolve } from "path";
import { detectGADAssemblies, isShapeInGADAssembly } from "../lib/geometry/gadAssemblyEngine";

const shapes = JSON.parse(readFileSync(resolve(process.cwd(), "public/samples/complex_gad_assembly.json"), "utf-8"));
console.log("Shapes loaded:", shapes.length);
const assemblies = detectGADAssemblies(shapes);
console.log("Assemblies detected:", assemblies.length);
if (assemblies.length > 0) {
  console.log("Outer ID:", assemblies[0].outer.id);
  console.log("Features:", assemblies[0].features.map(f => ({ id: f.id, kind: f.kind, shapeIds: f.shapeIds })));
}

for (const s of shapes) {
  const role = isShapeInGADAssembly(shapes, s.id);
  console.log(`Shape ${s.id}: inAssembly=${role.inAssembly}, role=${role.role}, featureIndex=${role.featureIndex}`);
}
