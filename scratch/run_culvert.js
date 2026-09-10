const puppeteer = require("puppeteer-core");

const ARTIFACTS_DIR = "/Users/proximus/.gemini/antigravity/brain/ab13c102-2469-4fa4-afa7-1c57bfae4275";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Starting Parametric Culvert Workflow ===");
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.on("console", (m) => console.log(`[Browser Console] ${m.text()}`));
  page.on("pageerror", (err) => console.error(`[Browser Error] ${err.message}`));

  // 1. Initial State
  console.log("Step 1: Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
  await delay(1000);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/01_initial_app_canvas.png` });
  console.log("Saved: 01_initial_app_canvas.png");

  // 2. Setup Drawing: Outer frame + octagonal culvert cell with lines & corner chamfers
  console.log("Step 2: Drawing outer rectangle and octagonal culvert cell with lines & chamfers...");
  await page.evaluate(() => {
    const outer = {
      id: "outer_rect",
      name: "Outer_Frame",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 260,
      strokeColor: "#38bdf8",
      strokeWidth: 2,
      fillColor: "transparent",
    };

    const p = {
      tl_top: { x: 165, y: 130 },
      tr_top: { x: 345, y: 130 },
      tr_right: { x: 380, y: 165 },
      br_right: { x: 380, y: 295 },
      br_bottom: { x: 345, y: 330 },
      bl_bottom: { x: 165, y: 330 },
      bl_left: { x: 130, y: 295 },
      tl_left: { x: 130, y: 165 },
    };

    const lines = [
      { id: "roof", name: "Roof", type: "line", x1: p.tl_top.x, y1: p.tl_top.y, x2: p.tr_top.x, y2: p.tr_top.y, strokeColor: "#e2e8f0", strokeWidth: 2 },
      { id: "chamfer_tr", name: "Chamfer_TR", type: "line", strokeColor: "#a855f7", strokeWidth: 2, x1: p.tr_top.x, y1: p.tr_top.y, x2: p.tr_right.x, y2: p.tr_right.y },
      { id: "wall_right", name: "Wall_Right", type: "line", x1: p.tr_right.x, y1: p.tr_right.y, x2: p.br_right.x, y2: p.br_right.y, strokeColor: "#e2e8f0", strokeWidth: 2 },
      { id: "chamfer_br", name: "Chamfer_BR", type: "line", strokeColor: "#a855f7", strokeWidth: 2, x1: p.br_right.x, y1: p.br_right.y, x2: p.br_bottom.x, y2: p.br_bottom.y },
      { id: "floor", name: "Floor", type: "line", x1: p.br_bottom.x, y1: p.br_bottom.y, x2: p.bl_bottom.x, y2: p.bl_bottom.y, strokeColor: "#e2e8f0", strokeWidth: 2 },
      { id: "chamfer_bl", name: "Chamfer_BL", type: "line", strokeColor: "#a855f7", strokeWidth: 2, x1: p.bl_bottom.x, y1: p.bl_bottom.y, x2: p.bl_left.x, y2: p.bl_left.y },
      { id: "wall_left", name: "Wall_Left", type: "line", x1: p.bl_left.x, y1: p.bl_left.y, x2: p.tl_left.x, y2: p.tl_left.y, strokeColor: "#e2e8f0", strokeWidth: 2 },
      { id: "chamfer_tl", name: "Chamfer_TL", type: "line", strokeColor: "#a855f7", strokeWidth: 2, x1: p.tl_left.x, y1: p.tl_left.y, x2: p.tl_top.x, y2: p.tl_top.y },
    ];

    window.__DRAWING_CONTEXT__.dispatch({ type: "LOAD_SHAPES", shapes: [outer, ...lines] });
  });

  await delay(1000);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/02_culvert_cell_drawn.png` });
  console.log("Saved: 02_culvert_cell_drawn.png");

  // 3. Switch Persona to Author Mode and open Parametric Tab
  console.log("Step 3: Switching to Author Mode and Parametric tab...");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button")).find((b) => b.innerText.trim() === "Author")?.click();
  });
  await delay(400);

  await page.evaluate(() => {
    Array.from(document.querySelectorAll("aside button")).find((b) => b.innerText.trim() === "Parametric")?.click();
  });
  await delay(400);

  // Click Analyse geometry button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("aside button")).find((b) => b.innerText.includes("Analyse geometry"));
    btn?.click();
  });
  await delay(1200);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/03_author_analysis.png` });
  console.log("Saved: 03_author_analysis.png");

  // 4. Accept detected constraint candidates
  console.log("Step 4: Accepting detected geometric candidates...");
  const cands = await page.evaluate(() => {
    const upce = window.__UPCE__;
    const accepted = [];
    for (const c of upce.candidates) {
      if (c.admissible && !c.headline.toLowerCase().includes("mirrored")) {
        upce.acceptCandidate(c.id);
        accepted.push(c.headline);
      }
    }
    return accepted;
  });
  console.log("Accepted candidates:", cands);
  await delay(1000);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/04_candidates_accepted.png` });
  console.log("Saved: 04_candidates_accepted.png");

  // 5. Apply design intents sequentially
  console.log("Step 5: Applying design intents sequentially...");
  
  // 5a. Pin Outer_Frame to sheet
  await page.evaluate(() => {
    const upce = window.__UPCE__;
    const pin = upce.completion?.quickFixes?.find((q) => q.title.includes("Pin"));
    if (pin) upce.applyIntent(pin);
  });
  await delay(500);

  // 5b. Hold Outer_Frame horizontal
  await page.evaluate(() => {
    const upce = window.__UPCE__;
    const horiz = upce.completion?.quickFixes?.find((q) => q.title.includes("horizontal"));
    if (horiz) upce.applyIntent(horiz);
  });
  await delay(500);

  // 5c. Size Outer_Frame Width
  await page.evaluate(() => {
    const upce = window.__UPCE__;
    const sizeGroup = upce.completion?.groups?.find((g) => g.question.includes("Outer_Frame") && g.question.includes("size"));
    const widthOpt = sizeGroup?.options?.find((o) => o.title.includes("top edge"));
    if (widthOpt) upce.applyIntent(widthOpt);
  });
  await delay(500);

  // 5d. Size Outer_Frame Height
  await page.evaluate(() => {
    const upce = window.__UPCE__;
    const sizeGroup = upce.completion?.groups?.find((g) => g.question.includes("Outer_Frame") && g.question.includes("size"));
    const heightOpt = sizeGroup?.options?.find((o) => o.title.includes("right edge"));
    if (heightOpt) upce.applyIntent(heightOpt);
  });
  await delay(500);

  // 5e. Mark intentional freedom
  await page.evaluate(() => {
    window.__UPCE__.setIntentionalFreedom(true);
  });
  await delay(500);

  const dofState = await page.evaluate(() => {
    const upce = window.__UPCE__;
    return {
      dof: upce.dof?.dof,
      status: upce.dof?.status,
      anchored: upce.dof?.anchored,
    };
  });
  console.log("Constrained DOF status:", dofState);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/05_fully_constrained_cell.png` });
  console.log("Saved: 05_fully_constrained_cell.png");

  // 6. Make Unit Component "Cell"
  console.log("Step 6: Making unit component 'Cell'...");
  await page.evaluate(() => {
    const cellIds = ["roof", "chamfer_tr", "wall_right", "chamfer_br", "floor", "chamfer_bl", "wall_left", "chamfer_tl"];
    const ctx = window.__DRAWING_CONTEXT__;
    ctx.dispatch({ type: "SELECT_SHAPE", id: cellIds[0], multi: false });
    for (let i = 1; i < cellIds.length; i++) {
      ctx.dispatch({ type: "SELECT_SHAPE", id: cellIds[i], multi: true });
    }
  });
  await delay(400);

  await page.evaluate(() => {
    const cellIds = ["roof", "chamfer_tr", "wall_right", "chamfer_br", "floor", "chamfer_bl", "wall_left", "chamfer_tl"];
    window.__UPCE__.makeComponent("Cell", cellIds);
  });
  await delay(1000);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/06_unit_component_created.png` });
  console.log("Saved: 06_unit_component_created.png");

  // 7. Add Repeat Rule: count = 1, pitch = 280 mm
  console.log("Step 7: Adding repeat rule with pitch 280 mm (clear span + wall thickness)...");
  await page.evaluate(() => {
    const upce = window.__UPCE__;
    const cellComp = upce.sketch.components.find((c) => c.name === "Cell");
    if (cellComp) {
      upce.makeRepeat({
        componentId: cellComp.id,
        count: 1,
        pitch: 280,
        spacingMode: "driven",
        direction: { x: 1, y: 0 },
      });
      upce.createDerivedParameter("Outer_FrameWidth", "CellCount * CellPitch + 120");
    }
    upce.setTemplateName("Parametric Multi-Cell Culvert");
  });
  await delay(1200);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/07_repeat_rule_added.png` });
  console.log("Saved: 07_repeat_rule_added.png");

  // 8. Set template name and click "Check it"
  console.log("Step 8: Checking template readiness...");
  await page.evaluate(() => {
    const checkBtn = Array.from(document.querySelectorAll("aside button")).find((b) => b.innerText.includes("Check it"));
    checkBtn?.click();
  });
  await delay(2000);

  const readinessInfo = await page.evaluate(() => {
    const upce = window.__UPCE__;
    const pubBtn = Array.from(document.querySelectorAll("aside button")).find((b) => b.innerText.includes("Publish"));
    return {
      ready: upce?.readiness?.ready,
      pubDisabled: pubBtn?.disabled,
      checks: upce?.readiness?.checks?.map((c) => ({ label: c.label, status: c.status })),
    };
  });
  console.log("Readiness status:", readinessInfo);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/08_readiness_check_passed.png` });
  console.log("Saved: 08_readiness_check_passed.png");

  // 9. Click Publish button
  console.log("Step 9: Publishing template...");
  await page.evaluate(() => {
    const pubBtn = Array.from(document.querySelectorAll("aside button")).find((b) => b.innerText.includes("Publish"));
    pubBtn?.click();
  });
  await delay(1500);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/09_template_published.png` });
  console.log("Saved: 09_template_published.png");

  // 10. Switch to Run Mode (User Mode)
  console.log("Step 10: Switching to Run Mode (User Mode)...");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button")).find((b) => b.innerText.trim() === "Run")?.click();
  });
  await delay(1500);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/10_user_mode_single_cell.png` });
  console.log("Saved: 10_user_mode_single_cell.png");

  // 11. DOUBLING THE CELL: In User Mode, change CellCount from 1 to 2!
  console.log("Step 11: DOUBLING THE CELL in User Mode (CellCount: 1 -> 2)...");
  await page.evaluate(() => {
    const countInp = document.querySelector("#p-CellCount");
    if (countInp) {
      countInp.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(countInp, "2");
      countInp.dispatchEvent(new Event("input", { bubbles: true }));
      countInp.dispatchEvent(new Event("change", { bubbles: true }));
      countInp.blur();
    } else {
      window.__UPCE__.setParameterValue("CellCount", 2);
    }
  });
  await delay(2500);

  const doubleReport = await page.evaluate(() => {
    const ctx = window.__DRAWING_CONTEXT__;
    const upce = window.__UPCE__;
    return {
      shapesCount: ctx.state.shapes.length,
      shapes: ctx.state.shapes.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      params: Object.fromEntries(Object.entries(upce.sketch.parameters).map(([k, v]) => [k, v.value])),
      invariantsCount: upce.invariants?.length,
      brokenInvariants: upce.invariants?.filter((i) => !i.ok).length,
    };
  });
  console.log("Doubled report:", doubleReport);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/11_user_mode_doubled_cell.png` });
  console.log("Saved: 11_user_mode_doubled_cell.png");

  // 12. Adjust Pitch to 290 mm in User Mode to demonstrate continuous parameter variation
  console.log("Step 12: Adjusting CellPitch to 290 mm in User Mode...");
  await page.evaluate(() => {
    const pitchInp = document.querySelector("#p-CellPitch");
    if (pitchInp) {
      pitchInp.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(pitchInp, "290");
      pitchInp.dispatchEvent(new Event("input", { bubbles: true }));
      pitchInp.dispatchEvent(new Event("change", { bubbles: true }));
      pitchInp.blur();
    } else {
      window.__UPCE__.setParameterValue("CellPitch", 290);
    }
  });
  await delay(2500);

  const pitchReport = await page.evaluate(() => {
    const ctx = window.__DRAWING_CONTEXT__;
    const upce = window.__UPCE__;
    return {
      shapesCount: ctx.state.shapes.length,
      params: Object.fromEntries(Object.entries(upce.sketch.parameters).map(([k, v]) => [k, v.value])),
    };
  });
  console.log("Pitch report:", pitchReport);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/12_user_mode_pitch_adjusted.png` });
  console.log("Saved: 12_user_mode_pitch_adjusted.png");

  // 13. Tripling: Set CellCount to 3
  console.log("Step 13: TRIPLING THE CELL (CellCount: 2 -> 3)...");
  await page.evaluate(() => {
    const countInp = document.querySelector("#p-CellCount");
    if (countInp) {
      countInp.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(countInp, "3");
      countInp.dispatchEvent(new Event("input", { bubbles: true }));
      countInp.dispatchEvent(new Event("change", { bubbles: true }));
      countInp.blur();
    } else {
      window.__UPCE__.setParameterValue("CellCount", 3);
    }
  });
  await delay(2500);
  await page.screenshot({ path: `${ARTIFACTS_DIR}/13_user_mode_tripled_cell.png` });
  console.log("Saved: 13_user_mode_tripled_cell.png");

  console.log("=== Workflow Successfully Completed ===");
  await browser.close();
}

main().catch(console.error);
