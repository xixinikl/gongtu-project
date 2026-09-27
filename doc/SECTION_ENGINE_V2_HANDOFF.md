# 截面引擎 V2 接力手册：SEC2-005 起点

> 冻结日期：2026-07-01
> 冻结标签：`section-engine-v2-sec2-004-handoff-v1`
> 稳定分支：`feature/spatial-geometry-cutfix-plan`
> 下一任务：`SEC2-005 feat: 建立截面轮廓拓扑与三角化`

## 1. 给下一位 Agent 的最短指令

从冻结标签建立隔离分支与 worktree，只做 SEC2-005。把 SEC2-004 的三维闭环投影到切面局部二维，
识别外环与孔洞，再通过 Three.js `ShapeUtils.triangulateShape`（内部使用 Earcut）生成索引。
完成后停下等待主协调 Agent 回审。

```bash
cd /Users/xixi/Documents/Codex/2026-06-29/new-chat/work/gongtu-cutfix-plan
git fetch --tags origin
git status --short --branch
git rev-list -n 1 section-engine-v2-sec2-004-handoff-v1
git log -7 --oneline --decorate
```

修改前完整阅读：

1. `.ai_rules.md`
2. `TASKS.md`
3. `CURRENT_STATUS.md`
4. `doc/SECTION_ENGINE_V2_PLAN.md`
5. 本文件
6. `geometry/section-contour-builder.js`
7. `tests/section-contour-builder.test.mjs`
8. `tests/fixtures/section-v2-fixtures.mjs`

若 Git 事实与文档冲突，停止修改并先报告。禁止 `git reset --hard`。

## 2. 已冻结的根因与路线

旧算法只保留无序交点，再用质心极角排序，因此丢失凹截面的真实边连接。当前 V2 已完成：

```text
SEC2-001  独立黄金答案
SEC2-002  三角面与切平面求交线段
SEC2-003  端点归一化、零长与重复边清理
SEC2-004  通过邻接图链接一个或多个真实闭环
SEC2-005  外环/孔洞拓扑、局部二维投影与 Earcut（三角化） ← 下一项
SEC2-006  稳定视觉
SEC2-007～009 影子比较、生产切换与连续性验收
```

失败实验 `cutfix006a-experimental-do-not-merge-v1` 只能分析，禁止合并。

## 3. 当前完成进度

| 项目 | 状态 | 证据 |
|---|---|---|
| SEC2-001 黄金答案 | 完成 | 10 个独立样例；专项 6/6 |
| SEC2-002 单三角面切片 | 完成 | 专项 9/9 |
| SEC2-003 线段归一化 | 完成 | 专项 10/10 |
| SEC2-004 邻接闭环 | 完成 | 专项 26/26；整库 411/411 |
| UX2-001 页面滚轮修复 | 完成 | 专项 2/2 |
| SEC2-005 拓扑与三角化 | 下一项 | 尚未开始 |
| SEC2-006～009 | 等待依赖 | 必须串行 |

现在已经恢复了旧算法丢失的边连接关系。SEC2-005 不再猜边界，只负责解释已经正确闭合的环。

## 4. SEC2-004 输入契约

入口：

```js
const result = buildSectionContours(normalizedSegments);
```

成功结果：

```js
{
  status: "ok",
  contours: [
    {
      points: [THREE.Vector3, /* ... */],
      segmentCount,
      triangleIds,
    },
  ],
  epsilon,
  consumedEdges,
  totalEdges,
}
```

保证：

- 每个 contour 是不重复尾点的闭环顶点序列。
- 点序沿真实边邻接关系，不使用极角排序。
- 多个不相连区域输出多个 contour。
- 环起点、方向和 contours 顺序确定。
- 所有边恰好消费一次。
- 开链、分叉、非流形、重复边和零长边不会伪造成轮廓。
- `triangleIds` 只含有限 number 或 string，并稳定去重。

SEC2-005 只接受 `status="ok"` 的结果，不得吞掉 SEC2-004 的错误状态。

## 5. SEC2-005 的文件边界

最多三个交付文件：

```text
geometry/section-contour-topology.js
geometry/section-triangulation.js
tests/section-triangulation.test.mjs
```

`TASKS.md`、`CURRENT_STATUS.md` 是强制审计文件，不计入交付文件上限。

不得修改 SEC2-002～004 的已冻结实现；若发现真实契约缺陷，停止并报告，不得顺手扩项。

## 6. 切面局部二维坐标契约

建议入口：

```js
buildSectionContourTopology(contours, plane, { epsilon })
```

要求：

1. `plane` 必须是法向量非零的 `THREE.Plane`，内部克隆并归一化，不修改调用者。
2. 使用 `plane.coplanarPoint()` 取得局部原点。
3. 从世界 X/Y/Z 中选择与法向量最不平行的轴作为参考，确定性构造正交单位基 `u`、`v`。
4. `u × v` 必须与归一化平面法向量同向。
5. 每个三维顶点都必须在平面 epsilon 内；超出则明确拒绝，禁止静默投影错误数据。
6. 二维坐标为：

```text
x = (point - origin) · u
y = (point - origin) · v
```

7. 必须同时保留二维点、原三维点和 basis，供 SEC2-006 直接建立 BufferGeometry。

