import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createBlockAssembly } from "../geometry/block-assembly.js";
import { BlockArray } from "../geometry/block-array.js";
import { collectWorldEdges } from "../geometry/plane-intersections.js";

// ======================================================
// 1. 单个积木
// ======================================================
test("single block", () => {
  const group = createBlockAssembly([[0, 0, 0]]);

  assert.equal(group.userData.type, "blockAssembly");
  assert.equal(group.userData.blockCount, 1);
  assert.deepStrictEqual(group.userData.positions, [[0, 0, 0]]);
  assert.equal(group.children.length, 2); // solid + wireframe

  const solid = group.getObjectByName("BlockAssemblySolid");
  assert.ok(solid !== undefined);
  assert.ok(solid.isMesh);

  const wireframe = group.getObjectByName("BlockAssemblyWireframe");
  assert.ok(wireframe !== undefined);
  assert.ok(wireframe.isLineSegments);
});

// ======================================================
// 2. 空输入
// ======================================================
test("empty array", () => {
  const group = createBlockAssembly([]);
  assert.equal(group.userData.blockCount, 0);
  assert.equal(group.userData.positions.length, 0);
});

test("empty BlockArray", () => {
  const ba = new BlockArray();
  const group = createBlockAssembly(ba);
  assert.equal(group.userData.blockCount, 0);
});

// ======================================================
// 3. 两个相邻积木 — 合并几何体棱线
// ======================================================
test("two adjacent blocks — merged edges", () => {
  const group = createBlockAssembly([
    [0, 0, 0],
    [1, 0, 0],
  ]);
  group.updateMatrixWorld(true);

  const wireframe = group.getObjectByName("BlockAssemblyWireframe");
  const pos = wireframe.geometry.attributes.position;
  assert.ok(pos !== undefined);

  // 未合并前：2 × 12 = 24 条边（48 个顶点）
  // 合并后：EdgesGeometry 只保留非共面的边
  // 两个立方体相邻面之间的 4 条内部棱线被去除，应 < 24
  const edgeCount = pos.count / 2; // position 中每 2 个点是一条线段
  assert.ok(edgeCount < 24, `合并后棱线应少于 24 条，实际 ${edgeCount}`);
});

// ======================================================
// 4. collectWorldEdges 兼容
// ======================================================
test("wireframe compatible with collectWorldEdges", () => {
  const group = createBlockAssembly([
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  group.updateMatrixWorld(true);

  const edges = collectWorldEdges(group);
  assert.ok(edges.length >= 10, `应有 ≥10 条世界边，实际 ${edges.length}`);
});

// ======================================================
// 5. 外观选项
// ======================================================
test("appearance options", () => {
  const group = createBlockAssembly([[0, 0, 0]], {
    color: 0xff0000,
    opacity: 0.5,
    wireframeColor: 0x0000ff,
  });

  const solid = group.getObjectByName("BlockAssemblySolid");
  const mat = solid.material;
  assert.equal(mat.color.getHex(), 0xff0000);
  assert.equal(mat.opacity, 0.5);
  assert.ok(mat.transparent);

  const wireframe = group.getObjectByName("BlockAssemblyWireframe");
  assert.equal(wireframe.material.color.getHex(), 0x0000ff);
});

// ======================================================
// 6. 积木中心位置验证
// ======================================================
test("block centers are at (x+0.5, y+0.5, z+0.5)", () => {
  const group = createBlockAssembly([[2, 3, 4]]);
  group.updateMatrixWorld(true);

  const solid = group.getObjectByName("BlockAssemblySolid");
  const bbox = new THREE.Box3().setFromObject(solid);

  // min = (2, 3, 4), max = (3, 4, 5)
  assert.ok(Math.abs(bbox.min.x - 2) < 1e-10);
  assert.ok(Math.abs(bbox.min.y - 3) < 1e-10);
  assert.ok(Math.abs(bbox.min.z - 4) < 1e-10);
  assert.ok(Math.abs(bbox.max.x - 3) < 1e-10);
  assert.ok(Math.abs(bbox.max.y - 4) < 1e-10);
  assert.ok(Math.abs(bbox.max.z - 5) < 1e-10);
});

// ======================================================
// 7. 2×2×2 立方体
// ======================================================
test("2x2x2 cube assembly", () => {
  const positions = [];
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++)
        positions.push([x, y, z]);

  const group = createBlockAssembly(positions);
  assert.equal(group.userData.blockCount, 8);

  const wireframe = group.getObjectByName("BlockAssemblyWireframe");
  const edgeCount = wireframe.geometry.attributes.position.count / 2;

  // 8 个未合并立方体 = 96 条边；合并后应大幅减少（内部面被消除）
  // 2×2×2 大立方体外表有 12 条棱
  assert.ok(edgeCount < 40, `合并后应远少于 96 条棱，实际 ${edgeCount}`);

  // 恰好 12 条棱（EdgesGeometry 可能保留一些内部线但不应多太多）
  assert.ok(edgeCount >= 12, `至少应有 12 条外棱，实际 ${edgeCount}`);
});

// ======================================================
// 8. L 形积木
// ======================================================
test("L-shape block assembly", () => {
  const positions = [
    [0, 0, 0], [1, 0, 0],
    [0, 0, 1],
  ];

  const group = createBlockAssembly(positions);
  assert.equal(group.userData.blockCount, 3);

  group.updateMatrixWorld(true);
  const edges = collectWorldEdges(group);
  assert.ok(edges.length >= 20, `L 形应有 ≥20 条世界边，实际 ${edges.length}`);
});
