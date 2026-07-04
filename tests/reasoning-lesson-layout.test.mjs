import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../reasoning-lesson.html", import.meta.url);
const cssUrl = new URL("../reasoning-lesson.css", import.meta.url);
const scriptUrl = new URL("../reasoning-lesson.js", import.meta.url);
const foundationHtmlUrl = new URL("../section-foundation.html", import.meta.url);
const foundationCssUrl = new URL("../section-foundation.css", import.meta.url);
const foundationScriptUrl = new URL("../section-foundation.js", import.meta.url);
const caseUrls = [
  new URL("../data/reasoning-cases/cone-box-001.json", import.meta.url),
  new URL("../data/reasoning-cases/pyramid-cylinder-001.json", import.meta.url),
];

test("student lesson keeps the three products as independent entry points", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /href="\/reasoning-lesson\.html"/);
  assert.match(html, /href="\/section-foundation\.html"/);
  assert.match(html, /href="\/geometry\.html"/);
  assert.match(html, /href="\/csg-section\.html"/);
  assert.doesNotMatch(html, /WASM 状态|三角面数量|模板调试/);
});

test("student lesson has all four same-screen learning regions", async () => {
  const html = await readFile(htmlUrl, "utf8");

  for (const id of [
    "question-heading",
    "option-list",
    "lesson-viewport",
    "foundation-note",
    "constraint-list",
    "verdict-card",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("student lesson exposes deterministic timeline and exploration controls", async () => {
  const html = await readFile(htmlUrl, "utf8");

  for (const id of [
    "previous-step",
    "play-lesson",
    "next-step",
    "reset-view",
    "explore-toggle",
    "plane-position",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("lesson layout has desktop and narrow-screen arrangements", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /\.lesson-shell\s*\{[\s\S]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("constraint teaching prioritizes conflicts and protects the answer", async () => {
  const [script, css] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(script, /orderedIds = \[\.\.\.option\.violates, \.\.\.option\.satisfies\]/);
  assert.match(script, /不满足 · 排除依据/);
  assert.match(script, /满足 · 可行条件/);
  assert.match(script, /state\.machine\?\.answerRevealed/);
  assert.match(css, /\.constraint-summary\.has-conflict/);
  assert.match(css, /\.constraint-summary\.is-consistent/);
});

test("student lesson explains foundation knowledge before rejecting lookalike options", async () => {
  const [script, css] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(script, /FOUNDATION_NOTES/);
  assert.match(script, /单独的正方体或长方体确实可以截出六边形/);
  assert.match(script, /不能说“六边形不可能”/);
  assert.match(script, /foundationNoteCopy/);
  assert.match(css, /\.foundation-note/);
});

test("student lesson shows the original video question frame when available", async () => {
  const [script, css, coneCase] = await Promise.all([
    readFile(scriptUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(caseUrls[0], "utf8"),
  ]);
  const caseData = JSON.parse(coneCase);

  assert.match(caseData.source.image, /cone-box-001-question\.png$/);
  assert.match(script, /source-question-image/);
  assert.match(script, /caseData\.source\.image/);
  assert.match(css, /\.source-figure\.has-image/);
});

test("student lesson maps vertical movement to plane offset and horizontal movement to rotation", async () => {
  const [html, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  assert.match(html, /上下移动 · 左右旋转/);
  assert.match(script, /function moveExplorationPlane/);
  assert.match(script, /function rotateExplorationPlaneBy/);
  assert.match(script, /direction === "up"[\s\S]*moveExplorationPlane/);
  assert.match(script, /direction === "left"[\s\S]*rotateExplorationPlaneBy/);
  assert.match(script, /addEventListener\("wheel"/);
  assert.match(script, /addEventListener\("pointermove"/);
});

test("every golden option has a human-readable constraint path", async () => {
  for (const url of caseUrls) {
    const caseData = JSON.parse(await readFile(url, "utf8"));
    const constraintIds = new Set(caseData.constraints.map(({ id }) => id));
    for (const option of caseData.options) {
      const path = [...option.violates, ...option.satisfies];
      assert.ok(path.length > 0, `${caseData.id}/${option.id} has no path`);
      assert.ok(option.reason.length >= 20, `${caseData.id}/${option.id} reason too short`);
      for (const id of path) {
        assert.ok(constraintIds.has(id), `${caseData.id}/${option.id} unknown ${id}`);
      }
    }
  }
});

test("foundation page lists base solids and demo entry points", async () => {
  const [html, css, script] = await Promise.all([
    readFile(foundationHtmlUrl, "utf8"),
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(html, /id="solid-list"/);
  assert.match(html, /id="knowledge-grid"/);
  assert.match(html, /id="demo-buttons"/);
  assert.match(html, /href="\/reasoning-lesson\.html"/);
  assert.match(css, /\.foundation-shell/);
  for (const word of ["正方体", "长方体", "圆柱", "圆锥", "棱锥"]) {
    assert.match(script, new RegExp(word));
  }
  for (const word of ["六边形", "椭圆", "不能直接截出", "典型切法"]) {
    assert.match(script + html, new RegExp(word));
  }
});

test("foundation page renders every common section as a visual tile", async () => {
  const [css, script] = await Promise.all([
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(script, /sectionTileList/);
  assert.match(script, /section-tile/);
  assert.match(css, /\.section-tile-list/);
  assert.match(css, /\.section-thumb/);
  for (const word of [
    "等边三角形",
    "直角三角形",
    "平行四边形",
    "带弧边截面",
    "斜切必然带曲边",
  ]) {
    assert.match(script, new RegExp(word));
  }
});

test("foundation visual tiles are tied to the current solid", async () => {
  const [css, script] = await Promise.all([
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(script, /SOLID_SECTION_DRAWING/);
  assert.match(script, /drawingForSection\(solidId, item\)/);
  assert.match(script, /"六边形": "cubeHexCut"/);
  assert.match(script, /"椭圆": "cylinderEllipseCut"/);
  assert.match(script, /"矩形": "cylinderRectangleCut"/);
  assert.match(script, /"带弧边截面": "cylinderArcCut"/);
  assert.match(script, /section-line/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(146px, 1fr\)\)/);
});

test("foundation page uses an interactive 3D section viewer", async () => {
  const [html, css, script] = await Promise.all([
    readFile(foundationHtmlUrl, "utf8"),
    readFile(foundationCssUrl, "utf8"),
    readFile(foundationScriptUrl, "utf8"),
  ]);

  assert.match(html, /id="foundation-3d"/);
  assert.match(html, /id="reset-section"/);
  assert.match(html, /id="live-section-svg"/);
  assert.match(html, /id="live-section-verdict"/);
  assert.match(html, /active-cut-card[\s\S]*demo-buttons[\s\S]*demo-stage/);
  assert.match(html, /切法选择/);
  assert.match(html, /"three": "\/node_modules\/three\/build\/three\.module\.js"/);
  assert.match(script, /import \* as THREE from "three"/);
  assert.match(script, /SECTION_3D_PRESETS/);
  assert.match(script, /POSITION_RULES/);
  assert.match(script, /briefPositionRule/);
  assert.match(script, /当前切面位置/);
  assert.match(script, /切面从一个角的附近斜穿到对角附近/);
  assert.match(script, /斜着穿过圆柱侧面/);
  assert.match(script, /切面只削过正方体一个顶角附近的三个面/);
  assert.match(script, /buildViewerScene/);
  assert.match(script, /renderLiveSection/);
  assert.match(script, /liveScaleFactor/);
  assert.match(script, /data-section-label/);
  assert.match(script, /updateSectionOffset/);
  assert.match(script, /addEventListener\("wheel"/);
  assert.match(css, /\.demo-stage-3d canvas/);
  assert.match(css, /\.active-cut-card/);
  assert.match(css, /\.demo-choice-title/);
  assert.match(css, /\.live-section-card/);
  assert.match(css, /\.live-fill/);
  assert.match(css, /cursor: ns-resize/);
});
