import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { buildSectionContourTopology, DEFAULT_EPSILON } from "../geometry/section-contour-topology.js";
import { triangulateSectionTopology } from "../geometry/section-triangulation.js";
import { sectionV2Fixtures } from "./fixtures/section-v2-fixtures.mjs";

// ── Helpers ──

function v2(x, y) {
  return new THREE.Vector2(x, y);
}

function v3(x, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function contour(points3D) {
  return { points: points3D, segmentCount: points3D.length, triangleIds: [] };
}

function shoelaceArea2D(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function totalTriangulatedArea(result) {
  let total = 0;
  for (let i = 0; i < result.indices.length; i += 3) {
    const v0 = result.vertices2D[result.indices[i]];
    const v1 = result.vertices2D[result.indices[i + 1]];
    const v2 = result.vertices2D[result.indices[i + 2]];
    total += Math.abs(0.5 * (v0.x * (v1.y - v2.y) + v1.x * (v2.y - v0.y) + v2.x * (v0.y - v1.y)));
  }
  return total;
}

// ── SECTION: Topology (section-contour-topology.js) ──

test("horizontal square: 4-vertex contour, 1 outer, CCW winding", () => {
  const rect = [
    v3(0, 0, 0.5),
    v3(1, 0, 0.5),
    v3(1, 1, 0.5),
    v3(0, 1, 0.5),
  ];

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const topo = buildSectionContourTopology([contour(rect)], plane);

  assert.equal(topo.status, "ok");
  assert.equal(topo.groups.length, 1);
  assert.equal(topo.groups[0].outerContourIndex, 0);
  assert.deepEqual(topo.groups[0].holeContourIndices, []);
  assert.equal(topo.groups[0].outerPoints2D.length, 4);
  assert.equal(topo.groups[0].holes2D.length, 0);

  // Should be CCW (positive area)
  const area = shoelaceArea2D(topo.groups[0].outerPoints2D);
  assert.ok(area > 0, `area should be positive (CCW), got ${area}`);
  assert.ok(Math.abs(area - 1) < 1e-6, `area should be ~1, got ${area}`);
});

test("horizontal square triangulated: 2 triangles, area 1", () => {
  const rect = [
    v3(0, 0, 0.5),
    v3(1, 0, 0.5),
    v3(1, 1, 0.5),
    v3(0, 1, 0.5),
  ];

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const topo = buildSectionContourTopology([contour(rect)], plane);
  const result = triangulateSectionTopology(topo);

  assert.equal(result.status, "ok");
  assert.equal(result.indices.length, 6, "4-vertex rectangle should produce 2 triangles (6 indices)");
  assert.equal(result.groups.length, 1);

  // Each index must be within range
  for (const idx of result.indices) {
    assert.ok(idx >= 0 && idx < result.vertices2D.length, `index ${idx} out of range`);
  }

  // Area = 1
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 1) < 1e-6, `triangulated area should be ~1, got ${triArea}`);
});

test("oblique regular hexagon: shared 2D basis, 4 triangles, golden fixture area", () => {
  // Use golden fixture: unit-cube-oblique
  const fixture = sectionV2Fixtures.find((f) => f.id === "unit-cube-oblique");
  assert.ok(fixture, "fixture not found");

  const basisData = fixture.expected.basis;
  const ringData = fixture.expected.rings[0];
  const { origin, u, v } = basisData;

  // Build 3D contour from the 2D golden ring via inverse projection
  const originVec = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const uVec = new THREE.Vector3(u[0], u[1], u[2]);
  const vVec = new THREE.Vector3(v[0], v[1], v[2]);

  const points3D = ringData.vertices.map(([x, y]) => {
    return new THREE.Vector3(
      originVec.x + x * uVec.x + y * vVec.x,
      originVec.y + x * uVec.y + y * vVec.y,
      originVec.z + x * uVec.z + y * vVec.z,
    );
  });

  const fi = fixture.expected;
  const normal = fixture.plane.normal;
  const plane = new THREE.Plane(
    new THREE.Vector3(normal[0], normal[1], normal[2]),
    fixture.plane.constant,
  );

  const topo = buildSectionContourTopology([contour(points3D)], plane);
  assert.equal(topo.status, "ok");
  assert.equal(topo.groups.length, 1);

  // Verify shared basis: origin, u, v
  assert.ok(topo.basis.origin.isVector3);
  assert.ok(topo.basis.u.isVector3);
  assert.ok(topo.basis.v.isVector3);

  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");

  // Regular hexagon 6 vertices → 4 triangles = 12 indices
  assert.equal(result.indices.length, 12, `hexagon should produce 4 triangles, got ${result.indices.length / 3}`);

  // Area should match golden fixture: (3 * sqrt(3)) / 4 ≈ 1.299...
  const triArea = totalTriangulatedArea(result);
  const expectedArea = ringData.area;
  assert.ok(
    Math.abs(triArea - expectedArea) < 1e-6,
    `area ${triArea.toExponential(4)} ≠ expected ${expectedArea.toExponential(4)}`,
  );
});

