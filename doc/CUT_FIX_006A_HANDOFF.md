# CUT-FIX-006A 新 Agent 单任务交接单

> 唯一任务：`CUT-FIX-006A feat: 建立阶梯组合体验收入口`
>
> 冻结标签：`cutfix006a-handoff-v1`
>
> 冻结基线：`feature/spatial-geometry-cutfix-plan`

## 1. 为什么先拆出 006A

原 CUT-FIX-006 要同时验证正方体、圆柱和阶梯组合体的连续截面，但当前实验室没有可选择的阶梯组合体。
如果直接写测试，只能验证隐藏在测试里的模型，CUT-FIX-007 也无法录制用户真正想看的阶梯切割过程。

因此先用一个独立小任务建立确定性的三阶阶梯体验入口；完成后 CUT-FIX-006 再专注连续截面测试。

## 2. 冻结与分支

```bash
git fetch origin --tags
git worktree add ../gongtu-cutfix006a-agent \
  -b feature/spatial-geometry-cutfix006a-agent \
  cutfix006a-handoff-v1
cd ../gongtu-cutfix006a-agent
git status --short --branch
git tag --points-at HEAD
```

必须从 `cutfix006a-handoff-v1` 新建独立 worktree。禁止修改或提交到 `main`、`dev`、
`feature/spatial-geometry-cutfix-plan`，禁止合并、强推基线、开始 CUT-FIX-006/007。

## 3. 必读与保护范围

必读：

- `.ai_rules.md`
- `TASKS.md`
- `CURRENT_STATUS.md`
- `doc/AGENT_HANDOFF.md`
- `doc/GEOMETRY_ARCHITECTURE.md`
- 本交接单

禁止修改：

- `geometry/cutting-plane.js`
- `geometry/plane-intersections.js`
- `geometry/section-mode.js`
- `geometry/cutaway-visual.js`
- CUT-FIX-003 至 005 的蓝色截面、刀面和三种显示模式

必须复用现有 `BlockArray` 与 `createBlockAssembly`，禁止另写一套积木几何引擎。

## 4. 阶梯模型契约

新增一个确定性三阶阶梯 fixture：

- 3 个台阶，沿世界 X 轴逐级降低；
- 每级沿 Z 轴具有相同深度，建议深度 3 个单位方块；
- 最高层 3 格、第二层 2 格、最低层 1 格；
- 推荐坐标：对每个 `x=0..2`，高度为 `3-x`，填充 `y=0..height-1`、`z=0..2`；
- 共 18 个单位方块；
- 生成后整体居中到世界原点附近，便于现有相机、切面滑块和刀面自适应逻辑工作；
- `userData.type` 必须稳定为 `staircase`，并保留 blockCount/positions 等可验证信息。

页面左侧模型库增加“阶梯组合体”入口。选择后必须复用现有 `placeModel()` 流程，使包围盒、滑块范围、
蓝色截面、视觉刀面和三种显示模式自动接线。不要为阶梯模型复制一套切割逻辑。

## 5. 文件预算

最多 3 个交付文件：

1. `geometry/staircase-fixture.js`
2. `geometry.html`
3. `tests/staircase-fixture.test.mjs`

审计文件必须更新但不计入限额：

- `TASKS.md`
- `CURRENT_STATUS.md`
- `doc/AGENT_WORK_LOG.md`

不得提交本任务截图；截图统一留给后续 CUT-FIX-006/007，减少仓库体积和重复验收。

## 6. 必须验证

专项测试：

- 坐标数量恰好 18，且无重复；
- 每个 X 层高度分别为 3、2、1，Z 深度均为 3；
- fixture 返回 Three.js Group，`userData.type === "staircase"`；
- 包围盒尺寸为 3×3×3，居中后中心接近原点；
- 生成模型可被 `collectWorldEdges()` 读取；
- 页面模型库和 factory 接线存在，选择时仍走 `placeModel()`。

运行：

```bash
npm run test:geometry
git diff --check
```

浏览器只需做一次冒烟检查：选择“阶梯组合体”，确认模型可见、滑块范围更新、蓝色截面可出现。
保存一张截图作为临时回审证据即可，但不要提交到仓库；返回绝对路径。

## 7. 状态、提交和停止点

开始前把 CUT-FIX-006A 标为 `- [ ] ◐`；全部通过后改为 `- [x] ●`。

提交信息必须精确为：

```text
feat: 建立阶梯组合体验收入口
```

推送：

```bash
git push -u origin feature/spatial-geometry-cutfix006a-agent
```

返回分支、最终提交、3个交付文件、测试数字、临时截图绝对路径和已知风险。然后停止：

- 不合并；
- 不开始 CUT-FIX-006；
- 不录制最终体验视频；
- 等待主协调 Agent 轻量回审。
