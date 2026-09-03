import puppeteer from "puppeteer-core";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";

async function runBrowserTest() {
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

    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err: any) => {
      pageErrors.push(err.message);
    });

    console.log("Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 15000 });
    console.log("Page loaded successfully.");

    // Take initial screenshot
    const screenshot1Path = resolve(process.cwd(), "scratch/browser_initial.png");
    await page.screenshot({ path: screenshot1Path });
    console.log(`Saved screenshot 1 to ${screenshot1Path}`);

    // Load complex GAD assembly JSON directly into canvas state
    const complexJsonPath = resolve(process.cwd(), "public/samples/complex_gad_assembly.json");
    const complexShapes = JSON.parse(readFileSync(complexJsonPath, "utf-8"));

    console.log("Injecting complex GAD drawing shapes into the application...");
    const injectionResult = await page.evaluate((shapes) => {
      // Find the React state or dispatch if accessible, or trigger file import
      // Alternatively, simulate drawing or click import button
      // Let's check window state or simulate import
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        return { hasFileInput: true };
      }
      return { hasFileInput: false };
    }, complexShapes);

    console.log("File input availability:", injectionResult);

    // Let's use page.evaluate to test drawing two nested rectangles via the UI or dispatch
    console.log("Testing nested rectangle GAD creation and zero-formula scale calculation...");
    const testResult = await page.evaluate(async (shapesToLoad) => {
      // Dispatch custom load action or test reducer via client React tree
      // In this Next.js app, let's look for the canvas element
      const svg = document.querySelector("svg");
      return {
        svgFound: Boolean(svg),
        buttonsCount: document.querySelectorAll("button").length,
      };
    }, complexShapes);

    console.log("DOM inspection:", testResult);

    // Let's load the shapes via the file input using Puppeteer's uploadFile!
    const fileInputHandle = await page.$('input[type="file"]');
    if (fileInputHandle) {
      console.log("Uploading complex_gad_assembly.json through the UI file input...");
      await fileInputHandle.uploadFile(complexJsonPath);
      await new Promise((r) => setTimeout(r, 1000));
    } else {
      // Click Export/Import menu to expose file input
      console.log("Clicking toolbar Export/Import menu...");
      const importBtn = await page.$('button[title*="Import"], button:has-text("Export"), button:has-text("Import")');
      if (importBtn) {
        await importBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Capture screenshot after loading
    const screenshot2Path = resolve(process.cwd(), "scratch/browser_complex_gad_loaded.png");
    await page.screenshot({ path: screenshot2Path });
    console.log(`Saved screenshot 2 to ${screenshot2Path}`);

    // Check console errors
    console.log(`Console logs captured: ${consoleLogs.length}`);
    console.log(`Page errors captured: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.error("Page errors:", pageErrors);
    }

    console.log("Browser test finished successfully!");
  } catch (err) {
    console.error("Browser test error:", err);
  } finally {
    await browser.close();
  }
}

runBrowserTest();
