"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Terminal,
  Cpu,
  Play,
  Download,
  Copy,
  Check,
  RotateCcw,
  Layers,
  Code2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileCode,
  Image as ImageIcon,
  X,
  Brain,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileJson,
} from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { Shape } from "@/lib/geometry/types";

interface ModelInfo {
  id: string;
  name: string;
  tier: string;
  provider: string;
  configured: boolean;
  endpoint?: string;
  details?: string;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsTools?: boolean;
}

interface AgentResult {
  success: boolean;
  prompt: string;
  routerDecision: {
    intent: string;
    inputMode: string;
    modelTier: string;
    selectedModel: string;
    confidence: number;
    reasoning: string;
    extractedEntities: {
      primitives: string[];
      components: string[];
      parameters: Record<string, { value: number; unit?: string }>;
      cellCount?: number;
    };
  };
  plan?: {
    id: string;
    parameters: Array<{ name: string; value: number; unit: string; role: string }>;
    formulas: Array<{ target: string; expression: string }>;
    steps: Array<{ tool: string; args: Record<string, any> }>;
  };
  toolResults?: Array<{ tool: string; success: boolean }>;
  sceneGraph: {
    nodes: any[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    validation: {
      isValid: boolean;
      checks: Array<{ name: string; status: "PASS" | "WARNING" | "FAIL"; expected: string; actual: string; clause?: string }>;
    };
    derivedMetrics?: {
      summary: string;
      measurements?: Array<{ itemNo: string; description: string; quantity: number; unit: string }>;
      billOfQuantities?: Array<{ itemNo: string; description: string; quantity: number; unit: string; rate: number; amount: number }>;
      estimatedCost?: {
        baseCost: number;
        contingency: number;
        tpqa: number;
        gst: number;
        grandTotal: number;
      };
    };
  };
  shapes: Shape[];
  dxf: string;
  svg: string;
  previewPng?: string;
  response?: string;
  explanation?: string;
  thinking?: string;
  executionTimeMs: number;
  error?: string;
}

const EXAMPLE_PROMPTS = [
  "Draw a circle at (200, 150) with radius 50",
  "Draw a rectangular steel plate 400x250 with 4 corner bolt holes r=15 and centerlines",
  "Draw an arc at (100, 100) with radius 75 from 0 to 180",
  "Draw text 'FOUNDATION A1' at (50, 100) height 20",
  "Draw the cross-section of an RCC T-beam bridge, span 20 m",
  "Draw a twin-cell RCC box culvert with 4000mm span, 3000mm height, 400mm walls",
  "Draw beam longitudinal section with top 3-T20 rebars and bottom 4-T25 rebars",
];

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "fastmcp",
    name: "FastMCP Server (ezdxf)",
    tier: "fastmcp_cad",
    provider: "fastmcp",
    configured: true,
    details: "Headless Python CAD Engine & Visual Self-Verification",
    supportsVision: true,
    supportsThinking: false,
    supportsTools: true,
  },
  {
    id: "gemini-3.8-flash",
    name: "Google Gemini 3.8 Flash",
    tier: "strong",
    provider: "vertex",
    configured: true,
    details: "Vertex AI reasoning, thinking trace & 15 MCP CAD tools",
    supportsVision: true,
    supportsThinking: true,
    supportsTools: true,
  },
  {
    id: "c3dv0",
    name: "Ollama C3Dv0 (Gemma 3n)",
    tier: "cad_specialized",
    provider: "ollama",
    configured: false,
    endpoint: "http://103.100.217.50:11434",
    details: "Fine-tuned Text-to-CAD (JSON / CadQuery)",
    supportsVision: false,
    supportsThinking: false,
    supportsTools: false,
  },
  {
    id: "auto",
    name: "Auto Router",
    tier: "adaptive",
    provider: "router",
    configured: true,
    details: "Adaptive routing based on intent and complexity",
    supportsVision: true,
    supportsThinking: true,
    supportsTools: true,
  },
  {
    id: "deterministic",
    name: "UPCE Local Solver (§57)",
    tier: "offline_fallback",
    provider: "local",
    configured: true,
    details: "Instant offline parametric engineering solver",
    supportsVision: true,
    supportsThinking: false,
    supportsTools: true,
  },
];