test("L-shape concave: triangulated as 6-vertex L, not convex hull, area 3", () => {
  // L-shape from golden fixture: l-prism-concave
  const fixture = sectionV2Fixtures.find((f) => f.id === "l-prism-concave");
  assert.ok(fixture, "fixture not found");

  const { basis, rings } = fixture.expected;
  const { origin, u, v } = basis;
  const originVec = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const uVec = new THREE.Vector3(u[0], u[1], u[2]);
  const vVec = new THREE.Vector3(v[0], v[1], v[2]);

  const points3D = rings[0].vertices.map(([x, y]) => {
    return new THREE.Vector3(
      originVec.x + x * uVec.x + y * vVec.x,
      originVec.y + x * uVec.y + y * vVec.y,
      originVec.z + x * uVec.z + y * vVec.z,
    );
  });

  const plane = new THREE.Plane(
    new THREE.Vector3(fixture.plane.normal[0], fixture.plane.normal[1], fixture.plane.normal[2]),
    fixture.plane.constant,
  );

  const topo = buildSectionContourTopology([contour(points3D)], plane);
  assert.equal(topo.status, "ok");
  assert.equal(topo.groups[0].outerPoints2D.length, 6, "L-shape must have 6 vertices (not convex hull)");

  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");

  // L-shape 6 vertices → 4 triangles = 12 indices
  assert.equal(result.indices.length, 12, `L-shape should produce 4 triangles, got ${result.indices.length / 3}`);

  // Area = 3
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 3) < 1e-6, `L-shape area should be 3, got ${triArea}`);
});

