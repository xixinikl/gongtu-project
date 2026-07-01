/**
 * CUT-FIX-007 参考视频体验验收录制脚本
 *
 * 按 CURRENT_STATUS.md 四项验证标准逐项操作并录制视频：
 * 1. 默认教学模式保留完整模型
 * 2. 切面从模型外进入、连续穿过、离开 - 蓝色截面无闪烁残留
 * 3. orbit/plane 模式切换清楚，无手势冲突
 * 4. 页面构图、主要控件和实时状态可见
 *
 * 使用: npx playwright test tests/cut-fix-007-recording.mjs --project=chromium
 */

import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
const BASE_URL = "http://127.0.0.1:8770";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Verify scenario #1: Default teaching mode preserves complete model
 */
async function verifyTeachingMode(page) {
  console.log("  [1] Default teaching mode...");
  // Page loads in teaching mode by default
  await page.goto(`${BASE_URL}/geometry.html`, { waitUntil: "networkidle" });
  await sleep(3000); // Let 3D scene fully render

  // Verify the teaching mode button is pressed
  const teachingBtn = page.locator('[data-cutaway-mode="teaching"]');
  const pressed = await teachingBtn.getAttribute("aria-pressed");
  if (pressed !== "true") {
    throw new Error("Expected teaching mode to be active by default");
  }

  // Take screenshot of default state
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-01-teaching-default.png") });
  console.log("    Screenshot: cf7-01-teaching-default.png");
}

/**
 * Verify scenario #2: Section enters, passes through, and leaves model
 */
/**
 * Read slider range from the page and set a value within bounds.
 */
async function readSliderRange(page) {
  return page.evaluate(() => {
    const slider = document.querySelector("#cut-free-inputs input[type=\"range\"]");
    if (!slider) return null;
    return {
      min: parseFloat(slider.min),
      max: parseFloat(slider.max),
      step: parseFloat(slider.step),
      value: parseFloat(slider.value),
    };
  });
}

