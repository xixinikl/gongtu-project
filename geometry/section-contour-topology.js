import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_EPSILON = 1e-7;

// ── Input validation ──

function validatedEpsilon(value) {
  if (value === undefined) return DEFAULT_EPSILON;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("epsilon must be a positive finite number");
  }
  return value;
}

function validatePlane(plane) {
  if (!plane || typeof plane !== "object" || !plane.isPlane) {
    throw new TypeError("plane must be a THREE.Plane");
  }
  const n = plane.normal;
  if (!n.isVector3 || (n.x === 0 && n.y === 0 && n.z === 0)) {
    throw new RangeError("plane normal must be a non-zero THREE.Vector3");
  }
}

function validateContours(contours) {
  if (!Array.isArray(contours)) {
    throw new TypeError("contours must be an array from SEC2-004 buildSectionContours");
  }
  for (let i = 0; i < contours.length; i++) {
    const c = contours[i];
    if (!c || typeof c !== "object" || !Array.isArray(c.points)) {
      throw new TypeError(`contour ${i} must have a points array`);
    }
    for (let j = 0; j < c.points.length; j++) {
      const p = c.points[j];
      if (!p.isVector3 || ![p.x, p.y, p.z].every(Number.isFinite)) {
        throw new TypeError(`contour ${i} point ${j} must be a finite THREE.Vector3`);
      }
    }
    if (c.points.length > 0 && c.points.length < 3) {
      throw new RangeError(`contour ${i} has fewer than 3 points`);
    }
  }
}

// ── Deterministic 2D basis ──

/**
 * Build a shared orthonormal 2D basis on the plane.
 * Guarantees: u, v are orthonormal; u × v = plane.normal (same direction).
 * The axis choice is deterministic: pick the world axis least parallel to the normal.
 */
function _buildBasis(normal) {
  const absN = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];

  let u;
  if (absN[0] <= absN[1] && absN[0] <= absN[2]) {
    // Normal is least parallel to X → cross with X
    u = new THREE.Vector3(0, -normal.z, normal.y);
  } else if (absN[1] <= absN[0] && absN[1] <= absN[2]) {
    // Normal is least parallel to Y → cross with Y
    u = new THREE.Vector3(normal.z, 0, -normal.x);
  } else {
    // Normal is least parallel to Z → cross with Z
    u = new THREE.Vector3(-normal.y, normal.x, 0);
  }

  u.normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  // u × v should equal normal (same direction)
  v.normalize();

  return { u, v };
}

// ── 2D projection ──

/**
 * Project 3D contour points onto the shared 2D basis.
 * Verifies every point lies on the plane within epsilon.
 */
function _projectTo2D(points3D, origin, u, v, plane, epsilon) {
  const points2D = [];
  for (let i = 0; i < points3D.length; i++) {
    const p = points3D[i];
    // Verify on-plane
    const dist = plane.distanceToPoint(p);
    if (Math.abs(dist) > epsilon) {
      throw new RangeError(
        `point ${i} is ${Math.abs(dist).toExponential(2)} units off the plane (epsilon=${epsilon})`,
      );
    }
    const rel = new THREE.Vector3().subVectors(p, origin);
    points2D.push(new THREE.Vector2(rel.dot(u), rel.dot(v)));
  }
  return points2D;
}

// ── Shoelace signed area ──