test("three-step staircase: preserves notches, 8 vertices, area 6", () => {
  const fixture = sectionV2Fixtures.find((f) => f.id === "eighteen-block-three-step-staircase");
  assert.ok(fixture, "fixture not found");

  const { basis, rings } = fixture.expected;
  const { origin, u, v } = basis;
  const originVec = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const uVec = new THREE.Vector3(u[0], u[1], u[2]);
  const vVec = new THREE.Vector3(v[0], v[1], v[2]);

  const points3D = rings[0].vertices.map(([x, y]) => {
    return new THREE.Vector3(
      originVec.x + x * uVec.x + y * vVec.x,
      originVec.y + x * uVec.y + y * vVec.y,
      originVec.z + x * uVec.z + y * vVec.z,
    );
  });

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.5);

  const topo = buildSectionContourTopology([contour(points3D)], plane);
  assert.equal(topo.status, "ok");
  assert.equal(topo.groups[0].outerPoints2D.length, 8, "staircase must have 8 vertices");

  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");

  // Area = 6
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 6) < 1e-6, `staircase area should be 6, got ${triArea}`);

  // All 8 vertices should be in the triangulated 2D set
  assert.equal(result.vertices2D.length, 8, "staircase must have 8 triangulated vertices");

  // The concave corners are present in the topology output (which uses its own 2D basis)
  const topoVertSet = new Set(
    topo.groups[0].outerPoints2D.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`),
  );
  assert.equal(topoVertSet.size, 8, "topology must have 8 distinct 2D vertices");
});

test("two disconnected rectangles: 2 groups, no cross-group triangles, total area 3", () => {
  const fixture = sectionV2Fixtures.find((f) => f.id === "two-disconnected-boxes");
  assert.ok(fixture, "fixture not found");

  const { basis, rings } = fixture.expected;
  const { origin, u, v } = basis;
  const originVec = new THREE.Vector3(origin[0], origin[1], origin[2]);
  const uVec = new THREE.Vector3(u[0], u[1], u[2]);
  const vVec = new THREE.Vector3(v[0], v[1], v[2]);

  const contours = rings.map((ring) => {
    const pts = ring.vertices.map(([x, y]) => {
      return new THREE.Vector3(
        originVec.x + x * uVec.x + y * vVec.x,
        originVec.y + x * uVec.y + y * vVec.y,
        originVec.z + x * uVec.z + y * vVec.z,
      );
    });
    return { points: pts, segmentCount: pts.length, triangleIds: [] };
  });

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology(contours, plane);
  assert.equal(topo.status, "ok");
  assert.equal(topo.groups.length, 2, "2 disconnected outers should produce 2 groups");

  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");
  assert.equal(result.groups.length, 2);

  // Total area = 1 + 2 = 3
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 3) < 1e-6, `total area should be 3, got ${triArea}`);

  // Each group should have exactly 4 vertices (rectangle) and 2 triangles
  for (const gi of result.groups) {
    assert.equal(gi.indexCount, 6, "each rectangle should produce 2 triangles");
  }
});

test("outer + hole: hole is NOT triangulated (area = outer - hole)", () => {
  // Outer: 4x4 square. Hole: 1x1 square in the center.
  // Both on plane z=0.5
  const outer = [
    v3(0, 0, 0.5), v3(4, 0, 0.5), v3(4, 4, 0.5), v3(0, 4, 0.5),
  ];
  const hole = [
    v3(1.5, 1.5, 0.5), v3(2.5, 1.5, 0.5), v3(2.5, 2.5, 0.5), v3(1.5, 2.5, 0.5),
  ];

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const topo = buildSectionContourTopology([
    contour(outer),
    contour(hole),
  ], plane);

  assert.equal(topo.status, "ok");
  assert.equal(topo.groups.length, 1);
  assert.equal(topo.groups[0].holeContourIndices.length, 1);

  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");

  // Area = outer(16) - hole(1) = 15
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 15) < 1e-6, `outer-hole area should be 15, got ${triArea}`);

  // Number of triangles: outer 4-vertex + hole 4-vertex = 8 vertices total
  // With a hole, triangulation should produce more than 2 triangles
  assert.ok(result.indices.length / 3 >= 4, `outer with hole should produce >= 4 triangles`);
});

test("outer + hole + hole-in-island (3-level nesting): 2 polygon groups", () => {
  // Outer: 6x6. Hole: 3x3 donut. Island inside hole: 1x1.
  const outer = [
    v3(0, 0, 0.5), v3(6, 0, 0.5), v3(6, 6, 0.5), v3(0, 6, 0.5),
  ];
  const holeOuter = [
    v3(1.5, 1.5, 0.5), v3(4.5, 1.5, 0.5), v3(4.5, 4.5, 0.5), v3(1.5, 4.5, 0.5),
  ];
  const island = [
    v3(2.5, 2.5, 0.5), v3(3.5, 2.5, 0.5), v3(3.5, 3.5, 0.5), v3(2.5, 3.5, 0.5),
  ];

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const topo = buildSectionContourTopology([
    contour(outer),
    contour(holeOuter),
    contour(island),
  ], plane);

  assert.equal(topo.status, "ok");
  // Expect 2 groups: outer(6x6)-hole(3x3) and island(1x1)
  assert.equal(topo.groups.length, 2, "hole-in-island should produce 2 polygon groups");

  // Sort by outerContourIndex for deterministic check
  const sorted = [...topo.groups].sort((a, b) => a.outerContourIndex - b.outerContourIndex);

  // Group with the large outer should have 1 hole
  const group0 = sorted.find((g) => g.outerPoints2D.length === 4 && Math.abs(shoelaceArea2D(g.outerPoints2D) - 36) < 1e-6);
  assert.ok(group0, "should have a group with outer area ~36");
  assert.equal(group0.holes2D.length, 1, "outer should have one hole");

  // Group with the island should have no holes
  const group1 = sorted.find((g) => g.outerPoints2D.length === 4 && Math.abs(shoelaceArea2D(g.outerPoints2D) - 1) < 1e-6);
  assert.ok(group1, "should have a group with outer area ~1 (island)");
  assert.equal(group1.holes2D.length, 0, "island should have no holes");

  // Triangulate
  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");
  assert.equal(result.groups.length, 2);

  // Total area = outer(36) - hole(9) + island(1) = 28
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 28) < 1e-6, `total area should be 28, got ${triArea}`);
});

test("all contours reversed: identical topology and area", () => {
  // L-shape normal and reversed
  const pointList = [
    v3(0, 0, 0.5), v3(2, 0, 0.5), v3(2, 1, 0.5), v3(1, 1, 0.5), v3(1, 2, 0.5), v3(0, 2, 0.5),
  ];
  const reversed = [...pointList].reverse();

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo1 = buildSectionContourTopology([contour(pointList)], plane);
  const topo2 = buildSectionContourTopology([contour(reversed)], plane);

  assert.equal(topo1.status, "ok");
  assert.equal(topo2.status, "ok");

  const r1 = triangulateSectionTopology(topo1);
  const r2 = triangulateSectionTopology(topo2);

  assert.equal(r1.status, "ok");
  assert.equal(r2.status, "ok");

  // Areas should match
  const area1 = totalTriangulatedArea(r1);
  const area2 = totalTriangulatedArea(r2);
  assert.ok(Math.abs(area1 - area2) < 1e-6, `areas must match: ${area1} vs ${area2}`);
  assert.ok(Math.abs(area1 - 3) < 1e-6, `L-shape area should be 3, got ${area1}`);
});

test("contours reordered: deterministic output", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const contourA = contour([
    v3(0, 0, 0.5), v3(1, 0, 0.5), v3(1, 1, 0.5), v3(0, 1, 0.5),
  ]);
  const contourB = contour([
    v3(3, 0, 0.5), v3(5, 0, 0.5), v3(5, 1, 0.5), v3(3, 1, 0.5),
  ]);

  const topo1 = buildSectionContourTopology([contourA, contourB], plane);
  const topo2 = buildSectionContourTopology([contourB, contourA], plane);

  const r1 = triangulateSectionTopology(topo1);
  const r2 = triangulateSectionTopology(topo2);

  assert.equal(r1.status, "ok");
  assert.equal(r2.status, "ok");

  // Both should have 2 groups, same total area
  assert.equal(r1.groups.length, 2);
  assert.equal(r2.groups.length, 2);

  const area1 = totalTriangulatedArea(r1);
  const area2 = totalTriangulatedArea(r2);
  assert.ok(Math.abs(area1 - area2) < 1e-6);
  assert.ok(Math.abs(area1 - 3) < 1e-6);
});

test("degenerate zero-area ring rejected", () => {
  // Three collinear points = zero area
  const planar = [
    v3(0, 0, 0.5),
    v3(1, 0, 0.5),
    v3(2, 0, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(planar)], plane);
  assert.equal(topo.status, "error");
  assert.equal(topo.error, "degenerate-ring");
});

test("self-intersecting ring rejected", () => {
  // Bow-tie shape: (0,0)-(2,0)-(0,2)-(2,2) self-intersects
  const bowtie = [
    v3(0, 0, 0.5),
    v3(2, 0, 0.5),
    v3(0, 2, 0.5),
    v3(2, 2, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(bowtie)], plane);
  assert.equal(topo.status, "error");
  assert.equal(topo.error, "self-intersecting-ring");
});

test("intersecting rings rejected", () => {
  // Two squares that overlap
  const rect1 = [
    v3(0, 0, 0.5), v3(2, 0, 0.5), v3(2, 2, 0.5), v3(0, 2, 0.5),
  ];
  const rect2 = [
    v3(1, 1, 0.5), v3(3, 1, 0.5), v3(3, 3, 0.5), v3(1, 3, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(rect1), contour(rect2)], plane);
  assert.equal(topo.status, "error");
  assert.equal(topo.error, "intersecting-rings");
});

test("touching rings rejected", () => {
  // Two squares that share an edge
  const rect1 = [
    v3(0, 0, 0.5), v3(1, 0, 0.5), v3(1, 1, 0.5), v3(0, 1, 0.5),
  ];
  const rect2 = [
    v3(1, 0, 0.5), v3(2, 0, 0.5), v3(2, 1, 0.5), v3(1, 1, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(rect1), contour(rect2)], plane);
  assert.equal(topo.status, "error");
  assert.equal(topo.error, "intersecting-rings");
});

test("points off-plane beyond epsilon rejected", () => {
  const pts = [
    v3(0, 0, 0.5),
    v3(1, 0, 0.5),
    v3(1, 1, 0.8), // off plane by 0.3
    v3(0, 1, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  assert.throws(
    () => buildSectionContourTopology([contour(pts)], plane),
    /off the plane/,
  );
});

test("fewer than 3 points in contour rejected", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  assert.throws(
    () => buildSectionContourTopology([contour([v3(0, 0, 0.5), v3(1, 0, 0.5)])], plane),
    /fewer than 3 points/,
  );
});

test("invalid plane rejected", () => {
  const pts = [v3(0, 0, 0.5), v3(1, 0, 0.5), v3(1, 1, 0.5)];
  const contourObj = contour(pts);

  assert.throws(
    () => buildSectionContourTopology([contourObj], null),
    /THREE.Plane/,
  );

  // Zero-length normal
  const badPlane = new THREE.Plane(new THREE.Vector3(0, 0, 0), 0);
  assert.throws(
    () => buildSectionContourTopology([contourObj], badPlane),
    /non-zero/,
  );

  // Non-Plane object
  assert.throws(
    () => buildSectionContourTopology([contourObj], { notAPlane: true }),
    /THREE.Plane/,
  );
});

test("non-Vector3 contour points rejected", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const badContour = { points: [{ x: 0, y: 0, z: 0.5 }], segmentCount: 3 };
  assert.throws(
    () => buildSectionContourTopology([badContour], plane),
    /finite THREE.Vector3/,
  );
});

test("invalid epsilon rejected", () => {
  const pts = [v3(0, 0, 0.5), v3(1, 0, 0.5), v3(1, 1, 0.5), v3(0, 1, 0.5)];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  assert.throws(
    () => buildSectionContourTopology([contour(pts)], plane, { epsilon: -1 }),
    /positive finite/,
  );
  assert.throws(
    () => buildSectionContourTopology([contour(pts)], plane, { epsilon: Number.NaN }),
    /positive finite/,
  );
});

test("empty contours produce stable empty result", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const topo = buildSectionContourTopology([], plane);
  assert.equal(topo.status, "ok");
  assert.equal(topo.groups.length, 0);
  assert.ok(topo.basis.origin);
  assert.ok(topo.basis.u);
  assert.ok(topo.basis.v);

  const result = triangulateSectionTopology(topo);
  assert.equal(result.status, "ok");
  assert.equal(result.vertices2D.length, 0);
  assert.equal(result.indices.length, 0);
  assert.equal(result.groups.length, 0);
});

test("2D basis is shared across all contours and u×v = n", () => {
  // Two disconnected rectangles on the same plane
  const contourA = contour([
    v3(0, 0, 0.5), v3(1, 0, 0.5), v3(1, 1, 0.5), v3(0, 1, 0.5),
  ]);
  const contourB = contour([
    v3(3, 0, 0.5), v3(5, 0, 0.5), v3(5, 1, 0.5), v3(3, 1, 0.5),
  ]);

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const topo = buildSectionContourTopology([contourA, contourB], plane);

  // u × v should equal plane.normal
  const cross = new THREE.Vector3().crossVectors(topo.basis.u, topo.basis.v);
  const dot = cross.dot(topo.plane.normal);
  assert.ok(dot > 0.99, `u × v should be parallel to plane normal, dot = ${dot}`);
});

test("basis is deterministic for the same plane", () => {
  const plane1 = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const plane2 = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);
  const pts = [
    v3(0, 0, 0.5), v3(1, 0, 0.5), v3(1, 1, 0.5), v3(0, 1, 0.5),
  ];

  const topo1 = buildSectionContourTopology([contour(pts)], plane1);
  const topo2 = buildSectionContourTopology([contour(pts)], plane2);

  assert.ok(Math.abs(topo1.basis.u.x - topo2.basis.u.x) < 1e-12);
  assert.ok(Math.abs(topo1.basis.u.y - topo2.basis.u.y) < 1e-12);
  assert.ok(Math.abs(topo1.basis.v.x - topo2.basis.v.x) < 1e-12);
  assert.ok(Math.abs(topo1.basis.v.y - topo2.basis.v.y) < 1e-12);
});

test("area conservation per group", () => {
  // Outer: 4x4, 1 hole: 2x2
  const outer = [
    v3(0, 0, 0.5), v3(4, 0, 0.5), v3(4, 4, 0.5), v3(0, 4, 0.5),
  ];
  const hole = [
    v3(1, 1, 0.5), v3(3, 1, 0.5), v3(3, 3, 0.5), v3(1, 3, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(outer), contour(hole)], plane);
  const result = triangulateSectionTopology(topo);

  assert.equal(result.status, "ok");
  assert.equal(result.groups.length, 1);

  const gi = result.groups[0];
  assert.equal(gi.vertexCount, 8, "4 outer + 4 hole = 8 vertices");
  assert.equal(gi.indexCount % 3, 0, "indices must be a multiple of 3");

  // Area = 16 - 4 = 12
  const triArea = totalTriangulatedArea(result);
  assert.ok(Math.abs(triArea - 12) < 1e-6);
});

test("all indices are valid integers within vertex range", () => {
  const outer = [
    v3(0, 0, 0.5), v3(3, 0, 0.5), v3(3, 3, 0.5), v3(0, 3, 0.5),
  ];
  const hole = [
    v3(1, 1, 0.5), v3(2, 1, 0.5), v3(2, 2, 0.5), v3(1, 2, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(outer), contour(hole)], plane);
  const result = triangulateSectionTopology(topo);

  assert.equal(result.status, "ok");
  const maxVertex = result.vertices2D.length;
  for (const idx of result.indices) {
    assert.ok(Number.isInteger(idx), `index ${idx} is not an integer`);
    assert.ok(idx >= 0, `index ${idx} is negative`);
    assert.ok(idx < maxVertex, `index ${idx} >= vertex count ${maxVertex}`);
  }
});

test("topology rejected when passed to triangulation (needs status ok)", () => {
  const badTopo = { status: "error", error: "open-chain", groups: [] };
  assert.throws(
    () => triangulateSectionTopology(badTopo),
    /status must be "ok"/,
  );
});

test("hole winding is enforced to CW (negative area)", () => {
  // Inner hole in 4x4 outer, hole given as CCW
  const outer = [
    v3(0, 0, 0.5), v3(4, 0, 0.5), v3(4, 4, 0.5), v3(0, 4, 0.5),
  ];
  // Hole drawn CCW (will be converted to CW by topology)
  const hole = [
    v3(1, 1, 0.5), v3(3, 1, 0.5), v3(3, 3, 0.5), v3(1, 3, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topo = buildSectionContourTopology([contour(outer), contour(hole)], plane);
  assert.equal(topo.status, "ok");

  // The hole should have negative area (CW)
  const hole2D = topo.groups[0].holes2D[0];
  const holeArea = shoelaceArea2D(hole2D);
  assert.ok(holeArea < 0, `hole should have negative area (CW), got ${holeArea}`);
});

test("concave child ring uses a boundary vertex rather than an exterior vertex-average", () => {
  const outer = [
    v3(0, 0, 0.5), v3(4, 0, 0.5), v3(4, 4, 0.5), v3(3, 4, 0.5),
    v3(3, 1, 0.5), v3(1, 1, 0.5), v3(1, 4, 0.5), v3(0, 4, 0.5),
  ];
  const concaveChild = [
    v3(0.2, 0.2, 0.5), v3(3.8, 0.2, 0.5), v3(3.8, 3.8, 0.5),
    v3(3.4, 3.8, 0.5), v3(3.4, 0.6, 0.5), v3(0.6, 0.6, 0.5),
    v3(0.6, 3.8, 0.5), v3(0.2, 3.8, 0.5),
  ];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

  const topology = buildSectionContourTopology(
    [contour(outer), contour(concaveChild)],
    plane,
  );

  assert.equal(topology.status, "ok");
  assert.equal(topology.groups.length, 1);
  assert.equal(topology.groups[0].holes2D.length, 1);
});

test("DEFAULT_EPSILON is exported from topology", () => {
  assert.equal(DEFAULT_EPSILON, 1e-7);
});

test("triangulation DEFAULT_EPSILON is exported", async () => {
  const { DEFAULT_EPSILON: triEps } = await import("../geometry/section-triangulation.js");
  assert.equal(triEps, 1e-7);
});
