import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sceneSource = await readFile(new URL("../geometry/scene.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../geometry.html", import.meta.url), "utf8");

test("viewport leaves wheel scrolling to the page while preserving orbit controls", () => {
  assert.match(sceneSource, /controls\.enableZoom = false;/);
  assert.match(sceneSource, /controls\.addEventListener\("change", updateCameraState\);/);
  assert.doesNotMatch(sceneSource, /addEventListener\(\s*["']wheel["']/);
});

test("viewport exposes explicit button zoom in both directions", () => {
  assert.match(pageSource, /aria-label="放大三维视图"/);
  assert.match(pageSource, /aria-label="缩小三维视图"/);
  assert.match(sceneSource, /zoomInButton\?\.addEventListener\("click", zoomIn\);/);
  assert.match(sceneSource, /zoomOutButton\?\.addEventListener\("click", zoomOut\);/);
  assert.match(sceneSource, /THREE\.MathUtils\.clamp\(/);
});