function _shoelaceSignedArea(points2D) {
  let area = 0;
  const n = points2D.length;
  for (let i = 0; i < n; i++) {
    const a = points2D[i];
    const b = points2D[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

// ── Winding enforcement ──

function _enforceWinding(points2D, points3D, targetSign) {
  const area = _shoelaceSignedArea(points2D);
  // targetSign > 0 → want CCW; targetSign < 0 → want CW
  if ((area > 0 && targetSign < 0) || (area < 0 && targetSign > 0)) {
    points2D.reverse();
    if (points3D) points3D.reverse();
  }
}

// ── Segment intersection (2D) ──

function _orient2D(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function _onSegment(p, a, b, epsilon) {
  // Check if point p lies on segment ab (collinear and between bounds)
  if (Math.abs(_orient2D(a, b, p)) > epsilon) return false;
  return (
    p.x >= Math.min(a.x, b.x) - epsilon &&
    p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon &&
    p.y <= Math.max(a.y, b.y) + epsilon
  );
}

function _segmentsIntersect(a1, a2, b1, b2, epsilon) {
  const o1 = _orient2D(a1, a2, b1);
  const o2 = _orient2D(a1, a2, b2);
  const o3 = _orient2D(b1, b2, a1);
  const o4 = _orient2D(b1, b2, a2);

  // Proper intersection. Compare each orientation with the tolerance instead
  // of comparing their product, whose units and scale would be different.
  const opposite12 =
    (o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon);
  const opposite34 =
    (o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon);
  if (opposite12 && opposite34) return "intersect";

  // Collinear touching/overlap → error for topology classification
  if (Math.abs(o1) <= epsilon && _onSegment(b1, a1, a2, epsilon)) return "touch";
  if (Math.abs(o2) <= epsilon && _onSegment(b2, a1, a2, epsilon)) return "touch";
  if (Math.abs(o3) <= epsilon && _onSegment(a1, b1, b2, epsilon)) return "touch";
  if (Math.abs(o4) <= epsilon && _onSegment(a2, b1, b2, epsilon)) return "touch";

  return false;
}

// ── Self-intersection check ──

function _ringSelfIntersects(points2D, epsilon) {
  const n = points2D.length;
  if (n < 4) return false; // triangle can't self-intersect
  for (let i = 0; i < n; i++) {
    const a1 = points2D[i];
    const a2 = points2D[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent and same edge
      if ((j + 1) % n === i) continue;
      const b1 = points2D[j];
      const b2 = points2D[(j + 1) % n];
      const result = _segmentsIntersect(a1, a2, b1, b2, epsilon);
      if (result) return true;
    }
  }
  return false;
}

// ── Ring-ring intersection check ──

function _ringsIntersect(ringA, ringB, epsilon) {
  for (let i = 0; i < ringA.length; i++) {
    const a1 = ringA[i];
    const a2 = ringA[(i + 1) % ringA.length];
    for (let j = 0; j < ringB.length; j++) {
      const b1 = ringB[j];
      const b2 = ringB[(j + 1) % ringB.length];
      const result = _segmentsIntersect(a1, a2, b1, b2, epsilon);
      if (result) return true;
    }
  }
  return false;
}

// ── Point-in-polygon (ray casting, 2D) ──

function _pointInPolygonRaycast(point, polygon, epsilon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    // Check if point is on this edge
    if (Math.abs(_orient2D({ x: xi, y: yi }, { x: xj, y: yj }, point)) <= epsilon) {
      if (_onSegment(point, { x: xi, y: yi }, { x: xj, y: yj }, epsilon)) {
        return "on-boundary";
      }
    }

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Ring area validation ──

function _ringHasValidArea(points2D, areaEpsilon) {
  return Math.abs(_shoelaceSignedArea(points2D)) > areaEpsilon;
}

// ── Parent finding ──

function _findParentRing(ringIdx, ring2Ds, ringAreas, epsilon) {
  const ring = ring2Ds[ringIdx];
  const ringArea = Math.abs(ringAreas[ringIdx]);
  // Rings have already been proven disjoint and non-touching, so any vertex
  // is a valid containment witness. A vertex-average "centroid" is unsafe for
  // concave rings because it can lie in the ring's exterior notch.
  const witness = ring[0];

  let parentIdx = -1;
  let parentArea = Infinity;

  for (let i = 0; i < ring2Ds.length; i++) {
    if (i === ringIdx) continue;
    const candidateArea = Math.abs(ringAreas[i]);
    // Parent must be larger
    if (candidateArea <= ringArea) continue;

    const containment = _pointInPolygonRaycast(witness, ring2Ds[i], epsilon);
    if (containment === "on-boundary") {
      throw new RangeError(
        `ring ${ringIdx} touches boundary of ring ${i} — topology ambiguous`,
      );
    }
    if (containment === true && candidateArea < parentArea) {
      parentIdx = i;
      parentArea = candidateArea;
    }
  }

  return parentIdx;
}

function _ringCentroid(points2D) {
  let cx = 0, cy = 0;
  for (const p of points2D) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points2D.length, y: cy / points2D.length };
}

// ── Depth computation ──

function _computeDepths(ring2Ds, ringAreas, epsilon) {
  const n = ring2Ds.length;
  const parents = new Array(n).fill(-1);
  const depths = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    parents[i] = _findParentRing(i, ring2Ds, ringAreas, epsilon);
  }

  function resolveDepth(idx, visited = new Set()) {
    if (depths[idx] !== -1) return depths[idx];
    if (visited.has(idx)) {
      throw new RangeError(`circular containment detected at ring ${idx}`);
    }
    visited.add(idx);
    if (parents[idx] === -1) {
      depths[idx] = 0;
    } else {
      depths[idx] = resolveDepth(parents[idx], visited) + 1;
    }
    return depths[idx];
  }

  for (let i = 0; i < n; i++) {
    resolveDepth(i);
  }

  return { parents, depths };
}

// ── Main topology entry ──

/**
 * Build section contour topology from SEC2-004 closed contours.
 *
 * Projects all 3D contour points onto a shared 2D basis on the cutting plane,
 * classifies outer (positive winding after CCW enforcement) vs hole (CW),
 * resolves nesting via parent containment, and groups outer rings with their
 * direct child holes. Hole-in-island (depth 2) becomes a new polygon group.
 *
 * @param {object[]} contours - SEC2-004 contours array (status must be "ok")
 * @param {THREE.Plane} plane - the cutting plane
 * @param {object} [options]
 * @param {number} [options.epsilon=1e-7]
 * @param {number} [options.areaEpsilon=1e-12] - rings with |area| ≤ this are degenerate
 * @returns {object} { status, groups, basis, plane }
 */
export function buildSectionContourTopology(contours, plane, options = {}) {
  const epsilon = validatedEpsilon(options.epsilon);
  const areaEpsilon = options.areaEpsilon ?? 1e-12;

  validatePlane(plane);
  validateContours(contours);

  // Clone and normalize plane (don't modify caller's)
  const normPlane = plane.clone();
  normPlane.normalize();

  const origin = new THREE.Vector3();
  normPlane.coplanarPoint(origin);

  const { u, v } = _buildBasis(normPlane.normal);

  // ── Project all contours to 2D ──
  const ring2Ds = [];
  const ring3Ds = [];
  const ringAreas = [];

  for (let i = 0; i < contours.length; i++) {
    const pts3D = contours[i].points;
    if (pts3D.length === 0) continue;

    const pts2D = _projectTo2D(pts3D, origin, u, v, normPlane, epsilon);

    // Self-intersection check
    if (_ringSelfIntersects(pts2D, epsilon)) {
      return {
        status: "error",
        error: "self-intersecting-ring",
        message: `contour ${i} self-intersects`,
        ringIndex: i,
      };
    }

    // Area check
    const signedArea = _shoelaceSignedArea(pts2D);
    if (!_ringHasValidArea(pts2D, areaEpsilon)) {
      return {
        status: "error",
        error: "degenerate-ring",
        message: `contour ${i} has area ${Math.abs(signedArea).toExponential(2)} ≤ areaEpsilon ${areaEpsilon}`,
        ringIndex: i,
        area: signedArea,
      };
    }

    ring2Ds.push(pts2D);
    ring3Ds.push([...pts3D]);
    ringAreas.push(signedArea);
  }

  // ── Empty → stable empty result ──
  if (ring2Ds.length === 0) {
    return {
      status: "ok",
      groups: [],
      basis: { origin, u, v },
      plane: normPlane,
    };
  }

  // ── Ring-ring intersection check ──
  for (let i = 0; i < ring2Ds.length; i++) {
    for (let j = i + 1; j < ring2Ds.length; j++) {
      if (_ringsIntersect(ring2Ds[i], ring2Ds[j], epsilon)) {
        return {
          status: "error",
          error: "intersecting-rings",
          message: `rings ${i} and ${j} intersect or touch`,
          ringIndices: [i, j],
        };
      }
    }
  }

  // ── Enforce winding: outer CCW (positive), hole CW (negative) ──
  // We'll flip based on area sign AFTER we know depth

  // ── Compute depth via parent containment ──
  const { parents, depths } = _computeDepths(ring2Ds, ringAreas, epsilon);

  // Now enforce winding based on depth
  for (let i = 0; i < ring2Ds.length; i++) {
    // depth 0,2,4... → outer → CCW (positive)
    // depth 1,3,5... → hole → CW (negative)
    const targetSign = depths[i] % 2 === 0 ? 1 : -1;
    _enforceWinding(ring2Ds[i], ring3Ds[i], targetSign);
    // Recompute area after potential reversal
    ringAreas[i] = _shoelaceSignedArea(ring2Ds[i]);
  }

  // ── Build polygon groups ──
  // Each outer (even depth) collects its direct child holes (depth = outer.depth + 1)
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < ring2Ds.length; i++) {
    if (depths[i] % 2 !== 0) continue; // skip holes (they belong to their parent outer)
    if (assigned.has(i)) continue;

    assigned.add(i);
    const holeIndices = [];
    const hole2Ds = [];
    const hole3Ds = [];

    for (let j = 0; j < ring2Ds.length; j++) {
      if (j === i) continue;
      if (parents[j] !== i) continue; // only direct child holes
      holeIndices.push(j);
      hole2Ds.push(ring2Ds[j]);
      hole3Ds.push(ring3Ds[j]);
      assigned.add(j);
    }

    groups.push({
      outerContourIndex: i,
      holeContourIndices: holeIndices,
      outerPoints2D: ring2Ds[i],
      outerPoints3D: ring3Ds[i],
      holes2D: hole2Ds,
      holes3D: hole3Ds,
    });
  }

  // Verify all holes were assigned
  for (let i = 0; i < ring2Ds.length; i++) {
    if (!assigned.has(i)) {
      return {
        status: "error",
        error: "unassigned-ring",
        message: `ring ${i} (depth ${depths[i]}, area sign ${ringAreas[i] > 0 ? '+' : '-'}) could not be assigned to any parent outer`,
        ringIndex: i,
        depth: depths[i],
      };
    }
  }

  // Sort groups deterministically by outer contour index
  groups.sort((a, b) => a.outerContourIndex - b.outerContourIndex);

  return {
    status: "ok",
    groups,
    basis: { origin, u, v },
    plane: normPlane,
  };
}

export { DEFAULT_EPSILON, _buildBasis };
