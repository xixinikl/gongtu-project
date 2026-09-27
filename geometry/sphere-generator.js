import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_APPEARANCE = {
  color: 0xf5f1e8,
  opacity: 1.0,
  wireframeColor: 0x3a3028,
};

/**
 * 创建球体模型组。
 *
 * 使用 SphereGeometry 生成球体，几何中心位于原点。
 * 含实体网格 + 棱线。
 *
 * @param {number} [radius=1]           - 球体半径
 * @param {number} [widthSegments=32]   - 水平分段数
 * @param {number} [heightSegments=16]  - 垂直分段数
 * @param {Object} [appearance]
 * @param {number|string} [appearance.color=0xf5f1e8]
 * @param {number}        [appearance.opacity=1.0]
 * @param {number|string} [appearance.wireframeColor=0x3a3028]
 * @returns {THREE.Group}
 */
export function createSphere(radius, widthSegments, heightSegments, appearance) {
  const safeRadius = Math.max(0.01, Number.isFinite(radius) ? radius : 1);
  const safeWidthSeg = Math.max(3, Math.floor(Number.isFinite(widthSegments) ? widthSegments : 32));
  const safeHeightSeg = Math.max(2, Math.floor(Number.isFinite(heightSegments) ? heightSegments : 16));

  const app = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };

  const geometry = new THREE.SphereGeometry(safeRadius, safeWidthSeg, safeHeightSeg);
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
  mesh.name = "SphereSolid";

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(app.wireframeColor),
    transparent: app.opacity < 0.5,
    opacity: Math.min(1, Math.max(0.01, app.opacity < 0.5 ? app.opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edges, lineMaterial);
  wireframe.name = "SphereWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;

  const group = new THREE.Group();
  group.name = `Sphere_r${safeRadius.toFixed(2)}`;
  group.add(mesh);
  group.add(wireframe);

  group.userData = {
    type: "sphere",
    radius: safeRadius,
    widthSegments: safeWidthSeg,
    heightSegments: safeHeightSeg,
    appearance: { ...app },
  };

  return group;
}
