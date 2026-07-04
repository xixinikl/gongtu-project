import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../three-view-training.html", import.meta.url);
const cssUrl = new URL("../three-view-training.css", import.meta.url);
const scriptUrl = new URL("../three-view-training.js", import.meta.url);
const caseUrl = new URL("../data/three-view-cases/black-white-blocks-001.json", import.meta.url);
const templateUrl = new URL("../data/three-view-cases/technique-template.json", import.meta.url);
const templateDocUrl = new URL("../doc/THREE_VIEW_TEACHING_TEMPLATE.md", import.meta.url);

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

function orderedValues(order) {
  if (order === "low-to-high") return [0, 1, 2];
  if (order === "high-to-low") return [2, 1, 0];
  throw new RangeError(`unknown order ${order}`);
}

function axisValue(block, axis) {
  return block.position[AXIS_INDEX[axis]];
}

function projectView(blocks, rule) {
  const horizontalValues = orderedValues(rule.horizontalOrder);
  const verticalValues = orderedValues(rule.verticalOrder);
  const depthValues = orderedValues(rule.depthOrder);

  return verticalValues.map((verticalValue) => (
    horizontalValues.map((horizontalValue) => {
      for (const depthValue of depthValues) {
        const visible = blocks.find((block) => (
          axisValue(block, rule.horizontalAxis) === horizontalValue
          && axisValue(block, rule.verticalAxis) === verticalValue
          && axisValue(block, rule.depthAxis) === depthValue
        ));
        if (visible) return visible.color;
      }
      return null;
    })
  ));
}

test("three-view training page exposes the complete practice flow", async () => {
  const [html, css, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  for (const id of [
    "left-view-grid",
    "top-view-grid",
    "option-list",
    "three-view-canvas",
    "actual-main-grid",
    "actual-left-grid",
    "actual-top-grid",
    "feedback-card",
    "technique-list",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /href="\/three-view-training\.html"/);
  assert.match(html, /href="\/reasoning-lesson\.html"/);
  assert.match(html, /href="\/section-foundation\.html"/);
  assert.match(html, /data-view-mode="main"/);
  assert.match(html, /data-view-mode="left"/);
  assert.match(html, /data-view-mode="top"/);
  assert.match(css, /\.model-stage canvas/);
  assert.match(css, /\.option-card\.is-correct/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(script, /import \* as THREE from "three"/);
  assert.match(script, /OrbitControls/);
  assert.match(script, /function renderModel/);
  assert.match(script, /function selectOption/);
  assert.match(script, /window\.__threeViewTraining/);
});

test("black-white block case has verified counts and source image", async () => {
  const caseData = JSON.parse(await readFile(caseUrl, "utf8"));
  const sourceImage = await readFile(new URL(`..${caseData.source.image}`, import.meta.url));

  assert.equal(caseData.id, "black-white-blocks-001");
  assert.equal(caseData.answer, "C");
  assert.equal(caseData.blocks.length, 18);
  assert.equal(caseData.blocks.filter((block) => block.color === "black").length, 3);
  assert.equal(caseData.blocks.filter((block) => block.color === "white").length, 15);
  assert.ok(sourceImage.byteLength > 1000);

  const uniquePositions = new Set(caseData.blocks.map((block) => block.position.join(",")));
  assert.equal(uniquePositions.size, caseData.blocks.length);
});

test("three-view model projections match the given views and correct option", async () => {
  const caseData = JSON.parse(await readFile(caseUrl, "utf8"));

  assert.deepEqual(
    projectView(caseData.blocks, caseData.viewRules.left),
    caseData.givenViews.left,
  );
  assert.deepEqual(
    projectView(caseData.blocks, caseData.viewRules.top),
    caseData.givenViews.top,
  );
  assert.deepEqual(
    projectView(caseData.blocks, caseData.viewRules.main),
    caseData.targetViews.main,
  );

  const answerOption = caseData.options.find((option) => option.id === caseData.answer);
  assert.ok(answerOption);
  assert.deepEqual(answerOption.grid, caseData.targetViews.main);
});

test("three-view teaching copy uses exam reasoning instead of theorem wording", async () => {
  const [caseData, script] = await Promise.all([
    readFile(caseUrl, "utf8").then(JSON.parse),
    readFile(scriptUrl, "utf8"),
  ]);

  assert.match(caseData.teaching.short, /先数黑块/);
  assert.match(caseData.teaching.steps.join(" "), /最前面/);
  assert.match(caseData.teaching.steps.join(" "), /挡住/);
  assert.match(caseData.teaching.optionFocus.join(" "), /选项差异|少一格|黑块/);
  assert.match(script, /validateThreeViewCase/);
  assert.match(script, /模型主视图与正确答案不一致/);
  assert.doesNotMatch(caseData.teaching.steps.join(" "), /正交投影定理|空间直角坐标系/);
});

test("three-view technique template is present and enforced by the first case", async () => {
  const [caseData, template, templateDoc, html, script] = await Promise.all([
    readFile(caseUrl, "utf8").then(JSON.parse),
    readFile(templateUrl, "utf8").then(JSON.parse),
    readFile(templateDocUrl, "utf8"),
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  for (const key of ["teaching.short", "teaching.steps", "teaching.optionFocus"]) {
    assert.ok(template.requiredFields[key], `${key} is missing from template`);
  }
  assert.match(template.stepPattern.join(" "), /数.*锁.*挡.*比.*验/);
  assert.match(templateDoc, /数：先看题目一共几个黑块/);
  assert.match(templateDoc, /不写“根据正交投影定理可知”/);

  assert.ok(caseData.teaching.short.length >= 8);
  assert.ok(caseData.teaching.steps.length >= 3);
  assert.ok(caseData.teaching.optionFocus.length >= 4);
  assert.match(caseData.teaching.steps.join(" "), /黑块|白块/);
  assert.match(caseData.teaching.steps.join(" "), /层|排|前面|侧边|位置/);

  assert.match(html, /id="short-tip"/);
  assert.match(html, /id="technique-list"/);
  assert.match(html, /id="option-focus-list"/);
  assert.match(script, /function renderTeaching/);
});
