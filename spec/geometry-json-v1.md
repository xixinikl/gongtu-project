# Geometry JSON 协议 v1.0

空间几何模型序列化协议，用于题库管理、前端渲染、跨系统数据交换。

---

## 1. 版本与作用域

| 字段 | 说明 |
|------|------|
| 协议版本 | `1.0` |
| 模型类型 | `unitCubeArray`（单位立方体阵列） |
| 坐标系 | 右手系：X 右、Y 上、Z 前（THREE.js 标准） |
| 坐标类型 | 整数，每个 `[x,y,z]` 表示以该点为最小角点的边长 1 立方体 |
| 网格范围 | 当前限定 5×5×5（0≤x,y,z≤4），协议保留扩展能力 |

---

## 2. 顶层结构

```jsonc
{
  "version": "1.0",                    // 必填，字符串，固定 "1.0"
  "id": "preset-lshape",               // 必填，唯一标识符，kebab-case
  "name": "L 形",                      // 必填，中文显示名称
  "description": "基础 L 形拐角排列",    // 可选，简短描述
  "type": "unitCubeArray",             // 必填，固定 "unitCubeArray"
  "source": "builtin",                 // 可选，"builtin" | "user" | "ai"，默认 "user"
  "tags": ["三视图", "入门"],           // 可选，标签数组
  "positions": [[0,1,2], [0,2,2], ...], // 必填，方块坐标数组 [x,y,z]
  "appearance": {                      // 可选，外观配置
    "colorScheme": "layered",
    "color": "#d4a76a",
    "opacity": 1.0,
    "wireframeColor": "#5c4033",
    "layerPalette": ["#6baed6", "#fd8d3c", "#74c476", "#9e9ac8",
                     "#f768a1", "#78c679", "#c994c7", "#dd1c77"]
  },
  "grid": {                            // 可选，网格约束
    "size": 5,
    "origin": [0, 0, 0]
  },
  "cutPlane": {                        // 可选，预设切面配置
    "axis": "y",
    "defaultOffset": 0.0,
    "range": [-2.5, 2.5]
  },
  "question": {                        // 可选，题目元数据（QDB-011/012 使用）
    "type": "front-view",              // "front-view" | "top-view" | "side-view" | "cross-section" | "block-count"
    "difficulty": 1,                   // 1-5 难度等级
    "answer": {                        // 答案（题目类型决定结构）
      "count": 3,                      // 如果是 block-count 题
      "shape": [[0,0],[0,1],[1,1]]     // 如果是视图题，投影形状
    },
    "explanation": "俯视图可以看到全部 3 块"
  }
}
```

---

## 3. 字段参考

### 3.1 `version`

| 属性 | 值 |
|------|-----|
| 类型 | `string` |
| 必填 | 是 |
| 格式 | `"主版本.次版本"` |
| 当前值 | `"1.0"` |

解析器应根据主版本号决定是否兼容。

### 3.2 `id`

| 属性 | 值 |
|------|-----|
| 类型 | `string` |
| 必填 | 是 |
| 格式 | `[a-z0-9-]+`（kebab-case） |
| 唯一性 | 题库内唯一 |

示例：`preset-lshape`、`staircase-3step`、`qdb-001-basic-cut`

### 3.3 `type`

| 属性 | 值 |
|------|-----|
| 类型 | `string` |
| 必填 | 是 |
| v1 有效值 | `"unitCubeArray"` |

v1 仅支持单位立方体阵列。未来版本可扩展 `"composite"`、`"parametric"` 等。

### 3.4 `positions`

| 属性 | 值 |
|------|-----|
| 类型 | `Array<[number, number, number]>` |
| 必填 | 是 |
| 约束 | 每个元素是 3 个整数的数组 |
| 最小长度 | 1（不允许空数组） |
| 最大长度 | 协议不限，网格约束下 ≤125（5³） |
| 去重 | 不强制，但建议实现去重 |

每个 `[x, y, z]` 表示一个边长为 1 的单位立方体，其几何范围为：
```
[x, x+1] × [y, y+1] × [z, z+1]
```

**坐标系示意图**：
```
      Y (上)
      ↑
      |
      +-----→ X (右)
     /
    ↙
   Z (前)
```

### 3.5 `appearance`

