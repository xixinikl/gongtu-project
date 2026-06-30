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

function pointKey(point) {
  return `${point.x},${point.y},${point.z}`;
}

function sourceKey(value) {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function compareSources(left, right) {
  return sourceKey(left).localeCompare(sourceKey(right));
}

function comparePointArrays(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const cmp = comparePoints(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

function parseInput(input, options) {
  let segments, epsilon;

  if (Array.isArray(input)) {
    segments = input;
    epsilon = options.epsilon;
  } else if (
    input
    && typeof input === "object"
    && "segments" in input
  ) {
    segments = input.segments;
    epsilon = options.epsilon ?? input.epsilon;
  } else {
    throw new TypeError(
      "input must be a normalized segments result { segments, ... } or an array of segments",
    );
  }

  return { segments, tolerance: validatedEpsilon(epsilon) };
}

function validateSegments(segments) {
  if (!Array.isArray(segments)) {
    throw new TypeError("segments must be an array");
  }
  segments.forEach((segment, index) => {
    if (!segment || typeof segment !== "object") {
      throw new TypeError(`segment ${index} must be an object`);
    }
    if (!segment.start?.isVector3 || !segment.end?.isVector3) {
      throw new TypeError(
        `segment ${index} must contain start and end THREE.Vector3 values`,
      );
    }
    if (
      ![segment.start, segment.end].every((p) =>
        [p.x, p.y, p.z].every(Number.isFinite),
      )
    ) {
      throw new RangeError(
        `segment ${index} endpoints must contain finite coordinates`,
      );
    }
    if (segment.triangleIds !== undefined && !Array.isArray(segment.triangleIds)) {
      throw new TypeError(
        `segment ${index} triangleIds must be an array if present`,
      );
    }
  });
}

/**
 * Build closed contours from normalized section segments using an adjacency graph.
 *
 * Each unique endpoint (already canonicalized by SEC2-003) is a graph node.
 * Each normalized segment is an undirected edge. Valid closed loops require
 * every node to have degree exactly 2.
 *
 * This function does NOT re-cluster endpoints, change coordinates, or use
 * centroid polar-angle sorting. It walks along true edge adjacency.
 *
 * @param {object|Array} input - SEC2-003 normalized result or segments array
 * @param {object} [options]
 * @param {number} [options.epsilon] - override epsilon (informational only)
 * @returns {object} { status, contours, epsilon, consumedEdges, totalEdges }
 */
export function buildSectionContours(input, options = {}) {
  const { segments, tolerance } = parseInput(input, options);
  validateSegments(segments);

  // ── Empty input → stable empty result ──
  if (segments.length === 0) {
    return {
      status: "ok",
      contours: [],
      epsilon: tolerance,
      consumedEdges: 0,
      totalEdges: 0,
    };
  }

  // ── Build node map and adjacency ──
  const nodeMap = new Map();
  const edges = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const startK = pointKey(seg.start);
    const endK = pointKey(seg.end);

    // Zero-length segment that slipped through normalization
    if (startK === endK) {
      return {
        status: "error",
        error: "zero-length-segment",
        message: `segment ${i} has identical start and end after normalization`,
        errorSegment: { index: i, point: seg.start.toArray() },
        epsilon: tolerance,
        consumedEdges: 0,
        totalEdges: segments.length,
      };
    }

    for (const [key, point] of [
      [startK, seg.start],
      [endK, seg.end],
    ]) {
      if (!nodeMap.has(key)) {
        nodeMap.set(key, {
          key,
          point: point.clone(),
          edgeIndices: [],
          degree: 0,
        });
      }
    }

    const edge = {
      index: i,
      startKey: startK,
      endKey: endK,
      start: seg.start,
      end: seg.end,
      triangleIds: seg.triangleIds ?? [],
      consumed: false,
    };
    edges.push(edge);

    nodeMap.get(startK).edgeIndices.push(i);
    nodeMap.get(endK).edgeIndices.push(i);
    nodeMap.get(startK).degree += 1;
    nodeMap.get(endK).degree += 1;
  }

  // ── Check for duplicate edges (multi-edges that slipped through normalization) ──
  const seenEdgePairs = new Set();
  for (const edge of edges) {
    const [a, b] = [edge.startKey, edge.endKey].sort();
    const pairKey = `${a}|${b}`;
    if (seenEdgePairs.has(pairKey)) {
      return {
        status: "error",
        error: "duplicate-edge",
        message: "duplicate edge detected — normalization should have removed this",
        errorEdge: { start: edge.start.toArray(), end: edge.end.toArray() },
        epsilon: tolerance,
        consumedEdges: 0,
        totalEdges: edges.length,
      };
    }
    seenEdgePairs.add(pairKey);
  }

  // ── Check degree constraints (all nodes must have degree 2) ──
  const errorNodes = [];
  for (const node of nodeMap.values()) {
    if (node.degree !== 2) {
      errorNodes.push({
        key: node.key,
        point: node.point.toArray(),
        degree: node.degree,
      });
    }
  }

  if (errorNodes.length > 0) {
    errorNodes.sort((a, b) => {
      const va = new THREE.Vector3(a.point[0], a.point[1], a.point[2]);
      const vb = new THREE.Vector3(b.point[0], b.point[1], b.point[2]);
      return comparePoints(va, vb);
    });

    let errorKind;
    if (errorNodes.some((n) => n.degree > 2)) {
      errorKind = "non-manifold";
    } else if (errorNodes.some((n) => n.degree === 1)) {
      errorKind = "open-chain";
    } else {
      errorKind = "isolated";
    }

    return {
      status: "error",
      error: errorKind,
      message: `Found ${errorNodes.length} node(s) with invalid degree`,
      errorNodes,
      epsilon: tolerance,
      consumedEdges: 0,
      totalEdges: edges.length,
    };
  }

  // ── Walk loops deterministically ──
  const contours = [];
  let consumedCount = 0;

  while (consumedCount < edges.length) {
    // Find lex-smallest node with at least one unconsumed edge
    const candidateNodes = [...nodeMap.values()]
      .filter((n) => n.edgeIndices.some((ei) => !edges[ei].consumed))
      .sort((a, b) => comparePoints(a.point, b.point));

    if (candidateNodes.length === 0) break;

    const startNode = candidateNodes[0];

    // Get the two unconsumed edges from start node
    const availableEdges = startNode.edgeIndices.filter(
      (ei) => !edges[ei].consumed,
    );

    // Determine neighbors and pick lex-smaller to establish deterministic direction
    const neighbors = availableEdges.map((ei) => {
      const edge = edges[ei];
      const neighborKey =
        edge.startKey === startNode.key ? edge.endKey : edge.startKey;
      return {
        edgeIndex: ei,
        neighborKey,
        neighborPoint: nodeMap.get(neighborKey).point,
      };
    });

    neighbors.sort((a, b) => comparePoints(a.neighborPoint, b.neighborPoint));

    // Walk the loop starting via the lex-smaller neighbor
    const loopPoints = [startNode.point.clone()];
    const loopTriangleIds = new Map();
    let loopSegmentCount = 0;

    let currentNode = startNode;
    let currentEdgeIndex = neighbors[0].edgeIndex;
    const visitedNodeKeys = new Set([startNode.key]);

    while (true) {
      const edge = edges[currentEdgeIndex];

      if (edge.consumed) {
        return {
          status: "error",
          error: "internal-edge-reuse",
          message: "attempted to consume an already-consumed edge",
          epsilon: tolerance,
          consumedEdges: consumedCount,
          totalEdges: edges.length,
        };
      }

      edge.consumed = true;
      consumedCount += 1;
      loopSegmentCount += 1;

      for (const tid of edge.triangleIds) {
        loopTriangleIds.set(sourceKey(tid), tid);
      }

      const nextKey =
        edge.startKey === currentNode.key ? edge.endKey : edge.startKey;

      if (nextKey === startNode.key) {
        break;
      }

      if (visitedNodeKeys.has(nextKey)) {
        return {
          status: "error",
          error: "self-intersection",
          message: "loop walk revisited a non-start node",
          epsilon: tolerance,
          consumedEdges: consumedCount,
          totalEdges: edges.length,
        };
      }

      visitedNodeKeys.add(nextKey);
      const nextNode = nodeMap.get(nextKey);
      loopPoints.push(nextNode.point.clone());

      const nextAvailable = nextNode.edgeIndices.filter(
        (ei) => !edges[ei].consumed,
      );

      if (nextAvailable.length === 0) {
        return {
          status: "error",
          error: "broken-loop",
          message: "loop walk hit a dead end unexpectedly",
          epsilon: tolerance,
          consumedEdges: consumedCount,
          totalEdges: edges.length,
        };
      }

      currentEdgeIndex = nextAvailable[0];
      currentNode = nextNode;
    }

    // Generate reverse candidate and pick lex-smaller sequence
    const reversed = [...loopPoints].reverse();
    const canonicalPoints =
      comparePointArrays(loopPoints, reversed) <= 0 ? loopPoints : reversed;

    contours.push({
      points: canonicalPoints,
      segmentCount: loopSegmentCount,
      triangleIds: [...loopTriangleIds.values()].sort(compareSources),
    });
  }

  // Sort contours by their canonical point sequences
  contours.sort((a, b) => comparePointArrays(a.points, b.points));

  return {
    status: "ok",
    contours,
    epsilon: tolerance,
    consumedEdges: consumedCount,
    totalEdges: edges.length,
  };
}

export { DEFAULT_EPSILON };
