import puppeteer from "puppeteer-core";
import { resolve } from "path";
import { readFileSync } from "fs";

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

    // ==========================================
    // TEST 1: Circle Inside Rectangle (Screenshot 1 Reproduction)
    // ==========================================
    console.log("\n--- TEST 1: Circle inside Rectangle ---");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = [
        {
          id: "box_frame",
          name: "Box Frame",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 500,
          height: 360,
          strokeColor: "#f8fafc",
          strokeWidth: 2,
        },
        {
          id: "circle_duct",
          name: "Circle Duct",
          type: "circle",
          cx: 350,
          cy: 280,
          r: 80,
          strokeColor: "#38bdf8",
          strokeWidth: 2,
        },
      ];
      ctx.dispatch({ type: "LOAD_SHAPES", shapes });
      ctx.dispatch({ type: "SELECT", id: "circle_duct" });
    });

    await new Promise((r) => setTimeout(r, 1000));

    // Verify Inspector has GAD Intelligence card for circle
    const circleInspectorInfo = await page.evaluate(() => {
      const aside = document.querySelectorAll("aside")[1];
      const text = aside?.textContent || "";
      return {
        hasGADTitle: text.includes("GAD Assembly Intelligence"),
        hasRadiusInput: text.includes("Auto-Calculate Radius"),
        hasClearances: text.includes("Clearance"),
        fullSnippet: text.substring(0, 300),
      };
    });

    console.log("Circle GAD card info:", circleInspectorInfo);
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_circle_in_rect.png") });

    // Now resize circle radius from 80 to 110 via auto-calculate
    console.log("Resizing circle radius to 110px without formulas...");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      ctx.dispatch({
        type: "ADJUST_GAD_ASSEMBLY",
        target: {
          shapeId: "circle_duct",
          newRadius: 110,
        },
      });
    });

    await new Promise((r) => setTimeout(r, 800));

    const circleScaledState = await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = ctx.state.shapes;
      const circ = shapes.find((s: any) => s.id === "circle_duct");
      const box = shapes.find((s: any) => s.id === "box_frame");
      return {
        circleRadius: circ?.r,
        boxWidth: box?.width,
        boxHeight: box?.height,
      };
    });
    console.log("After circle scaling:", circleScaledState);

    // ==========================================
    // TEST 2: 3-Level Nesting (Screenshot 4 Reproduction)
    // ==========================================
    console.log("\n--- TEST 2: 3-Level Nesting (R1 in R2 in R3) ---");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = [
        {
          id: "R1",
          name: "Level 0 Frame",
          type: "rectangle",
          x: 50,
          y: 50,
          width: 700,
          height: 450,
          strokeColor: "#f8fafc",
          strokeWidth: 2,
        },
        {
          id: "R2",
          name: "Level 1 Intermediate",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 500,
          height: 320,
          strokeColor: "#38bdf8",
          strokeWidth: 2,
        },
        {
          id: "R3",
          name: "Level 2 Innermost",
          type: "rectangle",
          x: 160,
          y: 160,
          width: 250,
          height: 140,
          strokeColor: "#a855f7",
          strokeWidth: 2,
        },
      ];
      ctx.dispatch({ type: "LOAD_SHAPES", shapes });
      ctx.dispatch({ type: "SELECT", id: "R3" });
    });

    await new Promise((r) => setTimeout(r, 1000));

    const nestingInspectorInfo = await page.evaluate(() => {
      const aside = document.querySelectorAll("aside")[1];
      const text = aside?.textContent || "";
      return {
        hasGADTitle: text.includes("GAD Assembly Intelligence"),
        hasLevelBadge: text.includes("Level 2"),
        hasClearances: text.includes("Clearance"),
      };
    });
    console.log("3-Level nesting inspector info for R3:", nestingInspectorInfo);
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_3_level_nesting.png") });

    // Auto-calculate R3 span to 380px
    console.log("Scaling R3 span to 380px without formulas...");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      ctx.dispatch({
        type: "ADJUST_GAD_ASSEMBLY",
        target: {
          shapeId: "R3",
          newSpan: 380,
        },
      });
    });

    await new Promise((r) => setTimeout(r, 800));

    const nestingScaledState = await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = ctx.state.shapes;
      const r3 = shapes.find((s: any) => s.id === "R3");
      const r2 = shapes.find((s: any) => s.id === "R2");
      const r1 = shapes.find((s: any) => s.id === "R1");
      return {
        r3Width: r3?.width,
        r2Width: r2?.width,
        r1Width: r1?.width,
      };
    });
    console.log("After 3-level nesting scaling:", nestingScaledState);

    // ==========================================
    // TEST 3: Complex RCC Bridge GAD Assembly
    // ==========================================
    console.log("\n--- TEST 3: Complex RCC Bridge GAD Assembly ---");
    const rccJsonPath = resolve(process.cwd(), "public/samples/rcc_bridge_assembly.json");
    const rccShapes = JSON.parse(readFileSync(rccJsonPath, "utf-8"));

    await page.evaluate((shapes) => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      ctx.dispatch({ type: "LOAD_SHAPES", shapes });
      ctx.dispatch({ type: "SELECT", id: "bay2_tendon_duct" });
    }, rccShapes);

    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_rcc_bridge_tendon_selected.png") });

    const tendonInfo = await page.evaluate(() => {
      const aside = document.querySelectorAll("aside")[1];
      const text = aside?.textContent || "";
      return {
        hasGADTitle: text.includes("GAD Assembly Intelligence"),
        hasClearances: text.includes("Clearance (L / R)150px / 150px"),
      };
    });
    console.log("RCC Tendon duct inside Bay 2 info:", tendonInfo);

    // Expand Bay 1 clear span from 380 to 500 (+120px)
    console.log("Scaling Bay 1 clear span to 500px...");
    await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      ctx.dispatch({
        type: "ADJUST_GAD_ASSEMBLY",
        target: {
          shapeId: "bay1_roof",
          deltaSpan: 120,
        },
      });
    });

    await new Promise((r) => setTimeout(r, 1200));

    const rccSolvedState = await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = ctx.state.shapes;
      const deck = shapes.find((s: any) => s.id === "rcc_deck_slab");
      const bay2 = shapes.find((s: any) => s.id === "bay2_box_cavity");
      const tendon = shapes.find((s: any) => s.id === "bay2_tendon_duct");
      const wallRight = shapes.find((s: any) => s.id === "bay1_wall_right");
      return {
        deckWidth: deck?.width,
        bay2X: bay2?.x,
        tendonCX: tendon?.cx,
        intermediateWeb: bay2 && wallRight ? bay2.x - wallRight.x1 : null,
      };
    });
    console.log("After RCC Bridge scaling:", rccSolvedState);
    await page.screenshot({ path: resolve(process.cwd(), "scratch/test_rcc_bridge_solved.png") });

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
