import * as THREE from "/node_modules/three/build/three.module.js";

function nextCapacity(required) {
  let capacity = 4;
  while (capacity < required) capacity *= 2;
  return capacity;
}

function finiteVector3(point, label) {
  if (!point?.isVector3 || ![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new TypeError(`${label} must be a finite THREE.Vector3`);
  }
}

function validateAndFlatten(data) {
  if (!data || typeof data !== "object" || data.status !== "ok") {
    throw new TypeError('section visual data must have status="ok"');
  }
  if (!Array.isArray(data.vertices3D) || !Array.isArray(data.indices)) {
    throw new TypeError("vertices3D and indices must be arrays");
  }
  if (!Array.isArray(data.contours)) {
    throw new TypeError("contours must be an array");
  }

  const fillPositions = [];
  data.vertices3D.forEach((point, index) => {
    finiteVector3(point, `vertices3D[${index}]`);
    fillPositions.push(point.x, point.y, point.z);
  });

  if (data.indices.length % 3 !== 0) {
    throw new RangeError("indices length must be divisible by 3");
  }
  const indices = data.indices.map((index, offset) => {
    if (!Number.isInteger(index) || index < 0 || index >= data.vertices3D.length) {
      throw new RangeError(`indices[${offset}] is outside vertices3D`);
    }
    return index;
  });

  const outlinePositions = [];
  data.contours.forEach((contour, contourIndex) => {
    const points = Array.isArray(contour) ? contour : contour?.points;
    if (!Array.isArray(points) || points.length < 3) {
      throw new TypeError(`contours[${contourIndex}] must contain at least 3 points`);
    }
    points.forEach((point, pointIndex) => {
      finiteVector3(point, `contours[${contourIndex}][${pointIndex}]`);
    });
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      outlinePositions.push(
        start.x, start.y, start.z,
        end.x, end.y, end.z,
      );
    }
  });

  if ((fillPositions.length === 0) !== (indices.length === 0)) {
    throw new RangeError("vertices3D and indices must both be empty or both contain data");
  }
  if (indices.length === 0 && outlinePositions.length !== 0) {
    throw new RangeError("empty fill data cannot contain contours");
  }
  if (indices.length > 0 && outlinePositions.length === 0) {
    throw new RangeError("visible fill data requires at least one contour");
  }

  const signature = [
    fillPositions.join(","),
    indices.join(","),
    outlinePositions.join(","),
  ].join("|");

  return { fillPositions, indices, outlinePositions, signature };
}

function updatePositionAttribute(geometry, values) {
  const requiredVertices = values.length / 3;
  let attribute = geometry.getAttribute("position");
  let reallocated = false;

  if (!attribute || attribute.count < requiredVertices) {
    const array = new Float32Array(nextCapacity(requiredVertices) * 3);
    attribute = new THREE.BufferAttribute(array, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    reallocated = true;
  }

  attribute.array.fill(0);
  attribute.array.set(values);
  attribute.needsUpdate = true;
  return reallocated;
}

function updateIndexAttribute(geometry, values) {
  const required = values.length;
  let attribute = geometry.getIndex();
  const needsUint32 = values.some((value) => value > 65535);
  const wrongType = attribute && (
    (needsUint32 && !(attribute.array instanceof Uint32Array))
    || (!needsUint32 && !(attribute.array instanceof Uint16Array))
  );
  let reallocated = false;

  if (!attribute || attribute.count < required || wrongType) {
    const ArrayType = needsUint32 ? Uint32Array : Uint16Array;
    attribute = new THREE.BufferAttribute(
      new ArrayType(nextCapacity(required)),
      1,
    );
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setIndex(attribute);
    reallocated = true;
  }

  attribute.array.fill(0);
  attribute.array.set(values);
  attribute.needsUpdate = true;
  return reallocated;
}

/**
 * 创建稳定复用的 V2 截面填充与多轮廓线视觉。
 */
export function createSectionVisualV2({
  fillColor = 0x2f80ed,
  outlineColor = 0x1559b3,
  fillOpacity = 0.62,
} = {}) {
  const group = new THREE.Group();
  group.name = "SectionVisualV2";
  group.visible = false;

  const fillGeometry = new THREE.BufferGeometry();
  const outlineGeometry = new THREE.BufferGeometry();
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity: fillOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: outlineColor,
    depthTest: false,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(fillGeometry, fillMaterial);
  const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  fill.name = "SectionFillV2";
  outline.name = "SectionContoursV2";
  fill.renderOrder = 4;
  outline.renderOrder = 5;
  group.add(fill, outline);

  let signature = null;
  let disposed = false;
  const stats = {
    updates: 0,
    skipped: 0,
    hides: 0,
    reallocations: 0,
  };

  function syncUserData(status, vertexCount = 0, indexCount = 0, contourCount = 0) {
    group.userData = {
      status,
      vertexCount,
      indexCount,
      contourCount,
      ...stats,
    };
  }

  function clear() {
    if (disposed) throw new Error("section visual is disposed");
    signature = "||";
    fillGeometry.setDrawRange(0, 0);
    outlineGeometry.setDrawRange(0, 0);
    if (group.visible) {
      group.visible = false;
      stats.hides += 1;
      syncUserData("empty");
      return true;
    }
    syncUserData("empty");
    return false;
  }

  function update(data) {
    if (disposed) throw new Error("section visual is disposed");
    const next = validateAndFlatten(data);
    const isEmpty = next.indices.length === 0;

    if (isEmpty) {
      if (!group.visible && signature === next.signature) {
        stats.skipped += 1;
        syncUserData("empty");
        return false;
      }
      signature = next.signature;
      fillGeometry.setDrawRange(0, 0);
      outlineGeometry.setDrawRange(0, 0);
      if (group.visible) {
        group.visible = false;
        stats.hides += 1;
        syncUserData("empty");
        return true;
      }
      syncUserData("empty");
      return false;
    }

    if (signature === next.signature) {
      stats.skipped += 1;
      syncUserData(
        "visible",
        next.fillPositions.length / 3,
        next.indices.length,
        data.contours.length,
      );
      return false;
    }

    const fillReallocated = updatePositionAttribute(fillGeometry, next.fillPositions);
    const indexReallocated = updateIndexAttribute(fillGeometry, next.indices);
    const outlineReallocated = updatePositionAttribute(
      outlineGeometry,
      next.outlinePositions,
    );
    stats.reallocations += Number(fillReallocated)
      + Number(indexReallocated)
      + Number(outlineReallocated);

    fillGeometry.setDrawRange(0, next.indices.length);
    outlineGeometry.setDrawRange(0, next.outlinePositions.length / 3);
    fillGeometry.computeBoundingSphere();
    outlineGeometry.computeBoundingSphere();
    signature = next.signature;
    group.visible = true;
    stats.updates += 1;
    syncUserData(
      "visible",
      next.fillPositions.length / 3,
      next.indices.length,
      data.contours.length,
    );
    return true;
  }

  function dispose() {
    if (disposed) return false;
    fillGeometry.dispose();
    outlineGeometry.dispose();
    fillMaterial.dispose();
    outlineMaterial.dispose();
    group.visible = false;
    disposed = true;
    signature = null;
    return true;
  }

  syncUserData("empty");

  return Object.freeze({
    group,
    fill,
    outline,
    update,
    clear,
    dispose,
    get disposed() {
      return disposed;
    },
  });
}
