# CAD Agent v2 — Integration & Deployment Notes

**Document Version:** 2.0  
**Engine Architecture:** UPCE-MASTER-1.0 (§56, §57, §69)  
**Target:** Reconnecting Ollama C3Dv0 & Wiring CAD Agent v2 into the CAD Editor  

---

## 1. System Architecture Overview

The CAD Agent v2 operates as an autonomous, model-agnostic engine that converts natural-language prompts and reference diagrams into deterministic parametric drawings:

```
                      ┌──────────────────────────────────────────────┐
                      │                 USER REQUEST                 │
                      │   Natural-language prompt and/or reference   │
                      │   diagram (e.g. bridge cross-section)        │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │              1. CAD ROUTER                   │
                      │  • Intent: create/modify/query/dim/explain   │
                      │  • Mode: text-only | image-only | text+image │
                      │  • Tier: fast | strong | vision              │
                      │  • Entities: span, depth, haunch, rebars...  │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │            2. MODEL SELECTOR                 │
                      │  Pluggable unified LLM interface:            │
                      │  ├─ Google Vertex AI (gemini-3.8-flash)      │
                      │  ├─ Ollama C3Dv0 (finetuned Gemma 3n)        │
                      │  └─ Deterministic Local Engine (§57 fallback)│
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │                 3. PLANNER                   │
                      │  • Resolves parameters (user / defaults / IS)│
                      │  • Binds formulas (depth = span/12, etc.)    │
                      │  • Sequences MCP tool calls                  │
                      │  • Guarantees Zero Conformal Scaling         │
                      │  • Satisfies Planar Rigid-Body Anchor (§18)  │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │             4. TOOL REGISTRY                 │
                      │  MCP-compatible CAD tools with symbolic      │
                      │  expressions (draw_*, move, mirror, dim...)  │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │          5. EXECUTOR / RENDERER              │
                      │  Outputs:                                    │
                      │  ├─ Scene Graph IR (canonical JSON v2.0)     │
                      │  ├─ UPCE Shape[] (React Canvas reducer)      │
                      │  ├─ AutoCAD DXF R2010 string                 │
                      │  └─ Scalable Vector Graphics (SVG)           │
                      └──────────────────────────────────────────────┘
```

---

## 2. Reconnecting Ollama C3Dv0

The CadCoder agent's Ollama instance is configured to use the finetuned `joshuaokolo/C3Dv0:latest` model (based on Gemma 3n for CAD generation).

### Configuration Parameters
Set the following environment variables in `.env.local` or your production deployment:

```bash
# Ollama Host & Port
OLLAMA_ENDPOINT="http://103.100.217.50:11434"

# Finetuned CAD Generation Model
OLLAMA_CAD_MODEL="joshuaokolo/C3Dv0:latest"
```

### Healthcheck & Reconnection Verification
When the remote server comes online, verify connectivity using:

```bash
# 1. Test tags endpoint
curl -s http://103.100.217.50:11434/api/tags | jq .

# 2. Check via internal service status
bun run -e 'import { getCadCoderStatus } from "./lib/ai/cadcoderService"; getCadCoderStatus().then(console.log);'
```

### Fallback Behavior (§57 Invariant)
The system is built to adhere strictly to **UPCE-MASTER-1.0 §57**:
> *The geometry engine MUST NOT depend on AI availability. AI is an accelerator, never a foundation.*

If the Ollama endpoint is unreachable, timed out, or returning non-200 responses:
1. The **Model Selector** automatically fails over to the **Vertex AI Provider** (if configured) or the **Deterministic Local Provider**.
2. All geometric drawing and parametric formula solving completes 100% deterministically with zero interruption to the user.

---

## 3. Vertex AI (Gemini 3.8 Flash) Setup

For strong engineering reasoning and multimodal image recreation (e.g. recreating drawings from uploaded bridge diagrams):

### Configuration
Set one of the authentication options in `.env.local`:

```bash
# Option A: Gemini API Key (generativelanguage.googleapis.com)
GEMINI_API_KEY="AIzaSy..."

# Option B: Vertex AI Project & ADC Login (aiplatform.googleapis.com)
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
VERTEX_LOCATION="global"
VERTEX_MODEL="gemini-3.8-flash"
VERTEX_MAX_TOKENS=8192
VERTEX_TIMEOUT_MS=45000
```

### Testing Model Inference with Thinking
```bash
# Run CLI test with explicit model override:
bun run lib/agent/cli.ts --prompt "Draw the cross-section of an RCC T-beam bridge, span 20 m" --model "gemini-3.8-flash"
```

---

## 4. Wiring into the CAD Editor & Command Bar

### 1. Connecting to the Next.js API Route
CAD Agent v2 is exposed at `POST /api/ai/agent`:

```ts
// Example client-side invocation from Canvas or CommandBar
const res = await fetch("/api/ai/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt: "Draw an RCC box culvert with span 10700 mm and height 4100 mm",
  }),
});

const data = await res.json();
if (data.success && data.shapes) {
  // Dispatch directly into UPCE drawingReducer
  dispatch({ type: "LOAD_SHAPES", shapes: data.shapes });
}
```

### 2. Registering in `CommandRegistry.ts`
To allow draftsmen and engineers to trigger CAD Agent v2 from the AutoCAD-style command bar:

In `lib/commands/CommandRegistry.ts`:
```ts
// Alias declaration
{ alias: "AGENT", commandName: "CAD_AGENT", description: "Generates CAD drawing via CAD Agent v2", category: "tool" },
{ alias: "AI", commandName: "CAD_AGENT", description: "Generates CAD drawing via CAD Agent v2", category: "tool" },

// Execution handler
case "CAD_AGENT": {
  const prompt = args || "Draw the cross-section of an RCC T-beam bridge, span 20 m";
  fetch("/api/ai/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.success && data.shapes) {
        ctx.dispatch({ type: "LOAD_SHAPES", shapes: data.shapes });
        ctx.notify?.({
          text: `CAD Agent v2: Generated ${data.shapes.length} CAD entities`,
          type: "success",
        });
      }
    });
  return { success: true, message: `Running CAD Agent v2: "${prompt}"...` };
}
```

---

## 5. Headless CLI Tooling

A standalone CLI is provided in `lib/agent/cli.ts` for running the agent without starting the browser:

```bash
# 1. Basic geometric primitive
bun run lib/agent/cli.ts --prompt "Draw a circle at (200, 150) with radius 50"

# 2. Complete RCC T-Beam bridge with DXF export
bun run lib/agent/cli.ts --prompt "Draw the cross-section of an RCC T-beam bridge, span 20 m" --dxf t_beam.dxf --out t_beam.json

# 3. Reference Image + Span Scaling
bun run lib/agent/cli.ts --image "/path/to/bridge_diagram.png" --prompt "recreate this with span 25 m" --svg bridge.svg
```

---

## 6. Running Verification Tests

Run the full evaluation test suite:

```bash
# Run MCP Tool Schema and Evaluation Harness (18 tests)
bun test tests/agent/

# Run Tolerance and License Linters
bun run lint:tolerance
bun run license:scan
```
