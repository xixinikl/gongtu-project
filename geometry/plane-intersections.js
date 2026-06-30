import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_EPSILON = 1e-7;

function safeEpsilon(value) {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EPSILON;
}

function normalizedPlane(plane) {
  if (!plane?.isPlane || plane.normal.lengthSq() === 0) {
    throw new TypeError("plane must be a THREE.Plane with a non-zero normal");
  }
  return plane.clone().normalize();
}

function edgeEndpoints(edge) {
  const start = Array.isArray(edge) ? edge[0] : edge?.start;
  const end = Array.isArray(edge) ? edge[1] : edge?.end;
  if (!start?.isVector3 || !end?.isVector3) {
    throw new TypeError("each edge must contain start and end THREE.Vector3 values");
  }
  return { start, end };
}

function addUniquePoint(points, point, epsilon) {
  const epsilonSq = epsilon * epsilon;
  if (!points.some((existing) => existing.distanceToSquared(point) <= epsilonSq)) {
    points.push(point.clone());
  }
}

/**
 * 求一个闭线段与无限平面的关系。
 *
 * status:
 * - crossing: 线段内部穿过平面
 * - endpoint: 一个或两个端点落在平面上
 * - coplanar: 整条边位于平面内
 * - none: 无交点
 */
export function intersectSegmentWithPlane(start, end, plane, { epsilon } = {}) {
  const { start: safeStart, end: safeEnd } = edgeEndpoints([start, end]);
  const tolerance = safeEpsilon(epsilon);
  const safePlane = normalizedPlane(plane);
  const startDistance = safePlane.distanceToPoint(safeStart);
  const endDistance = safePlane.distanceToPoint(safeEnd);
  const startOnPlane = Math.abs(startDistance) <= tolerance;
  const endOnPlane = Math.abs(endDistance) <= tolerance;

  if (startOnPlane && endOnPlane) {
    return {
      status: "coplanar",
      points: [safeStart.clone(), safeEnd.clone()],
      startDistance,
      endDistance,
    };
  }

  if (startOnPlane || endOnPlane) {
    return {
      status: "endpoint",
      point: (startOnPlane ? safeStart : safeEnd).clone(),
      startDistance,
      endDistance,
    };
  }

  if (Math.sign(startDistance) === Math.sign(endDistance)) {
    return { status: "none", startDistance, endDistance };
  }

  const interpolation = startDistance / (startDistance - endDistance);
  return {
    status: "crossing",
    point: safeStart.clone().lerp(safeEnd, interpolation),
    interpolation,
    startDistance,
    endDistance,
  };
}

/**
 * 批量求多面体边与无限平面的交点，并按容差去重。
 * 本函数不负责对交点排序或闭合；该步骤属于截面多边形构造。
 */
export function intersectEdgesWithPlane(edges, plane, { epsilon } = {}) {
  if (!Array.isArray(edges)) {
    throw new TypeError("edges must be an array");
  }
  const tolerance = safeEpsilon(epsilon);
  const safePlane = normalizedPlane(plane);
  const points = [];
  const coplanarEdges = [];
  const hits = [];

  edges.forEach((edge, edgeIndex) => {
    const { start, end } = edgeEndpoints(edge);
    const result = intersectSegmentWithPlane(start, end, safePlane, {
      epsilon: tolerance,
    });
    if (result.status === "none") return;

    hits.push({ edgeIndex, ...result });
    if (result.status === "coplanar") {
      coplanarEdges.push({
        edgeIndex,
        start: result.points[0].clone(),
        end: result.points[1].clone(),
      });
      result.points.forEach((point) => addUniquePoint(points, point, tolerance));
      return;
    }
    addUniquePoint(points, result.point, tolerance);
  });

  return { points, coplanarEdges, hits, epsilon: tolerance };
}

function polygonBasis(normal) {
  const reference = Math.abs(normal.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const u = reference.clone().cross(normal).normalize();
  const v = normal.clone().cross(u).normalize();
  return { u, v };
}

function signedProjectedArea(points, u, v) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.dot(u) * next.dot(v) - next.dot(u) * current.dot(v);
  }
  return twiceArea / 2;
}

/**
 * 将同一平面上的无序交点按法向量观察方向逆时针排序，并追加首点形成闭环。
 *
 * 退化输入不会伪造成多边形，而是返回 status="degenerate" 和明确 reason。
 */
