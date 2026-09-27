/**
 * 布尔组合几何运算测试。
 *
 * 覆盖：UNION / SUBTRACTION / INTERSECTION 基本运算、
 * 链式多步、结果包装、体积/面数度量、退化检测。
 */

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  csgFromGeometry,
  csgUnion,
  csgSubtract,
  csgIntersect,
  csgChain,
  csgToShape,
  csgComputeVolume,
  csgIsEmpty,
  csgFaceCount,
  csgEvaluate,
} from "../geometry/csg-operations.js";
import { ADDITION, SUBTRACTION, INTERSECTION, Brush } from "three-bvh-csg";

// ======================================================
// 工厂辅助
// ======================================================

/** 单位立方体 Brush（-0.5 ~ +0.5） */
function unitBox(w = 1, h = 1, d = 1) {
  const geom = new THREE.BoxGeometry(w, h, d);
  return csgFromGeometry(geom);
}

/** 单位球 Brush（半径 r，中心原点） */
function unitSphere(r = 1) {
  const geom = new THREE.SphereGeometry(r, 48, 32);
  return csgFromGeometry(geom);
}

/** 圆柱 Brush */
function unitCylinder(rTop = 1, rBottom = 1, height = 2, segs = 48) {
  const geom = new THREE.CylinderGeometry(rTop, rBottom, height, segs);
  return csgFromGeometry(geom);
}

// ======================================================
// 工具
// ======================================================

function approxEqual(a, b, tol = 1e-6) {
  return Math.abs(a - b) < tol;
}

function bboxVolume(brush) {
  const geom = brush.geometry;
  if (!geom) return 0;
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const s = bb.getSize(new THREE.Vector3());
  return s.x * s.y * s.z;
}

// ======================================================
// 1. 基本 UNION
// ======================================================

test("csgUnion: two identical cubes", () => {
  const a = unitBox();
  const b = unitBox();
  const r = csgUnion(a, b);
  assert.ok(r.isBrush);
  assert.ok(csgFaceCount(r) > 0);
  // 体积应接近 1（完全重叠不增加体积）
  const vol = csgComputeVolume(r);
  assert.ok(approxEqual(vol, 1, 0.1), `体积 1 附近，实际 ${vol}`);
});

test("csgUnion: two adjacent cubes", () => {
  // 平移 b 使其贴在 a 右边
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(1, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgUnion(a, b);
  const vol = csgComputeVolume(r);
  assert.ok(approxEqual(vol, 2, 0.15), `体积 2 附近，实际 ${vol}`);
});

test("csgUnion: two offset cubes partial overlap", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(0.5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgUnion(a, b);
  const vol = csgComputeVolume(r);
  // 两个单位立方体 50% 重叠 → 体积 ≈ 1.5
  assert.ok(vol > 1.3 && vol < 1.7, `体积 ~1.5，实际 ${vol}`);
});

test("csgUnion: cube and sphere", () => {
  const a = unitBox();
  const b = unitSphere(0.6);
  const r = csgUnion(a, b);
  assert.ok(csgFaceCount(r) > 0);
  // 体积应 > 立方体体积
  const vol = csgComputeVolume(r);
  assert.ok(vol > 0.8, `体积应 > 0.8，实际 ${vol}`);
});

// ======================================================
// 2. SUBTRACTION
// ======================================================

test("csgSubtract: cube minus smaller sphere at center", () => {
  const a = unitBox();
  const b = unitSphere(0.3);
  const r = csgSubtract(a, b);
  assert.ok(csgFaceCount(r) > 0);
  // 体积应 < 1
  const vol = csgComputeVolume(r);
  assert.ok(vol < 0.98, `体积应 < 0.98，实际 ${vol}`);
});

test("csgSubtract: cube minus offset sphere", () => {
  const a = unitBox();
  const bGeom = new THREE.SphereGeometry(0.3, 48, 32);
  bGeom.translate(0.5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgSubtract(a, b);
  assert.ok(csgFaceCount(r) > 0);
  const vol = csgComputeVolume(r);
  assert.ok(vol < 0.98, `体积应 < 0.98，实际 ${vol}`);
});

test("csgSubtract: cube minus identical cube → empty", () => {
  const a = unitBox();
  const b = unitBox();
  const r = csgSubtract(a, b);
  assert.ok(csgIsEmpty(r), "完全减去应得空几何体");
});

test("csgSubtract: cube minus larger cube → empty", () => {
  const a = unitBox(0.5, 0.5, 0.5);
  const b = unitBox();
  const r = csgSubtract(a, b);
  assert.ok(csgIsEmpty(r), "被大立方体完全包络应得空几何体");
});

test("csgSubtract: disjoint → a unchanged", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgSubtract(a, b);
  const vol = csgComputeVolume(r);
  assert.ok(approxEqual(vol, 1, 0.1), `不相交减去应保留原始体积，实际 ${vol}`);
});

// ======================================================
// 3. INTERSECTION
// ======================================================

test("csgIntersect: two identical cubes", () => {
  const a = unitBox();
  const b = unitBox();
  const r = csgIntersect(a, b);
  assert.ok(csgFaceCount(r) > 0);
  const vol = csgComputeVolume(r);
  assert.ok(approxEqual(vol, 1, 0.1), `完全重叠取交体积 1，实际 ${vol}`);
});

test("csgIntersect: cube and offset half-overlap cube", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(0.5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgIntersect(a, b);
  const vol = csgComputeVolume(r);
  // 相交区域 0.5 × 1 × 1 = 0.5
  assert.ok(approxEqual(vol, 0.5, 0.08), `体积 ~0.5，实际 ${vol}`);
});

test("csgIntersect: cube and sphere at origin", () => {
  const a = unitBox();
  const b = unitSphere(0.6);
  const r = csgIntersect(a, b);
  assert.ok(csgFaceCount(r) > 0);
  // 交集体积 < 球体体积
  const vol = csgComputeVolume(r);
  const sphereVol = (4 / 3) * Math.PI * 0.6 * 0.6 * 0.6;
  assert.ok(vol < sphereVol, "交集体积 < 球体体积");
});

test("csgIntersect: disjoint → empty", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgIntersect(a, b);
  assert.ok(csgIsEmpty(r), "不相交取交应得空几何体");
});

