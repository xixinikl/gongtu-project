/**
 * 积木视图题固定样例预设。
 *
 * 为 5×5×5 搭建器提供 8 个标准积木排列，覆盖三视图教学常见题型。
 * 每个预设包含名称、描述和方块坐标数组。
 *
 * 用途：
 * - COM-008: 验证积木视图题固定样例（本模块）
 * - M4: 作为题库 QDB-012 的预置题目来源
 */

/**
 * @typedef {Object} BlockPreset
 * @property {string} name - 中文名称
 * @property {string} desc - 简短描述
 * @property {number[][]} blocks - [[x,y,z], ...] 坐标数组，范围 0~4
 * @property {number} blockCount - 方块总数
 */

/** @type {BlockPreset[]} */
export const BLOCK_PRESETS = [
  {
    name: "L 形",
    desc: "基础 L 形拐角（3 块），最简单的非直线排列",
    blocks: [
      [1, 0, 2], [2, 0, 2], [2, 0, 3],
    ],
    blockCount: 3,
  },
  {
    name: "阶梯",
    desc: "3 阶楼梯（6 块），从左到右逐步升高",
    blocks: [
      [1, 0, 2], [2, 0, 2], [2, 1, 2],
      [3, 0, 2], [3, 1, 2], [3, 2, 2],
    ],
    blockCount: 6,
  },
  {
    name: "T 形",
    desc: "T 字形排列（5 块），顶部横条 + 中间竖条",
    blocks: [
      [1, 0, 1], [2, 0, 1], [3, 0, 1],
      [2, 0, 2], [2, 0, 3],
    ],
    blockCount: 5,
  },
  {
    name: "十字",
    desc: "十字形排列（5 块），中心向四面延伸",
    blocks: [
      [1, 0, 2], [2, 0, 2], [3, 0, 2],
      [2, 0, 1], [2, 0, 3],
    ],
    blockCount: 5,
  },
  {
    name: "角塔",
    desc: "角塔形排列（5 块），底部 L 形 + 竖直柱子",
    blocks: [
      [0, 0, 0], [1, 0, 0], [0, 0, 1],
      [0, 1, 0], [0, 2, 0],
    ],
    blockCount: 5,
  },
  {
    name: "回形",
    desc: "回字形空心方框（8 块），3×3 外环中空",
    blocks: [
      [1, 0, 1], [2, 0, 1], [3, 0, 1],
      [3, 0, 2], [3, 0, 3],
      [2, 0, 3], [1, 0, 3], [1, 0, 2],
    ],
    blockCount: 8,
  },
  {
    name: "金字塔",
    desc: "3 层金字塔（14 块），3×3 底座 → 2×2 → 1 顶",
    blocks: [
      // 底座 3×3 (y=0)
      [1, 0, 1], [2, 0, 1], [3, 0, 1],
      [1, 0, 2], [2, 0, 2], [3, 0, 2],
      [1, 0, 3], [2, 0, 3], [3, 0, 3],
      // 中层 2×2 (y=1)
      [1, 1, 1], [2, 1, 1],
      [1, 1, 2], [2, 1, 2],
      // 顶层 1 (y=2)
      [2, 2, 2],
    ],
    blockCount: 14,
  },
  {
    name: "散点",
    desc: "多层散点排列（14 块），用于高阶三视图推理",
    blocks: [
      // y=0
      [0, 0, 0], [2, 0, 1], [4, 0, 2],
      [1, 0, 3], [3, 0, 4],
      // y=1
      [1, 1, 0], [3, 1, 2], [4, 1, 3],
      // y=2
      [0, 2, 2], [2, 2, 3], [4, 2, 1],
      // y=3
      [1, 3, 3], [3, 3, 0],
      // y=4
      [2, 4, 4],
    ],
    blockCount: 14,
  },
];

/**
 * 按名称查找预设。
 * @param {string} name
 * @returns {BlockPreset|undefined}
 */
export function findPresetByName(name) {
  return BLOCK_PRESETS.find((p) => p.name === name);
}

/**
 * 验证所有预设的坐标均在 0~4 范围内。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAllPresets() {
  const errors = [];
  const seen = new Set(BLOCK_PRESETS.map((p) => p.name));
  if (seen.size !== BLOCK_PRESETS.length) {
    errors.push("存在重复的预设名称");
  }

  for (const p of BLOCK_PRESETS) {
    if (p.blocks.length !== p.blockCount) {
      errors.push(`${p.name}: blockCount(${p.blockCount}) 与实际块数(${p.blocks.length}) 不匹配`);
    }
    for (const [x, y, z] of p.blocks) {
      if (!Number.isInteger(x) || x < 0 || x > 4) {
        errors.push(`${p.name}: X 坐标 ${x} 超出 0~4 范围`);
      }
      if (!Number.isInteger(y) || y < 0 || y > 4) {
        errors.push(`${p.name}: Y 坐标 ${y} 超出 0~4 范围`);
      }
      if (!Number.isInteger(z) || z < 0 || z > 4) {
        errors.push(`${p.name}: Z 坐标 ${z} 超出 0~4 范围`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
