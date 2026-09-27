import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";
import { createBox } from "../geometry/box-generator.js";
import {
  collectWorldEdges,
  intersectEdgesWithPlane,
  intersectSegmentWithPlane,
  orderAndCloseSection,
} from "../geometry/plane-intersections.js";

const CUBE = createBox(2, 2, 2); // 边长 2，顶点在 (±1, ±1, ±1)
CUBE.updateMatrixWorld(true);

// ======================================================
// 1. 平面与立方体顶面共面
// ======================================================
test("coplanar: plane y=1 with cube top face", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
  const edges = collectWorldEdges(CUBE);
  const { points, coplanarEdges } = intersectEdgesWithPlane(edges, plane);

  // 顶面 4 条棱共面
  assert.ok(coplanarEdges.length >= 4, `应有 ≥4 条共面边，实际 ${coplanarEdges.length}`);

  // 交点应包含顶面 4 个顶点
  assert.ok(points.length >= 4, `应有 ≥4 个交点，实际 ${points.length}`);
  const allY1 = points.every((p) => Math.abs(p.y - 1) < 1e-10);
  assert.ok(allY1, "所有交点 y≈1");

  // 截面应为多边形
  const polygon = orderAndCloseSection(points, plane);
  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, 4, "共面顶面应形成正方形 4 顶点");
});

// ======================================================
// 2. 平面通过立方体顶点 (1,1,1) 但不共面
// ======================================================
test("endpoint: plane x+y+z=1 through three cube corners", () => {
  // 平面 x+y+z=1 通过 (1,1,-1), (1,-1,1), (-1,1,1) 三个顶点
  const normal = new THREE.Vector3(1, 1, 1).normalize();
  const constant = -1 / Math.sqrt(3);
  const plane = new THREE.Plane(normal, constant);
  const edges = collectWorldEdges(CUBE);
  const { points, hits } = intersectEdgesWithPlane(edges, plane);

  const endpointHits = hits.filter((h) => h.status === "endpoint");
  assert.ok(endpointHits.length >= 6, `应有 ≥6 endpoint 命中（3 顶点各 3 棱），实际 ${endpointHits.length}`);

  // 三个顶点在交点中
  const corners = [
    new THREE.Vector3(1, 1, -1),
    new THREE.Vector3(1, -1, 1),
    new THREE.Vector3(-1, 1, 1),
  ];
  for (const c of corners) {
    const found = points.some((p) => p.distanceToSquared(c) < 1e-14);
    assert.ok(found, `(${c.x},${c.y},${c.z}) 应在交点列表中`);
  }

  // 三个顶点形成三角形
  const polygon = orderAndCloseSection(points, plane);
  assert.equal(polygon.status, "polygon");
  assert.equal(polygon.points.length, 3, "通过三个顶点的截面对角线切面应为 3 顶点");
  assert.ok(polygon.signedArea > 0, "应有正面积");
});

// ======================================================
// 3. 平面恰好沿立方体某一棱边
// ======================================================
test("coplanar: plane along cube edge", () => {
  // 棱边 (1,1,0)→(1,1,1)：垂直棱在 x=1,y=1。平面 x=1,y=1 是沿该棱的无限平面
  // 使用平面 z=0 并通过该棱中点 → 改用 x=1 平面，它沿两条棱
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -1);
  const edges = collectWorldEdges(CUBE);
  const { coplanarEdges } = intersectEdgesWithPlane(edges, plane);

  // x=1 面包含 4 条棱（顶面、底面各 1 条 border，2 条垂直棱）
  // 实际上顶面边框有 1 条 x=1 的边、底面有 1 条
  assert.ok(coplanarEdges.length >= 4, `x=1 共面应有 ≥4 条边，实际 ${coplanarEdges.length}`);

  for (const ce of coplanarEdges) {
    assert.ok(Math.abs(ce.start.x - 1) < 1e-10, `共面边起点 x≈1`);
    assert.ok(Math.abs(ce.end.x - 1) < 1e-10, `共面边终点 x≈1`);
  }
});

