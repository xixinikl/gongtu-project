# 截面引擎 V2：参考效果、技术决策与分任务施工图

> 日期：2026-07-01
>
> 稳定基线：`feature/spatial-geometry-cutfix-plan`
>
> 规划冻结标签：`section-engine-v2-plan-v1`
>
> 失败实验留档：`cutfix006a-experimental-do-not-merge-v1`

## 1. 用户重新确认的目标

参考材料位于 `/Users/xixi/Desktop/给codex看/`。只参考功能效果，不参考界面设计。

必须达到：

1. 正方体、圆柱等凸模型的截面正确。
2. 积木组合体的凹截面（L、阶梯、折线形）轮廓正确，不能被填成凸包。
3. 截面严格位于数学切平面上，并与模型表面交线贴合。
4. 切面连续移动/倾斜时，截面稳定更新，不白屏、不闪烁、不残留上一帧。
5. 一个切面产生多个不相连区域时，能表达多个轮廓；不能强行拼成一个多边形。
6. 后续支持分层 5×5×5 方块搭建，但不在本轮算法修复中顺带开发 UI。

参考图的验收重点：

- `1000138046.jpg`：凹多边形轮廓、顶点落在模型棱边、填充贴合。
- `1000138048.jpg`：明显内凹的折线截面仍保持凹口。
- `1000138042.jpg`：分层方块数据模型与重力约束，仅作为后续搭建器参考。

## 2. 已确认的根因

旧流水线是：

```text
模型外棱 → 平面交点集合 → 围绕质心按角度排序 → 单个多边形 → 填充
```

它只适合凸截面。对于凹截面，仅有“无序交点集合”无法恢复哪些点应相连；极角排序会跨过凹口，
把 L 形、阶梯形错误地连成凸包。Earcut 只能三角化一个已经有正确边界顺序的轮廓，不能修复错误拓扑。

V2 决策：

```text
模型三角面
  → 每个三角面与平面求交，得到带来源信息的线段
  → 端点归一化与重复线段消除
  → 线段邻接图
  → 链接为一个或多个闭合轮廓
  → 外环/内环拓扑
  → Earcut 三角化
  → 稳定更新蓝色截面
```

选择“三角面切片 + 线段链接”，不再继续修补“交点极角排序”。

## 3. 分支隔离决定

- `cutfix006a-experimental-do-not-merge-v1`：保留失败试验，仅供分析，禁止合并。
- 远端 `cutfix006a-v1-staircase-done`：只包含阶梯入口候选，但提交纪律和审计不完整，暂不合并。
- 新任务全部从 `section-engine-v2-plan-v1` 或其后一个已验收任务的冻结标签开始。
- 每个 Agent 只领取一个任务；上一任务未回审合入，下一依赖任务不得开始。
- 禁止多个 Agent 同时修改同一文件。

## 4. 小任务链

### SEC2-001 test: 建立截面引擎黄金样例

目标：先定义答案，不写算法。

最多 2 个交付文件：

- `tests/fixtures/section-v2-fixtures.mjs`
- `tests/section-v2-fixtures.test.mjs`

内容：

- 单立方体水平/斜切；
- 圆柱水平切；
- 18 方块三阶阶梯；
- 参考图同类 L 形与折线形凹截面；
- 两个不相连截面区域；
- 擦边、过顶点、共面等退化输入。

每个样例保存模型输入、平面、期望轮廓数量、每环顶点/面积/凹性，不依赖当前错误实现生成答案。

完成证据：fixture 自检通过；人工说明答案依据。  
依赖：无。  
适合独立 Agent：是。

### SEC2-002 feat: 实现三角面与平面求交线段

目标：一个三角面只输出 0 或 1 条规范化线段，不负责拼轮廓。

最多 2 个交付文件：

- `geometry/triangle-plane-slice.js`
- `tests/triangle-plane-slice.test.mjs`

覆盖：不相交、两边相交、经过顶点、边共面、三角面共面、epsilon。输出保留三角面 ID。

依赖：SEC2-001。  
适合独立 Agent：是。

### SEC2-003 feat: 归一化截面线段集合

目标：稳定合并近似端点、删除零长度与重复/反向重复线段。

最多 2 个交付文件：

- `geometry/section-segment-normalizer.js`
- `tests/section-segment-normalizer.test.mjs`

不得拼轮廓，不得渲染。

依赖：SEC2-002。  
适合独立 Agent：是。

### SEC2-004 feat: 将截面线段链接为闭合轮廓

目标：通过邻接图连接线段，输出 `contours[]`，支持凹环和多个不相连环。

