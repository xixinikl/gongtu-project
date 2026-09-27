import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import {
  createStackedCylinder,
  createConeTopCylinder,
  createDoubleCone,
  createFrustum,
  createHalfCylinderOnBox,
  createCylinderArray,
  recolorAssembly,
  computeAssemblyBBox,
} from "../geometry/composite-generator.js";
import { collectWorldEdges } from "../geometry/plane-intersections.js";

// ======================================================
// 1. 层叠圆柱
// ======================================================
test("createStackedCylinder: two equal segments", () => {
  const group = createStackedCylinder([
    { radius: 1, height: 2 },
    { radius: 1, height: 2 },
  ]);
  assert.equal(group.userData.type, "stackedCylinder");
  assert.equal(group.userData.segmentCount, 2);

  // 两个子组
  assert.equal(group.children.length, 2);
  assert.ok(group.children[0].name.startsWith("StackSegment"));
  assert.ok(group.children[1].name.startsWith("StackSegment"));

  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxY, 4);
  assert.equal(bbox.maxX, 1);
});

test("createStackedCylinder: tapering radii", () => {
  const group = createStackedCylinder([
    { radius: 2, height: 1 },
    { radius: 1, height: 2 },
    { radius: 0.5, height: 1 },
  ]);
  assert.equal(group.children.length, 3);
  // 交界环：第 0-1 段和第 1-2 段之间各一个 ring
  // each StackSegment has ring when radius differs from next
  // So segment 0's subgroup should have a ring child, segment 1's subgroup too
  const seg0 = group.children[0];
  const seg1 = group.children[1];
  let ringCount = 0;
  seg0.traverse((c) => { if (c.name.startsWith("StackRing_")) ringCount++; });
  assert.equal(ringCount, 1, "第 0 段应有交界环");
  ringCount = 0;
  seg1.traverse((c) => { if (c.name.startsWith("StackRing_")) ringCount++; });
  assert.equal(ringCount, 1, "第 1 段应有交界环");

  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxY, 4);
  assert.equal(bbox.maxX, 2);
});

test("createStackedCylinder: explicit yOffset", () => {
  const group = createStackedCylinder([
    { radius: 1, height: 1, yOffset: 2 },
    { radius: 1, height: 1, yOffset: 4 },
  ]);
  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 2);
  assert.equal(bbox.maxY, 5);
});

test("createStackedCylinder: empty input", () => {
  const group = createStackedCylinder([]);
  assert.equal(group.userData.segmentCount, 0);
  assert.equal(group.children.length, 0);
});

test("createStackedCylinder: colorPalette", () => {
  const group = createStackedCylinder(
    [{ radius: 1, height: 1 }, { radius: 1, height: 1 }],
    { colorPalette: [0xff0000, 0x0000ff] },
  );
  const meshes = [];
  group.traverse((c) => { if (c.isMesh && c.name === "CompositeSolid") meshes.push(c); });
  assert.equal(meshes.length, 2);
  assert.equal(meshes[0].material.color.getHex(), 0xff0000);
  assert.equal(meshes[1].material.color.getHex(), 0x0000ff);
});

// ======================================================
// 2. 锥柱组合体
// ======================================================
test("createConeTopCylinder: basic", () => {
  const group = createConeTopCylinder(
    { radius: 1, height: 2 },
    { radius: 1, height: 1 },
    { bodyColor: 0xff0000, capColor: 0x0000ff },
  );

  assert.equal(group.userData.type, "coneTopCylinder");
  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxY, 3);

  // 柱体和锥体不同颜色
  const solids = [];
  group.traverse((c) => { if (c.name === "CompositeSolid") solids.push(c); });
  assert.equal(solids.length, 2);
  assert.equal(solids[0].material.color.getHex(), 0xff0000); // 柱体
  assert.equal(solids[1].material.color.getHex(), 0x0000ff); // 锥体
});

test("createConeTopCylinder: different cap radius", () => {
  const group = createConeTopCylinder(
    { radius: 1, height: 2 },
    { radius: 0.6, height: 1 },
  );
  // 应产生交界环
  let ringFound = false;
  group.traverse((c) => { if (c.name === "ConeTopRing") ringFound = true; });
  assert.ok(ringFound, "锥底与柱顶半径不同时应产生交界环");
});

// ======================================================
// 3. 双锥体
// ======================================================
test("createDoubleCone: basic", () => {
  const group = createDoubleCone(1, 2, 1, 2);
  assert.equal(group.userData.type, "doubleCone");
  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxY, 4);
  assert.equal(bbox.maxX, 1);
});

