import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createCylinder } from "../geometry/cylinder-generator.js";
import { createCone } from "../geometry/cone-generator.js";
import {
  collectWorldEdges,
  intersectEdgesWithPlane,
  orderAndCloseSection,
} from "../geometry/plane-intersections.js";
import { calculateSectionMetrics } from "../geometry/section-metrics.js";

const SEG = 8; // 低分段便于验证精确边数
const EPSILON = 1e-6;

function sectionOnModel(model, plane) {
  model.updateMatrixWorld(true);
  const edges = collectWorldEdges(model);
  const { points } = intersectEdgesWithPlane(edges, plane);
  return orderAndCloseSection(points, plane);
}

const CYL = createCylinder(1, 1, 2, SEG);
CYL.updateMatrixWorld(true);

const CONE = createCone(1, 2, SEG);
CONE.updateMatrixWorld(true);

// ======================================================
// 1. 圆柱水平截面 y=0 — 应与所有 8 条竖棱相交
// ======================================================
test("cylinder: horizontal cut at y=0 yields 8-gon", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const polygon = sectionOnModel(CYL, plane);

  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, SEG, `水平截面应有 ${SEG} 个顶点`);

  // 所有顶点 y≈0
  for (const p of polygon.points) {
    assert.ok(Math.abs(p.y) < 1e-9, `顶点 y=${p.y} 应 ≈0`);
  }

  // 8-gon 内接单位圆，面积 = 2√2 ≈ 2.828
  const metrics = calculateSectionMetrics(polygon);
  assert.ok(
    Math.abs(metrics.area - 2 * Math.sqrt(2)) < 1e-7,
    `8-gon 内接单位圆面积 = 2√2，实际 ${metrics.area}`,
  );
});

// ======================================================
// 2. 圆柱水平偏移 y=0.5 — 仍为 8-gon，面积相同
// ======================================================
test("cylinder: horizontal cut at y=0.5 yields same-size 8-gon", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  const polygon = sectionOnModel(CYL, plane);

  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, SEG);

  const metrics = calculateSectionMetrics(polygon);
  assert.ok(
    Math.abs(metrics.area - 2 * Math.sqrt(2)) < 1e-7,
    `水平偏移截面面积 2√2（与 y=0 一致），实际 ${metrics.area}`,
  );
});

// ======================================================
// 3. 圆柱倾斜截面 — 法向量 (1, 0.5, 0) 通过中心
// ======================================================
test("cylinder: oblique cut through center yields polygon", () => {
  const normal = new THREE.Vector3(1, 0.5, 0).normalize();
  const plane = new THREE.Plane(normal, 0);
  const polygon = sectionOnModel(CYL, plane);

  assert.equal(polygon.status, "polygon");
  // 倾斜截面边数 ≥ 8（部分竖棱 + 部分底/顶边）
  assert.ok(
    polygon.points.length >= 4,
    `倾斜截面应有 ≥4 个顶点，实际 ${polygon.points.length}`,
  );

  // 所有顶点应在平面上
  for (const p of polygon.points) {
    assert.ok(
      Math.abs(plane.distanceToPoint(p)) < 1e-6,
      `顶点应位于截平面上`,
    );
  }
});

// ======================================================
// 4. 圆柱外平面 — 无交点
// ======================================================
test("cylinder: plane above cylinder yields empty", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2);
  const edges = collectWorldEdges(CYL);
  const { points } = intersectEdgesWithPlane(edges, plane);
  assert.equal(points.length, 0, "平面在圆柱上方应无交点");
});

// ======================================================
// 5. 圆锥水平截面 y=0 — 8 条棱从底到顶全部穿过
// ======================================================
test("cone: horizontal cut at y=0 yields 8-gon", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const polygon = sectionOnModel(CONE, plane);

  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, SEG, `圆锥 y=0 截面应有 ${SEG} 个顶点`);

  // 所有顶点 y≈0
  for (const p of polygon.points) {
    assert.ok(Math.abs(p.y) < 1e-9, `顶点 y=${p.y} 应 ≈0`);
  }

  // y=0 半径 0.5，8-gon 面积 = 8 * 0.5 * 0.5² * sin(π/4) = √2/2 ≈ 0.707
  const metrics = calculateSectionMetrics(polygon);
  const expected = 0.5 * Math.sqrt(2);
  assert.ok(
    Math.abs(metrics.area - expected) < 1e-7,
    `圆锥 y=0 截面面积 = √2/2 ≈ 0.707，实际 ${metrics.area}`,
  );
});

// ======================================================
// 6. 圆锥水平截面 y=0.5 — 半径更小
// ======================================================
test("cone: horizontal cut at y=0.5 yields smaller 8-gon", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  const polygon = sectionOnModel(CONE, plane);

  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, SEG);

  // y=0.5 时半径 0.25，8-gon 面积 = 0.125√2 ≈ 0.177
  const metrics = calculateSectionMetrics(polygon);
  const expected = 0.125 * Math.sqrt(2);
  assert.ok(
    Math.abs(metrics.area - expected) < 1e-8,
    `圆锥 y=0.5 截面面积 = 0.125√2 ≈ 0.177，实际 ${metrics.area}`,
  );
});

// ======================================================
// 7. 圆锥接近顶点 y=0.999 — 8-gon 半径极小
// ======================================================
test("cone: cut near apex yields very small polygon", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.999);
  const polygon = sectionOnModel(CONE, plane);

  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, SEG);

  const metrics = calculateSectionMetrics(polygon);
  assert.ok(
    metrics.area < 0.001,
    `近顶点截面面积应极小，实际 ${metrics.area}`,
  );
});

// ======================================================
// 8. 圆锥外平面 — 无交点
// ======================================================
test("cone: plane above apex yields empty", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
  const edges = collectWorldEdges(CONE);
  const { points } = intersectEdgesWithPlane(edges, plane);
  assert.equal(points.length, 0, "平面在锥顶上方应无交点");
});

// ======================================================
// 9. 圆锥底面以下 — 无交点
// ======================================================
test("cone: plane below base yields empty", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.1);
  const edges = collectWorldEdges(CONE);
  const { points } = intersectEdgesWithPlane(edges, plane);
  assert.equal(points.length, 0, "平面在锥底下方应无交点");
});

// ======================================================
// 10. 圆柱底面处 — 平面 y=-1 与底面共面
// ======================================================
test("cylinder: plane at base rim y=-1 yields polygon", () => {
  // 平面恰好通过底面（y=-1），底面 8 条棱共面
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1);
  const edges = collectWorldEdges(CYL);
  const { points, coplanarEdges } = intersectEdgesWithPlane(edges, plane);

  // 竖棱底部端点在平面上，应能生成截面
  assert.ok(points.length >= SEG, `底面应有 ≥${SEG} 个交点，实际 ${points.length}`);
});
