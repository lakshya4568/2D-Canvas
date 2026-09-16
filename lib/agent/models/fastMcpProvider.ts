/**
 * CAD Agent v2 — FastMCP Model Engine & Python Bridge Provider
 * UPCE-MASTER-1.0 §56, §69
 *
 * Pluggable provider that executes the headless FastMCP ezdxf CAD engine
 * (src/bridge.py) via `uv run`, supporting all 7 unified FastMCP tools:
 * 1. draw_entities
 * 2. manage_layers
 * 3. manage_blocks
 * 4. transform_entities
 * 5. query_drawing
 * 6. manage_session
 * 7. render_preview
 */

import os from "os";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { LlmProvider, ModelRequest, ModelResponse } from "../types";

const execAsync = promisify(exec);

export interface FastMcpBridgePayload {
  prompt?: string;
  operations?: Array<{ tool: string; args: Record<string, any> }>;
  steps?: Array<{ tool: string; args: Record<string, any> }>;
  entities?: any[];
  width_px?: number;
  height_px?: number;
  background?: string;
}

export interface FastMcpBridgeResult {
  success: boolean;
  dxf: string;
  previewPng: string;
  preview_png: string;
  entityCount: number;
  entity_count: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    min_x: number;
    min_y: number;
    max_x: number;
    max_y: number;
    width: number;
    height: number;
  };
  toolResults: Array<{ tool: string; success: boolean; result?: any; error?: string }>;
  tool_results: Array<{ tool: string; success: boolean; result?: any; error?: string }>;
  queryResult?: any;
  query_result?: any;
  error?: string;
}

function getExecutionEnv(): NodeJS.ProcessEnv {
  const home = process.env.HOME || "";
  const extraPaths = [
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ].filter(Boolean);

  const currentPath = process.env.PATH || "";
  return {
    ...process.env,
    PATH: `${extraPaths.join(":")}:${currentPath}`,
  };
}

export class FastMcpProvider implements LlmProvider {
  readonly id = "fastmcp";
  readonly name = "FastMCP Server (ezdxf)";

  private availableCache: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.availableCache !== null) return this.availableCache;
    try {
      await execAsync("uv --version", { timeout: 4000, env: getExecutionEnv() });
      this.availableCache = true;
      return true;
    } catch {
      this.availableCache = false;
      return false;
    }
  }

  supportsTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const t0 = Date.now();
    const lastMsg = request.messages[request.messages.length - 1];
    const prompt = lastMsg?.content || "";

    const bridgeResult = await this.executeBridge({ prompt });
    return {
      content: `FastMCP executed drawing: ${bridgeResult.entityCount} entities generated via ezdxf backend.`,
      modelUsed: "fastmcp",
      latencyMs: Date.now() - t0,
    };
  }

  /**
   * Executes operations or prompt through the FastMCP python bridge via uv run.
   */
  async executeBridge(payload: FastMcpBridgePayload): Promise<FastMcpBridgeResult> {
    const tmpPayloadPath = path.join(
      os.tmpdir(),
      `fastmcp_payload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`
    );

    try {
      await fs.promises.writeFile(tmpPayloadPath, JSON.stringify(payload), "utf-8");
      const projectRoot = process.cwd();
      const cmd = `uv run python -m src.bridge "${tmpPayloadPath}"`;

      const { stdout, stderr } = await execAsync(cmd, {
        cwd: projectRoot,
        env: getExecutionEnv(),
        maxBuffer: 50 * 1024 * 1024,
        timeout: 45000,
      });

      if (!stdout || !stdout.trim()) {
        throw new Error(`Empty stdout from FastMCP bridge. Stderr: ${stderr}`);
      }

      const rawText = stdout.trim();
      let parsed: FastMcpBridgeResult;
      try {
        parsed = JSON.parse(rawText) as FastMcpBridgeResult;
      } catch {
        const firstBrace = rawText.indexOf("{");
        const lastBrace = rawText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(rawText.substring(firstBrace, lastBrace + 1)) as FastMcpBridgeResult;
        } else {
          throw new Error(`Invalid JSON output from FastMCP bridge: ${rawText.slice(0, 300)}`);
        }
      }
      return parsed;
    } catch (err: any) {
      return {
        success: false,
        dxf: "",
        previewPng: "",
        preview_png: "",
        entityCount: 0,
        entity_count: 0,
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, min_x: 0, min_y: 0, max_x: 0, max_y: 0, width: 0, height: 0 },
        toolResults: [],
        tool_results: [],
        error: err?.message || String(err),
      };
    } finally {
      try {
        await fs.promises.unlink(tmpPayloadPath);
      } catch {}
    }
  }
}
