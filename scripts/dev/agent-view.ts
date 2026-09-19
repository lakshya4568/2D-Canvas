/** Dev check: what the agent sees after inserting a component (writes a PNG). */
import { writeFileSync } from "node:fs";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";
import { runTool } from "@/lib/agent/drafter/tools";

const ws = new DraftingWorkspace();
const ctx = { ws, hasReference: false, viewedRevision: -1, suggestions: { revision: -1, byId: new Map() }, macroDepth: 0 };
const r = await runTool(ctx, "insert_component", { definition: process.argv[2] ?? "ir.rcc_box.half_section" });
console.log(r.text.split("\n")[0]);
const v = await runTool(ctx, "view", {});
if (v.image) writeFileSync(process.argv[3], Buffer.from(v.image.data, "base64"));
console.log(v.text.slice(0, 300));
