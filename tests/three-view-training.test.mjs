import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as THREE from "three";
import {
  AXIS_INDEX,
  VIEW_CAMERA_POSES,
  VIEW_LABELS,
  VIEW_RULES,
  gridKey,
  validateThreeViewBank,
  validateThreeViewCase,
} from "../three-view-case-engine.js";

const htmlUrl = new URL("../three-view-training.html", import.meta.url);
const cssUrl = new URL("../three-view-training.css", import.meta.url);
const scriptUrl = new URL("../three-view-training.js", import.meta.url);
const bankUrl = new URL("../data/three-view-cases/black-white-blocks-50.json", import.meta.url);
const generatorUrl = new URL("../tools/generate-three-view-bank.mjs", import.meta.url);
const templateUrl = new URL("../data/three-view-cases/technique-template.json", import.meta.url);
const templateDocUrl = new URL("../doc/THREE_VIEW_TEACHING_TEMPLATE.md", import.meta.url);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function semanticToThree(point) {
  const [x, y, z] = point;
  return new THREE.Vector3(1 - x, y - 1, z - 1);
}

function offsetAxis(point, axis, delta) {
  const next = [...point];
  next[AXIS_INDEX[axis]] += delta;
  return next;
}

function makeCamera(pose) {
  const camera = new THREE.PerspectiveCamera(1, 1, 0.1, 1000);
  camera.position.set(...pose.position);
  camera.up.set(...pose.up);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function projectedDelta(pose, axis) {
  const camera = makeCamera(pose);
  const center = [1, 1, 1];
  const projectedCenter = semanticToThree(center).project(camera);
  const projectedOffset = semanticToThree(offsetAxis(center, axis, 0.5)).project(camera);
  return {
    x: projectedOffset.x - projectedCenter.x,
    y: projectedOffset.y - projectedCenter.y,
  };
}

function cameraDistance(pose, point) {
  return new THREE.Vector3(...pose.position).distanceTo(semanticToThree(point));
}

async function readBank() {
  return JSON.parse(await readFile(bankUrl, "utf8"));
}

test("three-view training page exposes the grouped practice flow", async () => {
  const [html, css, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);

  for (const id of [
    "group-select",
    "group-label",
    "progress-label",
    "timer-label",
    "history-label",
    "given-views",
    "target-view-label",
    "option-list",
    "next-question",
    "restart-group",
    "group-result",
    "result-stats",
    "actual-views",
    "three-view-canvas",
    "model-gate",
    "feedback-card",
    "technique-list",
    "option-focus-list",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  for (const viewMode of ["free", "main", "left", "right", "top"]) {
    assert.match(html, new RegExp(`data-view-mode="${viewMode}"`), `missing ${viewMode} camera button`);
  }

  assert.doesNotMatch(html, /id="source-image"/);
  assert.doesNotMatch(html, /题目截图/);
  assert.match(css, /\.training-meta/);
  assert.match(css, /\.group-result/);
  assert.match(css, /body\[data-answered="false"\] \.projection-strip/);
  assert.match(css, /body\[data-answered="false"\] \.model-stage canvas[\s\S]*opacity: 0/);
  assert.match(css, /body\[data-answered="false"\] \.model-badges[\s\S]*display: none/);
  assert.match(css, /body\[data-answered="true"\] \.model-gate/);
  assert.match(css, /\.model-stage[\s\S]*min-height: 300px/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(script, /const BANK_URL = "\/data\/three-view-cases\/black-white-blocks-50\.json"/);
  assert.match(script, /const RECORDS_KEY = "gongtu\.threeViewTraining\.records\.v1"/);
  assert.match(script, /VIEW_CAMERA_POSES/);
  assert.match(script, /1 - x/);
  assert.match(script, /dataset\.cameraPosition/);
  assert.match(script, /validateThreeViewBank/);
  assert.match(script, /function completeGroup/);
  assert.match(script, /function setModelAccess/);
  assert.match(script, /button\.disabled = !isUnlocked/);
  assert.match(script, /setModelAccess\(false\)/);
  assert.match(script, /setModelAccess\(true\)/);
  assert.match(script, /localStorage/);
  assert.match(script, /window\.__threeViewTraining/);
});

test("fixed 3D view cameras use the same orientation as the 2D view grids", () => {
  for (const viewKey of ["main", "left", "right", "top"]) {
    const rule = VIEW_RULES[viewKey];
    const pose = VIEW_CAMERA_POSES[viewKey];
    const horizontal = projectedDelta(pose, rule.horizontalAxis);
    const vertical = projectedDelta(pose, rule.verticalAxis);
    const horizontalSign = rule.horizontalOrder === "low-to-high" ? 1 : -1;
    const verticalSign = rule.verticalOrder === "low-to-high" ? -1 : 1;

    assert.ok(
      horizontal.x * horizontalSign > 0.0001,
      `${VIEW_LABELS[viewKey]} horizontal screen order must match ${rule.horizontalAxis}/${rule.horizontalOrder}`,
    );
    assert.ok(
      vertical.y * verticalSign > 0.0001,
      `${VIEW_LABELS[viewKey]} vertical screen order must match ${rule.verticalAxis}/${rule.verticalOrder}`,
    );

    const lowDepth = [1, 1, 1];
    const highDepth = [1, 1, 1];
    lowDepth[AXIS_INDEX[rule.depthAxis]] = 0;
    highDepth[AXIS_INDEX[rule.depthAxis]] = 2;
    const lowDistance = cameraDistance(pose, lowDepth);
    const highDistance = cameraDistance(pose, highDepth);
    if (rule.depthOrder === "low-to-high") {
      assert.ok(lowDistance < highDistance, `${VIEW_LABELS[viewKey]} should see low ${rule.depthAxis} first`);
    } else {
      assert.ok(highDistance < lowDistance, `${VIEW_LABELS[viewKey]} should see high ${rule.depthAxis} first`);
    }
  }
});

test("black-white block bank has 50 verified cases in ten five-question groups", async () => {
  const bank = await readBank();
  const validation = validateThreeViewBank(bank);

  assert.equal(bank.id, "black-white-blocks-50");
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(bank.cases.length, 50);
  assert.equal(bank.cases.filter((caseData) => caseData.status === "verified").length, 50);
  assert.equal(bank.groups.length, 10);
  assert.equal(bank.sourceSamples.length, 15);

  for (const group of bank.groups) {
    assert.equal(group.caseIds.length, 5, `${group.id} should contain five cases`);
  }

  const groupedCaseIds = new Set(bank.groups.flatMap((group) => group.caseIds));
  assert.equal(groupedCaseIds.size, 50);
  for (const caseData of bank.cases) {
    assert.ok(groupedCaseIds.has(caseData.id), `${caseData.id} is missing from a group`);
  }

  for (const sample of bank.sourceSamples) {
    assert.equal(sample.status, "reference-screenshot");
    await access(new URL(`..${sample.image}`, import.meta.url));
  }
});

test("each case projects to its given views and has exactly one correct option", async () => {
  const bank = await readBank();
  const targetViewKeys = new Set();
  const givenPairs = new Set();

  for (const caseData of bank.cases) {
    const validation = validateThreeViewCase(caseData);
    assert.equal(validation.ok, true, `${caseData.id}: ${validation.errors.join("；")}`);
    assert.equal(caseData.options.length, 4, `${caseData.id} should have A-D options`);
    assert.deepEqual(caseData.options.map((option) => option.id), ["A", "B", "C", "D"]);
    assert.equal(caseData.blocks.length, caseData.counts.total);
    assert.equal(caseData.counts.black + caseData.counts.white, caseData.counts.total);

    for (const viewKey of caseData.givenViewKeys) {
      assert.deepEqual(
        validation.projected[viewKey],
        caseData.givenViews[viewKey],
        `${caseData.id} ${VIEW_LABELS[viewKey]} does not match the model`,
      );
    }

    const targetGrid = validation.projected[caseData.targetViewKey];
    const matchingOptions = caseData.options.filter((option) => gridKey(option.grid) === gridKey(targetGrid));
    assert.equal(matchingOptions.length, 1, `${caseData.id} should have one unique answer`);
    assert.equal(matchingOptions[0].id, caseData.answer, `${caseData.id} answer id mismatch`);

    targetViewKeys.add(caseData.targetViewKey);
    givenPairs.add(caseData.givenViewKeys.join("+"));
  }

  assert.deepEqual([...targetViewKeys].sort(), ["left", "main", "right"]);
  assert.ok(givenPairs.has("main+top"));
  assert.ok(givenPairs.has("top+left"));
  assert.ok(givenPairs.has("top+right"));
});

test("teaching copy uses exam reasoning and option differences", async () => {
  const [bank, template, templateDoc] = await Promise.all([
    readBank(),
    readFile(templateUrl, "utf8").then(JSON.parse),
    readFile(templateDocUrl, "utf8"),
  ]);

  for (const key of ["teaching.short", "teaching.steps", "teaching.optionFocus"]) {
    assert.ok(template.requiredFields[key], `${key} is missing from template`);
  }
  assert.match(template.stepPattern.join(" "), /数.*锁.*挡.*比.*验/);
  assert.match(templateDoc, /数：先看题目一共几个黑块/);
  assert.match(templateDoc, /不写“根据正交投影定理可知”/);

  for (const caseData of bank.cases) {
    const copy = [
      caseData.teaching.short,
      ...caseData.teaching.steps,
      ...caseData.teaching.optionFocus,
    ].join(" ");

    assert.match(copy, /黑块|黑格/, `${caseData.id} should mention black blocks`);
    assert.match(copy, /白块|白格|挡住/, `${caseData.id} should use visible exam language`);
    assert.match(copy, /选项|A|B|C|D/, `${caseData.id} should compare options`);
    assert.doesNotMatch(copy, /正交投影定理|空间直角坐标系|坐标轴投影公式/);
    assert.equal(caseData.teaching.optionFocus.length, 4);
  }
});

test("bank generator reproduces the checked-in 50-question bank", async () => {
  const before = await readFile(bankUrl, "utf8");
  const output = execFileSync(process.execPath, [fileURLToPath(generatorUrl)], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const after = await readFile(bankUrl, "utf8");

  assert.match(output, /wrote .*black-white-blocks-50\.json/);
  assert.equal(after, before, "generator output should be deterministic");
  assert.equal(validateThreeViewBank(JSON.parse(after)).ok, true);
});
