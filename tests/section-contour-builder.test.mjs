import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import {
  DEFAULT_EPSILON,
  buildSectionContours,
} from "../geometry/section-contour-builder.js";

// ── Helpers ──

function v(x, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function seg(start, end, triangleIds = []) {
  return { start, end, triangleIds };
}

function pointsToArrays(points) {
  return points.map((p) => p.toArray());
}

function contoursToSerializable(contours) {
  return contours.map((c) => ({
    points: pointsToArrays(c.points),
    segmentCount: c.segmentCount,
    triangleIds: c.triangleIds,
  }));
}

// ── Tests ──

test("empty input produces a stable empty result", () => {
  const result = buildSectionContours({ segments: [], epsilon: 1e-7 });
  assert.deepEqual(result, {
    status: "ok",
    contours: [],
    epsilon: 1e-7,
    consumedEdges: 0,
    totalEdges: 0,
  });
});

test("empty array input also works", () => {
  const result = buildSectionContours([]);
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 0);
  assert.equal(result.consumedEdges, 0);
});

test("square with shuffled order and mixed directions produces one stable loop", () => {
  // Unit square at z=0: (0,0)-(1,0)-(1,1)-(0,1)
  // Shuffled order and reversed directions
  const input = {
    segments: [
      seg(v(1, 1), v(1, 0), ["f3"]), // reversed
      seg(v(0, 0), v(1, 0), ["f1"]),
      seg(v(0, 1), v(0, 0), ["f4"]), // reversed
      seg(v(1, 1), v(0, 1), ["f2"]), // reversed
    ],
    epsilon: 1e-7,
  };

  const result = buildSectionContours(input);
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 1);
  assert.equal(result.contours[0].segmentCount, 4);
  assert.equal(result.consumedEdges, 4);
  assert.equal(result.totalEdges, 4);

  // Start from lex-smallest (0,0,0), go via lex-smaller neighbor
  // Neighbors of (0,0): (1,0) and (0,1). (0,1) < (1,0).
  // Walk: (0,0) → (0,1) → (1,1) → (1,0) → back
  assert.deepEqual(
    pointsToArrays(result.contours[0].points),
    [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  );
});

test("input array reversed produces identical output", () => {
  const segments = [
    seg(v(0, 0), v(2, 0), ["a"]),
    seg(v(2, 0), v(2, 1), ["b"]),
    seg(v(2, 1), v(1, 1), ["c"]),
    seg(v(1, 1), v(1, 2), ["d"]),
    seg(v(1, 2), v(0, 2), ["e"]),
    seg(v(0, 2), v(0, 0), ["f"]),
  ];

  const forward = buildSectionContours({ segments });
  const reverse = buildSectionContours({ segments: [...segments].reverse() });

  assert.deepEqual(
    contoursToSerializable(forward.contours),
    contoursToSerializable(reverse.contours),
  );
  assert.equal(forward.consumedEdges, reverse.consumedEdges);
});

test("L-shape concave contour preserves 6 vertices and concave connection", () => {
  // L-shape: (0,0)-(2,0)-(2,1)-(1,1)-(1,2)-(0,2)
  // (1,1) is the inner concave vertex
  const input = {
    segments: [
      seg(v(0, 0), v(2, 0), ["t1"]),
      seg(v(2, 0), v(2, 1), ["t2"]),
      seg(v(1, 1), v(2, 1), ["t3"]), // normalized: start < end
      seg(v(1, 1), v(1, 2), ["t4"]),
      seg(v(0, 2), v(1, 2), ["t5"]), // normalized: start < end
      seg(v(0, 0), v(0, 2), ["t6"]),
    ],
    epsilon: 1e-7,
  };

  const result = buildSectionContours(input);
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 1);
  assert.equal(result.contours[0].points.length, 6);
  assert.equal(result.contours[0].segmentCount, 6);
  assert.equal(result.consumedEdges, 6);

  // Verify all 6 expected vertices are present
  const pointSet = new Set(
    pointsToArrays(result.contours[0].points).map((p) => p.join(",")),
  );
  for (const expected of [
    [0, 0, 0],
    [2, 0, 0],
    [2, 1, 0],
    [1, 1, 0],
    [1, 2, 0],
    [0, 2, 0],
  ]) {
    assert.ok(pointSet.has(expected.join(",")), `missing vertex ${expected}`);
  }

  // Verify (1,1) is in the middle, not filled as convex hull
  // The contour should NOT be the convex hull [(0,0),(2,0),(2,1),(1,2),(0,2)]
  assert.equal(result.contours[0].points.length, 6, "L-shape must have 6 vertices, not 5 (convex hull)");
});

