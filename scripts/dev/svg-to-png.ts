/**
 * Dev helper: rasterise an SVG with the local Chrome (puppeteer-core).
 *
 *   bun run scripts/dev/svg-to-png.ts <in.svg> <out.png> [widthPx] [crop x,y,w,h in 0..1]
 */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const [input, output, widthArg, crop] = process.argv.slice(2);
const svg = readFileSync(input, "utf8");
const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(svg);
const w = Number(widthArg ?? 2400);
const h = vb ? Math.round((w * Number(vb[4])) / Number(vb[3])) : w;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h });
await page.setContent(`<html><body style="margin:0;background:#fff">${svg.replace(/<\?xml[^>]*>/, "").replace("<svg ", `<svg width="${w}" height="${h}" `)}</body></html>`);
if (crop) {
  const [cx, cy, cw, ch] = crop.split(",").map(Number);
  await page.screenshot({ path: output as `${string}.png`, clip: { x: cx * w, y: cy * h, width: cw * w, height: ch * h } });
} else {
  await page.screenshot({ path: output as `${string}.png` });
}
await browser.close();
console.log(`${output} ${w}x${h}`);
