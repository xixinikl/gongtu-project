/**
 * 积木组合模型生成器。
 *
 * 从 BlockArray 提取仅外表面并构建合并几何体，确保 EdgesGeometry
 * 正确消除相邻积木间的内部棱线。支持分层配色和编号标记。
 */

import * as THREE from "three";
import { BlockArray } from "./block-array.js";

const DEFAULT_APPEARANCE = {
  color: 0xd4a76a,
  opacity: 1.0,
  wireframeColor: 0x5c4033,
};

/** 默认分层调色板 */
const DEFAULT_LAYER_PALETTE = [
  0x6baed6, 0xfd8d3c, 0x74c476, 0x9e9ac8,
  0xf768a1, 0x78c679, 0xc994c7, 0xdd1c77,
];

const UNIT_HALF = 0.5;

// ============================================================
// FACES — 六个面方向的局部顶点模板（CCW）
// ============================================================
const FACES = [
  { offset: [1, 0, 0],  vertices: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]] },   // +x
  { offset: [-1, 0, 0], vertices: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },   // -x
  { offset: [0, 1, 0],  vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },   // +y
  { offset: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },   // -y
  { offset: [0, 0, 1],  vertices: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] },   // +z
  { offset: [0, 0, -1], vertices: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] },   // -z
];

// ============================================================
// 几何体构建工具
// ============================================================

/**
 * @param {Set<string>} blockSet
 * @param {number[][]} positions
 * @returns {{ positions: Float32Array, normals: Float32Array }}
 */