test("three-step staircase polyline maintains correct order", () => {
  // Staircase: (0,0)-(3,0)-(3,1)-(2,1)-(2,2)-(1,2)-(1,3)-(0,3)
  // From fixture: eighteen-block-three-step-staircase
  const segments = [
    seg(v(0, 0), v(3, 0), ["s1"]),
    seg(v(3, 0), v(3, 1), ["s2"]),
    seg(v(2, 1), v(3, 1), ["s3"]),
    seg(v(2, 1), v(2, 2), ["s4"]),
    seg(v(1, 2), v(2, 2), ["s5"]),
    seg(v(1, 2), v(1, 3), ["s6"]),
    seg(v(0, 3), v(1, 3), ["s7"]),
    seg(v(0, 0), v(0, 3), ["s8"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 1);
  assert.equal(result.contours[0].points.length, 8);
  assert.equal(result.contours[0].segmentCount, 8);
  assert.equal(result.consumedEdges, 8);

  // All 8 vertices present
  const pointSet = new Set(
    pointsToArrays(result.contours[0].points).map((p) => p.join(",")),
  );
  assert.ok(pointSet.has("3,0,0"));
  assert.ok(pointSet.has("2,1,0"));
  assert.ok(pointSet.has("1,2,0"));
  assert.ok(pointSet.has("0,3,0"));
});

test("two disconnected regions produce two contours", () => {
  // Box 1: (0,0)-(1,0)-(1,1)-(0,1)
  // Box 2: (3,0)-(5,0)-(5,1)-(3,1)
  const segments = [
    seg(v(0, 0), v(1, 0), ["a1"]),
    seg(v(1, 0), v(1, 1), ["a2"]),
    seg(v(0, 1), v(1, 1), ["a3"]),
    seg(v(0, 0), v(0, 1), ["a4"]),
    seg(v(3, 0), v(5, 0), ["b1"]),
    seg(v(5, 0), v(5, 1), ["b2"]),
    seg(v(3, 0), v(3, 1), ["b3"]),
    seg(v(3, 1), v(5, 1), ["b4"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 2);
  assert.equal(result.consumedEdges, 8);

  // Contours sorted by point sequences — first contour starts at (0,0)
  assert.deepEqual(result.contours[0].points[0].toArray(), [0, 0, 0]);
  assert.deepEqual(result.contours[1].points[0].toArray(), [3, 0, 0]);

  // Each has 4 segments
  assert.equal(result.contours[0].segmentCount, 4);
  assert.equal(result.contours[1].segmentCount, 4);

  // Triangle IDs aggregated per contour
  assert.deepEqual(result.contours[0].triangleIds, ["a1", "a2", "a3", "a4"]);
  assert.deepEqual(result.contours[1].triangleIds, ["b1", "b2", "b3", "b4"]);
});

test("open chain returns explicit error", () => {
  // A-B-C: open chain, degrees are 1, 2, 1
  const segments = [
    seg(v(0, 0), v(1, 0), ["t1"]),
    seg(v(1, 0), v(2, 0), ["t2"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "error");
  assert.equal(result.error, "open-chain");
  assert.ok(result.errorNodes.length >= 2);
  assert.equal(result.consumedEdges, 0);
});

test("T-junction fork returns explicit error", () => {
  // T-junction: A(0,0) connected to B(1,0), C(0,1), D(0,-1)
  // A has degree 3 (non-manifold)
  const segments = [
    seg(v(0, 0), v(1, 0), ["t1"]),
    seg(v(0, 0), v(0, 1), ["t2"]),
    seg(v(0, -1), v(0, 0), ["t3"]),
    // Add a segment to make C and D have degree 1 (clearly non-manifold)
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "error");
  assert.equal(result.error, "non-manifold");
  assert.ok(
    result.errorNodes.some((n) => n.degree === 3),
    "should report the degree-3 node",
  );
});

test("node degree greater than 2 returns non-manifold error", () => {
  // Create a node with degree 4: two loops sharing a node
  // Center (0,0) connected to (1,0), (-1,0), (0,1), (0,-1)
  // Plus edges to close: (1,0)-(0,1), (-1,0)-(0,-1)
  const segments = [
    seg(v(0, 0), v(1, 0), ["a"]),
    seg(v(0, 0), v(0, 1), ["b"]),
    seg(v(-1, 0), v(0, 0), ["c"]),
    seg(v(0, -1), v(0, 0), ["d"]),
    seg(v(1, 0), v(0, 1), ["e"]),
    seg(v(-1, 0), v(0, -1), ["f"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "error");
  assert.equal(result.error, "non-manifold");
  // Node (0,0,0) should have degree 4
  const center = result.errorNodes.find(
    (n) => n.point[0] === 0 && n.point[1] === 0 && n.point[2] === 0,
  );
  assert.ok(center, "center node should be in error nodes");
  assert.equal(center.degree, 4);
});

test("non-Vector3 input is rejected", () => {
  assert.throws(
    () => buildSectionContours([{ start: { x: 0 }, end: v(1) }]),
    /THREE\.Vector3/,
  );
  assert.throws(
    () => buildSectionContours([{ start: v(0), end: [1, 0, 0] }]),
    /THREE\.Vector3/,
  );
});

test("non-finite coordinates are rejected", () => {
  assert.throws(
    () => buildSectionContours([seg(v(Number.NaN), v(1))]),
    /finite coordinates/,
  );
  assert.throws(
    () => buildSectionContours([seg(v(0), v(Number.POSITIVE_INFINITY))]),
    /finite coordinates/,
  );
});

test("zero-length segment that slipped through normalization is rejected", () => {
  const result = buildSectionContours([seg(v(1, 2, 3), v(1, 2, 3))]);
  assert.equal(result.status, "error");
  assert.equal(result.error, "zero-length-segment");
});

test("duplicate edge that slipped through normalization is rejected", () => {
  // Two edges connecting the same pair of nodes
  const segments = [
    seg(v(0, 0), v(1, 0), ["a"]),
    seg(v(0, 0), v(1, 0), ["b"]), // exact duplicate
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "error");
  assert.equal(result.error, "duplicate-edge");
});

test("each edge consumed exactly once and source IDs aggregated", () => {
  // Triangle with extra triangleId on one edge
  const segments = [
    seg(v(0, 0), v(1, 0), ["t1", "t2"]), // shared edge from two triangles
    seg(v(1, 0), v(0, 1), ["t1"]),
    seg(v(0, 0), v(0, 1), ["t1"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 1);
  assert.equal(result.consumedEdges, 3);
  assert.equal(result.totalEdges, 3);

  // All source IDs aggregated, stably sorted
  assert.deepEqual(result.contours[0].triangleIds, ["t1", "t2"]);
  assert.equal(result.contours[0].segmentCount, 3);
});

test("source IDs with mixed string and number types are stable", () => {
  const segments = [
    seg(v(0, 0), v(1, 0), [2, "2"]),
    seg(v(1, 0), v(0, 1), [2]),
    seg(v(0, 0), v(0, 1), ["2"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  // Both 2 and "2" should be present, distinct, and sorted
  assert.deepEqual(result.contours[0].triangleIds, [2, "2"]);
});

test("triangle contour produces correct 3-vertex loop", () => {
  const segments = [
    seg(v(0, 0), v(1, 0), ["f1"]),
    seg(v(1, 0), v(0, 1), ["f2"]),
    seg(v(0, 0), v(0, 1), ["f3"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 1);
  assert.equal(result.contours[0].points.length, 3);
  assert.equal(result.contours[0].segmentCount, 3);

  // Starts at lex-smallest (0,0)
  assert.deepEqual(result.contours[0].points[0].toArray(), [0, 0, 0]);
});

test("hexagon contour from cube oblique cut has 6 vertices", () => {
  // Regular-ish hexagon (simplified coordinates)
  const pts = [
    v(-0.35, -0.61),
    v(0.35, -0.61),
    v(0.71, 0),
    v(0.35, 0.61),
    v(-0.35, 0.61),
    v(-0.71, 0),
  ];
  const segments = [];
  for (let i = 0; i < 6; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 6];
    const sorted = comparePoints(a, b) <= 0 ? [a, b] : [b, a];
    segments.push(seg(sorted[0], sorted[1], [`f${i}`]));
  }

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 1);
  assert.equal(result.contours[0].points.length, 6);
  assert.equal(result.contours[0].segmentCount, 6);
  assert.equal(result.consumedEdges, 6);
});

test("deterministic output regardless of input segment order", () => {
  // L-shape segments in two different orders
  const baseSegments = [
    seg(v(0, 0), v(2, 0), ["t1"]),
    seg(v(2, 0), v(2, 1), ["t2"]),
    seg(v(1, 1), v(2, 1), ["t3"]),
    seg(v(1, 1), v(1, 2), ["t4"]),
    seg(v(0, 2), v(1, 2), ["t5"]),
    seg(v(0, 0), v(0, 2), ["t6"]),
  ];

  const order1 = [0, 1, 2, 3, 4, 5];
  const order2 = [5, 3, 0, 2, 4, 1];
  const order3 = [3, 1, 5, 0, 2, 4];

  for (const order of [order1, order2, order3]) {
    const reordered = order.map((i) => baseSegments[i]);
    const result = buildSectionContours({ segments: reordered });
    const expected = buildSectionContours({ segments: baseSegments });

    assert.deepEqual(
      contoursToSerializable(result.contours),
      contoursToSerializable(expected.contours),
    );
  }
});

test("deterministic output regardless of segment direction", () => {
  // Same L-shape but with some segments reversed
  const normalSegments = [
    seg(v(0, 0), v(2, 0), ["t1"]),
    seg(v(2, 0), v(2, 1), ["t2"]),
    seg(v(1, 1), v(2, 1), ["t3"]),
    seg(v(1, 1), v(1, 2), ["t4"]),
    seg(v(0, 2), v(1, 2), ["t5"]),
    seg(v(0, 0), v(0, 2), ["t6"]),
  ];

  // Reverse some segments (swap start/end)
  const reversedSegments = [
    seg(v(2, 0), v(0, 0), ["t1"]), // reversed
    seg(v(2, 0), v(2, 1), ["t2"]),
    seg(v(2, 1), v(1, 1), ["t3"]), // reversed
    seg(v(1, 1), v(1, 2), ["t4"]),
    seg(v(1, 2), v(0, 2), ["t5"]), // reversed
    seg(v(0, 0), v(0, 2), ["t6"]),
  ];

  const r1 = buildSectionContours({ segments: normalSegments });
  const r2 = buildSectionContours({ segments: reversedSegments });

  assert.deepEqual(
    contoursToSerializable(r1.contours),
    contoursToSerializable(r2.contours),
  );
});

test("invalid input types are rejected", () => {
  assert.throws(
    () => buildSectionContours(null),
    /must be a normalized segments result/,
  );
  assert.throws(
    () => buildSectionContours("not an object"),
    /must be a normalized segments result/,
  );
  assert.throws(
    () => buildSectionContours({ foo: "bar" }),
    /must be a normalized segments result/,
  );
  assert.throws(
    () => buildSectionContours({ segments: "not array" }),
    /must be an array/,
  );
});

test("segments without triangleIds are handled gracefully", () => {
  const segments = [
    { start: v(0, 0), end: v(1, 0) },
    { start: v(1, 0), end: v(0, 1) },
    { start: v(0, 0), end: v(0, 1) },
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours[0].triangleIds.length, 0);
});

test("epsilon is passed through in the output", () => {
  const result = buildSectionContours({
    segments: [],
    epsilon: 1e-5,
  });
  assert.equal(result.epsilon, 1e-5);
});

test("epsilon override in options takes precedence", () => {
  const result = buildSectionContours(
    { segments: [], epsilon: 1e-5 },
    { epsilon: 1e-3 },
  );
  assert.equal(result.epsilon, 1e-3);
});

test("DEFAULT_EPSILON is exported", () => {
  assert.equal(DEFAULT_EPSILON, 1e-7);
});

test("multiple contours are sorted by their point sequences", () => {
  // Three disconnected triangles at different positions
  const segments = [
    // Triangle at (10,0)
    seg(v(10, 0), v(11, 0), ["far"]),
    seg(v(11, 0), v(10, 1), ["far"]),
    seg(v(10, 0), v(10, 1), ["far"]),
    // Triangle at (0,0)
    seg(v(0, 0), v(1, 0), ["near"]),
    seg(v(1, 0), v(0, 1), ["near"]),
    seg(v(0, 0), v(0, 1), ["near"]),
    // Triangle at (5,0)
    seg(v(5, 0), v(6, 0), ["mid"]),
    seg(v(6, 0), v(5, 1), ["mid"]),
    seg(v(5, 0), v(5, 1), ["mid"]),
  ];

  const result = buildSectionContours({ segments });
  assert.equal(result.status, "ok");
  assert.equal(result.contours.length, 3);
  assert.equal(result.consumedEdges, 9);

  // Contours sorted: first at (0,0), then (5,0), then (10,0)
  assert.deepEqual(result.contours[0].points[0].toArray(), [0, 0, 0]);
  assert.deepEqual(result.contours[1].points[0].toArray(), [5, 0, 0]);
  assert.deepEqual(result.contours[2].points[0].toArray(), [10, 0, 0]);
});

// Helper for the direction test
function comparePoints(a, b) {
  return a.x - b.x || a.y - b.y || a.z - b.z;
}