// ======================================================
// 4. 链式多步
// ======================================================

test("csgChain: (a ∪ b) - c", () => {
  // a: 原点立方体, b: 右侧立方体, c: 共享区域球（钻通孔）
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(1, 0, 0);
  const b = csgFromGeometry(bGeom);
  const c = unitSphere(0.3);

  // 先合并再减去
  const unionAB = csgUnion(a, b);
  const result = csgSubtract(unionAB, c);
  assert.ok(csgFaceCount(result) > 0);
  const vol = csgComputeVolume(result);
  // 两个单位立方体并集 ≈ 2，减去球体后 < 2
  assert.ok(vol < 1.95, `体积应 < 1.95，实际 ${vol}`);
});

test("csgChain: using csgChain helper", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(1, 0, 0);
  const b = csgFromGeometry(bGeom);
  const c = unitSphere(0.3);

  const result = csgChain(a, [
    { brush: b, operation: ADDITION },
    { brush: c, operation: SUBTRACTION },
  ]);
  assert.ok(csgFaceCount(result) > 0);
  const vol = csgComputeVolume(result);
  assert.ok(vol < 1.95, `体积应 < 1.95，实际 ${vol}`);
});

// ======================================================
// 5. csgFromGeometry 输入类型
// ======================================================

test("csgFromGeometry: from BufferGeometry", () => {
  const geom = new THREE.BoxGeometry(2, 2, 2);
  const brush = csgFromGeometry(geom);
  assert.ok(brush.isBrush);
  assert.ok(brush.geometry.attributes.position.count > 0);
});

test("csgFromGeometry: from Mesh", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  const brush = csgFromGeometry(mesh);
  assert.ok(brush.isBrush);
  assert.ok(brush.geometry.attributes.position.count > 0);
});

test("csgFromGeometry: from Group with multiple children", () => {
  const group = new THREE.Group();
  const box1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  box1.position.set(-0.5, 0, 0);
  box1.updateMatrix();
  const box2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  box2.position.set(0.5, 0, 0);
  box2.updateMatrix();
  group.add(box1, box2);
  group.updateMatrixWorld(true);

  const brush = csgFromGeometry(group);
  assert.ok(brush.isBrush);
  // 两个立方体合并后至少 48 个顶点（每个 24）
  assert.ok(brush.geometry.attributes.position.count >= 24, `顶点至少 24，实际 ${brush.geometry.attributes.position.count}`);
});

test("csgFromGeometry: invalid input throws", () => {
  assert.throws(() => csgFromGeometry({ type: "Unknown" }), /期望/);
});

// ======================================================
// 6. 结果包装
// ======================================================

test("csgToShape: creates Group with solid + wireframe", () => {
  const a = unitBox();
  const shape = csgToShape(a, { name: "testShape", color: 0xff0000 });
  assert.ok(shape.isGroup);
  assert.equal(shape.name, "testShape");
  assert.equal(shape.children.length, 2);

  const solid = shape.children.find((c) => c.isMesh);
  const wire = shape.children.find((c) => c.isLineSegments);
  assert.ok(solid, "应有 solid mesh");
  assert.ok(wire, "应有 wireframe");
  assert.ok(shape.userData.bbox);
  assert.ok(typeof shape.userData.volume === "number");
  assert.equal(shape.userData.type, "csgResult");
});

test("csgToShape: wireframeColor 默认值", () => {
  const a = unitBox();
  const shape = csgToShape(a);
  const wire = shape.children.find((c) => c.isLineSegments);
  assert.equal(wire.material.color.getHex(), 0x5c4033);
});

// ======================================================
// 7. 度量工具
// ======================================================

