/**
 * 5×5×5 分层搭建器。
 *
 * 在 5×5×5 的整数坐标网格（X/Y/Z 范围 0~4）上自由放置/移除方块，
 * 实时生成 BlockAssembly 并返回居中的 Three.js Group。
 *
 * 内部维护一个可变的 BlockArray，所有变更即时反映到模型。
 * 复用现有 createBlockAssembly，配色方案固定为 layered（每 Y 层不同颜色）。
 */

import * as THREE from "three";
import { BlockArray } from "./block-array.js";
import { createBlockAssembly } from "./block-assembly.js";

// ── 网格常量 ──
export const GRID_SIZE = 5;   // 5×5×5
export const GRID_RANGE = [0, 1, 2, 3, 4];

const CENTER_OFFSET = new THREE.Vector3(
  -(GRID_SIZE - 1) / 2,   // -2
  -(GRID_SIZE - 1) / 2,   // -2
  -(GRID_SIZE - 1) / 2,   // -2
);

/** @type {BlockArray} 内部可变方块阵列 */
let blockArray = new BlockArray();

// ── 方块操作 ──

/**
 * 切换指定坐标方块的存在状态。
 * 存在则移除，不存在则添加。
 *
 * @param {number} x - X 坐标 (0~4)
 * @param {number} y - Y 坐标 (0~4)
 * @param {number} z - Z 坐标 (0~4)
 * @returns {boolean} 操作后方块是否存在
 */
export function toggleBlock(x, y, z) {
  if (!inRange(x) || !inRange(y) || !inRange(z)) return false;
  if (blockArray.has([x, y, z])) {
    blockArray.remove([x, y, z]);
    return false;
  }
  blockArray.add([x, y, z]);
  return true;
}

/**
 * 强制设置方块存在状态。
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {boolean} present
 */
export function setBlock(x, y, z, present) {
  if (!inRange(x) || !inRange(y) || !inRange(z)) return;
  if (present) {
    blockArray.add([x, y, z]);
  } else {
    blockArray.remove([x, y, z]);
  }
}

/**
 * 查询指定坐标是否被占用。
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {boolean}
 */
export function hasBlock(x, y, z) {
  if (!inRange(x) || !inRange(y) || !inRange(z)) return false;
  return blockArray.has([x, y, z]);
}

/**
 * 清空所有方块。
 */
export function clearAll() {
  blockArray.clear();
}

/**
 * 填满所有 125 个位置。
 */
export function fillAll() {
  blockArray.clear();
  for (let x of GRID_RANGE) {
    for (let y of GRID_RANGE) {
      for (let z of GRID_RANGE) {
        blockArray.add([x, y, z]);
      }
    }
  }
}

/**
 * 当前方块总数。
 * @returns {number}
 */
export function blockCount() {
  return blockArray.size;
}

/**
 * 获取指定 Y 层的 XZ 平面占用矩阵。
 *
 * @param {number} y - Y 层 (0~4)
 * @returns {boolean[][]} 5×5 布尔矩阵 [x][z]
 */
export function getLayerGrid(y) {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  for (let x of GRID_RANGE) {
    for (let z of GRID_RANGE) {
      grid[x][z] = blockArray.has([x, y, z]);
    }
  }
  return grid;
}

/**
 * 统计每层的方块数。
 * @returns {number[]} 5 个元素，索引为 Y 层号
 */
export function layerCounts() {
  const counts = [0, 0, 0, 0, 0];
  blockArray.forEach(([x, y, z]) => {
    counts[y] += 1;
  });
  return counts;
}

// ── 模型生成 ──

/**
 * 从当前方块状态创建 Three.js 模型 Group。
 * 模型已居中到原点，可直接加入场景。
 *
 * @returns {THREE.Group}
 */
export function createBuilderModel() {
  const positions = blockArray.toPositions();
  if (positions.length === 0) {
    const empty = new THREE.Group();
    empty.name = "Builder5x5_empty";
    empty.userData = {
      type: "builder5x5",
      blockCount: 0,
      positions: [],
      colorScheme: "layered",
    };
    return empty;
  }

  const group = createBlockAssembly(blockArray, {
    colorScheme: "layered",
  });

  // 居中到原点
  group.position.copy(CENTER_OFFSET);

  group.userData = {
    ...group.userData,
    type: "builder5x5",
  };

  return group;
}

/**
 * 获取当前所有方块坐标（副本）。
 * @returns {number[][]}
 */
export function getPositions() {
  return blockArray.toPositions();
}

/**
 * 将搭建器重置为指定坐标集合。
 * @param {number[][]} positions
 */
export function setPositions(positions) {
  blockArray = new BlockArray(positions);
}

// ── 内部工具 ──

function inRange(value) {
  return Number.isInteger(value) && value >= 0 && value < GRID_SIZE;
}
