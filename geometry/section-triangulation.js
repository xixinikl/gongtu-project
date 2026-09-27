import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_EPSILON = 1e-7;

// ── Validation ──

function validatedEpsilon(value) {
  if (value === undefined) return DEFAULT_EPSILON;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("epsilon must be a positive finite number");
  }
  return value;
}

function validateTopology(topology) {
  if (!topology || typeof topology !== "object") {
    throw new TypeError("topology must be an object from buildSectionContourTopology");
  }
  if (topology.status !== "ok") {
    throw new RangeError(
      `topology status must be "ok", got "${topology.status}": ${topology.error ?? "unknown error"}`,
    );
  }
  if (!Array.isArray(topology.groups)) {
    throw new TypeError("topology.groups must be an array");
  }
  for (let i = 0; i < topology.groups.length; i++) {
    const g = topology.groups[i];
    if (!Array.isArray(g.outerPoints2D)) {
      throw new TypeError(`group ${i}: outerPoints2D must be an array`);
    }
    if (!Array.isArray(g.outerPoints3D)) {
      throw new TypeError(`group ${i}: outerPoints3D must be an array`);
    }
    if (g.outerPoints2D.length !== g.outerPoints3D.length) {
      throw new RangeError(
        `group ${i}: 2D/3D point count mismatch (${g.outerPoints2D.length} vs ${g.outerPoints3D.length})`,
      );
    }
    for (let j = 0; j < g.outerPoints2D.length; j++) {
      if (!g.outerPoints2D[j].isVector2 || !g.outerPoints3D[j].isVector3) {
        throw new TypeError(
          `group ${i} outer point ${j}: must be THREE.Vector2 / THREE.Vector3 pair`,
        );
      }
    }
    if (!Array.isArray(g.holes2D)) {
      throw new TypeError(`group ${i}: holes2D must be an array`);
    }
    for (let j = 0; j < g.holes2D.length; j++) {
      if (!Array.isArray(g.holes2D[j])) {
        throw new TypeError(`group ${i} hole ${j}: must be an array of THREE.Vector2`);
      }
      for (const p of g.holes2D[j]) {
        if (!p.isVector2) {
          throw new TypeError(`group ${i} hole ${j}: all points must be THREE.Vector2`);
        }
      }
    }
  }
}

// ── Triangulation per group ──

/**
 * Triangulates the topology groups using THREE.ShapeUtils.triangulateShape (Earcut).
 *
 * Flattens outer + holes vertices per group, maps Earcut local indices to global,
 * and validates area conservation (sum of triangle areas = outer area - holes area).
 *
 * @param {object} topology - output from buildSectionContourTopology
 * @param {object} [options]
 * @param {number} [options.epsilon=1e-7]
 * @param {number} [options.areaEpsilon=1e-12]
 * @returns {object} { status, vertices2D, vertices3D, indices, groups, basis }
 */