不允许按轮廓分别选择不同基；同一次截面的所有环必须共享同一个 origin/u/v。

## 7. 外环、孔洞与嵌套归属

必须计算每个二维环的有符号鞋带面积，并拒绝：

- 少于 3 点；
- 绝对面积小于等于面积容差；
- 自交或边界相触导致归属含糊的环；
- 两个环相交；
- 同一层级重叠而非包含的环。

建议拓扑规则：

1. 为每个环找包含它的最小面积父环。
2. 通过父链得到 `depth`。
3. 偶数深度是 outer，奇数深度是 hole。
4. 每个偶数深度 outer 只收其直接奇数深度子环作为 holes。
5. 洞中岛（深度 2）成为新的 polygon group。
6. outer 统一为相对平面法向量 CCW；hole 统一为 CW。
7. 组与孔洞顺序必须确定，不依赖输入 contours 顺序或原方向。

点在边界上不能简单算作“在内部”；应返回明确拓扑错误。

## 8. 三角化契约

建议入口：

```js
triangulateSectionTopology(topology)
```

使用锁定版本 Three.js 的：

```js
THREE.ShapeUtils.triangulateShape(outer2D, holes2D)
```

它内部调用 Earcut，不新增第二份 Earcut 依赖，也不复制第三方源码。

建议输出：

```js
{
  status: "ok",
  vertices2D: [THREE.Vector2, /* ... */],
  vertices3D: [THREE.Vector3, /* ... */],
  indices: [0, 1, 2, /* ... */],
  groups: [
    {
      outerContourIndex,
      holeContourIndices,
      vertexStart,
      vertexCount,
      indexStart,
      indexCount,
    },
  ],
  basis,
}
```

要求：

- 每组顶点按 outer 后接各 holes 的顺序扁平化。
- Earcut/ShapeUtils 的局部索引必须加 `vertexStart` 后写入全局 indices。
- 每个索引为整数且落在顶点范围内。
- 三角形不得退化，三角形面积总和必须等于 outer 面积减 holes 面积（容差内）。
- 多个不相连 outer 均被三角化，不能桥接。
- 输出不依赖输入轮廓顺序或方向。
- 空 contours 返回稳定空结果，不当作错误。

## 9. 最低测试矩阵

- 水平正方形：4 点、2 三角形、面积 1。
- 斜切正六边形：共享二维基，4 三角形，面积匹配黄金样例。
- L 形凹环：不能填成凸包；三角面积和为 3。
- 三阶阶梯：保留凹口；面积为 6。
- 两个不相连矩形：两个 group，无跨区三角形，总面积为 3。
- 一个外环加一个孔洞：孔洞不被填充。
- 外环、孔洞和洞中岛三级嵌套：生成两个 polygon group。
- 输入环方向全部反转后输出拓扑和面积保持一致。
- 输入 contours 重排后输出确定。
- 退化零面积环明确拒绝。
- 环相交、边界相触、自交明确拒绝。
- 点偏离 plane 超过 epsilon 明确拒绝。
- 非法 plane、非 Vector3、非法 epsilon 明确拒绝。
- indices 全部有效且每组三角面积守恒。

测试答案必须来自解析几何、鞋带公式和黄金 fixture，不得由旧生产算法生成。

## 10. 明确禁止

- 不重新链接线段或重新聚类端点。
- 不使用质心极角排序。
- 不做视觉对象、材质或 BufferGeometry 复用；属于 SEC2-006。
- 不读取 DOM，不修改 `geometry.html`。
- 不接入生产路径，不修改旧 V1。
- 不开始 SEC2-006，即使测试全绿也必须先回审。
- 不整体合并 `cutfix006a-v1-staircase-done`。
- 不合并失败实验分支。

## 11. 验收命令

```bash
node --experimental-loader ./tests/three-absolute-loader.mjs \
  --test tests/section-triangulation.test.mjs
node --check geometry/section-contour-topology.js
node --check geometry/section-triangulation.js
npm run test:geometry
git diff --check
git status --short --branch
```

只有聚焦测试、全量测试、两文件语法检查和 diff 检查全部通过，SEC2-005 才能标记完成。

## 12. 已知风险

- 整个三角面共面时 SEC2-002 不输出任意边；网格级共面面策略仍待集成阶段明确。
- 环相交、相触和自交必须在三角化前拒绝，否则 Earcut 可能返回看似有效但数学错误的索引。
- 浮点点在边界判断必须统一使用 epsilon，避免父环归属抖动。
- 生产页面仍使用旧路径，当前凹截面画面不能证明 V2 正确。
- UX2-001 尚缺真实浏览器手势截图验收。

## 13. 下一位 Agent 的返回格式

- 基线标签、隔离分支、最终提交。
- 修改文件，最多三个交付文件加审计文件。
- 聚焦与全量测试命令、通过数和失败数。
- 二维 basis 的确定性规则。
- 父环、depth、outer/hole 与洞中岛归属策略。
- Earcut/ShapeUtils 顶点展平和全局索引偏移证据。
- 面积守恒与非法拓扑测试证据。
- 尚未解决的数学边界。
- 明确声明：未合并、未开始 SEC2-006、未修改生产页面。

完成后停下等待回审。
