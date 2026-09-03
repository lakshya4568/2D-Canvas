import puppeteer from "puppeteer-core";
import { resolve } from "path";

async function debugBrowserState() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
    await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });

    // Upload
    const fileInputHandle = await page.$('input[type="file"]');
    await fileInputHandle!.uploadFile(resolve(process.cwd(), "public/samples/complex_gad_assembly.json"));
    await new Promise((r) => setTimeout(r, 1000));

    // Click at 550, 200
    await page.mouse.click(550, 200);
    await new Promise((r) => setTimeout(r, 500));

    const debugInfo = await page.evaluate(() => {
      const ctx = (window as any).__DRAWING_CONTEXT__;
      const asides = document.querySelectorAll('aside');
      const inspector = asides[1];
      return {
        ctxFound: Boolean(ctx),
        selectedId: ctx?.state?.selectedId,
        selectedIds: ctx?.state?.selectedIds,
        shapesCount: ctx?.state?.shapes?.length,
        inspectorText: inspector ? inspector.textContent : null,
      };
    });

    console.log("Debug info:", debugInfo);
  } finally {
    await browser.close();
  }
}

debugBrowserState();
