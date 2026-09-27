import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = file => fs.readFileSync(file, "utf8");
const shell = read("gontu-v3-shell.js");
const verbal = read("verbal-reading-pilot.html");
const quantity = read("quantity-practice.html");
const quantitySingle = read("quantity-single.js");
const coach = read("ai-coach-demo.html");
const mindmap = read("mindmap.html");
const spatialShell = read("spatial-learning-shell.js");
const threeView = read("three-view-training.js");
const shenlun = read("shenlun.html");

test("shared shell builds a contextual AI link from identifiers only", () => {
  assert.match(shell, /context_kind/);
  assert.match(shell, /context_id/);
  assert.match(shell, /return_url/);
  assert.match(shell, /\["activity", "session"\]/);
  assert.match(shell, /\^\[A-Za-z0-9:_-\]/);
  assert.doesNotMatch(shell, /correct_answer|official_analysis|user_answer/);
  assert.match(shell, /data-context-state=\"free\"/);
  assert.match(shell, /训练事实将在 AI 教练中由服务端核验/);
});

test("verbal reading publishes its owned session and exact return route", () => {
  assert.match(verbal, /moduleId: "verbal\.reading"/);
  assert.match(verbal, /contextKind: "session"/);
  assert.match(verbal, /contextId: state\.sessionId/);
  assert.match(verbal, /returnUrl\.searchParams\.set\("session", state\.sessionId\)/);
  assert.match(verbal, /带本套复盘问西西/);
});

test("quantity publishes the unified activity id and resumes from return_url", () => {
  assert.match(quantity, /moduleId:'quantity\.exam'/);
  assert.match(quantity, /contextKind:'activity'/);
  assert.match(quantity, /contextId:`quantity:\$\{state\.session\.id\}`/);
  assert.match(quantity, /new URLSearchParams\(location\.search\)\.get\('session'\)/);
  assert.match(quantity, /await enterSession\(session\)/);
  assert.match(quantity, /url\.searchParams\.delete\('session'\)/);
});

test("quantity single diagnosis publishes its owned activity and exact return route", () => {
  assert.match(quantitySingle, /moduleId:'quantity\.practice'/);
  assert.match(quantitySingle, /contextKind:'activity'/);
  assert.match(quantitySingle, /contextId:`quantity-single:\$\{session\.id\}`/);
  assert.match(quantitySingle, /returnUrl\.searchParams\.set\('session',session\.id\)/);
  assert.match(quantitySingle, /带本题进度问西西/);
  assert.match(quantitySingle, /带本题复盘问西西/);
});

test("AI coach explains pending server verification before creating a thread", () => {
  assert.match(coach, /已携带本次训练引用/);
  assert.match(coach, /网址不传答案/);
  assert.match(coach, /body\.context_ref=ref/);
  assert.match(coach, /return_url:safeReturnUrl\(\)/);
});

test("planar mistakes publish an owned activity and provide an in-modal AI action", () => {
  assert.match(mindmap, /moduleId:'reasoning\.planar'/);
  assert.match(mindmap, /contextId:q\.activity_id/);
  assert.match(mindmap, /带这道错题问西西/);
  assert.match(mindmap, /searchParams\.set\('question',q\.id\)/);
  assert.match(mindmap, /showDetail\(qid\)/);
});

test("spatial pages upgrade a real visit or completion record into AI context", () => {
  assert.match(spatialShell, /moduleId:"reasoning\.spatial"/);
  assert.match(spatialShell, /contextId:record\.activity_id/);
  assert.match(spatialShell, /if\(response\.ok\)publishSpatialCoach\(await response\.json\(\)\)/);
  assert.match(spatialShell, /问西西 · 当前训练/);
  assert.match(threeView, /GontuSpatialCoach\?\.publish\(saved, "带本组三视图复盘问西西"\)/);
});

test("shenlun publishes only a successful grading activity and restores the question", () => {
  assert.match(shenlun, /moduleId:'shenlun\.review'/);
  assert.match(shenlun, /contextKind='activity'/);
  assert.match(shenlun, /publishShenlunCoach\(d\.activityId,d\.questionId\)/);
  assert.match(shenlun, /new URLSearchParams\(location\.search\)\.get\('question'\)/);
  assert.doesNotMatch(shenlun, /publishShenlunCoach\([^)]*studentAnswer/);
});

test("modified inline page scripts still parse", () => {
  for (const [name, html] of [["verbal", verbal], ["quantity", quantity], ["coach", coach], ["mindmap", mindmap], ["shenlun", shenlun]]) {
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
    scripts.forEach((source, index) => assert.doesNotThrow(() => new vm.Script(source, { filename: `${name}-${index}.js` })));
  }
});
