# 空间几何实验室 Agent 交接手册

更新时间：2026-07-03

权威分支：`feature/csg-v2-integration`

当前冻结标签：`csg-section-v6-interactive`

禁止合并：`cutfix006a-experimental-do-not-merge-v1`

## 1. 接手后的固定顺序

先读 `.ai_rules.md`、`TASKS.md`、`CURRENT_STATUS.md`、`doc/GEOMETRY_ARCHITECTURE.md`
和本文件，再执行：

```bash
git status --short --branch
git branch --show-current
git log -5 --oneline --decorate
git diff
```

唯一正确工作树：

```text
/Users/xixi/Documents/Codex/2026-06-29/new-chat/work/gongtu-cutfix-plan
```

若 Git 与文档冲突，以 Git 和 `TASKS.md` 为准。禁止 `reset --hard`，禁止直接修改 `main`。
每项任务最多 3 个交付文件，另同步 `TASKS.md`、`CURRENT_STATUS.md`，单独提交并推送。

## 1A. 当前产品路线

用户已明确：现有空间几何实验室和 CSG 工作台全部保留，但学生主入口改为“考公立体图推动态
解题与讲解”。三条产品线不得再塞入同一页面：

1. 考公图推解题与讲解：题图、选项、标准模型、切面验证、逐项排除和动态讲解。
2. 空间几何实验室：自由建模、积木搭建和切面探索。
3. CSG 建模工作台：管理员制作和验证组合模型。

完整规划：

```text
doc/SPATIAL_REASONING_PRODUCT_PLAN.md
```

第一批两道人工黄金题已经完成并通过真实浏览器验收：

- 倒圆锥 + 方体经典模型：A 可行，B/C/D 排除，人工答案 A；
- 棱锥 + 圆柱组合截面：A/B/C 可行，D 排除，人工答案 D。

动态讲解主链 CASE-001/002、LESSON-001～009 已完成。下一步先做不依赖 AI 的
AUTHOR-001/002；AI 以后仍只能生成待确认草稿，不能生成正式答案或绕过人工确认。

## 1B. 当前学生页事实

入口：`/reasoning-lesson.html`

当前页面同时具备：

1. 原题结构示意与 A-D 候选轮廓；
2. Three.js + CSG 标准组合实体；
3. Section Engine V2 实时三维橙色截面；
4. V2 topology 直接投影的独立二维截面卡片；
5. 人工约束的逐项排除/可行讲解；
6. 相机与切面关键帧、播放、步进和答案保护；
7. 手动探索：拖拽旋转相机，四向按钮/键盘方向键旋转切面，滑条移动切面。

2026-07-04 视觉与讲解返工后的额外事实：

- CSG union 网格只用于实体和截面计算，禁止再对它创建 `EdgesGeometry`；布尔切割会产生大量三角碎边。
- 可见结构棱来自组合前的基本体 geometry，保持圆锥/方体/棱锥/圆柱轮廓干净。
- 有切面时，union solid 使用本地 clipping plane 显示保留侧；`lesson-cutaway-ghost` 以 0.09
  透明度显示完整原体，帮助区分“被切走但原来存在”的部分。
- `sectionSource` 必须只指向 `lesson-union-solid`。ghost 也是 Mesh，但绝不能让 V2 遍历它，
  否则重复三角面会造成 duplicate-edge/topology error。
- 选项关键帧出现切面后，四向按钮和滑条立即可用。第一次屏幕按钮、键盘方向键或滑条操作会
  自动进入 exploring，不要求用户先点击“手动探索”。
- 讲解第一层是“题目候选 vs 当前实际截面”图形对比，使用三角形、矩形、椭圆、直边、曲边、
  尖角和缺角语言；几何约束列表只是第二层补充。

二维截面绝对不能改成截图、Canvas 描边猜测或选项 SVG。唯一数据链是：

```text
computeSectionV2()
  → result.topology.groups
  → outerPoints2D + holes2D
  → 等比缩放到独立 SVG
```

因此三维截面与二维截面共享同一次 V2 计算，关键帧、旋转和偏移均在 `updateSection()` 内同步。

## 2. 当前冻结状态

截面引擎 V2 的 SEC2-001～009 与体验任务 UX2-001～003 已依序完成。关键冻结点：

