import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createBlockAssembly } from "../geometry/block-assembly.js";
import {
  computeSectionV2,
  toSectionVisualV2Data,
} from "../geometry/section-engine-v2.js";
import { createSectionVisualV2 } from "../geometry/section-visual-v2.js";
import { sectionV2Fixtures } from "./fixtures/section-v2-fixtures.mjs";

function planeAt(normal, offset) {
  return new THREE.Plane(normal.clone().normalize(), -offset);
}

function runSequence(root, normal, offsets) {
  return offsets.map((offset) => computeSectionV2(root, planeAt(normal, offset)));
}

test("horizontal cube sweep enters, stays visible, and leaves without an invalid frame", () => {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const offsets = [-0.6, -0.5, -0.49, -0.25, 0, 0.25, 0.49, 0.5, 0.6];
  const results = runSequence(cube, new THREE.Vector3(0, 1, 0), offsets);

  assert.deepEqual(
    results.map(({ status }) => status),
    ["empty", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "empty"],
  );
  results.slice(1, -1).forEach((result) => {
    assert.equal(result.contourCount, 1);
    assert.ok(Math.abs(result.area - 1) < 1e-6);
  });
});

test("oblique cube sweep has no error or empty frame strictly inside its support", () => {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const normal = new THREE.Vector3(1, 1, 1).normalize();
  const offsets = [-1, -0.85, -0.6, -0.3, 0, 0.3, 0.6, 0.85, 1];
  const results = runSequence(cube, normal, offsets);

  assert.equal(results[0].status, "empty");
  assert.equal(results.at(-1).status, "empty");
  results.slice(1, -1).forEach((result, index) => {
    assert.equal(result.status, "ok", `inside frame ${index} must be visible`);
    assert.equal(result.contourCount, 1);
    assert.ok(result.area > 0);
  });
});

test("18-block staircase remains a concave area at every depth boundary", () => {
  const fixture = sectionV2Fixtures.find(
    ({ id }) => id === "eighteen-block-three-step-staircase",
  );
  const staircase = createBlockAssembly(fixture.model.blocks);
  const offsets = [-0.01, 0, 0.01, 0.5, 0.99, 1, 1.01, 1.5, 1.99, 2, 2.01, 2.99, 3, 3.01];
  const results = runSequence(staircase, new THREE.Vector3(0, 0, 1), offsets);

  assert.equal(results[0].status, "empty");
  assert.equal(results.at(-1).status, "empty");
  results.slice(1, -1).forEach((result, index) => {
    assert.equal(result.status, "ok", `staircase frame ${index} must be visible`);
    assert.equal(result.contourCount, 1);
    assert.equal(result.contours[0].points.length, 8);
    assert.ok(Math.abs(result.area - 6) < 1e-6);
  });
});

test("production visual reuses GPU geometries and clears all draw ranges after exit", () => {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const visual = createSectionVisualV2();
  const fillGeometry = visual.fill.geometry;
  const outlineGeometry = visual.outline.geometry;
  const offsets = [0, 0.1, 0.2, 0.3, 0.4, 0.49, 0.6, 0.7];
  const results = runSequence(cube, new THREE.Vector3(0, 1, 0), offsets);

  results.forEach((result) => visual.update(toSectionVisualV2Data(result)));

  assert.equal(visual.fill.geometry, fillGeometry);
  assert.equal(visual.outline.geometry, outlineGeometry);
  assert.equal(visual.group.userData.reallocations, 3);
  assert.equal(visual.group.visible, false);
  assert.equal(visual.fill.geometry.drawRange.count, 0);
  assert.equal(visual.outline.geometry.drawRange.count, 0);
  assert.equal(visual.group.userData.hides, 1);
  visual.dispose();
});

test("identical continuous frames do not rewrite GPU attributes", () => {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const result = computeSectionV2(cube, planeAt(new THREE.Vector3(0, 1, 0), 0));
  const data = toSectionVisualV2Data(result);
  const visual = createSectionVisualV2();

  assert.equal(visual.update(data), true);
  const positionVersion = visual.fill.geometry.getAttribute("position").version;
  const indexVersion = visual.fill.geometry.getIndex().version;
  assert.equal(visual.update(data), false);
  assert.equal(visual.fill.geometry.getAttribute("position").version, positionVersion);
  assert.equal(visual.fill.geometry.getIndex().version, indexVersion);
  assert.equal(visual.group.userData.skipped, 1);
  visual.dispose();
});