export function CadAgentPanel() {
  const { dispatch } = useDrawing();

  // Model selection
  const [models, setModels] = useState<ModelInfo[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.8-flash");

  // Prompt & Image input
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Execution state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [errorText, setErrorText] = useState("");
  const [copiedDxf, setCopiedDxf] = useState(false);
  const [copiedIr, setCopiedIr] = useState(false);

  // Collapsible view sections
  const [showThinking, setShowThinking] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const [showValidation, setShowValidation] = useState(true);
  const [showBoq, setShowBoq] = useState(false);

  // Load available models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/ai/agent");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.defaultModel) {
          setSelectedModel(data.defaultModel);
        }
      }
    } catch (e) {
      console.error("Failed to load models:", e);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Full = reader.result as string;
      const base64Data = base64Full.split(",")[1];
      setImageFile({
        base64: base64Data,
        mimeType: file.type || "image/png",
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleExecute = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && !imageFile) {
      setErrorText("Please enter a prompt or attach a reference image.");
      return;
    }

    setLoading(true);
    setErrorText("");
    setResult(null);

    try {
      const payload: any = {
        prompt: trimmedPrompt,
        modelOverride: selectedModel,
      };

      if (imageFile) {
        payload.image = {
          base64: imageFile.base64,
          mimeType: imageFile.mimeType,
        };
      }

      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Execution failed");
      }

      setResult(data);

      // Load generated UPCE Shapes into CAD Canvas
      if (data.shapes && data.shapes.length > 0) {
        dispatch({ type: "LOAD_SHAPES", shapes: data.shapes });
      }
    } catch (err: any) {
      setErrorText(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadShapes = () => {
    if (result?.shapes) {
      dispatch({ type: "LOAD_SHAPES", shapes: result.shapes });
    }
  };

  const handleDownloadDxf = () => {
    if (!result?.dxf) return;
    const blob = new Blob([result.dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cad_agent_${Date.now()}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJsonIr = () => {
    if (!result?.sceneGraph) return;
    navigator.clipboard.writeText(JSON.stringify(result.sceneGraph, null, 2));
    setCopiedIr(true);
    setTimeout(() => setCopiedIr(false), 2000);
  };

  const activeModelMeta = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto text-[11px] text-(--fg-primary) p-3 space-y-3">
      {/* 1. Model Selector */}
      <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-(--fg-muted)">
              Reasoning LLM
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-(--pen)/10 text-(--pen) font-mono font-medium">
              Tools: FastMCP (ezdxf)
            </span>
          </div>
          {activeModelMeta?.configured ? (
            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {activeModelMeta.provider === "vertex" ? "Vertex AI Ready" : "Online"}
            </span>
          ) : (
            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono font-medium">
              Offline
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {models.filter((m) => m.id !== "fastmcp").map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedModel(m.id)}
              className={`p-2 text-left rounded-[5px] border transition-all cursor-pointer ${
                selectedModel === m.id
                  ? "border-(--pen) bg-(--pen)/10 text-(--pen) font-semibold shadow-xs"
                  : "border-(--rule) bg-(--ink-panel) text-(--fg-muted) hover:text-(--fg-primary) hover:border-(--fg-muted)"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] truncate font-medium">{m.name}</span>
                {m.supportsThinking && (
                  <span title="Reasoning & Thinking Enabled">
                    <Brain className="w-3 h-3 text-(--pen) shrink-0 ml-1" />
                  </span>
                )}
              </div>
              <p className="text-[9px] text-(--fg-muted) truncate mt-0.5">
                {m.id === "gemini-3.8-flash"
                  ? "Thinking + 15 MCP CAD Tools"
                  : m.id === "c3dv0"
                  ? "Finetuned Text-to-CAD (JSON)"
                  : m.id === "auto"
                  ? "Adaptive Smart Router"
                  : "Offline Solver (§57)"}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Prompt & Reference Input */}
      <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-(--fg-muted)">
            Engineering Drawing Prompt
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach reference drawing / diagram image"
            className="text-[10px] text-(--pen) hover:underline flex items-center gap-1 cursor-pointer"
          >
            <ImageIcon className="w-3 h-3" />
            <span>{imageFile ? "Change Image" : "Attach Image"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>

        {/* Attached Image Badge */}
        {imageFile && (
          <div className="flex items-center justify-between px-2 py-1 rounded bg-(--ink-panel) border border-(--rule) text-[10px]">
            <span className="truncate text-(--pen) flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3 shrink-0" />
              {imageFile.name}
            </span>
            <button
              onClick={() => setImageFile(null)}
              className="text-(--fg-muted) hover:text-red-400 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe geometry, bridge cross-section, or structural component to draw... e.g. Draw a circle at (200, 150) with radius 50"
          className="w-full resize-none bg-(--ink-panel) border border-(--rule) rounded-[4px] p-2 text-[11px] placeholder:text-(--fg-muted)/60 focus:outline-hidden focus:border-(--pen)"
        />

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-1">
          {EXAMPLE_PROMPTS.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => setPrompt(ex)}
              className="text-[9.5px] px-1.5 py-0.5 rounded bg-(--ink-panel) border border-(--rule) text-(--fg-muted) hover:text-(--pen) hover:border-(--pen)/40 transition-colors cursor-pointer truncate max-w-full"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Execution Action */}
        <button
          onClick={handleExecute}
          disabled={loading || (!prompt.trim() && !imageFile)}
          className="w-full h-[28px] rounded bg-(--pen) text-(--ink-app) font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity shadow-xs"
        >
          {loading ? (
            <>
              <div className="w-3 h-3 border-2 border-(--ink-app) border-t-transparent rounded-full animate-spin" />
              <span>
                {selectedModel === "fastmcp"
                  ? "FastMCP ezdxf Drafting & Rendering..."
                  : selectedModel === "gemini-3.8-flash"
                  ? "Gemini 3.8 Flash Reasoning..."
                  : "CAD Agent Processing..."}
              </span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Generate & Draw on Canvas</span>
            </>
          )}
        </button>

        {errorText && (
          <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[10.5px] flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="leading-tight">{errorText}</span>
          </div>
        )}
      </div>

      {/* 3. Execution Results & Inspector */}
      {result && (
        <div className="space-y-3">
          {/* Header Summary */}
          <div className="rounded-[6px] border border-emerald-500/30 bg-emerald-500/5 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Drawing Generated Successfully
              </span>
              <span className="text-[10px] font-mono text-(--fg-muted)">
                {result.executionTimeMs} ms
              </span>
            </div>
            <div className="text-[10px] text-(--fg-muted) grid grid-cols-2 gap-1 pt-1 border-t border-(--rule)/60">
              <div>
                Intent: <span className="text-(--fg-primary) font-mono">{result.routerDecision.intent}</span>
              </div>
              <div>
                Model: <span className="text-(--fg-primary) font-mono">{result.routerDecision.selectedModel}</span>
              </div>
              <div>
                Entities: <span className="text-(--fg-primary) font-mono">{result.sceneGraph.nodes.length}</span>
              </div>
              <div>
                Bounds: <span className="text-(--fg-primary) font-mono">{result.sceneGraph.bounds.width.toFixed(0)} × {result.sceneGraph.bounds.height.toFixed(0)} mm</span>
              </div>
            </div>
          </div>

          {/* FastMCP Visual Self-Verification Preview PNG */}
          {result.previewPng && (
            <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) overflow-hidden p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-medium text-(--fg-muted)">
                <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Visual Self-Verification Preview (FastMCP)
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  render_preview
                </span>
              </div>
              <div className="rounded border border-(--rule) overflow-hidden bg-white/5 flex items-center justify-center p-1">
                <img
                  src={
                    result.previewPng.startsWith("data:")
                      ? result.previewPng
                      : `data:image/png;base64,${result.previewPng}`
                  }
                  alt="CAD Visual Self-Verification Preview"
                  className="w-full h-auto max-h-48 object-contain rounded shadow-xs"
                />
              </div>
            </div>
          )}

          {/* Gemini 3.8 Flash Thinking Trace */}
          {result.thinking && (
            <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) overflow-hidden">
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="w-full px-2.5 py-1.5 bg-(--ink-panel) flex items-center justify-between text-[10px] font-medium text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-(--pen)">
                  <Brain className="w-3 h-3" />
                  Gemini 3.8 Flash Thinking Process
                </span>
                {showThinking ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showThinking && (
                <div className="p-2.5 text-[10px] font-mono text-(--fg-muted) whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-(--ink-app)">
                  {result.thinking}
                </div>
              )}
            </div>
          )}

          {/* Technical Explanation / Response */}
          {result.explanation && (
            <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) p-2.5 space-y-1">
              <span className="text-[10px] font-semibold uppercase text-(--fg-muted) tracking-wider">
                Engineering Rationale
              </span>
              <p className="text-[10.5px] leading-relaxed text-(--fg-primary)">
                {result.explanation}
              </p>
            </div>
          )}

          {/* Tool Calls Execution */}
          {result.plan && result.plan.steps.length > 0 && (
            <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) overflow-hidden">
              <button
                onClick={() => setShowTools(!showTools)}
                className="w-full px-2.5 py-1.5 bg-(--ink-panel) flex items-center justify-between text-[10px] font-medium text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-(--pen)" />
                  Parametric Tool Calls ({result.plan.steps.length})
                </span>
                {showTools ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showTools && (
                <div className="p-2 space-y-1 max-h-40 overflow-y-auto">
                  {result.plan.steps.map((s, idx) => (
                    <div
                      key={idx}
                      className="px-2 py-1 rounded bg-(--ink-panel) border border-(--rule) font-mono text-[9.5px] text-(--fg-muted) truncate"
                    >
                      <span className="text-(--pen)">{s.tool}</span>(
                      {Object.entries(s.args)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                        .join(", ")}
                      {Object.keys(s.args).length > 3 ? ", …" : ""})
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Invariant & IRC Standards Validation */}
          {result.sceneGraph.validation && (
            <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) overflow-hidden">
              <button
                onClick={() => setShowValidation(!showValidation)}
                className="w-full px-2.5 py-1.5 bg-(--ink-panel) flex items-center justify-between text-[10px] font-medium text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  IRC Standards & Invariants
                </span>
                {showValidation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showValidation && (
                <div className="p-2 space-y-1">
                  {result.sceneGraph.validation.checks.map((c, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded bg-(--ink-panel)"
                    >
                      <span className="truncate text-(--fg-primary)">{c.name}</span>
                      <span
                        className={`font-mono text-[9px] px-1 rounded ${
                          c.status === "PASS"
                            ? "text-emerald-400 bg-emerald-500/10"
                            : "text-amber-400 bg-amber-500/10"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BoQ & Cost Summary (Civil & Structural Components Only) */}
          {result.sceneGraph.derivedMetrics?.estimatedCost && (result.sceneGraph.derivedMetrics.concreteArea || 0) > 0 && (
            <div className="rounded-[6px] border border-(--rule) bg-(--ink-app) overflow-hidden">
              <button
                onClick={() => setShowBoq(!showBoq)}
                className="w-full px-2.5 py-1.5 bg-(--ink-panel) flex items-center justify-between text-[10px] font-medium text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-amber-400" />
                  BoQ & Cost Estimate
                </span>
                {showBoq ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showBoq && (
                <div className="p-2.5 space-y-1 text-[10px] font-mono">
                  <div className="text-(--fg-muted)">{result.sceneGraph.derivedMetrics.summary}</div>
                  <div className="pt-1.5 border-t border-(--rule) flex justify-between font-semibold text-(--fg-primary)">
                    <span>Grand Total (incl. GST):</span>
                    <span className="text-(--pen)">
                      ₹{result.sceneGraph.derivedMetrics.estimatedCost.grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Export & Redraw Actions */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={handleLoadShapes}
              className="flex-1 h-[24px] rounded bg-(--ink-panel) border border-(--rule) text-[10px] font-medium text-(--fg-primary) hover:border-(--pen) flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Redraw Canvas</span>
            </button>
            <button
              onClick={handleDownloadDxf}
              className="flex-1 h-[24px] rounded bg-(--ink-panel) border border-(--rule) text-[10px] font-medium text-(--fg-primary) hover:border-(--pen) flex items-center justify-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Save DXF</span>
            </button>
            <button
              onClick={handleCopyJsonIr}
              className="flex-1 h-[24px] rounded bg-(--ink-panel) border border-(--rule) text-[10px] font-medium text-(--fg-primary) hover:border-(--pen) flex items-center justify-center gap-1 cursor-pointer"
            >
              {copiedIr ? <Check className="w-3 h-3 text-emerald-400" /> : <FileJson className="w-3 h-3" />}
              <span>{copiedIr ? "Copied" : "Copy IR"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