function extractExteriorSurface(blockSet, positions) {
  const verts = [];
  const norms = [];

  for (const [cx, cy, cz] of positions) {
    for (const face of FACES) {
      const [dx, dy, dz] = face.offset;
      const neighborKey = `${cx + dx},${cy + dy},${cz + dz}`;
      if (blockSet.has(neighborKey)) continue;

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

function buildIndexedGeometry(surfPos, surfNorms) {
  const vertexCount = surfPos.length / 3;
  const faceCount = vertexCount / 4;
  const indices = [];
  for (let i = 0; i < faceCount; i++) {
    const base = i * 4;
    indices.push(base, base + 1, base + 2);
    indices.push(base, base + 2, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(surfPos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(surfNorms, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function createAssemblySubgroup(positions, blockSet, colorHex, opacity, wfColorHex) {
  const { positions: surfPos, normals: surfNorms } = extractExteriorSurface(blockSet, positions);
  const geometry = buildIndexedGeometry(surfPos, surfNorms);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.55,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity: Math.min(1, Math.max(0, opacity)),
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "BlockAssemblySolid";

  const edgesGeo = new THREE.EdgesGeometry(geometry);
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(wfColorHex),
    transparent: opacity < 0.5,
    opacity: Math.min(1, Math.max(0.01, opacity < 0.5 ? opacity + 0.3 : 1)),
  });
  const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
  wireframe.name = "BlockAssemblyWireframe";
  wireframe.renderOrder = 1;
  wireframe.material.depthTest = true;
  wireframe.material.depthWrite = false;

  const subgroup = new THREE.Group();
  subgroup.add(mesh);
  subgroup.add(wireframe);
  return subgroup;
}

// ============================================================
// 配色方案
// ============================================================

/**
 * 分层配色：将位置按 Y 坐标分组。
 *
 * @param {number[][]} positions
 * @param {number[]} [palette]
 * @returns {Map<number, { positions: number[][], color: number }>}
 */
function groupByLayer(positions, palette = DEFAULT_LAYER_PALETTE) {
  /** @type {Map<number, number[][]>} */
  const layerMap = new Map();
  for (const [x, y, z] of positions) {
    if (!layerMap.has(y)) layerMap.set(y, []);
    layerMap.get(y).push([x, y, z]);
  }
  const sortedLayers = [...layerMap.keys()].sort((a, b) => a - b);
  /** @type {Map<number, { positions: number[][], color: number }>} */
  const result = new Map();
  sortedLayers.forEach((y, i) => {
    result.set(y, {
      positions: layerMap.get(y),
      color: palette[i % palette.length],
    });
  });
  return result;
}

/**
 * 解析配色方案。
 *
 * @param {"uniform"|"layered"|((x:number,y:number,z:number,index:number)=>number)} scheme
 * @param {number[][]} positions
 * @param {number} fallback
 * @returns {Map<number, number[][]>} color → positions
 */
function resolveColorScheme(scheme, positions, fallback) {
  /** @type {Map<number, number[][]>} */
  const colorGroups = new Map();

  if (typeof scheme === "function") {
    positions.forEach(([x, y, z], index) => {
      const c = scheme(x, y, z, index);
      const colorHex = new THREE.Color(c).getHex();
      if (!colorGroups.has(colorHex)) colorGroups.set(colorHex, []);
      colorGroups.get(colorHex).push([x, y, z]);
    });
    return colorGroups;
  }

  if (scheme === "layered") {
    const layers = groupByLayer(positions);
    for (const [, { positions: layerPos, color }] of layers) {
      if (!colorGroups.has(color)) colorGroups.set(color, []);
      colorGroups.get(color).push(...layerPos);
    }
    return colorGroups;
  }

  // "uniform" 或未知
  colorGroups.set(new THREE.Color(fallback).getHex(), positions);
  return colorGroups;
}

// ============================================================
// 编号标签
// ============================================================

const LABEL_CANVAS_SIZE = 128;

/**
 * 生成编号纹理（白色圆形底 + 黑色数字）。
 *
 * @param {number} number
 * @returns {THREE.CanvasTexture}
 */
function createLabelTexture(number) {
  const size = LABEL_CANVAS_SIZE;
  const canvas = new (globalThis.OffscreenCanvas || globalThis.HTMLCanvasElement || class {})(
    size,
    size,
  );
  // Node.js 环境无 Canvas，跳过
  if (!canvas || typeof canvas.getContext !== "function") return null;

  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  // 半透明白色圆形底
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 边框
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // 数字
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = String(number);
  const fontSize = text.length > 2 ? 44 : 64;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.fillText(text, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 为每个积木添加编号标签（Sprite）。
 * 仅当运行在支持 Canvas 的浏览器环境时生效。
 *
 * @param {THREE.Group} assemblyGroup - createBlockAssembly 返回的组
 * @param {Object} [options]
 * @param {number}   [options.startIndex=1]   - 编号起始值
 * @param {number}   [options.labelSize=0.4]  - 标签 Sprite 边长
 * @returns {THREE.Sprite[]} 创建的标签列表
 */
export function addBlockLabels(assemblyGroup, options = {}) {
  const startIndex = options.startIndex ?? 1;
  const labelSize = options.labelSize ?? 0.4;

  const userData = assemblyGroup.userData;
  if (!userData || userData.type !== "blockAssembly" || !userData.positions) {
    return [];
  }

  const sprites = [];
  const positions = userData.positions;

  for (let i = 0; i < positions.length; i++) {
    const [x, y, z] = positions[i];
    const texture = createLabelTexture(startIndex + i);
    if (!texture) break; // 无 Canvas 支持

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x + UNIT_HALF, y + UNIT_HALF, z + UNIT_HALF);
    sprite.scale.set(labelSize, labelSize, 1);
    sprite.name = `BlockLabel_${startIndex + i}`;
    sprite.userData = { blockIndex: i, blockPosition: [x, y, z], labelNumber: startIndex + i };

    assemblyGroup.add(sprite);
    sprites.push(sprite);
  }

  return sprites;
}

/**
 * 清空组内所有编号标签。
 *
 * @param {THREE.Group} assemblyGroup
 */
export function removeBlockLabels(assemblyGroup) {
  const toRemove = [];
  assemblyGroup.traverse((child) => {
    if (child.isSprite && child.name.startsWith("BlockLabel_")) {
      toRemove.push(child);
    }
  });
  for (const sprite of toRemove) {
    if (sprite.material?.map) sprite.material.map.dispose();
    sprite.material?.dispose();
    assemblyGroup.remove(sprite);
  }
}

// ============================================================
// 主入口
// ============================================================

/**
 * 从 BlockArray 创建积木组合 Three.js 模型组。
 *
 * 每个积木位于整数坐标 [x, y, z]，其几何中心在 (x+0.5, y+0.5, z+0.5)。
 * 仅提取外表面构建合并几何体，相邻积木的内部面不产生多余棱线。
 *
 * @param {BlockArray|Array<number[]>} blocks - 积木阵列或坐标列表
 * @param {Object} [options]
 * @param {number|string} [options.color=0xd4a76a]              - 实体颜色 (colorScheme="uniform")
 * @param {number}        [options.opacity=1.0]                  - 不透明度
 * @param {number|string} [options.wireframeColor=0x5c4033]       - 棱线颜色
 * @param {"uniform"|"layered"|((x:number,y:number,z:number,i:number)=>number|string)} [options.colorScheme]
 *         配色方案："uniform" 统一色，"layered" 按 Y 层调色板，
 *         或自定义函数返回颜色值。
 * @param {number[]} [options.layerPalette] - "layered" 方案调色板，8 色默认
 * @returns {THREE.Group}
 */
export function createBlockAssembly(blocks, options = {}) {
  const positions = blocks instanceof BlockArray
    ? blocks.toPositions()
    : Array.isArray(blocks) ? blocks : [];

  const {
    color = DEFAULT_APPEARANCE.color,
    opacity = DEFAULT_APPEARANCE.opacity,
    wireframeColor = DEFAULT_APPEARANCE.wireframeColor,
    colorScheme = "uniform",
    layerPalette,
  } = options;

  const group = new THREE.Group();
  group.name = `BlockAssembly_${positions.length}cubes`;

  if (positions.length === 0) {
    group.userData = {
      type: "blockAssembly",
      blockCount: 0,
      positions: [],
      colorScheme,
    };
    return group;
  }

  const blockSet = new Set(positions.map(([x, y, z]) => `${x},${y},${z}`));

  // 配色分组
  const effectivePalette = layerPalette || DEFAULT_LAYER_PALETTE;
  // 如果是 layered，需要把 palette 传进 grouping 逻辑
  const colorGroups = colorScheme === "layered"
    ? (() => {
        const layers = groupByLayer(positions, effectivePalette);
        const map = new Map();
        for (const [, { positions: layerPos, color: c }] of layers) {
          if (!map.has(c)) map.set(c, []);
          map.get(c).push(...layerPos);
        }
        return map;
      })()
    : resolveColorScheme(colorScheme, positions, color);

  // 每个颜色组生成一个子组
  for (const [colorHex, groupPositions] of colorGroups) {
    const subgroup = createAssemblySubgroup(
      groupPositions, blockSet, colorHex, opacity, wireframeColor,
    );
    group.add(subgroup);
  }

  group.userData = {
    type: "blockAssembly",
    blockCount: positions.length,
    positions: positions.map((p) => [...p]),
    colorScheme,
    appearance: { color, opacity, wireframeColor },
  };

  return group;
}
