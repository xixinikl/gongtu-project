import * as THREE from "/node_modules/three/build/three.module.js";

import { sliceTriangleWithPlane } from "./triangle-plane-slice.js";
import { normalizeSectionSegments } from "./section-segment-normalizer.js";
import { buildSectionContours } from "./section-contour-builder.js";
import { buildSectionContourTopology } from "./section-contour-topology.js";
import { triangulateSectionTopology } from "./section-triangulation.js";

const DEFAULT_EPSILON = 1e-7;

function validatedRoot(root) {
  if (!root?.isObject3D) {
    throw new TypeError("root must be a THREE.Object3D");
  }
  return root;
}

function validatedPlane(plane) {
  if (!plane?.isPlane || plane.normal.lengthSq() === 0) {
    throw new TypeError("plane must be a THREE.Plane with a non-zero normal");
  }
  return plane;
}

function triangleCount(geometry) {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  return geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor(position.count / 3);
}

function readVertex(geometry, vertexIndex, target) {
  target.fromBufferAttribute(geometry.getAttribute("position"), vertexIndex);
  return target;
}

function triangleVertexIndex(geometry, cornerIndex) {
  return geometry.index ? geometry.index.getX(cornerIndex) : cornerIndex;
}

function collectWorldTriangleSegments(root, plane, epsilon) {
  const segments = [];
  const relations = {
    segment: 0,
    none: 0,
    point: 0,
    coplanar: 0,
  };
  let meshCount = 0;
  let totalTriangles = 0;

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.isBufferGeometry) return;
    const geometry = object.geometry;
    if (!geometry.getAttribute("position")) return;

    meshCount += 1;
    const count = triangleCount(geometry);
    totalTriangles += count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let triangleIndex = 0; triangleIndex < count; triangleIndex += 1) {
      const corner = triangleIndex * 3;
      readVertex(geometry, triangleVertexIndex(geometry, corner), a)
        .applyMatrix4(object.matrixWorld);
      readVertex(geometry, triangleVertexIndex(geometry, corner + 1), b)
        .applyMatrix4(object.matrixWorld);
      readVertex(geometry, triangleVertexIndex(geometry, corner + 2), c)
        .applyMatrix4(object.matrixWorld);

      const triangleId = `${object.uuid}:${triangleIndex}`;
      const sliced = sliceTriangleWithPlane([a, b, c], plane, {
        triangleId,
        epsilon,
      });
      relations[sliced.status] += 1;
      if (sliced.segment) segments.push(sliced.segment);
    }
  });

  return { segments, meshCount, totalTriangles, relations };
}

function errorResult(stage, result, diagnostics) {
  return {
    status: "error",
    stage,
    error: result?.error ?? "unknown-error",
    message: result?.message ?? "section engine stage failed",
    contourCount: 0,
    area: 0,
    contours: [],
    diagnostics,
  };
}

function triangulatedArea(triangulation) {
  let area = 0;
  for (let index = 0; index < triangulation.indices.length; index += 3) {
    const a = triangulation.vertices2D[triangulation.indices[index]];
    const b = triangulation.vertices2D[triangulation.indices[index + 1]];
    const c = triangulation.vertices2D[triangulation.indices[index + 2]];
    area += Math.abs(
      0.5 * (
        a.x * (b.y - c.y)
        + b.x * (c.y - a.y)
        + c.x * (a.y - b.y)
      ),
    );
  }
  return area;
}

