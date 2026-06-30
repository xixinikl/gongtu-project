import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createBlockAssembly, addBlockLabels, removeBlockLabels } from "../geometry/block-assembly.js";
import { BlockArray } from "../geometry/block-array.js";
import { collectWorldEdges } from "../geometry/plane-intersections.js";

// ======================================================
// 1. 基础：单积木、空输入、相邻合并
// ======================================================
test("single block", () => {
  const group = createBlockAssembly([[0, 0, 0]]);
  assert.equal(group.userData.type, "blockAssembly");
  assert.equal(group.userData.blockCount, 1);

  const mesh = group.getObjectByName("BlockAssemblySolid");
  assert.ok(mesh?.isMesh, "应有实体 mesh");
});

test("empty array / BlockArray", () => {
  const g1 = createBlockAssembly([]);
  assert.equal(g1.userData.blockCount, 0);
  const g2 = createBlockAssembly(new BlockArray());
  assert.equal(g2.userData.blockCount, 0);
});

test("two adjacent blocks — merged edges", () => {
  const group = createBlockAssembly([[0, 0, 0], [1, 0, 0]]);
  group.updateMatrixWorld(true);

  const edges = collectWorldEdges(group);
  // 合并后两个相邻积木共面边被消除，应 < 24
  assert.ok(edges.length < 24, `合并后棱线应 <24，实际 ${edges.length}`);
});

test("2x2x2 cube assembly — edges count", () => {
  const positions = [];
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++)
        positions.push([x, y, z]);

  const group = createBlockAssembly(positions);
  group.updateMatrixWorld(true);

  const edges = collectWorldEdges(group);
  assert.ok(edges.length >= 12, `至少 12 条外棱，实际 ${edges.length}`);
  assert.ok(edges.length < 40, `应远少于 96，实际 ${edges.length}`);
});

test("block centers at (x+0.5, y+0.5, z+0.5)", () => {
  const group = createBlockAssembly([[2, 3, 4]]);
  group.updateMatrixWorld(true);

  const bbox = new THREE.Box3();
  group.traverse((c) => { if (c.isMesh) bbox.expandByObject(c); });

  assert.ok(Math.abs(bbox.min.x - 2) < 1e-10);
  assert.ok(Math.abs(bbox.min.y - 3) < 1e-10);
  assert.ok(Math.abs(bbox.min.z - 4) < 1e-10);
  assert.ok(Math.abs(bbox.max.x - 3) < 1e-10);
  assert.ok(Math.abs(bbox.max.y - 4) < 1e-10);
  assert.ok(Math.abs(bbox.max.z - 5) < 1e-10);
});

// ======================================================
// 2. 配色方案：layered
// ======================================================
test("colorScheme: layered — different Y layers", () => {
  const positions = [
    [0, 0, 0], [1, 0, 0],   // y=0
    [0, 1, 0],               // y=1
    [0, 2, 0], [1, 2, 0],   // y=2
  ];
  const group = createBlockAssembly(positions, { colorScheme: "layered" });
  assert.equal(group.userData.colorScheme, "layered");

  // 3 层 → 3 个子组，每个子组包含 solid + wireframe
  const subgroups = group.children;
  assert.equal(subgroups.length, 3, `应有 3 个分层子组，实际 ${subgroups.length}`);

  // 每层颜色不同
  const colors = subgroups.map((sg) => {
    const mesh = sg.getObjectByName("BlockAssemblySolid");
    return mesh.material.color.getHex();
  });
  const uniqueColors = new Set(colors);
  assert.equal(uniqueColors.size, 3, "3 层应有 3 种不同颜色");
});

// ======================================================
// 3. 配色方案：自定义函数
// ======================================================
test("colorScheme: custom function", () => {
  const positions = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  // 按 x 坐标染色
  const group = createBlockAssembly(positions, {
    colorScheme: (x, y, z, i) => x === 0 ? 0xff0000 : 0x0000ff,
  });

  const subgroups = group.children;
  assert.equal(subgroups.length, 2, "两种颜色 → 2 个子组");

  // 收集颜色
  const colors = subgroups.map((sg) => {
    const mesh = sg.getObjectByName("BlockAssemblySolid");
    return mesh.material.color.getHex();
  });
  assert.ok(colors.includes(0xff0000));
  assert.ok(colors.includes(0x0000ff));
});

// ======================================================
// 4. 配色方案：uniform（默认）
// ======================================================
test("colorScheme: uniform (default)", () => {
  const group = createBlockAssembly([[0, 0, 0], [1, 1, 1]], { color: 0xaaaaaa });
  assert.equal(group.userData.colorScheme, "uniform");
  assert.equal(group.children.length, 1); // 一组合并几何体

  const mesh = group.getObjectByName("BlockAssemblySolid");
  assert.equal(mesh.material.color.getHex(), 0xaaaaaa);
});

