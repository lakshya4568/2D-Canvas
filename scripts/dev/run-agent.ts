/**
 * Dev helper: run the drafting agent through the app's own endpoint (the same
 * request the Draw tab sends), with a reference image, on an empty drawing.
 * Logs every tool call, saves the final state and plots it.
 *
 *   bun run scripts/dev/run-agent.ts <image> <outDir> [model] [prompt…]
 *
 * Needs the dev server on :3000 (its Google Cloud login is used — nothing here
 * touches credentials).
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { exportDrawingSvg } from "@/lib/cad/export";
import type { DrafterState } from "@/lib/agent/drafter/workspace";
import type { Shape } from "@/lib/geometry/types";

const [image, outDir, model = "gemini-3.8-flash@medium", ...words] = process.argv.slice(2);
const prompt = words.join(" ") || "Reconstruct the attached drawing.";
mkdirSync(outDir, { recursive: true });
const log = path.join(outDir, "log.txt");
writeFileSync(log, `model ${model}\nprompt ${prompt}\n\n`);
const say = (s: string) => {
  appendFileSync(log, s + "\n");
  console.log(s);
};

const ext = path.extname(image).toLowerCase();
const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
const res = await fetch("http://localhost:3000/api/ai/drafter", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt, images: [{ data: readFileSync(image).toString("base64"), mimeType }], model }),
});
if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
let images = 0;
let lastTool = "";
let final: { state: DrafterState; status: string; summary?: string; message: string; turns: number; toolCalls: number; elapsedMs: number } | null = null;
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let i: number;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const chunk = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const line = chunk.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const e = JSON.parse(line.slice(6));
    if (e.type === "tool") {
      lastTool = e.name;
      say(`→ ${e.name} ${JSON.stringify(e.args).slice(0, 400)}`);
    } else if (e.type === "result") {
      say(`  ${e.ok ? "✓" : "✗"} ${String(e.text).replace(/\n/g, " ⏎ ").slice(0, 1500)}`);
      // Every picture the agent was shown (views, reference overlays), in order.
      if (e.image) writeFileSync(path.join(outDir, `img-${String(++images).padStart(2, "0")}-${lastTool}.png`), Buffer.from(e.image, "base64"));
    }
    else if (e.type === "message") say(`» ${String(e.text).slice(0, 800)}`);
    else if (e.type === "retry") say(`… retry ${e.attempt} in ${e.waitSeconds}s: ${e.reason}`);
    else if (e.type === "error") say(`!! ${e.message}`);
    else if (e.type === "done") final = e;
  }
}
if (!final) throw new Error("No final event.");
say(`\nDONE ${final.status} — ${final.message} (${final.turns} turns, ${final.toolCalls} tool calls, ${Math.round(final.elapsedMs / 1000)} s)\n${final.summary ?? ""}`);
writeFileSync(path.join(outDir, "state.json"), JSON.stringify(final.state));
const shapes = [...(final.state.shapes ?? []), ...(final.state.cadShapes ?? [])] as Shape[];
if (final.state.cad) writeFileSync(path.join(outDir, "result.svg"), exportDrawingSvg(shapes, final.state.cad, "white"));
