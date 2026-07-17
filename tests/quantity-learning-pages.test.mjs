import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("single diagnosis is a standalone one-question evidence loop", () => {
  const html = read("quantity-single.html");
  const js = read("quantity-single.js");
  for (const marker of ["一道题，完整走一遍", "写下你的关键思路或算式", "提交这一题"]) {
    assert.ok(html.includes(marker), `missing single diagnosis copy: ${marker}`);
  }
  assert.match(js, /\/api\/quantity\/single-sessions/);
  assert.match(js, /stuck_step/);
  assert.match(js, /work_note/);
  assert.match(js, /moduleId:'quantity\.practice'/);
  assert.match(js, /contextId:`quantity-single:\$\{session\.id\}`/);
  assert.match(js, /returnUrl\.searchParams\.set\('session',session\.id\)/);
  assert.match(js, /带本题复盘问西西/);
  assert.doesNotMatch(js, /\/api\/quantity\/sessions\b/);
  assert.doesNotThrow(() => new vm.Script(js, { filename: "quantity-single.js" }));
});

test("topic learning uses real topic value, time and same-topic routing", () => {
  const html = read("quantity-topics.html");
  const js = read("quantity-topics.js");
  assert.match(html, /必做 \/ 可做 \/ 先跳/);
  assert.match(js, /priority/);
  assert.match(js, /recommended_seconds/);
  assert.match(js, /quantity-single\.html\?topic=/);
  assert.doesNotThrow(() => new vm.Script(js, { filename: "quantity-topics.js" }));
});

test("review is evidence based and offers an executable next step", () => {
  const html = read("quantity-review.html");
  const js = read("quantity-review.js");
  assert.match(html, /下一步/);
  assert.match(js, /\/api\/quantity\/review-summary/);
  assert.match(js, /现在开始下一题/);
  assert.match(js, /还没有单题记录/);
  assert.doesNotThrow(() => new vm.Script(js, { filename: "quantity-review.js" }));
});
