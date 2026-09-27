import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../geometry.html", import.meta.url), "utf8");

test("desktop workspace is constrained to one viewport with a flexible 3D stage", () => {
  assert.match(pageSource, /@media \(min-width: 1081px\)/);
  assert.match(pageSource, /height:\s*calc\(100dvh - 56px\)/);
  assert.match(pageSource, /grid-template-rows:\s*52px minmax\(0,\s*1fr\) 48px/);
  assert.match(pageSource, /\.viewport\s*\{[\s\S]*?min-height:\s*0/);
});

test("desktop side panels scroll internally while narrow layouts keep document flow", () => {
  assert.match(pageSource, /\.sidebar,\s*\.controls\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(pageSource, /@media \(max-width: 1080px\)[\s\S]*?min-height:\s*calc\(100vh - 72px\)/);
  assert.match(pageSource, /@media \(max-width: 760px\)/);
});

test("model choices use a compact two-column desktop grid", () => {
  assert.match(pageSource, /\.model-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(pageSource, /\.model-button\s*\{[\s\S]*?padding:\s*9px 10px/);
});
