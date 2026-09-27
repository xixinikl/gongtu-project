import assert from "node:assert/strict";
import test from "node:test";

import { sectionV2Fixtures } from "./fixtures/section-v2-fixtures.mjs";

const EPSILON = 1e-10;

function signedArea(vertices) {
  return vertices.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = vertices[(index + 1) % vertices.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0) / 2;
}

function isConcave(vertices) {
  const signs = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const [ax, ay] = vertices[index];
    const [bx, by] = vertices[(index + 1) % vertices.length];
    const [cx, cy] = vertices[(index + 2) % vertices.length];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) > EPSILON) signs.push(Math.sign(cross));
  }
  return signs.some((sign) => sign !== signs[0]);
}

function magnitude(vector) {
  return Math.hypot(...vector);
}

test("fixture catalog covers every SEC2-001 category with unique immutable ids", () => {
  const ids = sectionV2Fixtures.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 10);
  assert.deepEqual(ids, [
    "unit-cube-horizontal",
    "unit-cube-oblique",
    "cylinder-horizontal-16",
    "eighteen-block-three-step-staircase",
    "l-prism-concave",
    "zigzag-concave-prism",
    "two-disconnected-boxes",
    "cube-tangent-at-vertex",
    "cube-through-three-vertices",
    "cube-coplanar-top-face",
  ]);
  assert.ok(Object.isFrozen(sectionV2Fixtures));
  assert.ok(sectionV2Fixtures.every((fixture) => Object.isFrozen(fixture.expected)));
});

test("all plane normals are unit length and area rings are explicit CCW polygons", () => {
  for (const fixture of sectionV2Fixtures) {
    assert.ok(
      Math.abs(magnitude(fixture.plane.normal) - 1) < EPSILON,
      `${fixture.id}: plane normal must be normalized`,
    );
    assert.equal(fixture.expected.contourCount, fixture.expected.rings.length);
    assert.ok(fixture.expected.basisReason.length >= 10);

    for (const expectedRing of fixture.expected.rings) {
      assert.equal(expectedRing.vertexCount, expectedRing.vertices.length);
      assert.ok(expectedRing.vertexCount >= 3);
      const actualArea = signedArea(expectedRing.vertices);
      assert.ok(actualArea > 0, `${fixture.id}: ring must be counter-clockwise`);
      assert.ok(
        Math.abs(actualArea - expectedRing.area) < EPSILON,
        `${fixture.id}: shoelace area ${actualArea} differs from golden ${expectedRing.area}`,
      );
      assert.equal(isConcave(expectedRing.vertices), expectedRing.concave);
    }
  }
});

test("18-block staircase is exactly 18 unique cubes and has the hand-counted 3/2/1 profile", () => {
  const fixture = sectionV2Fixtures.find(({ id }) => id === "eighteen-block-three-step-staircase");
  assert.equal(fixture.model.blocks.length, 18);
  assert.equal(
    new Set(fixture.model.blocks.map((point) => point.join(","))).size,
    18,
  );
  for (let z = 0; z < 3; z += 1) {
    const layer = fixture.model.blocks.filter((point) => point[2] === z);
    assert.deepEqual(
      [0, 1, 2].map((x) => layer.filter((point) => point[0] === x).length),
      [3, 2, 1],
    );
  }
  assert.equal(fixture.expected.rings[0].area, 3 + 2 + 1);
});

test("cylinder golden area uses the fixed mesh polygon rather than analytic circle area", () => {
  const fixture = sectionV2Fixtures.find(({ id }) => id === "cylinder-horizontal-16");
  const expectedArea = 32 * Math.sin(Math.PI / 8);
  assert.ok(Math.abs(fixture.expected.rings[0].area - expectedArea) < EPSILON);
  assert.notEqual(fixture.expected.rings[0].area, Math.PI * 4);
  assert.equal(fixture.expected.rings[0].vertexCount, fixture.model.radialSegments);
});

test("degenerate contracts distinguish a zero-area tangent from a coplanar face", () => {
  const tangent = sectionV2Fixtures.find(({ id }) => id === "cube-tangent-at-vertex");
  const coplanar = sectionV2Fixtures.find(({ id }) => id === "cube-coplanar-top-face");

  assert.equal(tangent.expected.status, "degenerate");
  assert.equal(tangent.expected.contourCount, 0);
  assert.equal(tangent.expected.degeneracy.kind, "point");

  assert.equal(coplanar.expected.status, "area");
  assert.equal(coplanar.expected.contourCount, 1);
  assert.equal(coplanar.expected.degeneracy.kind, "coplanar-face");
});

test("golden fixture module has no dependency on production geometry implementation", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("./fixtures/section-v2-fixtures.mjs", import.meta.url), "utf8"),
  );
  assert.doesNotMatch(source, /from\s+["']\.\.\/\.\.\/geometry\//);
  assert.doesNotMatch(source, /plane-intersections|section-engine|earcut/i);
});
