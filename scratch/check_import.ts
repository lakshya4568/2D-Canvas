import { readFileSync } from "fs";
import { resolve } from "path";
import { parseAndValidateJson } from "../lib/serialization/importJson";
import { detectGADAssemblies, isShapeInGADAssembly } from "../lib/geometry/gadAssemblyEngine";

const jsonStr = readFileSync(resolve(process.cwd(), "public/samples/complex_gad_assembly.json"), "utf-8");
const parsed = parseAndValidateJson(jsonStr);
console.log("Parse success:", parsed.success);
console.log("Shapes count:", parsed.shapes?.length);

const assemblies = detectGADAssemblies(parsed.shapes!);
console.log("Assemblies on imported shapes:", assemblies.length);
if (assemblies.length > 0) {
  console.log("Outer ID:", assemblies[0].outer.id);
  console.log("Features:", assemblies[0].features.map((f) => ({ id: f.id, kind: f.kind, shapeIds: f.shapeIds })));
}

for (const s of parsed.shapes!) {
  const role = isShapeInGADAssembly(parsed.shapes!, s.id);
  console.log(`Shape ${s.id} (name: ${s.name}): inAssembly=${role.inAssembly}, role=${role.role}`);
}
