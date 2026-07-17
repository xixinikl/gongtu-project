import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const shellScript = fs.readFileSync("gontu-v3-shell.js", "utf8");
const shellCss = fs.readFileSync("gontu-v3-shell.css", "utf8");

const formalPages = [
  "verbal-reading-pilot.html",
  "quantity-practice.html",
  "quantity-single.html",
  "quantity-topics.html",
  "quantity-review.html"
];

const spatialPages = [
  "section-foundation.html",
  "three-view-training.html",
  "geometry.html",
  "csg-section.html"
];

test("shared V3 shell script parses", () => {
  assert.doesNotThrow(() => new vm.Script(shellScript, { filename: "gontu-v3-shell.js" }));
});

test("all formal specialist pages load the shared V3 shell", () => {
  for (const file of formalPages) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /gontu-v3-shell\.css/, `${file} is missing the V3 shell stylesheet`);
    assert.match(html, /gontu-v3-shell\.js/, `${file} is missing the V3 shell script`);
  }
});

test("spatial workspaces load their compact stage shell without nested product chrome", () => {
  for (const file of spatialPages) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /spatial-learning-shell\.css/, `${file} is missing the spatial shell stylesheet`);
    assert.match(html, /spatial-learning-shell\.js/, `${file} is missing the spatial shell script`);
    assert.doesNotMatch(html, /gontu-v3-shell\.(?:css|js)/, `${file} still nests the global product shell`);
  }
});

test("shenlun keeps its own workspace chrome with one direct return instead of a nested product shell", () => {
  const html = fs.readFileSync("shenlun.html", "utf8");
  assert.doesNotMatch(html, /gontu-v3-shell\.(?:css|js)/);
  assert.match(html, /class="back-btn"/);
  assert.match(html, />\s*返回\s*</);
});

test("AI coach uses one compact self-contained shell instead of nested product chrome", () => {
  const html = fs.readFileSync("ai-coach-demo.html", "utf8");
  assert.doesNotMatch(html, /gontu-v3-shell\.(?:css|js)/);
  assert.match(html, /id="returnLink"/);
  assert.match(html, /← 返回原训练/);
});

test("main navigation exposes every promised product area", () => {
  for (const marker of ["言语", "数量关系", "图形推理", "申论批改", "AI 教练"]) {
    assert.ok(shellScript.includes(marker), `missing primary navigation marker: ${marker}`);
  }
  assert.match(shellScript, /dataset\.productShell = "gongtu-unified-v3"/);
  assert.match(shellScript, /aria-label="公途主导航"/);
});

test("quantity navigation exposes the five approved functional labels", () => {
  for (const marker of ["今日训练", "单题诊断", "套题策略", "系统学题型", "我的复盘"]) {
    assert.ok(shellScript.includes(marker), `missing quantity function: ${marker}`);
  }
  assert.match(shellScript, /quantity-single\.html/);
  assert.match(shellScript, /quantity-topics\.html/);
  assert.match(shellScript, /quantity-review\.html/);
});

test("spatial learning path is visible in the shared context navigation", () => {
  for (const marker of ["基础截面", "三视图训练", "自由切面", "组合体切割"]) {
    assert.ok(shellScript.includes(marker), `missing spatial path: ${marker}`);
  }
  assert.match(shellCss, /\.gontu-v3-contextbar\s*\{[\s\S]*flex-wrap:/);
  assert.doesNotMatch(shellCss, /\.gontu-v3-contextbar\s*\{[^}]*overflow-x\s*:\s*auto/);
});

test("mobile navigation uses a disclosed menu and wrapped context links", () => {
  assert.match(shellScript, /aria-expanded="false"/);
  assert.match(shellScript, /打开学习导航/);
  assert.match(shellCss, /data-menu-open="true"/);
  assert.match(shellCss, /@media \(max-width: 520px\)[\s\S]*flex-basis: calc\(50% - 5px\)/);
  assert.match(shellCss, /data-gontu-area="reasoning"[\s\S]*flex-basis: calc\(33\.333% - 5px\)/);
  assert.match(shellScript, /ResizeObserver/);
  assert.match(shellScript, /--gontu-v3-shell-height/);
});

test("legacy spatial navigation is retired when the real shell is active", () => {
  assert.match(shellCss, /body\.gontu-v3-shell-active \.spatial-module-nav/);
  assert.match(shellCss, /display: none !important/);
  assert.match(shellCss, /padding-top: var\(--gontu-v3-shell-height\) !important/);
});