export function triangulateSectionTopology(topology, options = {}) {
  const epsilon = validatedEpsilon(options.epsilon);
  const areaEpsilon = options.areaEpsilon ?? 1e-12;

  validateTopology(topology);

  // ── Empty → stable empty result ──
  if (topology.groups.length === 0) {
    return {
      status: "ok",
      vertices2D: [],
      vertices3D: [],
      indices: [],
      groups: [],
      basis: topology.basis,
    };
  }

  const allVertices2D = [];
  const allVertices3D = [];
  const allIndices = [];
  const groupInfos = [];

  for (const group of topology.groups) {
    const outer2D = group.outerPoints2D;
    const outer3D = group.outerPoints3D;
    const holes2DList = group.holes2D;
    const holes3DList = group.holes3D;

    const vertexStart = allVertices2D.length;

    // ShapeUtils.triangulateShape expects Vector2[] for outer and Vector2[][] for holes
    const vec2Holes = holes2DList.map((hole) => hole.map((p) => p.clone()));

    // Collect 2D vertices
    for (const p of outer2D) {
      allVertices2D.push(p.clone());
    }
    for (let h = 0; h < holes2DList.length; h++) {
      for (const p of holes2DList[h]) {
        allVertices2D.push(p.clone());
      }
    }

    // Collect 3D vertices
    for (const p of outer3D) {
      allVertices3D.push(p.clone());
    }
    for (let h = 0; h < holes3DList.length; h++) {
      for (const p of holes3DList[h]) {
        allVertices3D.push(p.clone());
      }
    }

    // Triangulate
    let localTriangles;
    try {
      localTriangles = THREE.ShapeUtils.triangulateShape(outer2D, vec2Holes);
    } catch (e) {
      return {
        status: "error",
        error: "triangulation-failed",
        message: `ShapeUtils.triangulateShape failed for group ${group.outerContourIndex}: ${e.message}`,
        groupIndex: group.outerContourIndex,
      };
    }

    // triangulateShape returns [[i0,i1,i2], ...] arrays, not flat indices
    if (!localTriangles || localTriangles.length === 0) {
      return {
        status: "error",
        error: "triangulation-empty",
        message: `ShapeUtils.triangulateShape returned empty triangles for group ${group.outerContourIndex}`,
        groupIndex: group.outerContourIndex,
      };
    }

    // Flatten triangle array [[i0,i1,i2], ...] → [i0,i1,i2, ...]
    const localIndices = [];
    for (const tri of localTriangles) {
      if (!Array.isArray(tri) || tri.length !== 3) continue;
      localIndices.push(tri[0], tri[1], tri[2]);
    }

    // Map local indices to global
    const vertexCount = allVertices2D.length - vertexStart;
    const indexStart = allIndices.length;
    const localIndexCount = localIndices.length;

    for (let j = 0; j < localIndices.length; j++) {
      const localIdx = localIndices[j];
      if (!Number.isInteger(localIdx) || localIdx < 0 || localIdx >= vertexCount) {
        return {
          status: "error",
          error: "invalid-index",
          message: `Earcut produced out-of-range index ${localIdx} (vertexCount={${vertexCount}}) for group ${group.outerContourIndex}`,
          groupIndex: group.outerContourIndex,
          badIndex: localIdx,
        };
      }
      allIndices.push(vertexStart + localIdx);
    }

    // Filter out degenerate triangles instead of rejecting the entire result.
    // Degenerate triangles (area ≈ 0) contribute no visible area; discarding them
    // prevents unnecessary fallback to V1 which causes visual flickering.
    const filteredIndices = [];
    let degenerateCount = 0;
    for (let j = 0; j < localIndices.length; j += 3) {
      const li0 = localIndices[j];
      const li1 = localIndices[j + 1];
      const li2 = localIndices[j + 2];
      const v0 = allVertices2D[vertexStart + li0];
      const v1 = allVertices2D[vertexStart + li1];
      const v2 = allVertices2D[vertexStart + li2];

      const triArea =
        0.5 *
        Math.abs(
          v0.x * (v1.y - v2.y) +
          v1.x * (v2.y - v0.y) +
          v2.x * (v0.y - v1.y),
        );

      if (triArea <= areaEpsilon) {
        degenerateCount++;
        continue;
      }
      filteredIndices.push(vertexStart + li0, vertexStart + li1, vertexStart + li2);
    }

    // Replace original indices with filtered set
    allIndices.length = indexStart; // remove previously-pushed indices for this group
    for (const idx of filteredIndices) {
      allIndices.push(idx);
    }

    groupInfos.push({
      outerContourIndex: group.outerContourIndex,
      holeContourIndices: group.holeContourIndices,
      vertexStart,
      vertexCount,
      indexStart,
      indexCount: filteredIndices.length,
    });
  }

  // ── Area conservation check per group ──
  for (let g = 0; g < groupInfos.length; g++) {
    const gi = groupInfos[g];
    const topoGroup = topology.groups[g];

    // Expected net area = outer area - sum of hole areas
    const outerArea = Math.abs(_shoelaceArea2D(topoGroup.outerPoints2D));
    let holesArea = 0;
    for (const hole of topoGroup.holes2D) {
      holesArea += Math.abs(_shoelaceArea2D(hole));
    }
    const expectedArea = outerArea - holesArea;

    // Actual triangulated area
    let triArea = 0;
    for (let j = gi.indexStart; j < gi.indexStart + gi.indexCount; j += 3) {
      const i0 = allIndices[j];
      const i1 = allIndices[j + 1];
      const i2 = allIndices[j + 2];
      triArea += Math.abs(_triangleArea(
        allVertices2D[i0],
        allVertices2D[i1],
        allVertices2D[i2],
      ));
    }

    if (Math.abs(triArea - expectedArea) > Math.max(areaEpsilon, epsilon * expectedArea)) {
      return {
        status: "error",
        error: "area-mismatch",
        message: `group ${g}: triangle area sum ${triArea.toExponential(4)} ≠ expected ${expectedArea.toExponential(4)} (outer ${outerArea.toExponential(4)} - holes ${holesArea.toExponential(4)})`,
        groupIndex: g,
        triangleArea: triArea,
        expectedArea,
      };
    }
  }

  return {
    status: "ok",
    vertices2D: allVertices2D,
    vertices3D: allVertices3D,
    indices: allIndices,
    groups: groupInfos,
    basis: topology.basis,
  };
}

// ── Area helpers (duplicated for this module's internal use) ──

function _shoelaceArea2D(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function _triangleArea(v0, v1, v2) {
  return 0.5 * Math.abs(
    v0.x * (v1.y - v2.y) + v1.x * (v2.y - v0.y) + v2.x * (v0.y - v1.y),
  );
}

export { DEFAULT_EPSILON };
