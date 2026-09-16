/**
 * CadCoder & CadQuery AI Agent Service (UPCE-MASTER-1.0 §56)
 *
 * Integrates:
 * 1. Ollama LLM endpoint (`joshuaokolo/C3Dv0:latest`)
 * 2. `uv` Python 3.11 environment with CadQuery & ezdxf
 * 3. Bidirectional DXF -> UPCE Shape[] pipeline
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { importDxfToShapes } from "../io/dxfImporter";
import { DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import type { Shape } from "../geometry/types";

const execAsync = promisify(exec);

export const DEFAULT_OLLAMA_ENDPOINT =
  process.env.OLLAMA_ENDPOINT || "http://103.100.217.50:11434";
export const DEFAULT_OLLAMA_MODEL =
  process.env.OLLAMA_CAD_MODEL || "joshuaokolo/C3Dv0:latest";

export interface CadCoderRequest {
  prompt: string;
  code?: string;
  endpoint?: string;
  model?: string;
  executeOnly?: boolean;
}

export interface CadCoderResponse {
  success: boolean;
  prompt: string;
  code: string;
  shapes: Shape[];
  dxf: string;
  model: string;
  executionTimeMs: number;
  error?: string;
}

export interface CadCoderStatus {
  ollamaConfigured: boolean;
  ollamaEndpoint: string;
  model: string;
  modelAvailable: boolean;
  uvAvailable: boolean;
  uvPath?: string;
  details?: string;
}

/**
 * Checks connectivity to the Ollama C3Dv0 endpoint and availability of uv.
 */
