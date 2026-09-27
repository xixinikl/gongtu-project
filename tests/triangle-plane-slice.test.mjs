import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import {
  DEFAULT_EPSILON,
  sliceTriangleWithPlane,
} from "../geometry/triangle-plane-slice.js";

const X_ZERO = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

function vector(x, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function rounded(point) {
  return point.toArray().map((value) => Math.round(value * 1e10) / 1e10);
}

test("triangle on one side returns no segment and preserves its id", () => {
  const result = sliceTriangleWithPlane(
    [vector(1), vector(2, 1), vector(3, 0, 1)],
    X_ZERO,
    { triangleId: "face-7" },
  );

  assert.equal(result.status, "none");
  assert.equal(result.segment, null);
  assert.equal(result.triangleId, "face-7");
});

test("two crossed edges produce one lexicographically normalized segment", () => {
  const result = sliceTriangleWithPlane(
    [vector(2, 0, 0), vector(-2, 2, 0), vector(-2, -2, 0)],
    X_ZERO,
    { triangleId: 12 },
  );

  assert.equal(result.status, "segment");
  assert.equal(result.relation, "edge-crossing");
  assert.equal(result.segment.triangleId, 12);
  assert.deepEqual(rounded(result.segment.start), [0, -1, 0]);
  assert.deepEqual(rounded(result.segment.end), [0, 1, 0]);
});

test("plane through one vertex and opposite edge produces a segment", () => {
  const result = sliceTriangleWithPlane(
    [vector(0, 3, 0), vector(-2, 0, 0), vector(2, 0, 0)],
    X_ZERO,
    { triangleId: "vertex-crossing" },
  );

  assert.equal(result.status, "segment");
  assert.equal(result.relation, "vertex-crossing");
  assert.deepEqual(rounded(result.segment.start), [0, 0, 0]);
  assert.deepEqual(rounded(result.segment.end), [0, 3, 0]);
});

test("a lone vertex touch is explicit and does not invent a zero-length segment", () => {
  const result = sliceTriangleWithPlane(
    [vector(0, 1, 0), vector(2, 0, 0), vector(3, 2, 0)],
    X_ZERO,
  );

  assert.equal(result.status, "point");
  assert.equal(result.segment, null);
  assert.deepEqual(rounded(result.point), [0, 1, 0]);
});

test("an edge in the plane is the only emitted segment", () => {
  const result = sliceTriangleWithPlane(
    [vector(0, 2, 0), vector(1, 0, 0), vector(0, -1, 0)],
    X_ZERO,
    { triangleId: 4 },
  );

  assert.equal(result.status, "segment");
  assert.equal(result.relation, "coplanar-edge");
  assert.deepEqual(rounded(result.segment.start), [0, -1, 0]);
  assert.deepEqual(rounded(result.segment.end), [0, 2, 0]);
});

test("a triangle wholly in the plane is marked coplanar without choosing an arbitrary edge", () => {
  const result = sliceTriangleWithPlane(
    [vector(0, 0, 0), vector(0, 1, 0), vector(0, 0, 1)],
    X_ZERO,
    { triangleId: "coplanar" },
  );

  assert.equal(result.status, "coplanar");
  assert.equal(result.relation, "coplanar-triangle");
  assert.equal(result.segment, null);
});

test("epsilon classifies near-plane vertices deterministically", () => {
  const within = sliceTriangleWithPlane(
    [vector(DEFAULT_EPSILON / 2, 1), vector(-1), vector(1)],
    X_ZERO,
  );
  assert.equal(within.status, "segment");
  assert.equal(within.relation, "vertex-crossing");
  assert.deepEqual(rounded(within.segment.end), [0.00000005, 1, 0]);

  const outside = sliceTriangleWithPlane(
    [vector(2e-7, 1), vector(3e-7), vector(4e-7, 0, 1)],
    X_ZERO,
  );
  assert.equal(outside.status, "none");
});

test("THREE.Triangle input is accepted without mutating source vertices or plane", () => {
  const triangle = new THREE.Triangle(
    vector(-1, 0, 0),
    vector(1, 0, 0),
    vector(1, 2, 0),
  );
  const plane = new THREE.Plane(new THREE.Vector3(2, 0, 0), 0);
  const before = [triangle.a.clone(), triangle.b.clone(), triangle.c.clone()];

  const result = sliceTriangleWithPlane(triangle, plane);

  assert.equal(result.status, "segment");
  assert.ok(triangle.a.equals(before[0]));
  assert.ok(triangle.b.equals(before[1]));
  assert.ok(triangle.c.equals(before[2]));
  assert.deepEqual(plane.normal.toArray(), [2, 0, 0]);
});

test("invalid triangle, plane and epsilon fail or fall back predictably", () => {
  assert.throws(
    () => sliceTriangleWithPlane([vector(0), vector(1)], X_ZERO),
    /exactly three/,
  );
  assert.throws(
    () => sliceTriangleWithPlane(
      [vector(0), vector(1), vector(0, 1)],
      new THREE.Plane(vector(0), 0),
    ),
    /non-zero normal/,
  );

  const result = sliceTriangleWithPlane(
    [vector(1), vector(2), vector(3)],
    X_ZERO,
    { epsilon: -1 },
  );
  assert.equal(result.epsilon, DEFAULT_EPSILON);
});
