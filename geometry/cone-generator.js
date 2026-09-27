import * as THREE from "/node_modules/three/build/three.module.js";

const DEFAULT_APPEARANCE = {
  color: 0xf5f1e8,
  opacity: 1.0,
  wireframeColor: 0x3a3028,
};

/**
 * 创建圆锥体模型组。
 *
 * 使用 ConeGeometry 生成圆锥，几何中心位于原点。
 * 含实体网格 + 棱线。
 *
 * @param {number} [radius=1]          - 底面半径
 * @param {number} [height=2]          - 高度（Y 轴方向）
 * @param {number} [radialSegments=32] - 圆周分段数
 * @param {Object} [appearance]
 * @param {number|string} [appearance.color=0xf5f1e8]
 * @param {number}        [appearance.opacity=1.0]
 * @param {number|string} [appearance.wireframeColor=0x3a3028]
 * @returns {THREE.Group}
 */
export function createCone(radius, height, radialSegments, appearance) {
  const safeRadius = Math.max(0.01, Number.isFinite(radius) ? radius : 1);
  const safeHeight = Math.max(0.01, Number.isFinite(height) ? height : 2);
  const safeSegments = Math.max(3, Math.floor(Number.isFinite(radialSegments) ? radialSegments : 32));

  const app = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };

  const geometry = new THREE.ConeGeometry(safeRadius, safeHeight, safeSegments, 1);
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
  mesh.name = "ConeSolid";

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(app.wireframeColor),
    transparent: app.opacity < 0.5,
    opacity: Math.min(1, Math.max(0.01, app.opacity < 0.5 ? app.opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edges, lineMaterial);
  wireframe.name = "ConeWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;

  const group = new THREE.Group();
  group.name = `Cone_r${safeRadius.toFixed(2)}_h${safeHeight.toFixed(2)}`;
  group.add(mesh);
  group.add(wireframe);

  group.userData = {
    type: "cone",
    radius: safeRadius,
    height: safeHeight,
    radialSegments: safeSegments,
    appearance: { ...app },
  };

  return group;
}
