import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { orderAndCloseSection } from "../geometry/plane-intersections.js";
import {
  calculateSectionMetrics,
  formatSectionNumber,
} from "../geometry/section-metrics.js";

const Z_ZERO_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

function point(x, y, z = 0) {
  return new THREE.Vector3(x, y, z);
}

test("section metrics calculate edge count, exact area and 3D perimeter", () => {
  const polygon = orderAndCloseSection(
    [point(-2, -1), point(2, -1), point(2, 1), point(-2, 1)],
    Z_ZERO_PLANE,
  );
  const metrics = calculateSectionMetrics(polygon);

  assert.equal(metrics.status, "polygon");
  assert.equal(metrics.edgeCount, 4);
  assert.equal(metrics.area, 8);
  assert.equal(metrics.perimeter, 12);
  assert.deepEqual(metrics.vertices, [
    { x: -2, y: -1, z: 0 },
    { x: 2, y: -1, z: 0 },
    { x: 2, y: 1, z: 0 },
    { x: -2, y: 1, z: 0 },
  ]);
});

test("section metrics preserve ordered vertices on a tilted 3D polygon", () => {
  const normal = new THREE.Vector3(1, 1, 1).normalize();
  const plane = new THREE.Plane(normal, 0);
  const polygon = orderAndCloseSection(
    [point(1, -1, 0), point(0, 1, -1), point(-1, 0, 1)],
    plane,
  );
  const metrics = calculateSectionMetrics(polygon);

  assert.equal(metrics.edgeCount, 3);
  assert.ok(Math.abs(metrics.perimeter - 3 * Math.sqrt(6)) < 1e-9);
  assert.ok(metrics.vertices.every(({ x, y, z }) => (
    Math.abs(plane.distanceToPoint(point(x, y, z))) < 1e-9
  )));
});

test("section metrics return an explicit empty result for invalid polygons", () => {
  assert.deepEqual(calculateSectionMetrics(null), {
    status: "empty",
    edgeCount: 0,
    area: 0,
    perimeter: 0,
    vertices: [],
  });
});

test("section number formatting is stable and removes negative zero", () => {
  assert.equal(formatSectionNumber(Math.PI), "3.142");
  assert.equal(formatSectionNumber(-0.0001), "0.000");
  assert.equal(formatSectionNumber(Number.NaN), "—");
});