// ======================================================
// 4. 浮点误差 — 平面略微偏离共面
// ======================================================
test("float-tolerance: plane just off coplanar by 2e-7", () => {
  // 默认 epsilon=1e-7，偏离 2e-7 应视为 crossing 而非 coplanar
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1 + 2e-7);
  const edges = collectWorldEdges(CUBE);
  const { coplanarEdges, points } = intersectEdgesWithPlane(edges, plane);

  // 不应有共面边，因为偏离超出了 tol=1e-7
  assert.equal(coplanarEdges.length, 0, "偏离 2e-7 不应产生 coplanar");

  // 顶面 4 条棱应产生 crossing/endpoint 交点
  assert.ok(points.length >= 4, `应有 ≥4 个交点，实际 ${points.length}`);
});

// ======================================================
// 5. 浮点误差 — 平面恰在容差内
// ======================================================
test("float-tolerance: plane within epsilon yields coplanar", () => {
  // 偏离 5e-8，在默认 1e-7 容差内
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1 + 5e-8);
  const edges = collectWorldEdges(CUBE);
  const { coplanarEdges } = intersectEdgesWithPlane(edges, plane);

  assert.ok(coplanarEdges.length >= 4, `容差内应识别为 coplanar，实际 ${coplanarEdges.length}`);
});

// ======================================================
// 6. intersectSegmentWithPlane — 单一单元测试
// ======================================================
test("segment-vs-plane: coplanar segment", () => {
  const a = new THREE.Vector3(0, 3, 0);
  const b = new THREE.Vector3(5, 3, 0);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3); // y=3

  const result = intersectSegmentWithPlane(a, b, plane);
  assert.equal(result.status, "coplanar");
  assert.equal(result.points.length, 2);
  assert.ok(result.points[0].distanceTo(new THREE.Vector3(0, 3, 0)) < 1e-12);
  assert.ok(result.points[1].distanceTo(new THREE.Vector3(5, 3, 0)) < 1e-12);
});

test("segment-vs-plane: crossing", () => {
  const a = new THREE.Vector3(0, 2, 0);
  const b = new THREE.Vector3(0, 6, 0);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -4); // y=4

  const result = intersectSegmentWithPlane(a, b, plane);
  assert.equal(result.status, "crossing");
  assert.ok(Math.abs(result.point.y - 4) < 1e-12);
  assert.ok(Math.abs(result.point.x) < 1e-12);
});

test("segment-vs-plane: endpoint on plane", () => {
  const a = new THREE.Vector3(1, 2, 3);
  const b = new THREE.Vector3(1, 8, 3);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2); // y=2

  const result = intersectSegmentWithPlane(a, b, plane);
  assert.equal(result.status, "endpoint");
  assert.ok(result.point.distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-12);
});

test("segment-vs-plane: both endpoints on plane (coplanar)", () => {
  // 线段完全在 xy 平面上
  const a = new THREE.Vector3(3, 0, 0);
  const b = new THREE.Vector3(0, 3, 0);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0

  const result = intersectSegmentWithPlane(a, b, plane);
  assert.equal(result.status, "coplanar");
});

test("segment-vs-plane: none — same side", () => {
  const a = new THREE.Vector3(0, 5, 0);
  const b = new THREE.Vector3(0, 10, 0);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2); // y=2

  const result = intersectSegmentWithPlane(a, b, plane);
  assert.equal(result.status, "none");
});

// ======================================================
// 7. 交点去重 — 两条棱交于几乎同一点
// ======================================================
test("dedup: two edges intersecting at nearly same point", () => {
  // 立方体 y=0 水平切面 — 同一顶点由两条共面边共享
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const edges = collectWorldEdges(CUBE);
  const { points } = intersectEdgesWithPlane(edges, plane);

  // 正方形截面：4 个顶端 + 4 个底端？不，立方体 y=0 是正方形
  // 4 条垂直棱穿过 y=0，产生 4 个交点
  assert.equal(points.length, 4, "立方体 y=0 截面应去重为 4 个交点");
});

// ======================================================
// 8. 自定义 epsilon
// ======================================================
test("custom-epsilon: larger tolerance catches near-coplanar", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1 + 1e-5); // 偏离 1e-5
  const edges = collectWorldEdges(CUBE);

  // 默认 epsilon=1e-7 → 非 coplanar
  const strict = intersectEdgesWithPlane(edges, plane);
  assert.equal(strict.coplanarEdges.length, 0, "默认容差不识别为 coplanar");

  // epsilon=1e-4 → coplanar
  const loose = intersectEdgesWithPlane(edges, plane, { epsilon: 1e-4 });
  assert.ok(loose.coplanarEdges.length >= 4, "大容差应识别为 coplanar");
});
