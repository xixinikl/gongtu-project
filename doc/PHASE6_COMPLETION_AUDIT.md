# Phase 6 完成审计与干净总装清单

更新时间：2026-07-13
审计分支：`cx/phase6-e2e-hardening`
审计方式：本地 Git 提交图、全部已登记 worktree 的只读状态、GitHub PR 元数据与已记录的自动/真实浏览器验收。

> 本文是 `phase6-clean-integration` Goal 的**唯一权威入口**；任何完成结论必须以本文的当前事实、证据、非范围和完成审计为准。

## 当前事实

本次总装仅允许使用连续的 Phase 1→6 提交链。GitHub 上的 Phase 1—5 PR 尚未合并，因而所有分支和 PR 都必须保持待审状态。

## 范围

- 审计六阶段提交、PR 元数据、直接验收来源和未完成边界。
- 对已登记的相关 worktree 给出不破坏原内容的三分类。
- 建立只含正式提交链、审计与项目记忆的待审总装分支，并重跑回归。

## 非范围

- 不从任何脏工作树、临时目录、旧 UI 原型或独立 preview PR 直接拣取文件。
- 不提交数据库、`.env`、令牌、浏览器资料、`node_modules`、截图/视频或其他运行产物。
- 不审阅、合并 Phase 1—6 PR，不部署生产，也不把外部审阅伪写成本地验收。

## 开 Goal 提示

目标文本：审计六阶段的直接验收证据和所有相关 worktree；只在连续、干净的 Phase 6 提交链上建立待审总装分支，并重跑自动与真实浏览器回归，不混入临时文件、数据库、密钥或未验收半成品。

## 结论边界

Phase 1→6 的提交链是连续的：Phase 1 `08ed24a` → Phase 2 `0e64201` → Phase 3 `a39de44` → Phase 4 `a1c8180` → Phase 5 `4afaf90` → Phase 6 `3f9cb27`。因此可以从干净的 Phase 6 提交链建立总装分支。

这不等于 GitHub 已审阅或已合并：PR #15—#19 均为 `open`、`merged=false`；#17、#18、#19 仍为 Draft。Phase 6 在本清单写入时尚无 PR。总装只能是待审分支/PR，不能合并到 `main` 或部署。

## 阶段证据与 PR 状态

| 阶段 | 代码锚点 | 直接验收证据 | GitHub 审阅状态 |
| --- | --- | --- | --- |
| P1 统一外壳 | `08ed24a` | PR #15 记录 15/15 静态、桌面/390px 浏览器、0 console error | PR #15 open，未合并，未见外部审阅结论 |
| P2 学习记录合同 | `0e64201` | PR #16 记录 JWT 归属、A/B 隔离、API/Node 测试 | PR #16 open，未合并，未见外部审阅结论 |
| P3 真实言语与数量 | `a39de44` | PR #17 记录 pipeline 14/14、Python/Node、真实浏览器与 390px | PR #17 open Draft，未合并 |
| P4 图推与申论 | `a1c8180` | PR #18 记录 Python、Node 36/36、浏览器与响应式 | PR #18 open Draft，未合并 |
| P5 AI 教练 | `4afaf90` | PR #19 记录 Python 61/61、Node 620/620、真实 DeepSeek 与 A/B | PR #19 open Draft，未合并 |
| P6 全链路 | `3f9cb27` | 62/62 服务端、45/45 页面/认证；六模块真实路径、刷新、服务重启、B/C 隔离、390/1280 无溢出/破图/console 错误 | 尚未建 PR；建立后必须保持 Draft，基线为 P5 |

P6 的补充提交包括 `c839156`（正式外壳的移动导航、焦点与减少动效）和 `3f9cb27`（端到端验收事实）。两者都在干净分支中，`git diff --check 4afaf90..HEAD` 通过。

## 相关 worktree 三分类

分类只决定本次总装是否纳入，不删除、重置、搬移或覆盖任何原有内容。

