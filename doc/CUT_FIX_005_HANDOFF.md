# CUT-FIX-005 新 Agent 单任务交接单

> 唯一任务：`CUT-FIX-005 feat: 保留真实剖开辅助模式`
>
> 冻结标签：`cutfix005-handoff-v1`
>
> 冻结基线：`feature/spatial-geometry-cutfix-plan`

## 1. 产品目标

默认体验永远是“教学模式”：完整模型保持可见，真实交集显示为蓝色截面。只有用户主动点击后，
才允许进入两种辅助剖开模式：

- `hidden`：隐藏被切侧，只显示保留侧与蓝色截面。
- `transparent`：保留侧正常显示，被切侧以透明辅助体显示，蓝色截面仍清晰。

用户切回 `teaching` 后，必须恢复完整模型、蓝色截面和原材质，不能残留裁剪面、透明镜像或重复模型。

CUT-FIX-003 已建立三种策略，CUT-FIX-004 已完成刀面尺寸、中心、显隐和 offset 同步。本任务是对
真实剖开辅助模式做端到端收口；优先补测试和修复接线，不得重写已通过的截面数学。

## 2. Git 冻结与隔离

新 Agent 必须执行：

```bash
git fetch origin --tags
git worktree add ../gongtu-cutfix005-agent \
  -b feature/spatial-geometry-cutfix005-agent \
  cutfix005-handoff-v1
cd ../gongtu-cutfix005-agent
git status --short --branch
git tag --points-at HEAD
```

预期工作区干净，HEAD 带 `cutfix005-handoff-v1`。禁止：

- 修改或提交到 `main`、`dev`、`feature/spatial-geometry-cutfix-plan`。
- 移动/删除冻结标签，强推既有基线，清理其他 Agent 工作区。
- 合并、rebase 或 cherry-pick 回基线。
- 开始 CUT-FIX-006/007 或恢复 COM-007。

完成后只推送 `feature/spatial-geometry-cutfix005-agent`，停止等待主协调 Agent 回审。

## 3. 接手前必读

完整阅读：

1. `.ai_rules.md`
2. `TASKS.md`
3. `CURRENT_STATUS.md`
4. `doc/AGENT_HANDOFF.md`
5. `doc/GEOMETRY_ARCHITECTURE.md`
6. 本交接单

## 4. 受保护成果

禁止修改：

- `geometry/cutting-plane.js`
- `geometry/plane-intersections.js`
- `geometry/section-visual.js`
- CUT-FIX-004 的刀面尺寸、中心、offset 与显隐逻辑
- 三点定面、截面顶点排序、面积和蓝色截面算法

不得把真实裁剪重新设成默认模式，不得用隐藏蓝色截面掩盖剖开错误。

## 5. 本任务精确范围

必须验证并在必要时修复：

1. 首次打开默认 `teaching`，源模型无 clipping，完整模型可见。
2. 点击 `hidden` 后才启用源模型 clipping；被切侧镜像不存在。
3. 点击 `transparent` 后源模型 clipping，反向被切侧仅以透明镜像显示。
4. 三种模式下蓝色真实截面都保持可见并随切面移动。
5. `hidden → teaching`、`transparent → teaching` 均完整恢复源模型和材质。
6. 多次往返不积累 ghost、材质克隆、场景节点或事件监听器。
7. 切换模型、修改尺寸、自由/题目切割切换时，当前显示策略接线正确。
8. “显示/隐藏视觉刀面”只控制刀面，不改变教学/剖开策略。

## 6. 文件预算

最多 3 个交付文件：

1. `geometry.html`
2. `geometry/section-mode.js`（只有策略本身确实需要修复时才改）
3. `tests/cut-fix-005.test.mjs`

强制审计文件不计入上限：

- `TASKS.md`
- `CURRENT_STATUS.md`
- `doc/AGENT_WORK_LOG.md`

超过 3 个交付文件必须停止并报告，不能自行扩权。

## 7. 状态与提交纪律

开始前把 CUT-FIX-005 标记为 `- [ ] ◐`，完成验收后才能改为 `- [x] ●`。
任务提交信息必须精确为：

```text
feat: 保留真实剖开辅助模式
```

审计文档必须使用“本任务所在提交”或最终事实，禁止写即将被 amend 淘汰的哈希。

## 8. 验收要求

自动测试：

```bash
npm run test:geometry
git diff --check
```

专项测试至少覆盖：

- 三种显示策略；
- 默认只进入 teaching；
- hidden 无 ghost；
- transparent 只有一个反向 ghost；
- 往返 teaching 后 clipping、ghost、材质全部恢复；
- 连续切换至少 10 次无节点/材质数量增长；
- 模型重建与刀面显隐不改变当前策略。

浏览器只做必要的 4 组证据，避免重复消耗：

1. teaching 完整模型 + 蓝色截面；
2. hidden 剖开 + 蓝色截面；
3. transparent 透明被切侧 + 蓝色截面；
4. 切回 teaching 后完整恢复。

保存 4 张截图；如果一段短录屏可以清楚展示往返恢复，则再保存 1 段。不得把截图存在仓库外部后只写口头结论。

## 9. 返回格式与停止点

返回内容保持精简：

- 分支与最终提交；
- 3 个以内交付文件；
- 测试数字；
- 4 张截图/录屏路径；
- 是否发现并修复真实缺陷；
- 明确声明未合并、未开始 CUT-FIX-006。

主协调 Agent 采用轻量回审：关键 diff、专项测试与证据一致性通过后才快进合入冻结基线。
