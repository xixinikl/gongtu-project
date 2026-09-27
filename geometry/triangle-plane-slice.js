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

function triangleVertices(triangle) {
  const vertices = triangle?.a?.isVector3
    && triangle?.b?.isVector3
    && triangle?.c?.isVector3
    ? [triangle.a, triangle.b, triangle.c]
    : triangle;
  if (
    !Array.isArray(vertices)
    || vertices.length !== 3
    || vertices.some((vertex) => !vertex?.isVector3)
  ) {
    throw new TypeError("triangle must contain exactly three THREE.Vector3 vertices");
  }
  return vertices;
}

function comparePoints(left, right) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function addUniquePoint(points, point, epsilon) {
  const epsilonSq = epsilon * epsilon;
  if (!points.some((existing) => existing.distanceToSquared(point) <= epsilonSq)) {
    points.push(point.clone());
  }
}

function result(status, triangleId, epsilon, extra = {}) {
  return {
    status,
    segment: null,
    triangleId,
    epsilon,
    ...extra,
  };
}

/**
 * 求单个三角面与无限平面的交集。
 *
 * 返回值始终包含 status 和 segment；segment 只会是 null 或一条规范化线段。
 * 点接触与整面共面不会被猜成线段。线段端点按 x/y/z 字典序排列，便于后续稳定去重。
 */
export function sliceTriangleWithPlane(
  triangle,
  plane,
  { triangleId = null, epsilon } = {},
) {
  const vertices = triangleVertices(triangle);
  const safePlane = normalizedPlane(plane);
  const tolerance = safeEpsilon(epsilon);
  const distances = vertices.map((vertex) => safePlane.distanceToPoint(vertex));
  const onPlane = distances.map((distance) => Math.abs(distance) <= tolerance);
  const onPlaneCount = onPlane.filter(Boolean).length;

  if (onPlaneCount === 3) {
    return result("coplanar", triangleId, tolerance, {
      relation: "coplanar-triangle",
      distances,
    });
  }

  const points = [];
  vertices.forEach((vertex, index) => {
    if (onPlane[index]) addUniquePoint(points, vertex, tolerance);
  });

  const edges = [[0, 1], [1, 2], [2, 0]];
  for (const [startIndex, endIndex] of edges) {
    if (onPlane[startIndex] || onPlane[endIndex]) continue;
    const startDistance = distances[startIndex];
    const endDistance = distances[endIndex];
    if (Math.sign(startDistance) === Math.sign(endDistance)) continue;

    const interpolation = startDistance / (startDistance - endDistance);
    const point = vertices[startIndex]
      .clone()
      .lerp(vertices[endIndex], interpolation);
    addUniquePoint(points, point, tolerance);
  }

  if (points.length === 0) {
    return result("none", triangleId, tolerance, { distances });
  }

  if (points.length === 1) {
    return result("point", triangleId, tolerance, {
      point: points[0],
      distances,
    });
  }

  if (points.length !== 2) {
    throw new Error("triangle-plane intersection produced more than two unique points");
  }

  points.sort(comparePoints);
  const relation = onPlaneCount === 2
    ? "coplanar-edge"
    : onPlaneCount === 1
      ? "vertex-crossing"
      : "edge-crossing";

  return {
    status: "segment",
    segment: {
      start: points[0],
      end: points[1],
      triangleId,
      relation,
    },
    triangleId,
    relation,
    distances,
    epsilon: tolerance,
  };
}

export { DEFAULT_EPSILON };
