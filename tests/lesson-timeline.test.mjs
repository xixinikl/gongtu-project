import assert from "node:assert/strict";
import test from "node:test";
import {
  easeInOutCubic,
  interpolateTeachingFrame,
  transitionProgress,
} from "../geometry/lesson-timeline.js";

const start = {
  camera: { position: [0, 2, 4], target: [0, 0, 0] },
  plane: { normal: [1, 0, 0], constant: 0 },
};
const end = {
  camera: { position: [4, 6, 8], target: [1, 2, 3] },
  plane: { normal: [0, 0, 1], constant: 2 },
};

test("timeline easing keeps exact endpoints", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(-3), 0);
  assert.equal(easeInOutCubic(3), 1);
});

test("teaching interpolation returns exact camera and plane endpoints", () => {
  const first = interpolateTeachingFrame(start, end, 0);
  const last = interpolateTeachingFrame(start, end, 1);

  assert.deepEqual(first.camera, start.camera);
  assert.deepEqual(first.plane, start.plane);
  assert.deepEqual(last.camera, end.camera);
  assert.deepEqual(last.plane, end.plane);
});

test("teaching interpolation normalizes the plane throughout motion", () => {
  const middle = interpolateTeachingFrame(start, end, 0.5);
  assert.deepEqual(middle.camera.position, [2, 4, 6]);
  assert.deepEqual(middle.camera.target, [0.5, 1, 1.5]);
  assert.ok(Math.abs(Math.hypot(...middle.plane.normal) - 1) < 1e-12);
  assert.equal(middle.plane.constant, 1);
});

test("a missing plane switches at the midpoint without invalid normals", () => {
  const overview = { camera: start.camera, plane: null };
  assert.equal(interpolateTeachingFrame(overview, end, 0.49).plane, null);
  assert.deepEqual(
    interpolateTeachingFrame(overview, end, 0.5).plane,
    end.plane,
  );
});

test("timeline clock clamps before and after its duration", () => {
  assert.equal(transitionProgress(100, 50, 800), 0);
  assert.equal(transitionProgress(100, 500, 800), 0.5);
  assert.equal(transitionProgress(100, 1000, 800), 1);
  assert.equal(transitionProgress(100, 100, 0), 1);
});
