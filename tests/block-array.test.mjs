import assert from "node:assert/strict";
import test from "node:test";

import { BlockArray } from "../geometry/block-array.js";

// ======================================================
// 1. 基础增删查
// ======================================================
test("add / has / remove", () => {
  const ba = new BlockArray();

  assert.equal(ba.add([0, 0, 0]), true, "首次添加应返回 true");
  assert.ok(ba.has([0, 0, 0]));
  assert.equal(ba.size, 1);

  assert.equal(ba.add([0, 0, 0]), false, "重复添加应返回 false");
  assert.equal(ba.size, 1, "重复不增加 size");

  assert.equal(ba.remove([0, 0, 0]), true);
  assert.ok(!ba.has([0, 0, 0]));
  assert.equal(ba.size, 0);

  assert.equal(ba.remove([0, 0, 0]), false, "删除不存在的返回 false");
});

// ======================================================
// 2. 多个位置与 size
// ======================================================
test("multiple positions", () => {
  const ba = new BlockArray([
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ]);

  assert.equal(ba.size, 3);
  assert.ok(ba.has([0, 0, 0]));
  assert.ok(ba.has([1, 0, 0]));
  assert.ok(ba.has([0, 1, 0]));
  assert.ok(!ba.has([2, 0, 0]));
});

// ======================================================
// 3. isEmpty
// ======================================================
test("isEmpty", () => {
  const ba = new BlockArray();
  assert.ok(ba.isEmpty);

  ba.add([0, 0, 0]);
  assert.ok(!ba.isEmpty);

  ba.remove([0, 0, 0]);
  assert.ok(ba.isEmpty);
});

// ======================================================
// 4. 包围盒
// ======================================================
test("getBounds — single cell", () => {
  const ba = new BlockArray([[5, 2, -3]]);
  const b = ba.getBounds();

  assert.ok(b !== null);
  assert.deepStrictEqual(b, {
    minX: 5, maxX: 5, sizeX: 1,
    minY: 2, maxY: 2, sizeY: 1,
    minZ: -3, maxZ: -3, sizeZ: 1,
  });
});

test("getBounds — 2×2×2 cube", () => {
  const positions = [];
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++)
        positions.push([x, y, z]);

  const ba = new BlockArray(positions);
  const b = ba.getBounds();

  assert.ok(b !== null);
  assert.deepStrictEqual(b, {
    minX: 0, maxX: 1, sizeX: 2,
    minY: 0, maxY: 1, sizeY: 2,
    minZ: 0, maxZ: 1, sizeZ: 2,
  });
});

test("getBounds — empty returns null", () => {
  const ba = new BlockArray();
  assert.strictEqual(ba.getBounds(), null);
});

// ======================================================
// 5. 非整数拒绝
// ======================================================
test("rejects non-integer positions", () => {
  const ba = new BlockArray();

  assert.throws(() => ba.add([0.5, 0, 0]), RangeError);
  assert.throws(() => ba.has([0, 1.2, 0]), RangeError);
  assert.throws(() => ba.remove([0, 0, NaN]), RangeError);
  assert.throws(() => ba.add([0, 0]), TypeError, "不足 3 维应报 TypeError");
  assert.throws(() => ba.add([0, 0, 0, 0]), TypeError, "超过 3 维应报 TypeError");
});

// ======================================================
// 6. 序列化往返
// ======================================================
test("toJSON / fromJSON round-trip", () => {
  const original = new BlockArray([
    [0, 0, 0],
    [1, 2, 3],
    [-1, 0, 5],
  ]);
  const json = original.toJSON();

  assert.equal(json.length, 3);
  assert.ok(Array.isArray(json));

  const restored = BlockArray.fromJSON(json);
  assert.equal(restored.size, 3);
  assert.ok(restored.has([0, 0, 0]));
  assert.ok(restored.has([1, 2, 3]));
  assert.ok(restored.has([-1, 0, 5]));
});

// ======================================================
// 7. forEach 迭代
// ======================================================
test("forEach iteration", () => {
  const ba = new BlockArray([
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
  ]);

  const visited = [];
  ba.forEach((pos, i) => {
    visited.push({ pos: [...pos], i });
  });

  assert.equal(visited.length, 3);
  assert.equal(visited[0].i, 0);
  assert.equal(visited[1].i, 1);
  assert.equal(visited[2].i, 2);
});

// ======================================================
// 8. layersByY
// ======================================================
test("layersByY", () => {
  const ba = new BlockArray([
    [0, 0, 0], [1, 0, 0],   // y=0
    [0, 1, 0],               // y=1
    [0, 2, 0], [1, 2, 0],   // y=2
  ]);

  const layers = ba.layersByY();
  assert.equal(layers.size, 3);
  assert.equal(layers.get(0).length, 2);
  assert.equal(layers.get(1).length, 1);
  assert.equal(layers.get(2).length, 2);
});

// ======================================================
// 9. 正投影视图
// ======================================================
test("project xy (top view)", () => {
  // 一个 2×1×1 的水平条
  const ba = new BlockArray([[0, 0, 0], [1, 0, 0]]);
  const proj = ba.project("xy");

  assert.equal(proj.length, 2);
  assert.deepStrictEqual(proj, [[0, 0], [1, 0]]);
});

test("project xz (front view)", () => {
  // 两个不同 xz 位置的方块
  const ba = new BlockArray([[0, 0, 0], [1, 2, 3]]);
  const proj = ba.project("xz");

  assert.equal(proj.length, 2);
  assert.deepStrictEqual(proj, [[0, 0], [1, 3]]);
});

test("project yz (side view)", () => {
  const ba = new BlockArray([[0, 1, 2], [3, 1, 2]]); // 同一 y,z
  const proj = ba.project("yz");

  assert.equal(proj.length, 1, "相同 (y,z) 应去重");
  assert.deepStrictEqual(proj, [[1, 2]]);
});

test("project — L-shape top view", () => {
  // L 形：y=0 层，(0,0,0)(1,0,0)(1,0,1) → 俯视图去重 xz
  const ba = new BlockArray([
    [0, 0, 0], [1, 0, 0], [1, 0, 1],
  ]);
  const proj = ba.project("xz");
  assert.equal(proj.length, 3);
});

// ======================================================
// 10. clear
// ======================================================
test("clear empties all", () => {
  const ba = new BlockArray([[0, 0, 0], [1, 1, 1]]);
  assert.equal(ba.size, 2);

  ba.clear();
  assert.ok(ba.isEmpty);
  assert.equal(ba.size, 0);
  assert.strictEqual(ba.getBounds(), null);
});

// ======================================================
// 11. 负坐标
// ======================================================
test("negative coordinates", () => {
  const ba = new BlockArray([
    [-2, -1, 0],
    [-2, 0, 0],
    [-2, -1, 1],
  ]);

  assert.equal(ba.size, 3);
  const b = ba.getBounds();
  assert.ok(b !== null);
  assert.equal(b.minX, -2);
  assert.equal(b.maxX, -2);
  assert.equal(b.minY, -1);
  assert.equal(b.maxY, 0);
  assert.equal(b.minZ, 0);
  assert.equal(b.maxZ, 1);
});

// ======================================================
// 12. 无效投影平面
// ======================================================
test("project rejects invalid plane", () => {
  const ba = new BlockArray([[0, 0, 0]]);
  assert.throws(() => ba.project("ab"), RangeError);
  assert.throws(() => ba.project(""), RangeError);
});