test("csgComputeVolume: unit cube", () => {
  const a = unitBox();
  const vol = csgComputeVolume(a);
  assert.ok(approxEqual(vol, 1, 0.01), `单位立方体体积 1，实际 ${vol}`);
});

test("csgComputeVolume: sphere approximate", () => {
  const s = unitSphere(1);
  const vol = csgComputeVolume(s);
  const expected = (4 / 3) * Math.PI; // ≈ 4.189
  assert.ok(approxEqual(vol, expected, 0.15), `球体积 ~4.189，实际 ${vol}`);
});

test("csgFaceCount: box has triangular faces", () => {
  const a = unitBox();
  // BoxGeometry 每个面 2 三角形，6 面 = 12 三角形
  assert.equal(csgFaceCount(a), 12);
});

test("csgIsEmpty: non-empty brush", () => {
  const a = unitBox();
  assert.equal(csgIsEmpty(a), false);
});

test("csgIsEmpty: empty brush", () => {
  const empty = new Brush();
  assert.equal(csgIsEmpty(empty), true);
});

// ======================================================
// 8. 复合场景
// ======================================================

test("composite: cylinder union with box (pier)", () => {
  const cyl = unitCylinder(0.2, 0.2, 2);
  const boxGeom = new THREE.BoxGeometry(1, 0.3, 1);
  boxGeom.translate(0, 1, 0); // 顶部平台
  const box = csgFromGeometry(boxGeom);
  const r = csgUnion(cyl, box);
  assert.ok(csgFaceCount(r) > 0);
  const vol = csgComputeVolume(r);
  assert.ok(vol > 0, "复合体应有正体积");
});

test("composite: cube minus cylinder (drilled hole)", () => {
  const box = unitBox();
  const cyl = unitCylinder(0.2, 0.2, 2); // 贯穿圆柱
  const r = csgSubtract(box, cyl);
  assert.ok(csgFaceCount(r) > 0);
  const vol = csgComputeVolume(r);
  // 减去圆孔后体积 < 1
  assert.ok(vol < 0.99, `体积应 < 0.99，实际 ${vol}`);
});

test("composite: intersection of cylinder and cube", () => {
  const box = unitBox();
  const cyl = unitCylinder(0.5, 0.5, 2);
  const r = csgIntersect(box, cyl);
  assert.ok(csgFaceCount(r) > 0);
  const vol = csgComputeVolume(r);
  assert.ok(vol > 0 && vol < 1, `体积 (0, 1)，实际 ${vol}`);
});

// ======================================================
// 9. csgEvaluate 低级接口
// ======================================================

test("csgEvaluate: explicit ADDITION", () => {
  const a = unitBox();
  const b = unitBox();
  const r = csgEvaluate(a, b, ADDITION);
  assert.ok(r.isBrush);
  assert.ok(csgFaceCount(r) > 0);
});

test("csgEvaluate: explicit SUBTRACTION", () => {
  const a = unitBox();
  const b = unitSphere(0.35); // 小球，不填满整个立方体
  const r = csgEvaluate(a, b, SUBTRACTION);
  assert.ok(csgFaceCount(r) > 0);
});

test("csgEvaluate: explicit INTERSECTION", () => {
  const a = unitBox();
  const b = unitSphere(0.9);
  const r = csgEvaluate(a, b, INTERSECTION);
  assert.ok(csgFaceCount(r) > 0);
});

// ======================================================
// 10. 边界情况
// ======================================================

test("edge: union with self → same geometry volume", () => {
  const a = unitBox();
  const r = csgUnion(a, unitBox());
  const vol = csgComputeVolume(r);
  assert.ok(approxEqual(vol, 1, 0.1), `自身并集体积 1，实际 ${vol}`);
});

test("edge: subtract empty input is handled", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const r = csgSubtract(a, b);
  assert.ok(!csgIsEmpty(r), "不相交减去应保留 a");
});

test("edge: intersect produces non-empty when overlapping", () => {
  const a = unitBox();
  const bGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const b = csgFromGeometry(bGeom);
  const r = csgIntersect(a, b);
  assert.ok(!csgIsEmpty(r), "重叠取交应非空");
});

// ======================================================
// 11. csgChain: 三步操作
// ======================================================

test("csgChain: (a ∩ b) ∪ c", () => {
  const a = unitBox(); // 原点
  const bGeom = new THREE.BoxGeometry(1, 1, 1);
  bGeom.translate(0.5, 0, 0);
  const b = csgFromGeometry(bGeom);
  const cGeom = new THREE.BoxGeometry(1, 1, 1);
  cGeom.translate(0, 1, 0);
  const c = csgFromGeometry(cGeom);

  const result = csgChain(a, [
    { brush: b, operation: INTERSECTION },
    { brush: c, operation: ADDITION },
  ]);
  assert.ok(csgFaceCount(result) > 0);
  const vol = csgComputeVolume(result);
  assert.ok(vol > 0.3, `复合体应有正体积，实际 ${vol}`);
});