外观配置对象，所有字段可选。未指定时实现使用默认值。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `colorScheme` | `string` | `"layered"` | `"uniform"` 统一色、`"layered"` 按Y分层 |
| `color` | `string` | `"#d4a76a"` | CSS 颜色字符串，仅 colorScheme="uniform" 生效 |
| `opacity` | `number` | `1.0` | 不透明度 0.0–1.0 |
| `wireframeColor` | `string` | `"#5c4033"` | 棱线颜色 |
| `layerPalette` | `string[]` | 8色调色板 | colorScheme="layered" 时，按 Y 层索引循环取色 |

**默认分层调色板**：
```
Y层 0: #6baed6 (蓝)   Y层 4: #f768a1 (粉)
Y层 1: #fd8d3c (橙)   Y层 5: #78c679 (绿)
Y层 2: #74c476 (绿)   Y层 6: #c994c7 (紫)
Y层 3: #9e9ac8 (紫)   Y层 7: #dd1c77 (玫红)
```

### 3.6 `grid`

网格约束对象，描述搭建空间的边界。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `size` | `number` | `5` | 网格尺寸 size×size×size |
| `origin` | `[number,number,number]` | `[0,0,0]` | 网格原点 |

验证规则：所有 `positions` 中的坐标值必须在 `[origin[i], origin[i] + size)` 范围内。

### 3.7 `cutPlane`

预设切面配置，用于初始化切面视图。

| 字段 | 类型 | 说明 |
|------|------|------|
| `axis` | `"x" \| "y" \| "z"` | 切面法线方向 |
| `defaultOffset` | `number` | 默认切面位置 |
| `range` | `[number, number]` | 切面滑动范围 `[min, max]` |

范围约定：`range[0]` 为包围盒最小值 − 0.5，`range[1]` 为包围盒最大值 + 0.5。

### 3.8 `question`

题目元数据，仅在作为题库题目时使用。

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 题型：`"front-view"`、`"top-view"`、`"side-view"`、`"cross-section"`、`"block-count"` |
| `difficulty` | `number` | 难度 1–5，1 最简单 |
| `answer` | `object` | 答案，结构取决于题型 |
| `explanation` | `string` | 答案解析 |

**题型与答案结构**：

| 题型 | answer 结构 | 示例 |
|------|------------|------|
| `front-view` | `{ shape: [[x,z],...] }` | 主视图投影形状 |
| `top-view` | `{ shape: [[x,z],...] }` | 俯视图投影形状 |
| `side-view` | `{ shape: [[y,z],...] }` | 侧视图投影形状 |
| `cross-section` | `{ edges, area, perimeter }` | 切面几何属性 |
| `block-count` | `{ count: number }` | 方块总数 |

---

## 4. 约束与验证规则

### 4.1 结构约束

| 规则 | 说明 |
|------|------|
| R1 | `version` 必须是有效语义版本字符串 |
| R2 | `type` 必须是 `"unitCubeArray"` |
| R3 | `positions` 不能为空数组 |
| R4 | 每个 position 必须是 `[Integer, Integer, Integer]` |
| R5 | `id` 必须匹配 `^[a-z0-9][a-z0-9-]*[a-z0-9]$`（kebab-case） |
| R6 | `appearance.colorScheme` 必须是 `"uniform"` 或 `"layered"` |

### 4.2 范围约束（启用 grid 时）

| 规则 | 说明 |
|------|------|
| G1 | `x ∈ [grid.origin[0], grid.origin[0] + grid.size)` |
| G2 | `y ∈ [grid.origin[1], grid.origin[1] + grid.size)` |
| G3 | `z ∈ [grid.origin[2], grid.origin[2] + grid.size)` |

### 4.3 逻辑约束

| 规则 | 说明 |
|------|------|
| L1 | 建议 positions 去重（同一坐标不重复出现） |
| L2 | `cutPlane.axis` 方向上的切面偏移量应默认在模型包围盒内 |
| L3 | `difficulty` ∈ {1, 2, 3, 4, 5} |

---

## 5. 完整示例

### 5.1 L 形基础排列

