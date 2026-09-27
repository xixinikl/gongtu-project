import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createCube } from "../geometry/box-generator.js";
import {
  collectWorldEdges,
  intersectEdgesWithPlane,
  orderAndCloseSection,
} from "../geometry/plane-intersections.js";
import { calculateSectionMetrics } from "../geometry/section-metrics.js";

// ---------- helpers ----------

const EPSILON = 1e-7;

/**
 * 在单位正方体（边长 1，中心在原点）上生成指定的切面多边形。
 */
function sectionOnCube(plane) {
  const cube = createCube(1);
  cube.updateMatrixWorld(true);
  const edges = collectWorldEdges(cube);
  const { points } = intersectEdgesWithPlane(edges, plane);
  return orderAndCloseSection(points, plane);
}

/**
 * 断言多边形状态为 polygon 且边数符合预期。
 */
function assertPolygon(label, polygon, expectedEdgeCount) {
  assert.equal(
    polygon.status,
    "polygon",
    `${label}: 应生成 polygon，实际得到 ${polygon.status} (${polygon.reason ?? ""})`,
  );
  assert.equal(
    polygon.closedPoints.length - 1,
    expectedEdgeCount,
    `${label}: 期望 ${expectedEdgeCount} 边，实际得到 ${polygon.closedPoints.length - 1} 边`,
  );
  assert.equal(
    polygon.points.length,
    expectedEdgeCount,
    `${label}: closedPoints 与 points 边数一致`,
  );
}

// ======================================================
// 1. 正方形截面 — 平面与 XY 面平行，z = 0
// ======================================================
test("cube: plane z=0 yields square (4 edges)", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const polygon = sectionOnCube(plane);

  assertPolygon("正方形", polygon, 4);

  // 正方形面积为 1
  const metrics = calculateSectionMetrics(polygon);
  assert.equal(metrics.status, "polygon");
  assert.ok(
    Math.abs(metrics.area - 1) < 1e-9,
    `正方形面积应为 1，实际 ${metrics.area}`,
  );
  assert.ok(
    Math.abs(metrics.perimeter - 4) < 1e-9,
    `正方形周长应为 4，实际 ${metrics.perimeter}`,
  );
});

// ======================================================
// 2. 三角形截面 — 平面 x+y+z=0.5 过 3 个顶点
// ======================================================
test("cube: plane x+y+z=0.5 yields triangle (3 edges)", () => {
  // x+y+z = 0.5 → THREE.Plane(n, d): n·p + d = 0, n=(1,1,1), d=-0.5
  const plane = new THREE.Plane(new THREE.Vector3(1, 1, 1), -0.5);
  const polygon = sectionOnCube(plane);

  assertPolygon("三角形", polygon, 3);

  const metrics = calculateSectionMetrics(polygon);
  assert.equal(metrics.status, "polygon");

  // 等边三角形，边长 √2，面积 (√3/4) * (√2)^2 = √3/2 ≈ 0.8660
  const expectedArea = Math.sqrt(3) / 2;
  const expectedPerimeter = 3 * Math.SQRT2;
  assert.ok(
    Math.abs(metrics.area - expectedArea) < 1e-9,
    `三角形面积应为 ${expectedArea}，实际 ${metrics.area}`,
  );
  assert.ok(
    Math.abs(metrics.perimeter - expectedPerimeter) < 1e-9,
    `三角形周长应为 ${expectedPerimeter}，实际 ${metrics.perimeter}`,
  );
});

