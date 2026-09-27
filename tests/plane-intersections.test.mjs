import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createCube } from "../geometry/box-generator.js";
import {
  collectWorldEdges,
  intersectEdgesWithPlane,
  intersectSegmentWithPlane,
  orderAndCloseSection,
} from "../geometry/plane-intersections.js";
import { createSectionVisual } from "../geometry/section-visual.js";
import { createCutawayVisual } from "../geometry/cutaway-visual.js";
import { projectSectionTo2D, svgPointString } from "../geometry/section-2d.js";

const X_ZERO_PLANE = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

function vector(x, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function roundedPoint(point) {
  return point.toArray().map((value) => Math.round(value * 1e9) / 1e9);
}

test("segment crossing returns the interpolated point", () => {
  const result = intersectSegmentWithPlane(
    vector(-2, 1, 0),
    vector(1, 1, 0),
    X_ZERO_PLANE,
  );
  assert.equal(result.status, "crossing");
  assert.deepEqual(roundedPoint(result.point), [0, 1, 0]);
  assert.equal(result.interpolation, 2 / 3);
});

test("segment on one side does not intersect", () => {
  const result = intersectSegmentWithPlane(vector(0.1), vector(2), X_ZERO_PLANE);
  assert.equal(result.status, "none");
});

test("endpoint on the plane is returned exactly once", () => {
  const result = intersectSegmentWithPlane(vector(0), vector(2), X_ZERO_PLANE);
  assert.equal(result.status, "endpoint");
  assert.deepEqual(roundedPoint(result.point), [0, 0, 0]);
});

test("coplanar segment preserves both endpoints", () => {
  const result = intersectSegmentWithPlane(
    vector(0, -1, 0),
    vector(0, 1, 0),
    X_ZERO_PLANE,
  );
  assert.equal(result.status, "coplanar");
  assert.deepEqual(result.points.map(roundedPoint), [
    [0, -1, 0],
    [0, 1, 0],
  ]);
});

test("near-plane endpoint respects the configured tolerance", () => {
  const result = intersectSegmentWithPlane(
    vector(5e-8),
    vector(1),
    X_ZERO_PLANE,
    { epsilon: 1e-7 },
  );
  assert.equal(result.status, "endpoint");
});

test("batch intersection deduplicates shared vertex hits", () => {
  const shared = vector(0, 0, 0);
  const result = intersectEdgesWithPlane(
    [
      [shared, vector(1, 0, 0)],
      [shared, vector(1, 1, 0)],
      [vector(-1, 0, 0), vector(1, 0, 0)],
    ],
    X_ZERO_PLANE,
  );
  assert.equal(result.hits.length, 3);
  assert.equal(result.points.length, 1);
  assert.deepEqual(roundedPoint(result.points[0]), [0, 0, 0]);
});

test("batch intersection reports coplanar edges separately", () => {
  const result = intersectEdgesWithPlane(
    [
      [vector(0, -1, 0), vector(0, 1, 0)],
      [vector(-1, 0, 0), vector(1, 0, 0)],
    ],
    X_ZERO_PLANE,
  );
  assert.equal(result.coplanarEdges.length, 1);
  assert.equal(result.points.length, 3);
});

test("cube world edges produce four unique points through its center", () => {
  const cube = createCube(2);
  cube.position.set(3, 4, -2);
  const edges = collectWorldEdges(cube);
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -3);
  const result = intersectEdgesWithPlane(edges, plane);

  assert.equal(edges.length, 12);
  assert.equal(result.points.length, 4);
  assert.deepEqual(
    result.points.map(roundedPoint).sort(),
    [
      [3, 3, -3],
      [3, 3, -1],
      [3, 5, -3],
      [3, 5, -1],
    ].sort(),
  );
});

test("zero-normal plane and malformed edges fail explicitly", () => {
  assert.throws(
    () => intersectEdgesWithPlane([], new THREE.Plane(vector(0), 0)),
    /non-zero normal/,
  );
  assert.throws(
    () => intersectEdgesWithPlane([[vector(0), null]], X_ZERO_PLANE),
    /start and end/,
  );
});

test("unordered square points become a consistently oriented closed polygon", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const result = orderAndCloseSection(
    [
      vector(1, 1, 0),
      vector(-1, -1, 0),
      vector(1, -1, 0),
      vector(-1, 1, 0),
    ],
    plane,
  );

  assert.equal(result.status, "polygon");
  assert.equal(result.points.length, 4);
  assert.equal(result.closedPoints.length, 5);
  assert.deepEqual(
    roundedPoint(result.closedPoints[0]),
    roundedPoint(result.closedPoints.at(-1)),
  );
  assert.equal(result.signedArea, 4);

  const orientation = new THREE.Vector3()
    .subVectors(result.points[1], result.points[0])
    .cross(new THREE.Vector3().subVectors(result.points[2], result.points[1]));
  assert.ok(orientation.dot(result.normal) > 0);
});

test("section ordering removes duplicate points within tolerance", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const result = orderAndCloseSection(
    [
      vector(0, 0, 0),
      vector(1, 0, 0),
      vector(0, 1, 0),
      vector(5e-8, 0, 0),
    ],
    plane,
    { epsilon: 1e-7 },
  );
  assert.equal(result.status, "polygon");
  assert.equal(result.points.length, 3);
});