| 冻结标签 | 内容 |
|---|---|
| `section-engine-v2-plan-v1` | 原始施工图，提交 `b93ca9d` |
| `section-engine-v2-sec2-007-handoff-v1` | V1/V2 影子比较，提交 `ca351cb` |
| `section-engine-v2-sec2-008-handoff-v1` | V2 切换生产，提交 `4e18190` |
| `section-engine-v2-sec2-009-handoff-v1` | 连续性终验，提交 `b3a92bc` |
| `section-engine-v2-ux2-002-handoff-v1` | 首屏布局压缩，提交 `7e9afe2` |
| `section-engine-v2-ux2-003-handoff-v1` | 交互状态机，提交 `9eb075a` |

生产页面默认使用 V2。临时回退入口：

```text
/geometry?sectionEngine=v1
```

回退只用于事故定位，不得删除 V2 或把 V1 重新设为默认。

## 3. 算法必须这样理解

旧算法“模型外棱交点 → 质心极角排序”丢失边连接关系，只对凸截面可靠。V2 的固定链路是：

```text
模型三角面（世界坐标）
  → triangle-plane slice
  → 近似端点聚类、零长/重复线段清理
  → 度数为 2 的邻接图
  → 一个或多个闭合轮廓
  → 删除三角面内部对角线产生的共线中间点
  → 共享切面二维基
  → 外环/孔洞/洞中岛拓扑
  → Earcut 三角化与面积守恒检查
  → 复用 BufferGeometry 的蓝色填充和闭合轮廓
```

各节点契约：

1. `triangle-plane-slice.js`：单三角面只返回 0/1 条线段；点接触和整面共面不伪造线段。
2. `section-segment-normalizer.js`：只聚类、去零长、去重复；不连接轮廓。
3. `section-contour-builder.js`：节点度数必须为 2；开链、分叉、非流形明确报错，不猜答案。
4. `section-engine-v2.js`：遍历 indexed/non-indexed Mesh，应用 `matrixWorld`，串联全链并输出
   `ok/empty/error`、轮廓数、面积和诊断。
5. `section-contour-topology.js`：全部轮廓共用同一二维基；父环使用环上顶点判包含，不能使用凹环
   的顶点平均值。
6. `section-triangulation.js`：Earcut 只负责正确边界的三角化；必须校验索引、退化三角形和面积守恒。
7. `section-visual-v2.js`：输入先完整验证；BufferGeometry 长期复用；相同数据跳过写入；空截面清零并隐藏。

绝对禁止重新引入质心极角排序、把多个轮廓强接成一个环、或让 Earcut 猜拓扑。

## 4. 生产接线与可观察状态

页面入口是 `geometry.html`，生产更新仍集中在 `updateSectionVisual()`。

- 默认：V2 成功或空截面时使用 V2，并清理 V1 视觉。
- 强制回退：查询参数 `sectionEngine=v1`。
- 自动回退：V2 返回 `error` 或抛异常时保留 V1，并清理 V2。
- 两套视觉不得同时显示。

Canvas 上的重要证据：

```text
data-section-engine="v2|v1"
data-section-engine-reason="production|forced-legacy|v2-error|v2-exception"
data-section-v2-mode="production|fallback"
data-section-v2-status="ok|empty|error"
data-section-v2-contour-count
data-section-v2-area
data-section-v2-error
data-interaction-mode="orbit|plane"
data-interaction-dragging="true|false"
data-orbit-enabled="true|false"
```

## 5. 视角与切面拖拽状态机

`geometry/viewport-interaction-mode.js` 是唯一交互模式状态机：

- `orbit`：OrbitControls enabled；画布拖拽只旋转相机。
- `plane`：OrbitControls disabled；只接受一个活动 pointerId，纵向位移按画布高度归一化后映射到
  切面滑块范围。
- `pointerup/pointercancel`：结束活动拖拽并释放 pointer capture。
- 从 plane 切回 orbit：立即取消未完成拖拽。
- 三点锁定模式：拒绝切面拖动，不覆盖 A/B/C 定义的平面。

不得让 OrbitControls 与切面 pointer 监听同时 enabled，也不得在两个文件各维护一份交互模式。

## 6. 已验证范围

- 10 类真实三角网格黄金样例：正方体水平/斜切、16 边圆柱、18 方块三阶阶梯、L 形、
  折线凹棱柱、两个分离长方体、顶点相切、过三个顶点、共面顶面。
