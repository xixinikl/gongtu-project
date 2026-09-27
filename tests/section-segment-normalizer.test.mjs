import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import {
  DEFAULT_EPSILON,
  normalizeSectionSegments,
} from "../geometry/section-segment-normalizer.js";

function vector(x, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function segment(start, end, triangleId) {
  return { start, end, triangleId };
}

function serialized(result) {
  return result.segments.map(({ start, end, triangleIds }) => ({
    start: start.toArray(),
    end: end.toArray(),
    triangleIds,
  }));
}

test("empty input produces an explicit empty deterministic result", () => {
  assert.deepEqual(normalizeSectionSegments([]), {
    segments: [],
    epsilon: DEFAULT_EPSILON,
    removed: { zeroLength: 0, duplicates: 0 },
  });
});

test("independent segments are oriented and sorted lexicographically", () => {
  const result = normalizeSectionSegments([
    segment(vector(4), vector(3), "later"),
    segment(vector(2), vector(0), "first"),
  ]);

  assert.deepEqual(serialized(result), [
    { start: [0, 0, 0], end: [2, 0, 0], triangleIds: ["first"] },
    { start: [3, 0, 0], end: [4, 0, 0], triangleIds: ["later"] },
  ]);
});

test("exact and reverse duplicates collapse while all source ids are retained", () => {
  const result = normalizeSectionSegments([
    segment(vector(0), vector(2), "face-b"),
    segment(vector(0), vector(2), "face-a"),
    segment(vector(2), vector(0), "face-c"),
  ]);

  assert.equal(result.segments.length, 1);
  assert.equal(result.removed.duplicates, 2);
  assert.deepEqual(result.segments[0].triangleIds, ["face-a", "face-b", "face-c"]);
});

test("source ids are stable, unique and preserve distinct string and number ids", () => {
  const result = normalizeSectionSegments([
    segment(vector(0), vector(1), 2),
    segment(vector(1), vector(0), "2"),
    segment(vector(0), vector(1), 2),
  ]);

  assert.deepEqual(result.segments[0].triangleIds, [2, "2"]);
  assert.equal(result.removed.duplicates, 2);
});

test("endpoints inside epsilon merge to the lexicographically smallest representative", () => {
  const result = normalizeSectionSegments([
    segment(vector(0), vector(1), "a"),
    segment(vector(1 + 5e-8), vector(2), "b"),
  ]);

  assert.deepEqual(serialized(result), [
    { start: [0, 0, 0], end: [1, 0, 0], triangleIds: ["a"] },
    { start: [1, 0, 0], end: [2, 0, 0], triangleIds: ["b"] },
  ]);
});

test("endpoints outside epsilon remain distinct", () => {
  const result = normalizeSectionSegments([
    segment(vector(0), vector(1), "a"),
    segment(vector(1 + 2e-7), vector(2), "b"),
  ]);

  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[1].start.x, 1 + 2e-7);
});

test("a segment collapsed by endpoint normalization is removed as zero length", () => {
  const result = normalizeSectionSegments([
    segment(vector(0), vector(5e-8), "tiny"),
  ]);

  assert.equal(result.segments.length, 0);
  assert.deepEqual(result.removed, { zeroLength: 1, duplicates: 0 });
});

test("transitive endpoint clusters and output are independent of input order", () => {
  const input = [
    segment(vector(0), vector(1), "c"),
    segment(vector(1 + 0.75e-7), vector(2), "b"),
    segment(vector(1 + 1.5e-7), vector(3), "a"),
  ];
  const forward = normalizeSectionSegments(input);
  const reverse = normalizeSectionSegments([...input].reverse());

  assert.deepEqual(serialized(forward), serialized(reverse));
  assert.deepEqual(serialized(forward).map(({ start }) => start), [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
  ]);
});

test("normalization does not mutate input vectors", () => {
  const start = vector(2);
  const end = vector(-1);
  const result = normalizeSectionSegments([segment(start, end, 7)]);

  assert.deepEqual(start.toArray(), [2, 0, 0]);
  assert.deepEqual(end.toArray(), [-1, 0, 0]);
  assert.notEqual(result.segments[0].start, end);
  assert.notEqual(result.segments[0].end, start);
});

test("malformed segments and invalid epsilon fail explicitly", () => {
  assert.throws(() => normalizeSectionSegments(null), /must be an array/);
  assert.throws(
    () => normalizeSectionSegments([{ start: vector(0), end: [1, 0, 0] }]),
    /THREE\.Vector3/,
  );
  assert.throws(
    () => normalizeSectionSegments([segment(vector(0), vector(1), {})]),
    /triangleId/,
  );
  assert.throws(
    () => normalizeSectionSegments([segment(vector(Number.NaN), vector(1), 1)]),
    /finite coordinates/,
  );
  assert.throws(
    () => normalizeSectionSegments([segment(vector(0), vector(1), Number.NaN)]),
    /numeric triangleId must be finite/,
  );
  assert.throws(
    () => normalizeSectionSegments([], { epsilon: 0 }),
    /positive finite/,
  );
});