export async function getCadCoderStatus(): Promise<CadCoderStatus> {
  let uvPath: string | undefined;
  let uvAvailable = false;
  try {
    const { stdout } = await execAsync("which uv");
    uvPath = stdout.trim();
    uvAvailable = !!uvPath;
  } catch {
    uvAvailable = false;
  }

  let modelAvailable = false;
  let ollamaConfigured = false;
  let details = "";

  try {
    const res = await fetch(`${DEFAULT_OLLAMA_ENDPOINT}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      ollamaConfigured = true;
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const hasModel = data.models?.some(
        (m) =>
          m.name === DEFAULT_OLLAMA_MODEL ||
          m.name.includes("C3D") ||
          m.name.includes("c3d")
      );
      modelAvailable = !!hasModel;
      details = modelAvailable
        ? `Connected to Ollama. Model ${DEFAULT_OLLAMA_MODEL} active.`
        : `Connected to Ollama, but model ${DEFAULT_OLLAMA_MODEL} not loaded.`;
    } else {
      details = `Ollama returned HTTP ${res.status}`;
    }
  } catch (err: any) {
    details = `Cannot reach Ollama at ${DEFAULT_OLLAMA_ENDPOINT}: ${err.message}`;
  }

  return {
    ollamaConfigured,
    ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
    model: DEFAULT_OLLAMA_MODEL,
    modelAvailable,
    uvAvailable,
    uvPath,
    details,
  };
}

/**
 * System instructions for the CadCoder model to generate valid 2D/3D CadQuery or ezdxf code.
 */
const CADCODER_SYSTEM_PROMPT = `
You are CadCoder, an expert CAD engineer assistant.
Generate clean, executable Python code using CadQuery (cq) and/or ezdxf to produce 2D/3D engineering drawings.
When given an engineering description (such as an RCC Culvert, Bridge Half Section, etc.), define:
- Standard millimeters (mm) units.
- Workplanes, clear span, clear height, wall and slab thicknesses, haunches (600x600 mm), earth cushion (4000 mm).
- Create the cross section or DXF drawing.
Output pure Python code inside \`\`\`python ... \`\`\` code blocks.
`;

/**
 * Calls Ollama endpoint to generate CadQuery code from a user prompt.
 */
export async function queryOllamaForCad(
  prompt: string,
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_OLLAMA_MODEL
): Promise<string> {
  const isRccCulvert =
    /rcc|culvert|half section|bridge|box culvert/i.test(prompt);

  const enrichedPrompt = isRccCulvert
    ? `${prompt}\n(Specifications: Clear span 10700 mm, Clear height 4100 mm, Top slab 800 mm, Bottom slab 800 mm, Wall thickness 850 mm, Haunches 600x600 mm at inner corners, 4000 mm Earth cushion width 11400 mm, Left 1:1 slope backfill with 600 mm boulder, Right wing wall with steps, Foundation base courses, Centerline of bridge).`
    : prompt;

  const res = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: CADCODER_SYSTEM_PROMPT },
        { role: "user", content: enrichedPrompt },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    throw new Error(`Ollama API error (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { message?: { content?: string } };
  const content = json.message?.content || "";

  // Extract python code block
  const match = content.match(/```python\s*([\s\S]*?)```/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Fallback to full content if raw code
  return content.trim();
}

/**
 * Runs Python code using `uv` and parses generated DXF into UPCE Shape[].
 */
export async function executeCadCodeViaUv(
  code: string,
  options?: { isPreset?: boolean }
): Promise<{ shapes: Shape[]; dxf: string }> {
  const tmpDir = os.tmpdir();
  const codePath = path.join(tmpDir, `cadcoder_${Date.now()}.py`);
  const dxfPath = path.join(tmpDir, `cadcoder_out_${Date.now()}.dxf`);

  try {
    fs.writeFileSync(codePath, code, "utf8");

    const projectRoot = process.cwd();
    const runnerScript = path.join(projectRoot, "services/cad_coder/runner.py");

    let cmd: string;
    if (options?.isPreset) {
      cmd = `uv run --python 3.11 --with cadquery --with ezdxf python "${runnerScript}" --preset rcc_half_section --out "${dxfPath}"`;
    } else {
      cmd = `uv run --python 3.11 --with cadquery --with ezdxf python "${runnerScript}" --code-file "${codePath}" --out "${dxfPath}"`;
    }

    const { stdout, stderr } = await execAsync(cmd, { cwd: projectRoot, timeout: 35000 });

    if (!fs.existsSync(dxfPath) || fs.statSync(dxfPath).size === 0) {
      throw new Error(`DXF generation produced empty output. Stderr: ${stderr}`);
    }

    const dxfContent = fs.readFileSync(dxfPath, "utf8");
    const shapes = importDxfToShapes(dxfContent, {
      policy: DEFAULT_TOLERANCE_POLICY,
      detectRectangles: true,
      flipY: true,
    });

    return { shapes, dxf: dxfContent };
  } finally {
    try {
      if (fs.existsSync(codePath)) fs.unlinkSync(codePath);
      if (fs.existsSync(dxfPath)) fs.unlinkSync(dxfPath);
    } catch {}
  }
}

/**
 * The reference Python CadQuery script for the RCC Bridge Half Section.
 */
export const RCC_BRIDGE_CADQUERY_REFERENCE = `import cadquery as cq
import ezdxf

# --- Engineering Dimensions (mm) from Reference Drawing ---
# 'HALF SECTION & HALF ELEVATION PROPOSED BRIDGE (SCALE: 1:100)'
SPAN = 10700.0         # Clear span of inner chamber
HEIGHT = 4100.0        # Clear height of inner chamber
TOP_SLAB = 800.0       # Top slab thickness
BOT_SLAB = 800.0       # Bottom slab thickness
WALL_THK = 850.0       # Side wall thickness
HAUNCH = 600.0         # 600 x 600 mm corner haunches
CUSHION_THK = 4000.0   # 4000 mm earth cushion
CUSHION_W = 11400.0    # 11400 mm cushion width

# 1. Outer Box Profile
outer_w = SPAN + 2 * WALL_THK
outer_h = HEIGHT + TOP_SLAB + BOT_SLAB

# 2. 2D Cross Section & Section Cut
outer_loop = cq.Workplane("XY").rect(outer_w, outer_h)
inner_loop = (
    cq.Workplane("XY")
    .rect(SPAN, HEIGHT)
    .edges("|Z")
    .chamfer(HAUNCH)
)

# Culvert Wall Section (Hollow box with 4 corner haunches)
culvert_section = outer_loop.cut(inner_loop)

# 3. 4000 mm Earth Cushion Profile on top
cushion = (
    cq.Workplane("XY")
    .center(0, outer_h / 2.0 + CUSHION_THK / 2.0)
    .rect(CUSHION_W, CUSHION_THK)
)

# Export complete section to DXF
cq.exporters.export(culvert_section, "rcc_half_section.dxf", cq.exporters.ExportTypes.DXF)
print("RCC Half Section generated successfully via CadQuery!")
`;