test("createDoubleCone: asymmetric radii", () => {
  const group = createDoubleCone(2, 1, 1, 2);
  const bbox = group.userData.bbox;
  assert.equal(bbox.maxY, 3);
  assert.equal(bbox.maxX, 2);

  let ringFound = false;
  group.traverse((c) => { if (c.name === "DoubleConeRing") ringFound = true; });
  assert.ok(ringFound, "半径不同应产生交界环");
});

// ======================================================
// 4. 圆台体
// ======================================================
test("createFrustum: basic", () => {
  const group = createFrustum(2, 1, 3);
  assert.equal(group.userData.type, "frustum");
  assert.equal(group.userData.bottomRadius, 2);
  assert.equal(group.userData.topRadius, 1);
  assert.equal(group.userData.height, 3);

  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxY, 3);
  assert.equal(bbox.maxX, 2);
});

test("createFrustum: negative to zero radii", () => {
  const group = createFrustum(0, 0, 1); // 降级为最小
  const bbox = group.userData.bbox;
  assert.equal(bbox.maxX, 0.01);
});

// ======================================================
// 5. 半圆柱 + 长方体底座
// ======================================================
test("createHalfCylinderOnBox: basic", () => {
  const group = createHalfCylinderOnBox(1, 2, 3, 1, 3);
  assert.equal(group.userData.type, "halfCylinderOnBox");

  const bbox = group.userData.bbox;
  // 底座 y: 0-1，半圆柱 y: 1-3
  // maxX: max(3/2, 1) = 1.5
  assert.ok(Math.abs(bbox.maxY - 3) < 1e-10);
  assert.ok(bbox.maxX >= 1.4, `maxX 应 >= 1.5，实际 ${bbox.maxX}`);
});

// ======================================================
// 6. 圆柱阵列
// ======================================================
test("createCylinderArray: 2x2", () => {
  const group = createCylinderArray(0.3, 3, 2, 2, 2);
  assert.equal(group.userData.type, "cylinderArray");
  assert.equal(group.userData.rows, 2);
  assert.equal(group.userData.cols, 2);

  const bbox = group.userData.bbox;
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxY, 3);
  // spacing=2 → halfW = (2-1)*2/2 + 0.3 = 1.3
  assert.ok(Math.abs(bbox.maxX - 1.3) < 1e-9);
});

test("createCylinderArray: single cylinder (1x1)", () => {
  const group = createCylinderArray(0.5, 2, 1, 1, 1);
  assert.equal(group.userData.rows, 1);
  assert.equal(group.children.length, 1);
});

// ======================================================
// 7. recolorAssembly
// ======================================================
test("recolorAssembly: updates all MeshStandardMaterials", () => {
  const group = createStackedCylinder([
    { radius: 1, height: 1 },
    { radius: 1, height: 1 },
  ]);
  recolorAssembly(group, 0x00ff00);

  const meshes = [];
  group.traverse((c) => { if (c.isMesh && c.material?.isMeshStandardMaterial) meshes.push(c); });
  for (const m of meshes) {
    assert.equal(m.material.color.getHex(), 0x00ff00);
  }
});

// ======================================================
// 8. computeAssemblyBBox
// ======================================================
test("computeAssemblyBBox: matches userData", () => {
  const group = createStackedCylinder([
    { radius: 1.5, height: 2 },
    { radius: 0.5, height: 1 },
  ]);
  const bbox = computeAssemblyBBox(group);
  assert.ok(Math.abs(bbox.maxX - 1.5) < 1e-9);
  assert.ok(Math.abs(bbox.maxY - 3) < 1e-9);
});

test("computeAssemblyBBox: empty returns zero", () => {
  const group = new THREE.Group();
  const bbox = computeAssemblyBBox(group);
  assert.deepStrictEqual(bbox, { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
});

// ======================================================
// 9. 外观选项
// ======================================================
test("appearance: opacity and wireframe color", () => {
  const group = createFrustum(1, 0.5, 2, { opacity: 0.3, wireframeColor: 0x00ffff });

  const mesh = group.getObjectByName("CompositeSolid");
  assert.equal(mesh.material.opacity, 0.3);
  assert.ok(mesh.material.transparent);

  const wf = group.getObjectByName("CompositeWireframe");
  assert.equal(wf.material.color.getHex(), 0x00ffff);
});

// ======================================================
// 10. 退化输入安全降级
// ======================================================
test("degraded: zero height → minimum", () => {
  const group = createFrustum(1, 0.5, -5);
  const bbox = group.userData.bbox;
  assert.ok(bbox.maxY > 0, "高度应降级为最小值");
});

test("degraded: negative radius → minimum", () => {
  const group = createStackedCylinder([{ radius: -2, height: 1 }]);
  const bbox = group.userData.bbox;
  assert.ok(bbox.maxX > 0, "半径应降级为最小值");
});
