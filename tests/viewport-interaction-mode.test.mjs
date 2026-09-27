import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createViewportInteractionMode,
  VIEWPORT_INTERACTION_MODES,
} from "../geometry/viewport-interaction-mode.js";

const pageSource = await readFile(new URL("../geometry.html", import.meta.url), "utf8");

test("interaction modes are explicit and orbit is the safe default", () => {
  assert.deepEqual(VIEWPORT_INTERACTION_MODES, ["orbit", "plane"]);
  const state = createViewportInteractionMode();
  assert.deepEqual(state.snapshot(), {
    mode: "orbit",
    dragging: false,
    pointerId: null,
  });
  assert.equal(state.begin(1, 100).accepted, false);
});

test("plane mode tracks one pointer and returns normalized drag distance", () => {
  const state = createViewportInteractionMode();
  assert.equal(state.setMode("plane").changed, true);
  assert.equal(state.begin(7, 100).accepted, true);
  assert.equal(state.begin(8, 100).accepted, false);
  assert.equal(state.move(8, 140, 200).accepted, false);

  const moved = state.move(7, 150, 200);
  assert.equal(moved.accepted, true);
  assert.equal(moved.deltaNormalized, 0.25);
  assert.equal(state.end(7).accepted, true);
  assert.equal(state.snapshot().dragging, false);
});

test("switching back to orbit cancels an active plane drag", () => {
  const state = createViewportInteractionMode("plane");
  state.begin(3, 20);
  const next = state.setMode("orbit");
  assert.equal(next.mode, "orbit");
  assert.equal(next.dragging, false);
  assert.equal(state.move(3, 50, 100).accepted, false);
});

test("invalid modes, pointers and dimensions fail explicitly", () => {
  assert.throws(() => createViewportInteractionMode("both"), /unsupported/);
  const state = createViewportInteractionMode("plane");
  assert.throws(() => state.begin(1.5, 0), /pointerId/);
  state.begin(1, 0);
  assert.throws(() => state.move(1, 2, 0), /viewportHeight/);
  assert.throws(() => state.setMode("none"), /unsupported/);
});

test("page wiring disables orbit controls in plane mode and owns one pointer lifecycle", () => {
  assert.match(pageSource, /data-interaction-mode="orbit"/);
  assert.match(pageSource, /data-interaction-mode="plane"/);
  assert.match(
    pageSource,
    /window\.geometryLab\.controls\.enabled = state\.mode === "orbit"/,
  );
  assert.match(pageSource, /addEventListener\("pointerdown"/);
  assert.match(pageSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(pageSource, /addEventListener\("pointercancel", endPlanePointer\)/);
  assert.match(pageSource, /updateCuttingPlane\(\)/);
});