test("insufficient and collinear section points remain degenerate", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const insufficient = orderAndCloseSection(
    [vector(0, 0, 0), vector(1, 0, 0)],
    plane,
  );
  assert.equal(insufficient.status, "degenerate");
  assert.equal(insufficient.reason, "insufficient-points");

  const collinear = orderAndCloseSection(
    [vector(-1, 0, 0), vector(0, 0, 0), vector(1, 0, 0)],
    plane,
  );
  assert.equal(collinear.status, "degenerate");
  assert.equal(collinear.reason, "collinear-points");
});

test("off-plane points fail rather than being silently projected", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  assert.throws(
    () => orderAndCloseSection(
      [vector(0, 0, 0), vector(1, 0, 0), vector(0, 1, 0.01)],
      plane,
    ),
    /must lie on the plane/,
  );
});

test("diagonal cube section closes as a six-vertex polygon", () => {
  const cube = createCube(2);
  const plane = new THREE.Plane(new THREE.Vector3(1, 1, 1).normalize(), 0);
  const intersections = intersectEdgesWithPlane(collectWorldEdges(cube), plane);
  const polygon = orderAndCloseSection(intersections.points, plane);

  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, 6);
  assert.equal(polygon.closedPoints.length, 7);
  assert.ok(Math.abs(polygon.signedArea - 3 * Math.sqrt(3)) < 1e-9);
});

test("section visual creates a triangulated fill and closed outline", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const polygon = orderAndCloseSection(
    [
      vector(-1, -1, 0),
      vector(1, -1, 0),
      vector(1, 1, 0),
      vector(-1, 1, 0),
    ],
    plane,
  );
  const visual = createSectionVisual({ surfaceOffset: 0.002 });

  assert.equal(visual.update(polygon), true);
  assert.equal(visual.group.visible, true);
  assert.equal(visual.group.userData.vertexCount, 4);
  assert.equal(visual.fill.geometry.getAttribute("position").count, 4);
  assert.equal(visual.fill.geometry.getIndex().count, 6);
  assert.equal(visual.outline.geometry.getAttribute("position").count, 5);
  assert.ok(
    visual.fill.geometry.getAttribute("position").getZ(0) > 0,
    "fill must be offset toward the retained side",
  );

  visual.dispose();
});

test("section visual clears stale geometry for degenerate input", () => {
  const visual = createSectionVisual();
  assert.equal(visual.update({ status: "degenerate", points: [] }), false);
  assert.equal(visual.group.visible, false);
  assert.equal(visual.group.userData.vertexCount, 0);
  assert.equal(visual.fill.geometry.getAttribute("position"), undefined);
  visual.dispose();
});

test("cutaway visual uses shared geometry and independent reverse-clipped materials", () => {
  const source = createCube(1);
  const sourceSolid = source.children.find((child) => child.isMesh);
  const visual = createCutawayVisual({ opacity: 0.18 });
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.25);

  visual.setSource(source);
  visual.setPlane(plane);
  visual.setMode("transparent");
  const ghostSolid = visual.ghost.children.find((child) => child.isMesh);

  assert.equal(visual.group.visible, true);
  assert.equal(ghostSolid.geometry, sourceSolid.geometry);
  assert.notEqual(ghostSolid.material, sourceSolid.material);
  assert.equal(ghostSolid.material.opacity, 0.18);
  assert.equal(ghostSolid.material.depthWrite, false);
  assert.equal(ghostSolid.material.clippingPlanes[0], visual.reversePlane);
  assert.ok(visual.reversePlane.normal.equals(new THREE.Vector3(-1, 0, 0)));
  assert.equal(visual.reversePlane.constant, 0.25);

  visual.setMode("hidden");
  assert.equal(visual.group.visible, false);
  visual.dispose();
});

test("cutaway visual updates the shared reverse plane without rebuilding its ghost", () => {
  const source = createCube(1);
  const visual = createCutawayVisual();
  visual.setSource(source);
  const originalGhost = visual.ghost;
  visual.setPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4));

  assert.equal(visual.ghost, originalGhost);
  assert.ok(visual.reversePlane.normal.equals(new THREE.Vector3(0, -1, 0)));
  assert.equal(visual.reversePlane.constant, 0.4);
  assert.throws(() => visual.setMode("unsupported"), /unsupported cutaway mode/);
  visual.dispose();
});

test("2D section projection preserves aspect ratio and viewport padding", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const polygon = orderAndCloseSection(
    [
      vector(-2, -1, 0),
      vector(2, -1, 0),
      vector(2, 1, 0),
      vector(-2, 1, 0),
    ],
    plane,
  );
  const projected = projectSectionTo2D(polygon, {
    width: 220,
    height: 160,
    padding: 20,
  });

  assert.equal(projected.status, "polygon");
  assert.equal(projected.points.length, 4);
  assert.equal(projected.closedPoints.length, 5);
  assert.ok(projected.points.every(({ x, y }) => (
    x >= 20 && x <= 200 && y >= 20 && y <= 140
  )));
  const screenWidth = Math.max(...projected.points.map(({ x }) => x)
    ) - Math.min(...projected.points.map(({ x }) => x));
  const screenHeight = Math.max(...projected.points.map(({ y }) => y)
    ) - Math.min(...projected.points.map(({ y }) => y));
  assert.equal(screenWidth / screenHeight, 2);
});

test("2D projection reports empty input and serializes SVG points deterministically", () => {
  assert.deepEqual(projectSectionTo2D(null), {
    status: "empty",
    points: [],
    closedPoints: [],
  });
  assert.equal(
    svgPointString([{ x: 1 / 3, y: 2 / 3 }, { x: 10, y: 20 }]),
    "0.33,0.67 10.00,20.00",
  );
});
