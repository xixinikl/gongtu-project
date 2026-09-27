/**
 * 从确定性截面多边形计算可展示的数学信息。
 * 面积复用排序模块的精确投影面积；周长由有序三维顶点逐边求和。
 */
export function calculateSectionMetrics(polygon) {
  if (polygon?.status !== "polygon" || !Array.isArray(polygon.points)
    || polygon.points.length < 3 || !Number.isFinite(polygon.signedArea)) {
    return {
      status: "empty",
      edgeCount: 0,
      area: 0,
      perimeter: 0,
      vertices: [],
    };
  }

  const vertices = polygon.points.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z,
  }));
  const perimeter = polygon.points.reduce((sum, point, index) => (
    sum + point.distanceTo(polygon.points[(index + 1) % polygon.points.length])
  ), 0);

  return {
    status: "polygon",
    edgeCount: vertices.length,
    area: polygon.signedArea,
    perimeter,
    vertices,
  };
}

export function formatSectionNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) < 0.5 * (10 ** -digits) ? 0 : value;
  return rounded.toFixed(digits);
}
