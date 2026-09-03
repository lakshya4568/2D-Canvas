import puppeteer from "puppeteer-core";
import { resolve } from "path";

async function runInteractiveTest() {
  console.log("Launching Chrome for interactive GAD auto-scale verification...");
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

    // 1. Upload complex_gad_assembly.json
    const complexJsonPath = resolve(process.cwd(), "public/samples/complex_gad_assembly.json");
    const fileInputHandle = await page.$('input[type="file"]');
    if (!fileInputHandle) throw new Error("File input not found");

    await fileInputHandle.uploadFile(complexJsonPath);
    await new Promise((r) => setTimeout(r, 1200));

    console.log("Uploaded complex GAD drawing.");
    await page.screenshot({ path: resolve(process.cwd(), "scratch/1_complex_gad_imported.png") });

    // 2. Select Bay 2 cavity on canvas at (550, 200)
    console.log("Selecting Bay 2 cavity on canvas...");
    await page.mouse.click(550, 200);
    await new Promise((r) => setTimeout(r, 800));

    // Capture inspector state with GAD Assembly Intelligence card
    await page.screenshot({ path: resolve(process.cwd(), "scratch/2_feature_selected_inspector.png") });

    const cardInfo = await page.evaluate(() => {
      const asides = document.querySelectorAll("aside");
      const inspector = asides[1];
      const text = inspector?.textContent || "";
      return {
        hasGADTitle: text.includes("GAD Assembly Intelligence"),
        hasClearances: text.includes("Clearance (L / R)40px / 40px"),
        hasPartition: text.includes("Intermediate Partition60 px"),
        hasSpanInput: text.includes("Auto-Calculate Span"),
      };
    });
    console.log("Property Inspector GAD Intelligence card status:", cardInfo);

    // 3. Edit Span in GAD Assembly card to 450
    console.log("Auto-calculating by changing span to 450 in Property Inspector...");
    const edited = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
      // Find the Span input (currently 280)
      const spanInp = inputs.find((inp) => inp.value === "280");
      if (!spanInp) return false;

      // Update value and trigger React change
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(spanInp, "450");
      spanInp.dispatchEvent(new Event("input", { bubbles: true }));
      spanInp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });

    console.log("Input changed successfully:", edited);
    await new Promise((r) => setTimeout(r, 1500));

    // 4. Capture screenshot after auto-calculation
    const screenshotFinalPath = resolve(process.cwd(), "scratch/4_interactive_gad_solved.png");
    await page.screenshot({ path: screenshotFinalPath });
    console.log(`Saved screenshot of solved GAD to ${screenshotFinalPath}`);

    // 5. Verify geometric invariants in the DOM
    const stateReport = await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const shapes = ctx?.state?.shapes || [];
      const outer = shapes.find((s: any) => s.width > 600);
      const bay2 = shapes.find((s: any) => s.type === "rectangle" && s.width <= 600);
      return {
        outerWidth: outer?.width,
        bay2Width: bay2?.width,
        bay2X: bay2?.x,
        leftClearance: bay2 ? bay2.x - outer?.x : null,
      };
    });

    console.log("State verification in browser context:", stateReport);
    console.log(`Page errors: ${pageErrors.length}`);
    if (pageErrors.length > 0) {
      console.error("Errors:", pageErrors);
    }
  } catch (err) {
    console.error("Interactive test failed:", err);
  } finally {
    await browser.close();
  }
}

runInteractiveTest();
