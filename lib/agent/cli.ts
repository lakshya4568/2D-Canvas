#!/usr/bin/env bun
/**
 * CAD Agent v2 — Standalone Headless CLI Runner
 *
 * Usage:
 *   bun run lib/agent/cli.ts --prompt "Draw a circle at (200, 150) with radius 50"
 *   bun run lib/agent/cli.ts --prompt "Draw the cross-section of an RCC T-beam bridge, span 20 m" --out bridge.json
 *   bun run lib/agent/cli.ts --prompt "Recreate bridge with span 25 m" --image /path/to/image.png --dxf bridge.dxf
 */

import fs from "fs";
import path from "path";
import { CadAgent } from "./cadAgent";

async function main() {
  const args = process.argv.slice(2);
  let prompt = "";
  let imagePath = "";
  let outJson = "";
  let outDxf = "";
  let outSvg = "";
  let modelOverride = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--prompt" || args[i] === "-p") {
      prompt = args[++i];
    } else if (args[i] === "--image" || args[i] === "-i") {
      imagePath = args[++i];
    } else if (args[i] === "--out" || args[i] === "-o") {
      outJson = args[++i];
    } else if (args[i] === "--dxf") {
      outDxf = args[++i];
    } else if (args[i] === "--svg") {
      outSvg = args[++i];
    } else if (args[i] === "--model" || args[i] === "-m") {
      modelOverride = args[++i];
    }
  }

  if (!prompt && !imagePath) {
    console.log(`
CAD Agent v2 — Standalone CLI
Options:
  --prompt, -p <text>     Engineering prompt (e.g. "Draw the cross-section of an RCC T-beam bridge, span 20 m")
  --image, -i <path>      Path to reference CAD/bridge diagram image
  --model, -m <name>      Model override (e.g. "gemini-3.8-flash", "c3dv0", "deterministic")
  --out, -o <path>        Save Scene Graph IR to JSON file
  --dxf <path>            Save AutoCAD DXF file
  --svg <path>            Save SVG visualization file
`);
    process.exit(1);
  }

  const agent = new CadAgent();
  console.log(`\n========================================`);
  console.log(`CAD Agent v2 Processing: "${prompt || "[Image Input]"}"`);
  console.log(`========================================`);

  let imagePayload: { path?: string; base64?: string; mimeType?: string } | undefined;
  if (imagePath && fs.existsSync(imagePath)) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const base64 = fs.readFileSync(imagePath).toString("base64");
    imagePayload = { path: imagePath, base64, mimeType };
    console.log(`Loaded reference image: ${imagePath} (${(base64.length / 1024).toFixed(1)} KB)`);
  }

  const result = await agent.execute({
    prompt,
    image: imagePayload,
    modelOverride: modelOverride || undefined,
  });

  console.log(`\n[ROUTER DECISION]`);
  console.log(`  Intent:             ${result.routerDecision.intent}`);
  console.log(`  Input Mode:         ${result.routerDecision.inputMode}`);
  console.log(`  Model Tier:         ${result.routerDecision.modelTier}`);
  console.log(`  Selected Model:     ${result.routerDecision.selectedModel}`);
  console.log(`  Confidence:         ${(result.routerDecision.confidence * 100).toFixed(0)}%`);
  console.log(`  Reasoning:          ${result.routerDecision.reasoning}`);

  console.log(`\n[PLANNING]`);
  console.log(`  Plan ID:            ${result.plan.id}`);
  console.log(`  Driving Parameters: ${result.plan.parameters.filter((p) => p.role === "DRIVING").map((p) => `${p.name}=${p.value}${p.unit}`).join(", ")}`);
  console.log(`  Derived Formulas:   ${result.plan.formulas.map((f) => `${f.target} = ${f.expression}`).join(", ")}`);
  console.log(`  Tool Calls:         ${result.plan.steps.length}`);

  console.log(`\n[EXECUTION & VALIDATION]`);
  console.log(`  Entities Generated: ${result.sceneGraph.nodes.length}`);
  console.log(`  Bounds:             [${result.sceneGraph.bounds.minX.toFixed(0)}, ${result.sceneGraph.bounds.minY.toFixed(0)}] to [${result.sceneGraph.bounds.maxX.toFixed(0)}, ${result.sceneGraph.bounds.maxY.toFixed(0)}] (${result.sceneGraph.bounds.width.toFixed(0)} x ${result.sceneGraph.bounds.height.toFixed(0)} mm)`);
  console.log(`  IRC Standards:      ${result.sceneGraph.validation.isValid ? "ALL CHECKS PASSED ✓" : "WARNINGS DETECTED ⚠"}`);
  for (const c of result.sceneGraph.validation.checks) {
    console.log(`    [${c.status}] ${c.name} (${c.actual} vs ${c.expected})`);
  }
  if (result.sceneGraph.derivedMetrics) {
    console.log(`  BoQ Metrics:        ${result.sceneGraph.derivedMetrics.summary}`);
  }
  console.log(`  Execution Time:     ${result.executionTimeMs} ms`);

  // Save artifacts if requested
  if (outJson) {
    fs.writeFileSync(outJson, JSON.stringify(result.sceneGraph, null, 2), "utf8");
    console.log(`\nSaved Scene Graph IR to ${outJson}`);
  }
  if (outDxf) {
    fs.writeFileSync(outDxf, result.dxf, "utf8");
    console.log(`Saved AutoCAD DXF to ${outDxf}`);
  }
  if (outSvg) {
    fs.writeFileSync(outSvg, result.svg, "utf8");
    console.log(`Saved SVG to ${outSvg}`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
