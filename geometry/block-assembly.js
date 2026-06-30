/**
 * 积木组合模型生成器。
 *
 * 从 BlockArray 提取仅外表面并构建合并几何体，确保 EdgesGeometry
 * 正确消除相邻积木间的内部棱线。
 */

import * as THREE from "three";
import { BlockArray } from "./block-array.js";

const DEFAULT_APPEARANCE = {
  color: 0xd4a76a,
  opacity: 1.0,
  wireframeColor: 0x5c4033,
};

/**
 * 六个面方向的局部顶点模板（CCW，从外向里看）。
 * 每个面：(dx, dy, dz) 偏移 + 4 个顶点在单位立方体 [0,1]^3 内的坐标。
 */
const FACES = [
  // +x (right)
  { offset: [1, 0, 0], vertices: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] },
  // -x (left)
  { offset: [-1, 0, 0], vertices: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  // +y (top)
  { offset: [0, 1, 0], vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  // -y (bottom)
  { offset: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  // +z (front)
  { offset: [0, 0, 1], vertices: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },
  // -z (back)
  { offset: [0, 0, -1], vertices: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },
];

/**
 * 提取外表面——仅在某个方向无相邻积木时才生成该面。
 *
 * @param {Set<string>} blockSet - 积木的 "x,y,z" 键集合
 * @param {number[][]} positions - 积木坐标列表
 * @returns {{positions: Float32Array, normals: Float32Array}}
 */
function extractExteriorSurface(blockSet, positions) {
  const verts = [];
  const norms = [];

  for (const [cx, cy, cz] of positions) {
    for (const face of FACES) {
      const [dx, dy, dz] = face.offset;
      const neighborKey = `${cx + dx},${cy + dy},${cz + dz}`;
      if (blockSet.has(neighborKey)) continue; // 内部面，跳过

      // 外表面：四个顶点 + 法向
      const normal = [dx, dy, dz];
      for (const [vx, vy, vz] of face.vertices) {
        verts.push(cx + vx, cy + vy, cz + vz);
        norms.push(...normal);
      }
    }
  }

  return {
    positions: new Float32Array(verts),
    normals: new Float32Array(norms),
  };
}

/**
 * 从 BlockArray 创建积木组合 Three.js 模型组。
 *
 * 每个积木位于整数坐标 [x, y, z]，其几何中心在 (x+0.5, y+0.5, z+0.5)。
 * 仅提取外表面构建合并几何体，相邻积木的内部面不产生多余棱线。
 *
 * @param {BlockArray|Array<number[]>} blocks - 积木阵列或坐标列表
 * @param {Object} [options]
 * @param {number|string} [options.color=0xd4a76a]        - 实体颜色
 * @param {number}        [options.opacity=1.0]            - 不透明度
 * @param {number|string} [options.wireframeColor=0x5c4033] - 棱线颜色
 * @returns {THREE.Group}
 */
export function createBlockAssembly(blocks, options = {}) {
  const positions = blocks instanceof BlockArray
    ? blocks.toPositions()
    : Array.isArray(blocks) ? blocks : [];

  const app = { ...DEFAULT_APPEARANCE, ...options };

  const group = new THREE.Group();
  group.name = `BlockAssembly_${positions.length}cubes`;

  if (positions.length === 0) {
    group.userData = { type: "blockAssembly", blockCount: 0, positions: [] };
    return group;
  }

  // 构建快速查找集
  const blockSet = new Set(positions.map(([x, y, z]) => `${x},${y},${z}`));

  // 提取外表面
  const { positions: surfPos, normals: surfNorms } = extractExteriorSurface(blockSet, positions);

  // 构建索引（每 4 个顶点 = 两个三角形）
  const vertexCount = surfPos.length / 3;
  const faceCount = vertexCount / 4;
  const indices = [];
  for (let i = 0; i < faceCount; i++) {
    const base = i * 4;
    indices.push(base, base + 1, base + 2);
    indices.push(base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surfPos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(surfNorms, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  // 实体 mesh
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(app.color),
    roughness: 0.55,
    metalness: 0.05,
    transparent: app.opacity < 1,
    opacity: Math.min(1, Math.max(0, app.opacity)),
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "BlockAssemblySolid";

  // 棱线
  const edgesGeo = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(app.wireframeColor),
    transparent: app.opacity < 0.5,
    opacity: Math.min(1, Math.max(0.01, app.opacity < 0.5 ? app.opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edgesGeo, lineMaterial);
  wireframe.name = "BlockAssemblyWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;

  group.add(mesh);
  group.add(wireframe);

  group.userData = {
    type: "blockAssembly",
    blockCount: positions.length,
    positions: positions.map((p) => [...p]),
    appearance: { ...app },
  };

  return group;
}