- 连续序列：正方体水平扫面、正方体斜扫、阶梯跨整数共面边界。
- 生命周期：进入模型显示、模型内无非法空帧、离开后 fill/outline drawRange 均为 0。
- GPU 稳定性：Mesh/LineSegments 的 BufferGeometry 身份不变，扩容受控，相同帧不重复写 attribute。
- 浏览器：默认入口为 V2 production；`?sectionEngine=v1` 为 forced-legacy；两者无控制台错误。
- 1280×720 首屏：页面 scrollHeight=720，3D 画布 682×524，实时截面状态和切面控制标题可见；
  760×800 恢复自然页面滚动。
- 真实手势：plane 模式只改变 offset，orbit 模式只改变 camera，三点锁定拒绝切面拖动。

常用测试：

```bash
node --experimental-loader ./tests/three-absolute-loader.mjs \
  --test tests/section-engine-v2.integration.test.mjs
node --experimental-loader ./tests/three-absolute-loader.mjs \
  --test tests/section-engine-v2-continuity.test.mjs
node --test tests/ux2-layout.test.mjs
node --test tests/viewport-interaction-mode.test.mjs
npm run test:geometry
git diff --check
```

## 7. 后续任务难度与唯一顺序

| 后续任务 | 难度 | 原因与边界 |
|---|---:|---|
| AUTHOR-001 手工讲解编辑器 | 中高 | 复用 ReasoningCase；先支持模板、参数、选项、约束和关键帧编辑，不接 AI |
| AUTHOR-002 JSON 导入导出 | 中 | 必须版本化、Schema 校验、错误定位和往返一致 |
| VISION-001～007 图片辅助录题 | 高 | 可用低成本 OpenAI 兼容接口或开源库，但只产出待确认草稿 |
| 任意重叠壳体布尔并集截面 | 很高 | 当前重叠封闭壳体会明确报 topology error；若要支持，应先做可靠并集表面 |
| 洞、内腔与复杂 CSG 回归 | 高 | 拓扑已支持孔洞，但真实 CSG 网格质量和共面碎片需要独立黄金样例 |

唯一下一项是 AUTHOR-001：建立不依赖 AI 的手工题目讲解编辑器。不要跳到通用图片识别。

## 8. 已知边界

- 相互重叠但未布尔合并的多个封闭 Mesh 会形成相交轮廓，V2 会返回 topology/error 并自动回退 V1。
- `BlockAssembly` 的统一配色模式会生成外表面网格，已通过阶梯测试；分层配色会拆成多个 Mesh，
  必须在 COM-007 单独验证接缝。
- V2 已能显示多轮廓；旧二维辅助图和详细顶点列表仍偏向单轮廓表达，后续若扩展 UI 必须单独建任务。
- 自动测试不能替代最终参考视频的人工体验验收。
- Electron 依赖打包尚未在本轮验证。
- 第二题组合接触处使用邻近稳定关键帧避开 CSG 共面退化；不得把代表参数描述成原题精确尺寸。
- 二维截面 SVG 必须保留 `fill-rule="evenodd"`，否则孔洞会被错误填满。

## 9. 禁止事项

- 禁止合并 `cutfix006a-experimental-do-not-merge-v1`。
- 禁止删除 V1 临时回退，除非另有任务、完整回归和用户批准。
- 禁止用截图通过代替几何测试，也禁止只用单测通过代替参考视频体验验收。
- 禁止默认隐藏模型一侧；真实剖开只能由用户主动开启。
- 禁止在没有任务编号时改业务代码，或把多个任务压成一个提交。
- 禁止为“更像选项”而手绘二维截面；选项轮廓与真实 V2 截面必须保持两种不同证据。
- 禁止恢复 CSG 结果网格的全量边线或关闭深度测试强行显示所有隐藏边。
- 禁止把 ghost 放回 `computeSectionV2()` 的遍历根节点。
- 禁止再次要求用户先点“手动探索”才能使用方向键。
- 禁止用抽象规则清单取代候选图与实际截面的直接视觉比较。

## 10. 当前验证命令

```bash
node --check reasoning-lesson.js
node --test \
  tests/reasoning-case-fixtures.test.mjs \
  tests/reasoning-case-validator.test.mjs \
  tests/reasoning-lesson-layout.test.mjs \
  tests/lesson-state-machine.test.mjs \
  tests/lesson-timeline.test.mjs
git diff --check
```

浏览器必须额外检查：

- 两题切换后都有真实 V2 截面；
- 开启手动探索后四向按钮和滑条解锁；
- 方向按钮或键盘旋转后，二维 SVG path 随之变化；
- 滑条偏移后二维面积和轮廓同步变化；
- 完成前答案隐藏，最后一步才显示人工答案；
- 控制台无业务错误。