// ======================================================
// 3. 正六边形截面 — 平面 x+y+z=0 通过立方体中心
// ======================================================
test("cube: plane x+y+z=0 yields regular hexagon (6 edges)", () => {
  const plane = new THREE.Plane(new THREE.Vector3(1, 1, 1), 0);
  const polygon = sectionOnCube(plane);

  assertPolygon("正六边形", polygon, 6);

  // 正六边形边长 = √2/2，面积 = (3√3/2) * (√2/2)^2 = (3√3/2) * (1/2) = 3√3/4
  const metrics = calculateSectionMetrics(polygon);
  assert.equal(metrics.status, "polygon");

  const sideLength = Math.SQRT2 / 2;
  const expectedPerimeter = 6 * sideLength;
  assert.ok(
    Math.abs(metrics.perimeter - expectedPerimeter) < 1e-9,
    `六边形周长应为 ${expectedPerimeter}，实际 ${metrics.perimeter}`,
  );

  // 六边形的顶点应在立方体棱上，不会在 ±0.5 之外的坐标
  for (const v of polygon.points) {
    assert.ok(
      Math.abs(v.x) <= 0.5 + EPSILON,
      `六边形顶点 x=${v.x} 应 ≤ 0.5`,
    );
    assert.ok(
      Math.abs(v.y) <= 0.5 + EPSILON,
      `六边形顶点 y=${v.y} 应 ≤ 0.5`,
    );
    assert.ok(
      Math.abs(v.z) <= 0.5 + EPSILON,
      `六边形顶点 z=${v.z} 应 ≤ 0.5`,
    );
  }
});

// ======================================================
// 4. 五边形截面 — 平面 x+2y+0.5z=0.5 切 5 边
// ======================================================
test("cube: plane x+2y+0.5z=0.5 yields pentagon (5 edges)", () => {
  // 平面方程: x+2y+0.5z = 0.5
  // THREE.Plane(n, d): n·p + d = 0 → x+2y+0.5z - 0.5 = 0
  const plane = new THREE.Plane(new THREE.Vector3(1, 2, 0.5), -0.5);
  const polygon = sectionOnCube(plane);

  assertPolygon("五边形", polygon, 5);
});

// ======================================================
// 5. 矩形截面 — 平面 z=0.25 与面平行但偏移
// ======================================================
test("cube: plane z=0.25 yields rectangle (4 edges) with correct area", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.25);
  const polygon = sectionOnCube(plane);

  assertPolygon("矩形", polygon, 4);

  // 矩形 z=0.25 在单位正方体内部，截面为 1×1 正方形
  const metrics = calculateSectionMetrics(polygon);
  assert.equal(metrics.status, "polygon");
  assert.ok(
    Math.abs(metrics.area - 1) < 1e-9,
    `矩形面积应为 1，实际 ${metrics.area}`,
  );
});

// ======================================================
// 6. 无截面 — 平面与立方体不相交
// ======================================================
test("cube: plane outside the cube yields degenerate section", () => {
  // 平面 z=1 在立方体上方（立方体 z 范围 -0.5 到 0.5）
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1);
  const cube = createCube(1);
  cube.updateMatrixWorld(true);
  const edges = collectWorldEdges(cube);
  const { points } = intersectEdgesWithPlane(edges, plane);

  assert.equal(
    points.length,
    0,
    "平面在立方体外时应无交点",
  );
});

// ======================================================
// 7. collectWorldEdges 对单位立方体应返回 12+8 = ... wait, 12 edges per cube (BoxGeometry has 12 edges from EdgesGeometry)
// ======================================================
test("cube: collectWorldEdges returns correct number of edges", () => {
  const cube = createCube(1);
  cube.updateMatrixWorld(true);
  const edges = collectWorldEdges(cube);

  // 单位正方体有 12 条棱
  assert.equal(
    edges.length,
    12,
    `单位正方体应有 12 条棱，实际 ${edges.length}`,
  );
});

// ======================================================
// 8. 六边形截面各边的中点位于立方体面中心
//    正六边形截面顶点位于棱的 1/4 和 3/4 处，边长一致
// ======================================================
test("cube: regular hexagon side length is consistent", () => {
  const plane = new THREE.Plane(new THREE.Vector3(1, 1, 1), 0);
  const polygon = sectionOnCube(plane);

  assertPolygon("正六边形边长一致", polygon, 6);

  const closed = polygon.closedPoints;
  const sides = [];
  for (let i = 0; i < closed.length - 1; i++) {
    sides.push(closed[i].distanceTo(closed[i + 1]));
  }

  // 所有边长应一致（正六边形）
  const reference = sides[0];
  for (let i = 1; i < sides.length; i++) {
    assert.ok(
      Math.abs(sides[i] - reference) < 1e-9,
      `第 ${i} 条边长度 ${sides[i]} 应与参考边 ${reference} 一致`,
    );
  }
});