// ======================================================
// 5. 外观选项
// ======================================================
test("appearance: opacity + wireframe", () => {
  const group = createBlockAssembly([[0, 0, 0]], {
    color: 0xff0000,
    opacity: 0.5,
    wireframeColor: 0x0000ff,
  });

  const mesh = group.getObjectByName("BlockAssemblySolid");
  assert.equal(mesh.material.color.getHex(), 0xff0000);
  assert.equal(mesh.material.opacity, 0.5);
  assert.ok(mesh.material.transparent);

  const wf = group.getObjectByName("BlockAssemblyWireframe");
  assert.equal(wf.material.color.getHex(), 0x0000ff);
});

// ======================================================
// 6. 编号标签（仅在支持 Canvas 的环境生效）
// ======================================================
test("addBlockLabels: returns sprites or empty", () => {
  const group = createBlockAssembly([[0, 0, 0], [1, 0, 0]]);
  const sprites = addBlockLabels(group);

  // Node.js 无 Canvas → 返回空数组；浏览器有 Canvas → 返回 sprites
  if (typeof globalThis.OffscreenCanvas === "undefined" && typeof globalThis.HTMLCanvasElement === "undefined") {
    assert.equal(sprites.length, 0, "Node.js 环境无 Canvas");
    return;
  }

  assert.equal(sprites.length, 2);
  assert.ok(sprites[0].isSprite);
  assert.equal(sprites[0].name, "BlockLabel_1");
  assert.equal(sprites[1].name, "BlockLabel_2");
});

test("addBlockLabels: custom start index", () => {
  const group = createBlockAssembly([[0, 0, 0]]);

  if (typeof globalThis.OffscreenCanvas === "undefined" && typeof globalThis.HTMLCanvasElement === "undefined") {
    const sprites = addBlockLabels(group, { startIndex: 5 });
    assert.equal(sprites.length, 0);
    return;
  }

  const sprites = addBlockLabels(group, { startIndex: 5 });
  assert.equal(sprites[0].name, "BlockLabel_5");
});

test("addBlockLabels: labelSize option", () => {
  const group = createBlockAssembly([[0, 0, 0]]);

  if (typeof globalThis.OffscreenCanvas === "undefined" && typeof globalThis.HTMLCanvasElement === "undefined") {
    return;
  }

  const sprites = addBlockLabels(group, { labelSize: 0.8 });
  assert.ok(Math.abs(sprites[0].scale.x - 0.8) < 1e-10);
});

test("removeBlockLabels: cleanup", () => {
  const group = createBlockAssembly([[0, 0, 0]]);

  if (typeof globalThis.OffscreenCanvas !== "undefined" || typeof globalThis.HTMLCanvasElement !== "undefined") {
    addBlockLabels(group);
  }

  // 直接清除（即使没有标签也不报错）
  removeBlockLabels(group);

  // 确认不存在标签 sprite
  let hasLabel = false;
  group.traverse((c) => { if (c.isSprite && c.name.startsWith("BlockLabel_")) hasLabel = true; });
  assert.ok(!hasLabel, "不应残留标签");
});

// ======================================================
// 7. 负坐标 + 复杂形状
// ======================================================
test("negative coordinates", () => {
  const group = createBlockAssembly([[-2, -1, 0], [-2, 0, 0]]);
  group.updateMatrixWorld(true);

  const bbox = new THREE.Box3();
  group.traverse((c) => { if (c.isMesh) bbox.expandByObject(c); });

  assert.equal(bbox.min.x, -2);
  assert.equal(bbox.max.x, -1);
  assert.equal(bbox.min.y, -1);
  assert.equal(bbox.max.y, 1);
});

test("L-shape assembly", () => {
  const group = createBlockAssembly([[0, 0, 0], [1, 0, 0], [0, 0, 1]]);
  group.updateMatrixWorld(true);

  const edges = collectWorldEdges(group);
  assert.ok(edges.length >= 18, `L 形棱线 ≥18，实际 ${edges.length}`);
});

// ======================================================
// 8. 分层配色 — 自定义调色板
// ======================================================
test("colorScheme: layered with custom palette", () => {
  const positions = [[0, 0, 0], [0, 1, 0], [0, 2, 0]];
  const group = createBlockAssembly(positions, {
    colorScheme: "layered",
    layerPalette: [0xff0000, 0x00ff00, 0x0000ff],
  });

  assert.equal(group.children.length, 3);
  const colors = group.children.map((sg) => {
    return sg.getObjectByName("BlockAssemblySolid").material.color.getHex();
  });
  assert.deepStrictEqual(colors, [0xff0000, 0x00ff00, 0x0000ff]);
});
