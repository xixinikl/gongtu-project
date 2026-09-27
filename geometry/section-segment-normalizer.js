import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_EPSILON = 1e-7;

function validatedEpsilon(value) {
  if (value === undefined) return DEFAULT_EPSILON;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("epsilon must be a positive finite number");
  }
  return value;
}

function comparePoints(left, right) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function sourceKey(value) {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function compareSources(left, right) {
  return sourceKey(left).localeCompare(sourceKey(right));
}

function validateSegment(segment, index) {
  if (!segment || typeof segment !== "object") {
    throw new TypeError(`segment ${index} must be an object`);
  }
  if (!segment.start?.isVector3 || !segment.end?.isVector3) {
    throw new TypeError(`segment ${index} must contain start and end THREE.Vector3 values`);
  }
  if (
    ![segment.start, segment.end]
      .every((point) => [point.x, point.y, point.z].every(Number.isFinite))
  ) {
    throw new RangeError(`segment ${index} endpoints must contain finite coordinates`);
  }
  if (
    segment.triangleId !== null
    && segment.triangleId !== undefined
    && !["string", "number"].includes(typeof segment.triangleId)
  ) {
    throw new TypeError(`segment ${index} triangleId must be a string, number, null or undefined`);
  }
  if (typeof segment.triangleId === "number" && !Number.isFinite(segment.triangleId)) {
    throw new RangeError(`segment ${index} numeric triangleId must be finite`);
  }
}

function createDisjointSet(size) {
  const parents = Array.from({ length: size }, (_, index) => index);

  function find(index) {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  }

  return { find, union };
}

function clusterEndpoints(endpoints, epsilon) {
  const sorted = endpoints
    .map((endpoint, originalIndex) => ({ endpoint, originalIndex }))
    .sort((left, right) => (
      comparePoints(left.endpoint.point, right.endpoint.point)
      || left.originalIndex - right.originalIndex
    ));
  const set = createDisjointSet(sorted.length);
  const epsilonSq = epsilon * epsilon;

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      if (sorted[right].endpoint.point.x - sorted[left].endpoint.point.x > epsilon) break;
      if (
        sorted[left].endpoint.point.distanceToSquared(sorted[right].endpoint.point)
        <= epsilonSq
      ) {
        set.union(left, right);
      }
    }
  }

  const representativeByRoot = new Map();
  sorted.forEach(({ endpoint }, index) => {
    const root = set.find(index);
    if (!representativeByRoot.has(root)) {
      representativeByRoot.set(root, endpoint.point.clone());
    }
  });

  const canonicalByOriginalIndex = new Array(endpoints.length);
  sorted.forEach(({ originalIndex }, index) => {
    canonicalByOriginalIndex[originalIndex] = representativeByRoot.get(set.find(index));
  });
  return canonicalByOriginalIndex;
}

/**
 * 合并近似端点，并删除归一化后的零长与重复/反向重复线段。
 *
 * 本函数不链接轮廓。输出端点和线段均按字典序稳定排列，重复边来源聚合到 triangleIds。
 */
export function normalizeSectionSegments(segments, { epsilon } = {}) {
  if (!Array.isArray(segments)) {
    throw new TypeError("segments must be an array");
  }
  const tolerance = validatedEpsilon(epsilon);
  segments.forEach(validateSegment);

  const endpoints = segments.flatMap((segment, segmentIndex) => [
    { point: segment.start, segmentIndex, endpoint: "start" },
    { point: segment.end, segmentIndex, endpoint: "end" },
  ]);
  const canonical = clusterEndpoints(endpoints, tolerance);
  const uniqueSegments = new Map();
  let zeroLength = 0;
  let duplicates = 0;

  segments.forEach((segment, segmentIndex) => {
    const points = [
      canonical[segmentIndex * 2],
      canonical[segmentIndex * 2 + 1],
    ].sort(comparePoints);

    if (points[0].equals(points[1])) {
      zeroLength += 1;
      return;
    }

    const key = [
      points[0].x, points[0].y, points[0].z,
      points[1].x, points[1].y, points[1].z,
    ].join(",");
    const source = segment.triangleId;

    if (uniqueSegments.has(key)) {
      duplicates += 1;
      const existing = uniqueSegments.get(key);
      if (source !== null && source !== undefined) {
        existing.sourceMap.set(sourceKey(source), source);
      }
      return;
    }

    const sourceMap = new Map();
    if (source !== null && source !== undefined) {
      sourceMap.set(sourceKey(source), source);
    }
    uniqueSegments.set(key, {
      start: points[0].clone(),
      end: points[1].clone(),
      sourceMap,
    });
  });

  const normalized = [...uniqueSegments.values()]
    .sort((left, right) => (
      comparePoints(left.start, right.start)
      || comparePoints(left.end, right.end)
    ))
    .map(({ start, end, sourceMap }) => ({
      start,
      end,
      triangleIds: [...sourceMap.values()].sort(compareSources),
    }));

  return {
    segments: normalized,
    epsilon: tolerance,
    removed: { zeroLength, duplicates },
  };
}

export { DEFAULT_EPSILON };
