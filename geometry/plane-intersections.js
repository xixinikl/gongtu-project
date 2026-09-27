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

  const centroid = uniquePoints
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .multiplyScalar(1 / uniquePoints.length);
  const { u, v } = polygonBasis(safePlane.normal);
  const orderedPoints = uniquePoints
    .map((point) => ({
      point,
      angle: Math.atan2(
        point.clone().sub(centroid).dot(v),
        point.clone().sub(centroid).dot(u),
      ),
    }))
    .sort((left, right) => left.angle - right.angle)
    .map(({ point }) => point.clone());
  const signedArea = signedProjectedArea(orderedPoints, u, v);

  if (Math.abs(signedArea) <= tolerance * tolerance) {
    return {
      status: "degenerate",
      reason: "collinear-points",
      points: orderedPoints,
      closedPoints: [],
      centroid,
      normal: safePlane.normal.clone(),
      epsilon: tolerance,
    };
  }

  if (signedArea < 0) {
    orderedPoints.reverse();
  }

  return {
    status: "polygon",
    points: orderedPoints,
    closedPoints: [...orderedPoints.map((point) => point.clone()), orderedPoints[0].clone()],
    centroid,
    normal: safePlane.normal.clone(),
    signedArea: Math.abs(signedArea),
    basis: { u, v },
    epsilon: tolerance,
  };
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
