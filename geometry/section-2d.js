const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 160;
const DEFAULT_PADDING = 18;

/**
 * 将已排序的三维截面多边形投影为保持比例的二维辅助图坐标。
 */
export function projectSectionTo2D(
  polygon,
  {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    padding = DEFAULT_PADDING,
  } = {},
) {
  if (polygon?.status !== "polygon" || !polygon.basis || polygon.points.length < 3) {
    return { status: "empty", points: [], closedPoints: [] };
  }
  const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_HEIGHT;
  const maxPadding = Math.max(0, Math.min(safeWidth, safeHeight) / 2 - 1);
  const safePadding = Number.isFinite(padding)
    ? Math.max(0, Math.min(padding, maxPadding))
    : DEFAULT_PADDING;
  const projected = polygon.points.map((point) => {
    const relative = point.clone().sub(polygon.centroid);
    return {
      x: relative.dot(polygon.basis.u),
      y: relative.dot(polygon.basis.v),
    };
  });
  const xs = projected.map(({ x }) => x);
  const ys = projected.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sourceWidth = Math.max(maxX - minX, Number.EPSILON);
  const sourceHeight = Math.max(maxY - minY, Number.EPSILON);
  const scale = Math.min(
    (safeWidth - safePadding * 2) / sourceWidth,
    (safeHeight - safePadding * 2) / sourceHeight,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const points = projected.map(({ x, y }) => ({
    x: safeWidth / 2 + (x - centerX) * scale,
    y: safeHeight / 2 - (y - centerY) * scale,
  }));

  return {
    status: "polygon",
    points,
    closedPoints: [...points, { ...points[0] }],
    width: safeWidth,
    height: safeHeight,
    padding: safePadding,
    scale,
    sourceBounds: { minX, maxX, minY, maxY },
  };
}

export function svgPointString(points, precision = 2) {
  const digits = Number.isInteger(precision) ? Math.max(0, Math.min(6, precision)) : 2;
  return points
    .map(({ x, y }) => `${x.toFixed(digits)},${y.toFixed(digits)}`)
    .join(" ");
}
