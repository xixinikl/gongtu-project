import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createSectionVisualV2 } from "../geometry/section-visual-v2.js";

function v(x, y, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function squareData(offset = 0) {
  const points = [
    v(offset, 0),
    v(offset + 1, 0),
    v(offset + 1, 1),
    v(offset, 1),
  ];
  return {
    status: "ok",
    vertices3D: points,
    indices: [0, 1, 2, 0, 2, 3],
    contours: [{ points }],
  };
}

function twoRegionData() {
  const first = [v(0, 0), v(1, 0), v(1, 1), v(0, 1)];
  const second = [v(3, 0), v(5, 0), v(5, 1), v(3, 1)];
  return {
    status: "ok",
    vertices3D: [...first, ...second],
    indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
    contours: [{ points: first }, { points: second }],
  };
}

const EMPTY = {
  status: "ok",
  vertices3D: [],
  indices: [],
  contours: [],
};

test("visual starts hidden with persistent fill and outline geometries", () => {
  const visual = createSectionVisualV2();
  assert.equal(visual.group.visible, false);
  assert.equal(visual.group.userData.status, "empty");
  assert.ok(visual.fill.geometry.isBufferGeometry);
  assert.ok(visual.outline.isLineSegments);
  visual.dispose();
});

test("valid data updates fill and closes every contour as line segments", () => {
  const visual = createSectionVisualV2();
  assert.equal(visual.update(twoRegionData()), true);
  assert.equal(visual.group.visible, true);
  assert.equal(visual.fill.geometry.drawRange.count, 12);
  assert.equal(visual.outline.geometry.drawRange.count, 16);
  assert.equal(visual.group.userData.contourCount, 2);
  assert.equal(visual.group.userData.updates, 1);
  visual.dispose();
});

test("BufferGeometry instances survive repeated updates", () => {
  const visual = createSectionVisualV2();
  const fillGeometry = visual.fill.geometry;
  const outlineGeometry = visual.outline.geometry;
  visual.update(squareData());
  visual.update(squareData(2));
  assert.equal(visual.fill.geometry, fillGeometry);
  assert.equal(visual.outline.geometry, outlineGeometry);
  assert.equal(visual.group.userData.updates, 2);
  visual.dispose();
});

test("same data skips attribute and GPU version changes", () => {
  const visual = createSectionVisualV2();
  const data = squareData();
  visual.update(data);
  const fillVersion = visual.fill.geometry.getAttribute("position").version;
  const indexVersion = visual.fill.geometry.getIndex().version;
  const outlineVersion = visual.outline.geometry.getAttribute("position").version;

  assert.equal(visual.update(squareData()), false);
  assert.equal(visual.fill.geometry.getAttribute("position").version, fillVersion);
  assert.equal(visual.fill.geometry.getIndex().version, indexVersion);
  assert.equal(visual.outline.geometry.getAttribute("position").version, outlineVersion);
  assert.equal(visual.group.userData.skipped, 1);
  visual.dispose();
});

test("capacity is reused when a later update fits existing buffers", () => {
  const visual = createSectionVisualV2();
  visual.update(twoRegionData());
  const fillArray = visual.fill.geometry.getAttribute("position").array;
  const indexArray = visual.fill.geometry.getIndex().array;
  const outlineArray = visual.outline.geometry.getAttribute("position").array;
  const reallocations = visual.group.userData.reallocations;

  visual.update(squareData());
  assert.equal(visual.fill.geometry.getAttribute("position").array, fillArray);
  assert.equal(visual.fill.geometry.getIndex().array, indexArray);
  assert.equal(visual.outline.geometry.getAttribute("position").array, outlineArray);
  assert.equal(visual.group.userData.reallocations, reallocations);
  visual.dispose();
});

test("empty data hides once and repeated empty data is skipped", () => {
  const visual = createSectionVisualV2();
  visual.update(squareData());
  assert.equal(visual.update(EMPTY), true);
  assert.equal(visual.group.visible, false);
  assert.equal(visual.group.userData.hides, 1);
  assert.equal(visual.update(EMPTY), false);
  assert.equal(visual.group.userData.hides, 1);
  assert.equal(visual.group.userData.skipped, 1);
  visual.dispose();
});

test("invalid data is rejected before visible geometry changes", () => {
  const visual = createSectionVisualV2();
  visual.update(squareData());
  const position = visual.fill.geometry.getAttribute("position");
  const positionVersion = position.version;
  const drawCount = visual.fill.geometry.drawRange.count;

  assert.throws(
    () => visual.update({
      status: "ok",
      vertices3D: [v(0, 0)],
      indices: [0, 1, 2],
      contours: [],
    }),
    /outside vertices3D/,
  );
  assert.equal(visual.group.visible, true);
  assert.equal(visual.fill.geometry.getAttribute("position"), position);
  assert.equal(position.version, positionVersion);
  assert.equal(visual.fill.geometry.drawRange.count, drawCount);
  visual.dispose();
});

test("malformed status, points, indices and contours fail explicitly", () => {
  const visual = createSectionVisualV2();
  assert.throws(() => visual.update({ status: "error" }), /status="ok"/);
  assert.throws(
    () => visual.update({
      status: "ok",
      vertices3D: [new THREE.Vector3(Number.NaN, 0, 0)],
      indices: [],
      contours: [],
    }),
    /finite THREE.Vector3/,
  );
  assert.throws(
    () => visual.update({
      status: "ok",
      vertices3D: [v(0, 0), v(1, 0), v(0, 1)],
      indices: [0, 1],
      contours: [],
    }),
    /divisible by 3/,
  );
  assert.throws(
    () => visual.update({
      status: "ok",
      vertices3D: [v(0, 0), v(1, 0), v(0, 1)],
      indices: [0, 1, 2],
      contours: [{ points: [v(0, 0), v(1, 0)] }],
    }),
    /at least 3 points/,
  );
  visual.dispose();
});

test("dispose is idempotent and blocks later mutation", () => {
  const visual = createSectionVisualV2();
  visual.update(squareData());
  assert.equal(visual.dispose(), true);
  assert.equal(visual.dispose(), false);
  assert.equal(visual.disposed, true);
  assert.throws(() => visual.update(squareData()), /disposed/);
  assert.throws(() => visual.clear(), /disposed/);
});
