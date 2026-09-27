const SQRT_2 = Math.sqrt(2);
const SQRT_3 = Math.sqrt(3);
const cylinderSegments = 16;

function regularPolygon(vertexCount, radius, phase = 0) {
  return Array.from({ length: vertexCount }, (_, index) => {
    const angle = phase + (index * 2 * Math.PI) / vertexCount;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

function ring(vertices, area, concave = false) {
  return { vertices, vertexCount: vertices.length, area, concave };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * SEC2-001 的答案只来自解析几何或显式单位方块并集，不调用生产截面代码。
 *
 * plane 使用 n·p + constant = 0；expected.rings 中的 vertices 是切面局部二维坐标，
 * 均按逆时针顺序给出。退化输入不伪造面积环，而用 status 和 degeneracy 固定契约。
 */
export const sectionV2Fixtures = deepFreeze([
  {
    id: "unit-cube-horizontal",
    description: "单位立方体 [0,1]³ 被 z=0.5 水平切割",
    model: { type: "box", min: [0, 0, 0], max: [1, 1, 1] },
    plane: { normal: [0, 0, 1], constant: -0.5 },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [ring([[0, 0], [1, 0], [1, 1], [0, 1]], 1)],
      basis: { origin: [0, 0, 0.5], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "截面就是边长 1 的正方形。",
    },
  },
  {
    id: "unit-cube-oblique",
    description: "单位立方体中心斜切 x+y+z=1.5",
    model: { type: "box", min: [0, 0, 0], max: [1, 1, 1] },
    plane: {
      normal: [1 / SQRT_3, 1 / SQRT_3, 1 / SQRT_3],
      constant: -1.5 / SQRT_3,
    },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [
        ring([
          [-1 / (2 * SQRT_2), -3 / (2 * Math.sqrt(6))],
          [1 / (2 * SQRT_2), -3 / (2 * Math.sqrt(6))],
          [1 / SQRT_2, 0],
          [1 / (2 * SQRT_2), 3 / (2 * Math.sqrt(6))],
          [-1 / (2 * SQRT_2), 3 / (2 * Math.sqrt(6))],
          [-1 / SQRT_2, 0],
        ], (3 * SQRT_3) / 4),
      ],
      basis: {
        origin: [0.5, 0.5, 0.5],
        u: [1 / SQRT_2, -1 / SQRT_2, 0],
        v: [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)],
      },
      basisReason: "六个顶点是 (0,0.5,1) 的排列；正六边形边长为 1/√2。",
    },
  },
  {
    id: "cylinder-horizontal-16",
    description: "半径 2、高 4、16 径向分段圆柱被中面水平切割",
    model: {
      type: "cylinder",
      radius: 2,
      height: 4,
      radialSegments: cylinderSegments,
      axis: "z",
      center: [0, 0, 0],
    },
    plane: { normal: [0, 0, 1], constant: 0 },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [
        ring(
          regularPolygon(cylinderSegments, 2),
          (cylinderSegments * 4 * Math.sin((2 * Math.PI) / cylinderSegments)) / 2,
        ),
      ],
      basis: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "网格截面是内接于半径 2 圆的正 16 边形，不以 πr² 冒充网格答案。",
    },
  },
  {
    id: "eighteen-block-three-step-staircase",
    description: "3 层深、列高 3/2/1 的 18 个单位方块在 z=1.5 的阶梯截面",
    model: {
      type: "unit-blocks",
      blocks: Array.from({ length: 3 }, (_, z) =>
        [3, 2, 1].flatMap((height, x) =>
          Array.from({ length: height }, (_, y) => [x, y, z]),
        ),
      ).flat(),
    },
    plane: { normal: [0, 0, 1], constant: -1.5 },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [
        ring([[0, 0], [3, 0], [3, 1], [2, 1], [2, 2], [1, 2], [1, 3], [0, 3]], 6, true),
      ],
      basis: { origin: [0, 0, 1.5], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "每个深度层都是 3+2+1 个单位方块；并集面积为 6，边界保留两级凹转角。",
    },
  },
  {
    id: "l-prism-concave",
    description: "三个单位方块组成的 L 形棱柱截面",
    model: { type: "unit-blocks", blocks: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
    plane: { normal: [0, 0, 1], constant: -0.5 },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [ring([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 3, true)],
      basis: { origin: [0, 0, 0.5], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "三个互不重叠单位正方形的并集，面积 3；(1,1) 是内凹顶点。",
    },
  },
  {
    id: "zigzag-concave-prism",
    description: "带两个凹转角的折线形棱柱截面",
    model: {
      type: "extruded-polygon",
      polygon: [[0, 0], [4, 0], [4, 1], [2, 1], [2, 2], [3, 2], [3, 3], [0, 3]],
      zRange: [0, 1],
    },
    plane: { normal: [0, 0, 1], constant: -0.5 },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [
        ring([[0, 0], [4, 0], [4, 1], [2, 1], [2, 2], [3, 2], [3, 3], [0, 3]], 9, true),
      ],
      basis: { origin: [0, 0, 0.5], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "按三个矩形 4×1、2×1、3×1 分层求和，面积 9。",
    },
  },
  {
    id: "two-disconnected-boxes",
    description: "两个相离长方体产生两个互不连接的截面区域",
    model: {
      type: "boxes",
      boxes: [
        { min: [0, 0, 0], max: [1, 1, 1] },
        { min: [3, 0, 0], max: [5, 1, 1] },
      ],
    },
    plane: { normal: [0, 0, 1], constant: -0.5 },
    expected: {
      status: "area",
      contourCount: 2,
      rings: [
        ring([[0, 0], [1, 0], [1, 1], [0, 1]], 1),
        ring([[3, 0], [5, 0], [5, 1], [3, 1]], 2),
      ],
      basis: { origin: [0, 0, 0.5], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "两个矩形之间有 2 个单位空隙，不能桥接；面积分别为 1 和 2。",
    },
  },
  {
    id: "cube-tangent-at-vertex",
    description: "平面 x+y+z=3 只擦过单位立方体顶点 (1,1,1)",
    model: { type: "box", min: [0, 0, 0], max: [1, 1, 1] },
    plane: {
      normal: [1 / SQRT_3, 1 / SQRT_3, 1 / SQRT_3],
      constant: -SQRT_3,
    },
    expected: {
      status: "degenerate",
      contourCount: 0,
      rings: [],
      degeneracy: { kind: "point", points: [[1, 1, 1]] },
      basisReason: "线性函数 x+y+z 在立方体上的唯一最大点是 (1,1,1)，交集面积为零。",
    },
  },
  {
    id: "cube-through-three-vertices",
    description: "平面 x+y+z=2 经过单位立方体三个顶点",
    model: { type: "box", min: [0, 0, 0], max: [1, 1, 1] },
    plane: {
      normal: [1 / SQRT_3, 1 / SQRT_3, 1 / SQRT_3],
      constant: -2 / SQRT_3,
    },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [
        ring([[0, 0], [SQRT_2, 0], [SQRT_2 / 2, Math.sqrt(3 / 2)]], SQRT_3 / 2),
      ],
      basisReason: "交点 (0,1,1)、(1,0,1)、(1,1,0) 两两距离 √2，构成等边三角形。",
    },
  },
  {
    id: "cube-coplanar-top-face",
    description: "平面 z=1 与单位立方体顶面共面",
    model: { type: "box", min: [0, 0, 0], max: [1, 1, 1] },
    plane: { normal: [0, 0, 1], constant: -1 },
    expected: {
      status: "area",
      contourCount: 1,
      rings: [ring([[0, 0], [1, 0], [1, 1], [0, 1]], 1)],
      degeneracy: { kind: "coplanar-face", faceCount: 1 },
      basis: { origin: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
      basisReason: "集合交是完整顶面；共面来源需标记，但不能重复输出两个三角面或丢成空截面。",
    },
  },
]);