export function orderAndCloseSection(points, plane, { epsilon } = {}) {
  if (!Array.isArray(points)) {
    throw new TypeError("points must be an array");
  }
  const tolerance = safeEpsilon(epsilon);
  const safePlane = normalizedPlane(plane);
  const uniquePoints = [];

  points.forEach((point) => {
    if (!point?.isVector3) {
      throw new TypeError("each point must be a THREE.Vector3");
    }
    if (Math.abs(safePlane.distanceToPoint(point)) > tolerance) {
      throw new RangeError("all section points must lie on the plane");
    }
    addUniquePoint(uniquePoints, point, tolerance);
  });

  if (uniquePoints.length < 3) {
    return {
      status: "degenerate",
      reason: "insufficient-points",
      points: uniquePoints,
      closedPoints: [],
      epsilon: tolerance,
    };
  }

  const { u, v } = polygonBasis(safePlane.normal);

  // Compute centroid (always needed by downstream projectSectionTo2D)
  const centroid = uniquePoints
    .reduce((sum, pt) => sum.add(pt), new THREE.Vector3())
    .multiplyScalar(1 / uniquePoints.length);

  // Project to 2D coordinates for polygon ordering
  const pts2d = uniquePoints.map((p) => ({
    x: p.dot(u),
    y: p.dot(v),
  }));

  // Try concave-aware ordering; fall back to angle sort for convex cases
  let ordered2d;
  try {
    ordered2d = traceConcavePolygon(pts2d, tolerance);
  } catch (_) {
    // Fallback: original angle-sorting around centroid
    ordered2d = pts2d
      .map((item) => ({
        ...item,
        angle: Math.atan2(item.y - centroid.dot(v), item.x - centroid.dot(u)),
      }))
      .sort((l, r) => l.angle - r.angle)
      .map(({ x, y }) => ({ x, y }));
  }

  // Map 2D ordering back to original Vector3 objects (nearest-neighbor match)
  const finalOrdered = ordered2d.map((pt2d) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < uniquePoints.length; i++) {
      const up = uniquePoints[i];
      const dx = up.dot(u) - pt2d.x;
      const dy = up.dot(v) - pt2d.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return uniquePoints[bestIdx].clone();
  });

  const signedArea = signedProjectedArea(finalOrdered, u, v);

  if (Math.abs(signedArea) <= tolerance * tolerance) {
    return {
      status: "degenerate",
      reason: "collinear-points",
      points: finalOrdered,
      closedPoints: [],
      centroid,
      normal: safePlane.normal.clone(),
      epsilon: tolerance,
    };
  }

  if (signedArea < 0) {
    finalOrdered.reverse();
  }

  return {
    status: "polygon",
    points: finalOrdered,
    closedPoints: [...finalOrdered.map((p) => p.clone()), finalOrdered[0].clone()],
    centroid,
    normal: safePlane.normal.clone(),
    signedArea: Math.abs(signedArea),
    basis: { u, v },
    epsilon: tolerance,
  };
}

/**
 * 用可见性追踪法对 2D 点集排序，生成简单（不自交）多边形。
 * 支持凹形（concave）截面，如阶梯组合体的 L 形截面。
 *
 * 算法：从最左下角点出发，每次选"最左转且不与已有边相交"的下一个顶点，
 * 直到回到起点。O(n³)，n 通常 < 50，可接受。
 */
