import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_APPEARANCE = {
  color: 0xf5f1e8,
  opacity: 1.0,
  wireframeColor: 0x3a3028,
};

/**
 * 创建三棱柱模型组（底面正三角形，沿 Y 轴拉伸）。
 *
 * 底面正三角形边长 = baseSize，高 = height。
 * 模型几何中心位于原点。
 *
 * @param {number} baseSize - 正三角形底边长
 * @param {number} height   - 棱柱高度（Y 轴方向）
 * @param {Object} [appearance]
 * @param {number|string} [appearance.color=0xf5f1e8]
 * @param {number}        [appearance.opacity=1.0]
 * @param {number|string} [appearance.wireframeColor=0x3a3028]
 * @returns {THREE.Group}
 */
export function createTriangularPrism(baseSize, height, appearance) {
  const safeBase = Math.max(0.01, Number.isFinite(baseSize) ? baseSize : 1);
  const safeHeight = Math.max(0.01, Number.isFinite(height) ? height : 1);

  const app = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };

  // 正三角形三个顶点（Shape 在 XY 平面，中心在原点）
  const circumRadius = safeBase / Math.sqrt(3);
  const halfBase = safeBase / 2;
  const halfR = circumRadius / 2;

  const shape = new THREE.Shape();
  shape.moveTo(0, circumRadius);
  shape.lineTo(-halfBase, -halfR);
  shape.lineTo(halfBase, -halfR);
  shape.closePath();

  const extrudeSettings = {
    steps: 1,
    depth: safeHeight,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(app.color),
    roughness: 0.45,
    metalness: 0.05,
    transparent: app.opacity < 1,
    opacity: Math.min(1, Math.max(0, app.opacity)),
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "TriangularPrismSolid";
  // 绕 X 轴旋转使底面水平（Shape 在 XY → 底面在 XZ，高度沿 Y）
  mesh.rotation.x = -Math.PI / 2;

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(app.wireframeColor),
    transparent: app.opacity < 0.5,
    opacity: Math.min(1, Math.max(0, app.opacity < 0.5 ? app.opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edges, lineMaterial);
  wireframe.name = "TriangularPrismWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;
  wireframe.rotation.x = -Math.PI / 2;

  const group = new THREE.Group();
  group.name = `TriangularPrism_${safeBase.toFixed(2)}x${safeHeight.toFixed(2)}`;
  group.add(mesh);
  group.add(wireframe);
  // 将几何中心移至原点
  group.position.y = -safeHeight / 2;

  group.userData = {
    type: "triangularPrism",
    baseSize: safeBase,
    height: safeHeight,
    appearance: { ...app },
  };

  return group;
}
