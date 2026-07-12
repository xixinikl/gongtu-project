import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("catalog defines the ordered four-stage main path", async () => {
  const catalog = JSON.parse(await read("data/spatial-learning-modules.json"));
  assert.deepEqual(catalog.modules.map((x) => x.id), ["foundation", "three-view", "free-cut", "csg"]);
  assert.equal(catalog.modules.filter((x) => x.scored).length, 1);
  assert.equal(catalog.modules.find((x) => x.scored).id, "three-view");
});

test("four professional pages use the shared shell without replacing their layouts", async () => {
  const pages = {"section-foundation.html":"foundation", "three-view-training.html":"three-view", "geometry.html":"free-cut", "csg-section.html":"csg"};
  for (const [file, id] of Object.entries(pages)) {
    const html = await read(file);
    assert.match(html, new RegExp(`data-spatial-module="${id}"`));
    assert.match(html, /spatial-learning-shell\.css/);
    assert.match(html, /spatial-learning-shell\.js/);
    assert.match(html, /gontu-auth-client\.js/);
  }
});

test("dynamic reasoning lesson is a deep link, not a fixed catalog item", async () => {
  const catalog = await read("data/spatial-learning-modules.json");
  const lesson = await read("reasoning-lesson.html");
  assert.doesNotMatch(catalog, /reasoning-lesson/);
  assert.match(lesson, /href="\/spatial-learning\.html" aria-label="返回立体图推学习中心"/);
});

test("learning center uses JWT-owned overview for continue learning", async () => {
  const center = await read("spatial-learning.html");
  assert.match(center, /gontu-auth-client\.js/);
  assert.match(center, /\/api\/spatial-learning\/overview/);
  assert.match(center, /await response\.json\(\)/);
  assert.match(center, /overview\.completed_count/);
});

test("three-view completion sends truthful score and experiments are unscored", async () => {
  const training = await read("three-view-training.js");
  const shell = await read("spatial-learning-shell.js");
  assert.match(training, /activity_kind: "three_view_group"/);
  assert.match(training, /score: record\.correct/);
  assert.match(training, /loadAccountRecords/);
  assert.match(training, /state\.accountRecords/);
  assert.match(shell, /activity_kind:"visit"/);
  assert.match(shell, /activity_kind:"task"/);
  assert.match(shell, /完成本阶段学习/);
  assert.doesNotMatch(shell, /score:/);
});
