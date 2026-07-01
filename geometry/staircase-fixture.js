/**
 * 三阶阶梯组合体 fixture。
 *
 * 模型契约（CUT-FIX-006A）：
 * - 3 个台阶，沿世界 X 轴逐级降低
 * - 每级沿 Z 轴深度 3 个单位方块
 * - 最高层 3 格、第二层 2 格、最低层 1 格
 * - 共 18 个单位方块
 * - 生成后居中到世界原点附近
 * - userData.type === "staircase"
 *
 * 该 fixture 复用现有 BlockArray 和 createBlockAssembly，
 * 不另写积木几何引擎。
 */

import * as THREE from "three";
import { BlockArray } from "./block-array.js";
import { createBlockAssembly } from "./block-assembly.js";

/** 默认外观（积木色） */
const DEFAULT_APPEARANCE = {
  color: 0xd4a76a,
  opacity: 1.0,
  wireframeColor: 0x5c4033,
};

/**
 * 生成确定性三阶阶梯坐标。
 *
 * - 第 0 层 (x=0)：3 格高 (y=0..2) × 3 格深 (z=0..2) → 9 blocks
 * - 第 1 层 (x=1)：2 格高 (y=0..1) × 3 格深 (z=0..2) → 6 blocks
 * - 第 2 层 (x=2)：1 格高 (y=0   ) × 3 格深 (z=0..2) → 3 blocks
 *
 * 总计 18 个单位方块。
 *
 * @returns {import('./block-array.js').BlockArray}
 */
export function createStaircaseBlockArray() {
  const positions = [];
  for (let x = 0; x < 3; x++) {
    const height = 3 - x;
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < 3; z++) {
        positions.push([x, y, z]);
      }
    }
  }
  return new BlockArray(positions);
}

/**
 * 计算阶梯组合体居中的偏移量。
 *
 * 未居中包围盒为 (0,0,0) 至 (3,3,3)，中心在 (1.5, 1.5, 1.5)。
 * 返回平移向量使模型中心移至原点。
 *
 * @returns {THREE.Vector3}
 */
export function staircaseCenterOffset() {
  return new THREE.Vector3(-1.5, -1.5, -1.5);
}

/**
 * 创建三阶阶梯组合体 Three.js Group。
 *
 * 生成的 Group 已居中到原点附近，可直接添加到场景。
 * userData.type 稳定为 "staircase"，并保留 blockCount 和 positions。
 *
 * @param {Object} [appearance] - 外观配置
 * @param {number|string} [appearance.color=0xd4a76a]    - 实体颜色
 * @param {number}        [appearance.opacity=1.0]        - 不透明度
 * @param {number|string} [appearance.wireframeColor=0x5c4033] - 棱线颜色
 * @param {"uniform"|"layered"|Function} [appearance.colorScheme="layered"] - 配色方案
 * @returns {THREE.Group}
 */
export function createStaircaseModel(appearance = {}) {
  const merged = { ...DEFAULT_APPEARANCE, ...appearance };
  const blockArray = createStaircaseBlockArray();

  const group = createBlockAssembly(blockArray, {
    color: merged.color,
    opacity: merged.opacity,
    wireframeColor: merged.wireframeColor,
    colorScheme: merged.colorScheme || "uniform",
  });

  // 居中到原点
  const offset = staircaseCenterOffset();
  group.position.copy(offset);

  // 覆写 userData 使其稳定为 "staircase"
  group.userData = {
    ...group.userData,
    type: "staircase",
    stepCount: 3,
    maxHeight: 3,
    depth: 3,
  };

  return group;
}
