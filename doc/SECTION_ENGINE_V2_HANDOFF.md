# 截面引擎 V2 接力手册：SEC2-003 起点

> 冻结日期：2026-07-01  
> 冻结标签：`section-engine-v2-sec2-002-handoff-v1`  
> 稳定分支：`feature/spatial-geometry-cutfix-plan`  
> 下一任务：`SEC2-003 feat: 归一化截面线段集合`

## 1. 给下一位 Agent 的最短指令

先验证标签、分支和工作树，再从冻结标签建立自己的隔离分支与 worktree。只做 SEC2-003，
不得提前拼轮廓、改页面或切换生产算法。

```bash
cd /Users/xixi/Documents/Codex/2026-06-29/new-chat/work/gongtu-cutfix-plan
git fetch --tags origin
git status --short --branch
git rev-list -n 1 section-engine-v2-sec2-002-handoff-v1
git log -5 --oneline --decorate
```

必须完整阅读：

1. `.ai_rules.md`
2. `TASKS.md`
3. `CURRENT_STATUS.md`
4. `doc/SECTION_ENGINE_V2_PLAN.md`
5. 本文件
6. `geometry/triangle-plane-slice.js`
7. `tests/triangle-plane-slice.test.mjs`

如果 Git 事实与文档冲突，以 Git 为准，停止业务修改并先报告。禁止使用 `git reset --hard`。

## 2. 为什么这条路线不会再重复旧失败

旧算法只收集模型外棱与平面的无序交点，再围绕质心做极角排序。无序点集已经丢失“哪两个点
原本由一条截面边连接”的信息，因此会跨过 L 形或阶梯形凹口。Earcut 只能三角化正确轮廓，
不能从错误点序恢复拓扑。

已冻结的新流水线是：

```text
三角面切片
  → 线段端点归一化、零长与重复边消除
  → 邻接图链接闭环
  → 多轮廓与孔洞拓扑
  → Earcut 三角化
  → 稳定渲染
```

失败实验 `cutfix006a-experimental-do-not-merge-v1` 只能分析，绝对禁止合并。

## 3. 当前完成进度

| 项目 | 状态 | 证据 |
|---|---|---|
| SEC2-000 规划与根因冻结 | 完成 | `section-engine-v2-plan-v1` |
| SEC2-001 黄金答案 | 完成 | 10 个独立样例；专项 6/6 |
| UX2-001 页面滚轮修复 | 完成 | 专项 2/2；按钮缩放替代滚轮缩放 |
| SEC2-002 单三角面切片 | 完成 | 专项 9/9；整库 375/375 |
| SEC2-003 线段归一化 | 下一项 | 尚未开始 |
| SEC2-004～009 | 等待依赖 | 必须串行 |

现在不是“算法还没开始”，而是答案、第一层几何原语和退化契约已经固定。剩余算法链有明确边界。

## 4. SEC2-002 已冻结的接口契约

入口：

```js
sliceTriangleWithPlane(triangle, plane, {
  triangleId,
  epsilon,
})
```

返回对象始终含：

- `status`
- `segment`：只能是 `null` 或一条线段
- `triangleId`
- `epsilon`

状态：

| `status` | `segment` | 含义 |
|---|---|---|
| `none` | `null` | 不相交 |
| `point` | `null` | 只擦到一个顶点，不制造零长线段 |
| `segment` | 一条 | 普通穿过、顶点穿过或共面边 |
| `coplanar` | `null` | 整个三角面共面，不擅自挑一条边 |

有效线段端点已经按 x/y/z 字典序排列，并保留 `triangleId` 与 `relation`：
`edge-crossing`、`vertex-crossing` 或 `coplanar-edge`。

下一位 Agent 只能消费 `result.segment`。不得把 `point` 当边，也不得把整个共面三角面随意拆成三条边。

## 5. SEC2-003 的严格施工边界

目标：稳定归一化来自多个三角面的截面线段集合。

允许修改的交付文件只有：

```text
geometry/section-segment-normalizer.js
tests/section-segment-normalizer.test.mjs
```

`TASKS.md` 和 `CURRENT_STATUS.md` 是强制审计文件，不计入交付文件上限。

必须实现并测试：

1. 在统一 epsilon 下合并距离足够近的端点。
2. 合并后删除零长度线段。
3. 删除完全重复线段。
4. 删除反向重复线段。
5. 输出顺序确定，相同输入每次结果一致。
6. 保留来源三角面 ID；重复边的来源不得静默丢失，建议聚合为 `triangleIds`。
7. 输入非法时明确抛错，不猜测修复。

本任务明确禁止：

- 不链接轮廓；那是 SEC2-004。
- 不计算外环、孔洞或面积；那是 SEC2-005。
- 不调用 Earcut。
- 不读取 DOM，不修改 `geometry.html`。
- 不修改 Three.js 场景或截面视觉。
- 不接入生产路径，不顺手修旧 V1。
- 不开始 SEC2-004，即使 SEC2-003 很快完成，也必须先回审。

## 6. 建议的数据形状

输入只接收 SEC2-002 的有效 `segment` 对象数组。建议输出：

```js
{
  segments: [
    {
      start: THREE.Vector3,
      end: THREE.Vector3,
      triangleIds: [/* 稳定去重后的来源 */],
    },
  ],
  epsilon,
  removed: {
    zeroLength: 0,
    duplicates: 0,
  },
}
```

这只是建议形状；如需调整，必须仍满足来源可追踪、输出确定和 SEC2-004 可直接构建邻接图三个条件，
并在测试中固定契约。不要为了“通用”提前扩展成大型框架。

## 7. SEC2-003 最低测试矩阵

- 两条完全相同的线段。
- 两条首尾反向的线段。
- 端点在 epsilon 内和 epsilon 外。
- 归一化后坍缩为零长。
- 多条独立线段不被误合并。
- 三角面来源 ID 聚合且稳定去重。
- 输入顺序改变后几何输出仍确定。
- 空数组。
- 非 Vector3、缺端点、非法 epsilon。

测试不可调用旧极角排序，也不可用当前生产算法生成期望答案。

## 8. 验收命令

根目录 `node_modules` 不提交。若缺失，可从临时 `npm ci` 目录创建符号链接，测试后删除。

```bash
node --experimental-loader ./tests/three-absolute-loader.mjs \
  --test tests/section-segment-normalizer.test.mjs
node --check geometry/section-segment-normalizer.js
npm run test:geometry
git diff --check
git status --short --branch
```

只有聚焦测试、全量测试和 diff 检查都通过，才能把 SEC2-003 标为完成。

## 9. 已知风险与未完成验收

- 整面共面目前只标记状态；网格级共面边界提取需要在后续集成中明确策略，SEC2-003 不得擅自决定。
- 孔洞、多外环和非流形检测尚未实现。
- 生产页面仍使用旧截面路径；当前页面凹截面结果不能作为 V2 正确性证据。
- UX2-001 已有静态与全量测试，但真实浏览器滚轮、拖拽、按钮手势截图仍待补。
- 远端候选 `cutfix006a-v1-staircase-done` 不得整体合并；最多在 SEC2-007 经审查选择性复用阶梯入口。

## 10. 下一位 Agent 的返回格式

- 基线标签、隔离分支、最终提交。
- 修改文件，最多两个交付文件加两个审计文件。
- 聚焦测试与全量测试的命令、通过数、失败数。
- 端点量化/聚类策略和 epsilon 依据。
- 重复边来源如何聚合。
- 尚未解决的数学边界。
- 明确声明：未合并、未开始 SEC2-004、未修改生产页面。

完成后停下等待回审。不要因为测试全绿就自行推进下一个依赖任务。