function traceConcavePolygon(pts2d, eps) {
  const n = pts2d.length;
  if (n < 3) throw new Error("need >= 3 points");

  // Find lowest-leftmost starting point
  let startIdx = 0;
  for (let i = 1; i < n; i++) {
    const a = pts2d[startIdx];
    const b = pts2d[i];
    if (
      b.y < a.y - eps ||
      (Math.abs(b.y - a.y) <= eps && b.x < a.x - eps)
    ) {
      startIdx = i;
    }
  }

  const visited = new Set([startIdx]);
  const order = [startIdx];
  let prevDir = { x: 1, y: 0 }; // initial direction: east

  while (order.length < n) {
    const currIdx = order[order.length - 1];
    const curr = pts2d[currIdx];

    let bestIdx = -1;
    let bestTurn = Infinity; // smaller = more left-turn (better)

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      const cand = pts2d[i];

      // Direction to candidate
      const dx = cand.x - curr.x;
      const dy = cand.y - curr.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < eps * eps) continue;

      // Cross product with previous direction: positive = left turn
      const cross = prevDir.x * dy - prevDir.y * dx;
      const dotProduct = prevDir.x * dx + prevDir.y * dy;

      // Compute turn angle (-PI..PI), prefer left turns (positive)
      let turn = Math.atan2(cross, dotProduct);

      // Check if segment (curr -> cand) crosses any existing edge
      if (segmentCrossesExisting(curr, cand, order, pts2d, eps)) {
        turn += 10; // penalize crossing heavily
      }

      if (turn < bestTurn - eps) {
        bestTurn = turn;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) throw new Error("cannot find next vertex");
    visited.add(bestIdx);
    order.push(bestIdx);

    const best = pts2d[bestIdx];
    const bdx = best.x - curr.x;
    const bdy = best.y - curr.y;
    const bLen = Math.sqrt(bdx * bdx + bdy * bdy);
    prevDir = { x: bdx / bLen, y: bdy / bLen };
  }

  return order.map((idx) => ({ ...pts2d[idx] }));
}

/**
 * 检查线段 (a,b) 是否与已有多边形边（由 order 和 pts 定义）相交。
 * 忽略在端点处的接触（共享顶点是允许的）。
 */
function segmentCrossesExisting(a, b, order, pts, eps) {
  for (let i = 0; i < order.length - 1; i++) {
    const p1 = pts[order[i]];
    const p2 = pts[order[i + 1]];
    // Skip edges sharing endpoint with (a,b)
    if (
      distSq(a, p1) < eps * eps ||
      distSq(a, p2) < eps * eps ||
      distSq(b, p1) < eps * eps ||
      distSq(b, p2) < eps * eps
    ) {
      continue;
    }
    if (segmentsIntersect(a, b, p1, p2, eps)) return true;
  }
  return false;
}

function distSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function segmentsIntersect(a, b, c, d, eps) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ac = { x: c.x - a.x, y: c.y - a.y };
  const ad = { x: d.x - a.x, y: d.y - a.y };

  const crossAB_AC = ab.x * ac.y - ab.y * ac.x;
  const crossAB_AD = ab.x * ad.y - ab.y * ad.x;

  // c and d on same side of AB?
  if ((crossAB_AC > eps && crossAB_AD > eps) || (crossAB_AC < -eps && crossAB_AD < -eps)) {
    return false;
  }

  const cd = { x: d.x - c.x, y: d.y - c.y };
  const ca = { x: a.x - c.x, y: a.y - c.y };
  const cb = { x: b.x - c.x, y: b.y - c.y };

  const crossCD_CA = cd.x * ca.y - cd.y * ca.x;
  const crossCD_CB = cd.x * cb.y - cd.y * cb.x;

  if ((crossCD_CA > eps && crossCD_CB > eps) || (crossCD_CA < -eps && crossCD_CB < -eps)) {
    return false;
  }

  // Collinear case: check overlap of projections
  return true;
}

/**
 * 从模型中的 LineSegments 棱线提取世界坐标边。
 * 默认只读取名称以 Wireframe 结尾的对象，避免把坐标轴等辅助线算入模型。
 */
export function collectWorldEdges(
  root,
  { include = (object) => object.name.endsWith("Wireframe") } = {},
) {
  if (!root?.isObject3D) {
    throw new TypeError("root must be a THREE.Object3D");
  }
  root.updateWorldMatrix(true, true);
  const edges = [];

  root.traverse((object) => {
    if (!object.isLineSegments || !include(object)) return;
    const position = object.geometry?.getAttribute("position");
    if (!position) return;
    const index = object.geometry.getIndex();
    const count = index ? index.count : position.count;

    for (let offset = 0; offset + 1 < count; offset += 2) {
      const startIndex = index ? index.getX(offset) : offset;
      const endIndex = index ? index.getX(offset + 1) : offset + 1;
      const start = new THREE.Vector3()
        .fromBufferAttribute(position, startIndex)
        .applyMatrix4(object.matrixWorld);
      const end = new THREE.Vector3()
        .fromBufferAttribute(position, endIndex)
        .applyMatrix4(object.matrixWorld);
      edges.push({ start, end, source: object, sourceOffset: offset });
    }
  });

  return edges;
}