| worktree / 分支 | 盘点 | 分类 | 本次动作 |
| --- | --- | --- | --- |
| `/Users/miduoduo/Documents/xixi_gongtu` / `main` | 无已跟踪改动；4 个未跟踪运行产物（`.codex-runtime`、`.playwright-cli`、`node_modules`、`output`） | 历史归档 / 可重建产物 | 不纳入提交，也不删除 |
| `/private/tmp/xixi-gongtu-phase6-home-origin` / `cx/phase6-e2e-home-origin` | 2 个已改文件，内容是正式外壳无障碍改动的旧副本 | 历史归档 | 已由 `c839156` 在正式 Phase 6 分支纳入；不重复拣取 |
| `/Users/miduoduo/.codex/worktrees/af95/xixi_gongtu` / `cx/real-verbal-quantity-integration` | 21 个已改、33 个未跟踪；包含空间图推、页面、文档、preview/容器与题库草稿 | 继续开发 | 原始保全树；不得整体提交或混入总装 |
| `/Users/miduoduo/Documents/xixi_gongtu-main-app` / `cx/vocab-verbal-original-ui` | 2 个已改、2 个未跟踪；原始 UI 原型和交接文档 | 继续开发 | 保持独立；不作为 Phase 6 总装来源 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase3` / `cx/phase3-integrated` | 干净 | 正式纳入 | 已由线性提交链包含 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase4` / `cx/phase4-reasoning-shenlun` | 干净 | 正式纳入 | 已由线性提交链包含 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase5` / `cx/phase5-real-ai-coach` | 干净 | 正式纳入 | 已由线性提交链包含 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase6` / `cx/phase6-e2e-hardening` | 审计开始前干净；此提交只加入审计/项目记忆文件 | 正式纳入 | 总装的唯一代码来源 |
| `/Users/miduoduo/Documents/xixi_gongtu/.xds/worktrees/cx-realtime-preview-v1` / `cx/realtime-preview-v1` | 干净；独立 Draft PR #20 | 继续开发 | 与六阶段产品链分开，不能因预览工具而混入总装 |

## 明确未纳入项

- 本地 SQLite、`.env`、令牌、`node_modules`、浏览器目录、临时数据库、截图/视频和运行输出均不纳入。
- 数量关系的 42 个解析视觉引用仍未独立审计；申论仅有 10 道材料摘要且题源不完整。这些是产品事实边界，不因总装而移除或宣称完成。
- GitHub 的审阅和合并不是 Agent 可伪造的本地证据，保留为外部待办。

## 后续验收顺序

1. 以本审计提交为起点建立干净总装分支；仅包含 P1→P6 提交链和本审计/项目记忆。
2. 为 P6 建立以 P5 为基线的 Draft PR，附上本清单和端到端证据。
3. 在总装分支重跑服务端、Node、数据门禁与真实浏览器主路径/A-B 隔离。
4. 只有审阅结论、回归结果和未纳入项都写明，才可以请求合并；不得直接合并 `main`。

## 可见 Goal 阶段

| 顺序 | 任务 | 通过标准 | 当前状态 |
| --- | --- | --- | --- |
| P6I-1 | 证据审计 | 提交链、PR 状态和直接验收来源均写清 | 已核实，待写入提交 |
| P6I-2 | worktree 三分类 | 每个相关树都有正式纳入/继续开发/历史归档结论 | 已核实，待写入提交 |
| P6I-3 | 干净总装 | 新分支只包含线性阶段提交与本审计，不含临时/密钥/半成品 | 进行中 |
| P6I-4 | 总装回归 | 自动回归、数据门禁和真实浏览器主路径重新取得证据 | 待开始 |

## 停止条件

- 任何准备纳入的文件若包含数据库、密钥、临时产物、未验收半成品或来自保全脏树，立即排除并记录去向。
- 任何回归、数据门禁或真实浏览器路径失败，停止请求合并，保留失败证据并修复到所属阶段分支。
- PR 审阅或合并需要外部决定；本 Goal 可以完成审计和待审总装，但不能把尚未审阅的 PR 表述为已验收或擅自合并。