```json
{
  "version": "1.0",
  "id": "preset-lshape",
  "name": "L 形",
  "description": "基础 L 形拐角，3 块，最简单的非直线排列",
  "type": "unitCubeArray",
  "source": "builtin",
  "tags": ["三视图", "入门", "基础"],
  "positions": [[1,0,2], [2,0,2], [2,0,3]],
  "appearance": { "colorScheme": "layered" },
  "grid": { "size": 5, "origin": [0, 0, 0] },
  "question": {
    "type": "block-count",
    "difficulty": 1,
    "answer": { "count": 3 },
    "explanation": "俯视图可见全部 3 块：拐角处 1 块 + 两臂各 1 块"
  }
}
```

### 5.2 3 阶楼梯（跨层）

```json
{
  "version": "1.0",
  "id": "preset-stairs",
  "name": "阶梯",
  "description": "3 阶楼梯，6 块跨 3 层，从左到右逐步升高",
  "type": "unitCubeArray",
  "source": "builtin",
  "tags": ["三视图", "多层", "阶梯"],
  "positions": [
    [1,0,2], [2,0,2], [2,1,2],
    [3,0,2], [3,1,2], [3,2,2]
  ],
  "appearance": { "colorScheme": "layered" },
  "grid": { "size": 5, "origin": [0, 0, 0] },
  "cutPlane": { "axis": "y", "defaultOffset": 0.0, "range": [-2.5, 2.5] },
  "question": {
    "type": "block-count",
    "difficulty": 2,
    "answer": { "count": 6 },
    "explanation": "第 1 层 2 块、第 2 层 2 块、第 3 层 2 块，共 6 块"
  }
}
```

### 5.3 金字塔（多层单顶）

```json
{
  "version": "1.0",
  "id": "preset-pyramid",
  "name": "金字塔",
  "description": "3 层金字塔，3×3 底座 → 2×2 → 1 顶",
  "type": "unitCubeArray",
  "source": "builtin",
  "tags": ["三视图", "多层", "对称"],
  "positions": [
    [1,0,1],[2,0,1],[3,0,1],[1,0,2],[2,0,2],[3,0,2],[1,0,3],[2,0,3],[3,0,3],
    [1,1,1],[2,1,1],[1,1,2],[2,1,2],
    [2,2,2]
  ],
  "appearance": { "colorScheme": "layered" },
  "grid": { "size": 5, "origin": [0, 0, 0] },
  "question": {
    "type": "block-count",
    "difficulty": 2,
    "answer": { "count": 14 },
    "explanation": "底 9 + 中 4 + 顶 1 = 14"
  }
}
```

### 5.4 最小有效模型

```json
{
  "version": "1.0",
  "id": "minimal-cube",
  "name": "单方块",
  "type": "unitCubeArray",
  "positions": [[2, 2, 2]]
}
```

---

## 6. 序列化与反序列化

### 6.1 BlockArray ↔ JSON

`BlockArray` 类已内置 `toJSON()` / `fromJSON()` 方法：

```js
// 序列化
const json = blockArray.toJSON(); // → [[0,0,0], [1,0,0], ...]

// 反序列化
const ba = BlockArray.fromJSON(positions);
```

### 6.2 GeometryJSON ↔ BlockArray

```js
/**
 * 从 GeometryJSON 提取 BlockArray。
 * @param {object} geometryJson
 * @returns {BlockArray}
 */
function geometryJsonToBlockArray(geometryJson) {
  return BlockArray.fromJSON(geometryJson.positions);
}
```

### 6.3 GeometryJSON ↔ 完整模型

渲染入口：

```js
const blockArray = BlockArray.fromJSON(geometryJson.positions);
const model = createBlockAssembly(blockArray, geometryJson.appearance);
model.userData = {
  ...model.userData,
  geometryId: geometryJson.id,
  geometryName: geometryJson.name,
};
```

---

## 7. 扩展点（未来版本）

| 版本 | 扩展方向 |
|------|---------|
| v1.1 | 非整数比例缩放、旋转 |
| v2.0 | 复合模型类型 `composite`：多个 unitCubeArray 组合 |
| v2.0 | 参数化模型 `parametric`：用参数表达式描述形状 |
| v3.0 | 动画序列 `animation`：时间轴上的模型变化 |
| v3.0 | AI 生成标记 `aiGenerated` 和置信度 |

---

## 8. 变更记录

| 日期 | 版本 | 作者 | 变更 |
|------|------|------|------|
| 2026-07-01 | 1.0 | 高级开发工程师 | 初始版本，定义 unitCubeArray 协议 |
