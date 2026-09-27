import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_APPEARANCE = {
  color: 0xf5f1e8,
  opacity: 1.0,
  wireframeColor: 0x3a3028,
};

/**
 * 创建长方体模型组（含实体网格与棱线）。
 *
 * @param {number} width  - X 轴长度
 * @param {number} height - Y 轴长度
 * @param {number} depth  - Z 轴长度
 * @param {Object} [appearance]
 * @param {number|string} [appearance.color=0xf5f1e8]
 * @param {number}        [appearance.opacity=1.0]
 * @param {number|string} [appearance.wireframeColor=0x3a3028]
 * @returns {THREE.Group}
 */
export function createBox(width, height, depth, appearance) {
  const safeWidth = Math.max(0.01, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(0.01, Number.isFinite(height) ? height : 1);
  const safeDepth = Math.max(0.01, Number.isFinite(depth) ? depth : 1);

  const app = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };

  const geometry = new THREE.BoxGeometry(safeWidth, safeHeight, safeDepth);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(app.color),
    roughness: 0.45,
    metalness: 0.05,
    transparent: app.opacity < 1,
    opacity: Math.min(1, Math.max(0, app.opacity)),
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "BoxSolid";

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(app.wireframeColor),
    transparent: app.opacity < 0.5,
    opacity: Math.min(1, Math.max(0, app.opacity < 0.5 ? app.opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edges, lineMaterial);
  wireframe.name = "BoxWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;

  const group = new THREE.Group();
  group.name = `Box_${safeWidth.toFixed(2)}x${safeHeight.toFixed(2)}x${safeDepth.toFixed(2)}`;
  group.add(mesh);
  group.add(wireframe);

  group.userData = {
    type: "box",
    width: safeWidth,
    height: safeHeight,
    depth: safeDepth,
    appearance: { ...app },
  };

  return group;
}

/**
 * 创建正方体模型组（width = height = depth）。
 *
 * @param {number} size
 * @param {Object} [appearance] - 同 createBox
 * @returns {THREE.Group}
 */
export function createCube(size, appearance) {
  const safeSize = Math.max(0.01, Number.isFinite(size) ? size : 1);
  return createBox(safeSize, safeSize, safeSize, appearance);
}
