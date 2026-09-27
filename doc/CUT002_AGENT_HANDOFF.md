# CUT-002 接力 Agent 单任务交接单

更新时间：2026-06-30  
回审负责人：Agent 1（本线程）  
接力任务：`CUT-002 feat: 拖动切面时实时剖开模型`

## 1. 任务边界

本轮只完成一件事：拖动“切割平面位置”滑块时，让同一三维场景中的刀面移动，并让当前模型同步产生视觉裁剪。

本轮明确不做：

- 不接水平倾角、垂直倾角滑块；它们属于 CUT-003。
- 不做 A、B、C 三点锁定；它属于 CUT-004。
- 不计算真实截面顶点、面积或边数；它们属于 CUT-005 至 CUT-013。
- 不生成切口封面和高亮轮廓；它属于 CUT-007。
- 不修改 `main`，不合并回基准分支，不改已有已完成任务。

## 2. 唯一工作位置

接力分支：

```text
feature/spatial-geometry-cut002-agent
```

独立工作树：

```text
/Users/xixi/Documents/Codex/2026-06-29/new-chat/work/gongtu-cut002-agent
```

基准提交：

```text
cafdcf6 feat: 在三维场景显示无限切割平面
```

只允许向 `origin/feature/spatial-geometry-cut002-agent` 推送。禁止向
`feature/spatial-geometry-lab` 或 `main` 推送。完成后停下，由 Agent 1 回审和合并。

## 3. 开工前检查

依次完整阅读：

1. `.ai_rules.md`
2. `TASKS.md`
3. `CURRENT_STATUS.md`
4. `doc/AGENT_HANDOFF.md`
5. 本文件

然后执行：

```bash
git status --short --branch
git branch --show-current
git rev-parse --short HEAD
```

预期：工作区干净、分支为 `feature/spatial-geometry-cut002-agent`、起点包含
`cafdcf6`。任一不符都先停止，不得用 `reset --hard`。

## 4. 允许修改的业务文件

本任务最多修改以下 3 个交付文件：

1. `geometry.html`
2. `geometry/cutting-plane.js`
3. `geometry/scene.js`（只有前两个文件无法建立清晰契约时才修改）

另须同步审计文件：

- `TASKS.md`
- `CURRENT_STATUS.md`
- `doc/AGENT_WORK_LOG.md`

不得改模型生成器、后端、依赖版本、CI、架构文档或其他任务代码。

## 5. 现有契约与实现方向

- `geometry/scene.js` 已启用 `renderer.localClippingEnabled`。
- `window.geometryLab.cuttingPlane.plane` 是数学无限平面。
- `window.geometryLab.cuttingPlane.setPlane(normal, offset)` 会同步移动视觉刀面。
- 当前模型由 `geometry.html` 中的 `placeModel()` 创建并保存为 `activeModel`。
- 页面已有 `aria-label="切割平面位置"` 的范围滑块，范围 `-2` 至 `2`。

建议保持一个单一更新函数：

1. 读取位置滑块数值。
2. 调用 `cuttingPlane.setPlane(new THREE.Vector3(1, 0, 0), offset)`。
3. 遍历 `activeModel` 的可裁剪材质，把同一个数学平面放入 `material.clippingPlanes`。
4. 模型切换或参数重建后，立即把当前切面重新应用到新模型。
5. 更新 Canvas 的切面偏移/常数状态，供浏览器验收。

注意：

- 视觉刀面有限只是显示载体，裁剪必须使用 `THREE.Plane`。
- 不要克隆出不同的平面对象，否则视觉刀面和裁剪会失去同步。
- 只裁剪 `activeModel`，不得裁剪网格、坐标轴、标签或刀面自身。
- 正负方向只需在本任务内保持一致，并通过两端位置的浏览器画面证明模型被裁掉的侧面相反。

## 6. 验收标准

全部满足后才能在 `TASKS.md` 把 CUT-002 改为 `- [x] ●`：

1. 滑块位于 `0` 时，刀面穿过模型且模型显示被剖开。
2. 连续拖动位置滑块时，无需松手、刷新或跳转页面，刀面和模型裁剪同步变化。
3. 滑块分别移动到正、负位置时，裁剪结果明显不同。
4. 切换七种基础模型以及改变模型参数后，裁剪仍然生效。
5. OrbitControls 旋转、缩放和平移保持可用。
6. 桌面与窄屏无新增横向溢出；控制台无新增错误。
7. 122 项既有生成器测试全部通过。
8. Git 差异无空白错误，且没有任务范围外文件。

最低验收命令：

```bash
node --check geometry/scene.js
npm run deps:check
npm run test:geometry
git diff --check
git status --short
```

浏览器验收必须记录：滑块的三个位置值、Canvas 状态、模型切换结果和控制台错误数。

## 7. 提交、推送与停止点

提交信息必须精确为：

```text
feat: 拖动切面时实时剖开模型
```

完成后：

1. 更新 `TASKS.md`、`CURRENT_STATUS.md` 和 `doc/AGENT_WORK_LOG.md`。
2. 提交并推送 `origin/feature/spatial-geometry-cut002-agent`。
3. 等待该分支 GitHub Actions 全绿。
4. 向用户报告提交哈希、CI 链接、修改文件、测试结果和遗留风险。
5. 立即停止，不开始 CUT-003，不合并任何分支。

Agent 1 回来后只审查从基准到该提交的增量：

```bash
git diff cafdcf6...origin/feature/spatial-geometry-cut002-agent
```