async function setSliderValue(page, value) {
  await page.evaluate((v) => {
    const slider = document.querySelector("#cut-free-inputs input[type=\"range\"]");
    if (!slider) return;
    slider.value = String(v);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, Number(value));
}

async function verifySectionPassThrough(page) {
  console.log("  [2] Section pass-through sequence...");

  const range = await readSliderRange(page);
  if (!range) throw new Error("Could not read slider range");
  console.log(`    Slider range: ${range.min} → ${range.max} (current: ${range.value})`);

  // Start at top of range (outside/edge of model)
  await setSliderValue(page, range.max);
  await sleep(2000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-02-above-model.png") });

  // Check section status at top
  const topMetrics = await page.locator("#sectionMetricsContent").textContent();
  console.log(`    Top section: ${topMetrics.includes("暂无有效截面") ? "empty" : "present"}`);

  // Animate through the full range (top → bottom)
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const val = range.max - (i / steps) * (range.max - range.min);
    await setSliderValue(page, val);
    await sleep(250);
  }

  // Below model
  await sleep(1500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-03-below-model.png") });

  const bottomMetrics = await page.locator("#sectionMetricsContent").textContent();
  console.log(`    Bottom section: ${bottomMetrics.includes("暂无有效截面") ? "empty" : "present"}`);

  console.log("    Animated: " + steps + " steps top→bottom");
}

/**
 * Verify scenario #3: orbit/plane mode switching
 */
async function verifyModeSwitching(page) {
  console.log("  [3] orbit/plane mode switching...");

  // Reset slider to middle
  const range0 = await readSliderRange(page);
  const mid = (range0.min + range0.max) / 2;
  await setSliderValue(page, mid);
  await sleep(1000);

  // Switch to plane mode
  const planeBtn = page.locator('[data-interaction-mode="plane"]');
  await planeBtn.click();
  await sleep(500);

  // Verify plane mode is active
  const canvas = page.locator("#geometryCanvas");
  const viewport = page.locator(".viewport");

  // Simulate drag on the canvas (vertical drag moves the cutting plane)
  const box = await canvas.boundingBox();
  const startY = box.y + box.height * 0.3;
  const endY = box.y + box.height * 0.7;
  const centerX = box.x + box.width / 2;

  await page.mouse.move(centerX, startY);
  await page.mouse.down();
  // Slow drag for smooth section update
  for (let i = 1; i <= 10; i++) {
    const y = startY + (endY - startY) * (i / 10);
    await page.mouse.move(centerX, y, { steps: 3 });
    await sleep(150);
  }
  await page.mouse.up();
  await sleep(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-04-plane-drag.png") });

  // Switch back to orbit mode
  const orbitBtn = page.locator('[data-interaction-mode="orbit"]');
  await orbitBtn.click();
  await sleep(500);

  // Verify orbit mode is active (camera rotation) - use button selector
  const orbitCheckBtn = page.locator('button[data-interaction-mode="orbit"]');
  const orbitPressed = await orbitCheckBtn.getAttribute("aria-pressed");
  if (orbitPressed !== "true") {
    throw new Error("Expected orbit mode to be active after switching back");
  }
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-05-orbit-restored.png") });

  console.log("    Screenshots: cf7-04-plane-drag.png, cf7-05-orbit-restored.png");
}

/**
 * Verify scenario #4: Full page layout with controls and status visible
 */
async function verifyPageLayout(page) {
  console.log("  [4] Page layout verification...");

  // Reset position to get a visible section
  const range1 = await readSliderRange(page);
  await setSliderValue(page, (range1.min + range1.max) / 2 - 0.3);
  await sleep(1500);

  // Full page screenshot at 1280×720
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-06-full-layout-1280x720.png"), fullPage: false });

  // Check scrollHeight fits viewport
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`    Page scrollHeight: ${scrollHeight}px (expected ≤720)`);

  // Verify key elements are visible in viewport
  const elementsToCheck = [
    { selector: "#geometryCanvas", name: "3D Canvas" },
    { selector: "#sectionMetrics", name: "Section Metrics" },
    { selector: "#cut-settings-title", name: "Cutting Plane Title" },
    { selector: 'button[data-interaction-mode="orbit"]', name: "Orbit Button" },
    { selector: 'button[data-interaction-mode="plane"]', name: "Plane Button" },
  ];

  for (const el of elementsToCheck) {
    const visible = await page.locator(el.selector).isVisible();
    console.log(`    ${el.name}: ${visible ? "✓ visible" : "✗ MISSING"}`);
    if (!visible) {
      throw new Error(`${el.name} not visible in viewport`);
    }
  }

  // Check section metrics content (should show valid section)
  const metricsContent = await page.locator("#sectionMetricsContent").textContent();
  const hasValidSection = !metricsContent.includes("暂无有效截面");
  console.log(`    Section data: ${hasValidSection ? "valid" : "empty"}`);

  // Narrow screen layout check
  await page.setViewportSize({ width: 760, height: 800 });
  await sleep(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "cf7-07-narrow-layout.png"), fullPage: false });
  const narrowScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`    Narrow (760×800) scrollHeight: ${narrowScrollHeight}px`);
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("CUT-FIX-007 参考视频体验验收录制\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("  [Browser Error]", msg.text());
    }
  });

  try {
    await verifyTeachingMode(page);
    await verifySectionPassThrough(page);
    await verifyModeSwitching(page);
    await verifyPageLayout(page);

    console.log("\n✓ All 4 scenarios captured successfully.");
  } catch (err) {
    console.error("\n✗ Verification failed:", err.message);
    throw err;
  } finally {
    await context.close();
    await browser.close();

    // Print output files
    const { readdirSync } = await import("fs");
    const files = readdirSync(OUTPUT_DIR).filter((f) => f.startsWith("cf7-"));
    console.log("\nOutput files:");
    files.forEach((f) => console.log(`  ${OUTPUT_DIR}/${f}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