function simplifyContourPoints(points, epsilon) {
  const simplified = points.map((point) => point.clone());
  let changed = true;
  while (changed && simplified.length > 3) {
    changed = false;
    for (let index = 0; index < simplified.length; index += 1) {
      const previous = simplified[(index - 1 + simplified.length) % simplified.length];
      const current = simplified[index];
      const next = simplified[(index + 1) % simplified.length];
      const before = current.clone().sub(previous);
      const after = next.clone().sub(current);
      const scale = before.length() + after.length();
      if (scale > 0 && before.cross(after).length() <= epsilon * scale) {
        simplified.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return simplified;
}

function simplifyContours(contours, epsilon) {
  return contours.map((contour) => {
    const points = simplifyContourPoints(contour.points, epsilon);
    return { ...contour, points, segmentCount: points.length };
  });
}

/**
 * 截面引擎 V2 的纯编排入口。只计算数据，不创建或更新任何视觉对象。
 */
export function computeSectionV2(root, plane, options = {}) {
  validatedRoot(root);
  validatedPlane(plane);
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new RangeError("epsilon must be a positive finite number");
  }

  const sliced = collectWorldTriangleSegments(root, plane, epsilon);
  const diagnostics = {
    meshCount: sliced.meshCount,
    triangleCount: sliced.totalTriangles,
    sliceRelations: sliced.relations,
    rawSegmentCount: sliced.segments.length,
  };

  const normalized = normalizeSectionSegments(sliced.segments, { epsilon });
  diagnostics.normalizedSegmentCount = normalized.segments.length;
  diagnostics.removedSegments = normalized.removed;

  const built = buildSectionContours(normalized, { epsilon });
  if (built.status !== "ok") return errorResult("contours", built, diagnostics);
  diagnostics.consumedSegmentCount = built.consumedEdges;

  if (built.contours.length === 0) {
    return {
      status: "empty",
      stage: "complete",
      contourCount: 0,
      area: 0,
      contours: [],
      topology: null,
      triangulation: null,
      diagnostics,
    };
  }

  const contours = simplifyContours(built.contours, epsilon);
  diagnostics.simplifiedPointCount = contours
    .reduce((sum, contour) => sum + contour.points.length, 0);
  const topology = buildSectionContourTopology(contours, plane, { epsilon });
  if (topology.status !== "ok") return errorResult("topology", topology, diagnostics);

  const triangulation = triangulateSectionTopology(topology, { epsilon });
  if (triangulation.status !== "ok") {
    return errorResult("triangulation", triangulation, diagnostics);
  }

  return {
    status: "ok",
    stage: "complete",
    contourCount: contours.length,
    area: triangulatedArea(triangulation),
    contours,
    topology,
    triangulation,
    diagnostics,
  };
}

function normalizedV1Summary(v1) {
  const visible = v1?.status === "visible";
  return {
    status: visible ? "ok" : v1?.status === "error" ? "error" : "empty",
    contourCount: visible ? 1 : 0,
    area: visible && Number.isFinite(v1.area) ? Math.abs(v1.area) : 0,
  };
}

/**
 * 生成稳定、可序列化的影子比较结果，不决定生产显示。
 */
export function compareSectionV1V2(v1, v2, { areaTolerance = 1e-6 } = {}) {
  if (!v2 || typeof v2 !== "object") {
    throw new TypeError("v2 must be a computeSectionV2 result");
  }
  if (!Number.isFinite(areaTolerance) || areaTolerance < 0) {
    throw new RangeError("areaTolerance must be a non-negative finite number");
  }

  const legacy = normalizedV1Summary(v1);
  const areaDelta = Math.abs(legacy.area - (Number.isFinite(v2.area) ? v2.area : 0));
  const statusMatch = legacy.status === v2.status;
  const contourCountMatch = legacy.contourCount === v2.contourCount;
  const areaMatch = areaDelta <= areaTolerance;

  return {
    match: statusMatch && contourCountMatch && areaMatch,
    statusMatch,
    contourCountMatch,
    areaMatch,
    areaDelta,
    v1: legacy,
    v2: {
      status: v2.status,
      contourCount: v2.contourCount ?? 0,
      area: Number.isFinite(v2.area) ? v2.area : 0,
      stage: v2.stage ?? "unknown",
      error: v2.error ?? null,
    },
  };
}

/**
 * 把 V2 编排结果转换成稳定视觉模块的输入。
 */
export function toSectionVisualV2Data(result) {
  if (!result || typeof result !== "object") {
    throw new TypeError("result must be a computeSectionV2 result");
  }
  if (result.status === "empty") {
    return { status: "ok", vertices3D: [], indices: [], contours: [] };
  }
  if (result.status !== "ok") {
    throw new RangeError(`cannot render V2 result with status "${result.status}"`);
  }
  if (
    !Array.isArray(result.triangulation?.vertices3D)
    || !Array.isArray(result.triangulation?.indices)
    || !Array.isArray(result.contours)
  ) {
    throw new TypeError("successful V2 result is missing triangulation or contours");
  }
  return {
    status: "ok",
    vertices3D: result.triangulation.vertices3D,
    indices: result.triangulation.indices,
    contours: result.contours,
  };
}

/**
 * 默认选择 V2；显式开关或 V2 错误才选择 V1。
 */
export function chooseSectionProductionEngine(v2Result, { forceLegacy = false } = {}) {
  if (!v2Result || typeof v2Result !== "object") {
    throw new TypeError("v2Result must be an object");
  }
  if (forceLegacy) return { engine: "v1", reason: "forced-legacy" };
  if (v2Result.status === "error") {
    return {
      engine: "v1",
      reason: "v2-error",
      error: v2Result.error ?? "unknown-error",
    };
  }
  if (v2Result.status !== "ok" && v2Result.status !== "empty") {
    throw new RangeError(`unsupported V2 status "${v2Result.status}"`);
  }
  return { engine: "v2", reason: "production" };
}

export { DEFAULT_EPSILON };
