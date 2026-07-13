import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Xixi adapter declares live full-stack isolation", () => {
  const adapter = JSON.parse(read(".xixi-dev-system.json"));
  assert.equal(adapter.runtime.updateStrategy, "live-reload");
  assert.deepEqual(adapter.runtime.additionalPortEnvironments, ["API_PORT"]);
  assert.equal(adapter.runtime.dataEnvironment.GONTU_DB_PATH, ".xds/data/{namespace}/gongtu.sqlite");
  assert.match(adapter.runtime.startCommand, /realtime-preview\.mjs/);
  assert.match(adapter.runtime.startCommand, /\{python\}/);
});

test("live preview gates readiness and blocks private paths", () => {
  const source = read("tools/realtime-preview.mjs");
  assert.match(source, /await waitForBackend\(\)/);
  assert.match(source, /isBlockedRequestPath/);
  assert.match(source, /data-xds-live-reload/);
  assert.match(source, /Gongtu backend did not become healthy/);
});

test("primary full-stack pages use the preview origin", () => {
  for (const page of ["index.html", "login.html", "mindmap.html", "shenlun.html"]) {
    assert.match(read(page), /window\.__GONTU_API_BASE__ \|\| location\.origin/);
  }
});
