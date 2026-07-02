import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../reasoning-lesson.html", import.meta.url);
const cssUrl = new URL("../reasoning-lesson.css", import.meta.url);

test("student lesson keeps the three products as independent entry points", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /href="\/reasoning-lesson\.html"/);
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
