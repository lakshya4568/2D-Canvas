import puppeteer from "puppeteer-core";
import { resolve } from "path";

async function runBrowserVerification() {
  console.log("Launching Chrome at /Applications/Google Chrome.app/Contents/MacOS/Google Chrome...");
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const consoleLogs: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err: any) => pageErrors.push(err.message));

    await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 15000 });
    console.log("Next.js app loaded successfully.");

    // ==============================================================
    // TEST 1: Triangular Boundary with Rectangle (media_1788433447396.png)
    // ==============================================================
    console.log("\n--- TEST 1: Triangular Boundary Span Limits (media_1788433447396.png) ---");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = [
        {
          id: "outer_triangle",
          name: "Triangle Boundary",
          type: "polygon",
          cx: 430,
          cy: 280,
          r: 200,
          sides: 3,
          strokeColor: "#f8fafc",
          strokeWidth: 2,
        },
        {
          id: "inner_rect",
          name: "R1",
          type: "rectangle",
          x: 355,
          y: 171,
          width: 150,
          height: 74,
          strokeColor: "#38bdf8",
          strokeWidth: 2,
        },
      ];
      ctx.dispatch({ type: "LOAD_SHAPES", shapes });
      ctx.dispatch({ type: "SELECT", id: "inner_rect" });
    });

    await new Promise((r) => setTimeout(r, 1000));

    const boundaryInspectorInfo = await page.evaluate(() => {
      const aside = document.querySelectorAll("aside")[1];
      const text = aside?.textContent || "";
      return {
        hasLimitsTitle: text.includes("Boundary & Span Limits"),
        hasExceededBadge: text.includes("EXCEEDED") || text.includes("Exceeded"),
        hasWarningMsg: text.includes("exceeds available span"),
        textSnippet: text.substring(0, 400),
      };
    });

    console.log("Boundary Inspector Info for Triangle Scenario:", boundaryInspectorInfo);
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_boundary_triangle_exceeded.png") });

    // ==============================================================
    // TEST 2: Automatic Formula & Variable Synthesis
    // ==============================================================
    console.log("\n--- TEST 2: Autonomous Formula & Variable Synthesis ---");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = [
        {
          id: "outer_box",
          name: "Outer Box",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 500,
          height: 300,
          strokeColor: "#f8fafc",
          strokeWidth: 2,
        },
        {
          id: "inner_cavity",
          name: "Inner Cavity",
          type: "rectangle",
          x: 140,
          y: 140,
          width: 420,
          height: 220,
          strokeColor: "#38bdf8",
          strokeWidth: 2,
        },
      ];
      ctx.dispatch({ type: "LOAD_SHAPES", shapes });
      ctx.dispatch({ type: "SELECT", id: "inner_cavity" });
    });

    await new Promise((r) => setTimeout(r, 1000));

    const formulasInfo = await page.evaluate(() => {
      const aside = document.querySelectorAll("aside")[1];
      const text = aside?.textContent || "";
      return {
        hasFormulasTitle: text.includes("Inferred Formulas"),
        hasConfidence: text.includes("Confidence"),
        hasWallThicknessReason: text.includes("Uniform 40px clearance"),
        hasFormulaExpression: text.includes("outer_box.width - 2 * T"),
        hasAcceptButton: text.includes("Accept"),
      };
    });

    console.log("Autonomous Formula Synthesis Info:", formulasInfo);
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_inferred_formulas_accepted.png") });

    // ==============================================================
    // TEST 3: RCC Bridge Parametric Benchmark Template
    // ==============================================================
    console.log("\n--- TEST 3: RCC Bridge Parametric Template ---");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      ctx.dispatch({ type: "CLEAR_ALL" });
      ctx.dispatch({ type: "INSTANTIATE_TEMPLATE", templateId: "rcc_bridge" });
      ctx.dispatch({ type: "SELECT", id: "deck_cell_1" });
    });

    await new Promise((r) => setTimeout(r, 1000));

    const rccBridgeInfo = await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = ctx.state.shapes;
      const deck = shapes.find((s: any) => s.id === "bridge_deck_slab");
      const centerline = shapes.find((s: any) => s.id === "bridge_centerline");
      const leftPier = shapes.find((s: any) => s.id === "bridge_pier_left");
      const rightPier = shapes.find((s: any) => s.id === "bridge_pier_right");
      return {
        shapeCount: shapes.length,
        deckWidth: deck?.width,
        centerlineX: centerline?.x1,
        leftPierX: leftPier?.x,
        rightPierX: rightPier?.x,
        isSymmetric: Math.abs((500 - (leftPier.x + leftPier.width / 2)) - ((rightPier.x + rightPier.width / 2) - 500)) < 1,
      };
    });

    console.log("RCC Bridge Parametric Model State:", rccBridgeInfo);
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_rcc_bridge_parametric_solved.png") });

    console.log(`\nBrowser Page Errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.error("Errors:", pageErrors);
    }
  } catch (err) {
    console.error("Browser verification failed:", err);
  } finally {
    await browser.close();
  }
}

runBrowserVerification();