最多 2 个交付文件：

- `geometry/section-contour-builder.js`
- `tests/section-contour-builder.test.mjs`

验收：

- L 形凹口保留；
- 阶梯折线顺序正确；
- 两个孤立区域输出两个 contour；
- 开链、分叉和非流形输入明确返回错误状态，不猜答案。

依赖：SEC2-003。  
适合独立 Agent：是，但属于高难任务，必须由主协调 Agent重点回审。

### SEC2-005 feat: 建立截面轮廓拓扑与三角化

目标：识别外环/内环，投影到切面局部二维坐标并用 Earcut 生成索引。

最多 3 个交付文件：

- `geometry/section-contour-topology.js`
- `geometry/section-triangulation.js`
- `tests/section-triangulation.test.mjs`

不得读取 DOM，不得修改 Three.js 场景。

依赖：SEC2-004。  
适合独立 Agent：是。

### SEC2-006 feat: 建立稳定的多轮廓截面视觉

目标：渲染 `contours + triangle indices`，避免每帧 dispose/new 导致闪烁。

最多 2 个交付文件：

- `geometry/section-visual-v2.js`
- `tests/section-visual-v2.test.mjs`

要求：

- 相同数据跳过 GPU 更新；
- 空截面只隐藏一次；
- BufferGeometry 尽量复用；
- 非法数据先拒绝，再改变 visible；
- 多轮廓填充与轮廓线都正确。

依赖：SEC2-005。  
适合独立 Agent：是。

### SEC2-007 feat: 集成截面引擎 V2 影子模式

目标：先让 V1 与 V2 同时计算，只显示 V1，在测试数据中比较结果；不得直接替换生产路径。

最多 3 个交付文件：

- `geometry/section-engine-v2.js`
- `geometry.html`
- `tests/section-engine-v2.integration.test.mjs`

页面记录 V1/V2 轮廓数、面积和状态差异，便于回审。只有黄金样例全部通过后才允许下一任务切换。

依赖：SEC2-006。  
适合独立 Agent：高风险，只能在前六项全部合入后开始。

### SEC2-008 feat: 切换生产截面到 V2

目标：默认教学模式改用 V2；保留一个临时回退开关，不删除 V1。

最多 3 个交付文件：

- `geometry.html`
- `tests/section-engine-v2.browser.test.mjs`
- `doc/SECTION_ENGINE_V2_ACCEPTANCE.md`

验收：凸、凹、多区域、擦边、移动和双轴倾斜；参考图同类凹截面轮廓正确。

依赖：SEC2-007 影子比较全部通过。  
适合独立 Agent：否，建议主协调 Agent 集成或做最终回审。

### SEC2-009 test: 验证连续切割无闪烁

目标：用确定性帧序列验证进入、穿过、离开模型，不发生非法空帧、上一帧残留或 GPU 对象增长。

最多 2 个交付文件：

- `tests/section-v2-continuity.test.mjs`
- `output/section-v2-continuity.webm`

依赖：SEC2-008。

## 5. 可并行但不阻塞算法链的 UX 任务

### UX2-001 fix: 解除三维视图滚轮劫持

最多 3 个交付文件：`geometry/scene.js`、`geometry.html`、一个专项测试。  
目标：页面滚轮正常滚动；视角旋转保留；提供明确的非滚轮缩放方式。

### UX2-002 style: 压缩空间几何实验室首屏布局

最多 2 个交付文件：`geometry.html`、一个视觉回归证据。  
目标：桌面端首屏看到模型、主要切割控件和截面状态；不参考竞品 UI。

### UX2-003 feat: 建立视角与切面拖拽模式

必须在 SEC2-009 后进行。先写交互状态机，不直接把 OrbitControls 与切面拖拽监听混在一起。

## 6. 暂缓任务

- 原 CUT-FIX-006/007：由 SEC2-001 至 SEC2-009 取代，V2 完成后再决定是否关闭。
- 自定义 5×5×5 分层搭建器：截面引擎 V2 稳定后另开里程碑。
- 图片/文字 AI 建模：不与截面数学并行开发。
- UI 全面美化：只在 UX2-001/002 解决可用性，不提前大改风格。

## 7. 每个 Agent 的统一返回格式

- 基线标签、分支、最终提交；
- 修改文件（最多 3 个）；
- 实际测试命令与数字；
- 黄金样例通过情况；
- 未解决的数学边界；
- 明确声明未合并、未开始下一依赖任务。

主协调 Agent 只做轻量回审：关键数学断言、文件边界和测试证据；发现问题才升级浏览器验收。
