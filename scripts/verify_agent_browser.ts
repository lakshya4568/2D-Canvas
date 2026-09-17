import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

async function runBrowserVerification() {
  console.log("=== Starting CAD Agent Browser E2E Verification ===");

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome binary not found at ${chromePath}`);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    console.log("Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    page.on("console", (msg) => console.log("PAGE CONSOLE:", msg.text()));
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

    // Step 1: Switch to "CAD Agent" dock tab
    console.log("Locating CAD Agent tab...");
    const cadAgentTabClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const tabBtn = buttons.find((b) => b.textContent?.trim() === "CAD Agent");
      if (tabBtn) {
        tabBtn.click();
        return true;
      }
      return false;
    });

    if (!cadAgentTabClicked) {
      throw new Error("Could not find CAD Agent tab in dock");
    }
    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Ensure Gemini 3.8 Flash model is selected
    console.log("Selecting Google Gemini 3.8 Flash model...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const flashBtn = buttons.find((b) => b.textContent?.includes("Gemini 3.8 Flash"));
      if (flashBtn) flashBtn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Step 3: Click an example prompt chip
    console.log("Clicking example prompt chip...");
    const clickedChip = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const chip = buttons.find((b) => b.textContent?.includes("twin-cell RCC box culvert") || b.textContent?.includes("RCC T-beam"));
      if (chip) {
        chip.click();
        return chip.textContent;
      }
      return null;
    });
    console.log("Clicked chip:", clickedChip);
    await new Promise((r) => setTimeout(r, 500));

    // Step 4: Click "Generate & Draw on Canvas"
    console.log("Clicking Generate & Draw on Canvas...");
    const genClickResult = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const genBtn = buttons.find((b) => b.textContent?.includes("Generate & Draw on Canvas"));
      if (genBtn) {
        genBtn.click();
        return "Clicked button: " + genBtn.textContent;
      }
      return "Generate button not found";
    });
    console.log("Generate click result:", genClickResult);

    // Step 5: Wait for execution result to render
    console.log("Waiting for autonomous loop execution results...");
    await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText;
        return (
          bodyText.includes("Drawing Generated Successfully") ||
          bodyText.includes("Autonomous Agentic Loop Trace")
        );
      },
      { timeout: 45000 }
    );

    // Step 6: Verify Autonomous Agentic Progress Trace components
    console.log("Verifying Autonomous Progress Trace timeline elements...");
    const traceInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const hasTraceHeader = bodyText.includes("Autonomous Agentic Loop Trace");
      const hasObserve = bodyText.includes("OBSERVE");
      const hasReason = bodyText.includes("REASON");
      const hasAct = bodyText.includes("ACT");
      const hasInspect = bodyText.includes("INSPECT");
      const hasVerify = bodyText.includes("VERIFY");
      const hasGoalPassed = bodyText.includes("ALL GOALS PASSED");
      const hasRedrawBtn = bodyText.includes("Redraw Canvas");
      const hasSaveDxfBtn = bodyText.includes("Save DXF");
      const hasCopyIrBtn = bodyText.includes("Copy IR");

      return {
        hasTraceHeader,
        hasObserve,
        hasReason,
        hasAct,
        hasInspect,
        hasVerify,
        hasGoalPassed,
        hasRedrawBtn,
        hasSaveDxfBtn,
        hasCopyIrBtn,
      };
    });

    console.log("Trace Info Result:", JSON.stringify(traceInfo, null, 2));

    if (!traceInfo.hasTraceHeader) {
      throw new Error("Autonomous Agentic Loop Trace header not rendered!");
    }
    if (!traceInfo.hasGoalPassed) {
      throw new Error("Goal Verification chip 'ALL GOALS PASSED' not found!");
    }

    // Step 7: Capture overview screenshot
    const screenshotPath = path.resolve(__dirname, "../tests/browser_verification.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`✓ Overview screenshot captured at ${screenshotPath}`);

    // Step 8: Scroll right panel down and capture trace view
    await page.evaluate(() => {
      const panel = document.querySelector(".overflow-y-auto");
      if (panel) {
        panel.scrollTop = panel.scrollHeight;
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    const traceScreenshotPath = path.resolve(__dirname, "../tests/browser_verification_trace.png");
    await page.screenshot({ path: traceScreenshotPath, fullPage: false });
    console.log(`✓ Trace view screenshot captured at ${traceScreenshotPath}`);

    console.log("=== Browser E2E Verification PASSED Successfully! ===");
  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
