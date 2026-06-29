import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_APPEARANCE = {
  color: 0xf5f1e8,
  opacity: 1.0,
  wireframeColor: 0x3a3028,
};

/**
 * 创建三棱锥（正四面体）模型组。
 *
 * 底面为正三角形，顶点位于底面中心正上方。
 * 使用 ConeGeometry(radius, height, radialSegments=3) 生成三角形底锥体，
 * 几何中心位于原点。
 *
 * @param {number} baseSize - 底面正三角形边长
 * @param {number} height   - 锥体高度（顶点到底面的垂直距离）
 * @param {Object} [appearance]
 * @param {number|string} [appearance.color=0xf5f1e8]
 * @param {number}        [appearance.opacity=1.0]
 * @param {number|string} [appearance.wireframeColor=0x3a3028]
 * @returns {THREE.Group}
 */
export function createTriangularPyramid(baseSize, height, appearance) {
  const safeBase = Math.max(0.01, Number.isFinite(baseSize) ? baseSize : 1);
  const safeHeight = Math.max(0.01, Number.isFinite(height) ? height : 1);

  const app = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };

  // 正三角形外接圆半径 = 边长 / √3
  const radius = safeBase / Math.sqrt(3);

  // ConeGeometry(radiusTop, height, radialSegments) - 默认 radiusTop=0 即锥体
  const geometry = new THREE.ConeGeometry(radius, safeHeight, 3, 1);
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
  mesh.name = "TriangularPyramidSolid";

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(app.wireframeColor),
    transparent: app.opacity < 0.5,
    opacity: Math.min(1, Math.max(0.01, app.opacity < 0.5 ? app.opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edges, lineMaterial);
  wireframe.name = "TriangularPyramidWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;

  const group = new THREE.Group();
  group.name = `TriangularPyramid_${safeBase.toFixed(2)}x${safeHeight.toFixed(2)}`;
  group.add(mesh);
  group.add(wireframe);

  group.userData = {
    type: "triangularPyramid",
    baseSize: safeBase,
    height: safeHeight,
    appearance: { ...app },
  };

  return group;
}
