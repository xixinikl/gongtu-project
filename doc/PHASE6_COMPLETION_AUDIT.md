# Phase 6 完成审计与干净总装清单

更新时间：2026-07-13
审计分支：`cx/phase6-e2e-hardening`
审计方式：本地 Git 提交图、全部已登记 worktree 的只读状态、GitHub PR 元数据与已记录的自动/真实浏览器验收。

> 本文是 `phase6-clean-integration` Goal 的**唯一权威入口**；任何完成结论必须以本文的当前事实、证据、非范围和完成审计为准。

## 当前事实

本次总装仅允许使用连续的 Phase 1→6 提交链。GitHub 上的 Phase 1—6 PR 均尚未合并，因而所有分支和 PR 都必须保持待审状态。

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

这不等于 GitHub 已审阅或已合并：PR #15—#21 均为 `open`、`merged=false`；#17、#18、#19、#21 仍为 Draft。Phase 6 的 [Draft PR #21](https://github.com/xixinikl/gongtu-project/pull/21) 以 Phase 5 为基线。总装只能是待审分支/PR，不能合并到 `main` 或部署。

## 阶段证据与 PR 状态

| 阶段 | 代码锚点 | 直接验收证据 | GitHub 审阅状态 |
| --- | --- | --- | --- |
| P1 统一外壳 | `08ed24a` | PR #15 记录 15/15 静态、桌面/390px 浏览器、0 console error | PR #15 open，未合并，未见外部审阅结论 |
| P2 学习记录合同 | `0e64201` | PR #16 记录 JWT 归属、A/B 隔离、API/Node 测试 | PR #16 open，未合并，未见外部审阅结论 |
| P3 真实言语与数量 | `a39de44` | PR #17 记录 pipeline 14/14、Python/Node、真实浏览器与 390px | PR #17 open Draft，未合并 |
| P4 图推与申论 | `a1c8180` | PR #18 记录 Python、Node 36/36、浏览器与响应式 | PR #18 open Draft，未合并 |
| P5 AI 教练 | `4afaf90` | PR #19 记录 Python 61/61、Node 620/620、真实 DeepSeek 与 A/B | PR #19 open Draft，未合并 |
| P6 全链路 | `3f9cb27` | 62/62 服务端、45/45 页面/认证；六模块真实路径、刷新、服务重启、B/C 隔离、390/1280 无溢出/破图/console 错误 | [Draft PR #21](https://github.com/xixinikl/gongtu-project/pull/21)，基线为 P5，未合并 |

P6 的补充提交包括 `c839156`（正式外壳的移动导航、焦点与减少动效）和 `3f9cb27`（端到端验收事实）。两者都在干净分支中，`git diff --check 4afaf90..HEAD` 通过。

## 相关 worktree 三分类

分类只决定本次总装是否纳入，不删除、重置、搬移或覆盖任何原有内容。

| worktree / 分支 | 盘点 | 分类 | 本次动作 |
| --- | --- | --- | --- |
| `/Users/miduoduo/Documents/xixi_gongtu` / `main` | 无已跟踪改动；4 个未跟踪目录（`.codex-runtime`、`.playwright-cli`、`node_modules`、`output`） | 历史归档 / 可重建产物 | 不纳入提交，也不删除；其中本树的 `output/playwright` 与 `output/quantity-bank` 不同于正式链已版本化的 3D 验收素材 |
| `/private/tmp/xixi-gongtu-phase6-home-origin` / `cx/phase6-e2e-home-origin` | 2 个已改文件，内容是正式外壳无障碍改动的旧副本 | 历史归档 | 已由 `c839156` 在正式 Phase 6 分支纳入；不重复拣取 |
| `/Users/miduoduo/.codex/worktrees/af95/xixi_gongtu` / `cx/real-verbal-quantity-integration` | 21 个已改、33 个未跟踪；包含空间图推、页面、文档、preview/容器与题库草稿 | 继续开发 | 原始保全树；不得整体提交或混入总装 |
| `/Users/miduoduo/Documents/xixi_gongtu-main-app` / `cx/vocab-verbal-original-ui` | 2 个已改、2 个未跟踪；原始 UI 原型和交接文档 | 继续开发 | 保持独立；不作为 Phase 6 总装来源 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase3` / `cx/phase3-integrated` | 干净 | 正式纳入 | 已由线性提交链包含 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase4` / `cx/phase4-reasoning-shenlun` | 干净 | 正式纳入 | 已由线性提交链包含 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase5` / `cx/phase5-real-ai-coach` | 干净 | 正式纳入 | 已由线性提交链包含 |
| `/Users/miduoduo/Documents/xixi_gongtu-phase6` / `cx/phase6-e2e-hardening` | 审计开始前干净；此提交只加入审计/项目记忆文件 | 正式纳入 | 总装的唯一代码来源 |
| `/Users/miduoduo/Documents/xixi_gongtu/.xds/worktrees/cx-realtime-preview-v1` / `cx/realtime-preview-v1` | 干净；独立 Draft PR #20 | 继续开发 | 与六阶段产品链分开，不能因预览工具而混入总装 |

## 明确未纳入项

- 本地 SQLite、`.env`、令牌、`node_modules`、浏览器目录、临时数据库、截图/视频和新生成的运行输出均不纳入。历史提交 `8ae9ed1` 已版本化的 11 个 `output/` 3D 验收素材留在 P1—P6 的既有提交链中，本次不会新增或改写它们。
- 数量关系的 42 个解析视觉引用仍未独立审计；申论仅有 10 道材料摘要且题源不完整。这些是产品事实边界，不因总装而移除或宣称完成。
- GitHub 的审阅和合并不是 Agent 可伪造的本地证据，保留为外部待办。

## 后续验收顺序

1. 以本审计提交为起点建立干净总装分支；仅包含 P1→P6 提交链和本审计/项目记忆。
2. P6 Draft PR #21 已以 P5 为基线建立，附上本清单和端到端证据。
3. 在总装分支重跑服务端、Node、数据门禁与真实浏览器主路径/A-B 隔离。
4. 只有审阅结论、回归结果和未纳入项都写明，才可以请求合并；不得直接合并 `main`。

## 可见 Goal 阶段

| 顺序 | 任务 | 通过标准 | 当前状态 |
| --- | --- | --- | --- |
| P6I-1 | 证据审计 | 提交链、PR 状态和直接验收来源均写清 | 已验证 |
| P6I-2 | worktree 三分类 | 每个相关树都有正式纳入/继续开发/历史归档结论 | 已验证 |
| P6I-3 | 干净总装 | 新分支只包含线性阶段提交与本审计，不含临时/密钥/半成品 | 已验证 |
| P6I-4 | 总装回归 | 自动回归、数据门禁和真实浏览器主路径重新取得证据 | 已验证 |

## 停止条件

- 任何准备纳入的文件若包含数据库、密钥、临时产物、未验收半成品或来自保全脏树，立即排除并记录去向。
- 任何回归、数据门禁或真实浏览器路径失败，停止请求合并，保留失败证据并修复到所属阶段分支。
- PR 审阅或合并需要外部决定；本 Goal 可以完成审计和待审总装，但不能把尚未审阅的 PR 表述为已验收或擅自合并。

## 完成审计：总装回归证据

2026-07-13 在新建的干净 worktree `/Users/miduoduo/Documents/xixi_gongtu-phase6-integration`、分支 `cx/phase6-clean-integration` 完成复验。该树只从本审计提交链建立，未拣取任何保全脏树文件；首次进入时无 `backend/venv`，已通过仓库的 `tools/python-venv.mjs` 重建 Python 3.12 环境。

- 服务端：10 个独立测试进程共 62/62 通过（统一学习、认证、言语目录/阅读、数量、平面图推、立体图推、申论、AI 教练、题库不可用合同）。
- 页面/认证：9 个文件共 46/46 Node 测试通过；其中新增 1 项断言，保证干净 worktree 的数量流水线不再读取未提交 OCR 中间产物。
- 数据门禁：`npm run quantity:pipeline` 在没有 `output/quantity-bank/raw_sets` 时自动执行 portable approved-seed CI，验证 600 题、60 套、71 媒体、Set 28 `DABDCCBCCB`、Set 08 q7 `A-H/E` 和 42 题解析视觉未完成边界，退出码 0。
- 浏览器：在只用于验收的 8912 服务和临时 SQLite 中注册 B，言语作答后刷新显示 1/20；B 登出后注册 C，同一套题为 0/20。六条正式路由（言语、数量、平面图推、立体图推、申论、AI 教练）在 390px 与 1280px 的 `scrollWidth === clientWidth`，破图数均为 0；最终 console error/warn 为 0。
- 清理：Playwright 浏览器、8912 服务和临时 SQLite 已停止/删除；总装树 `git status --short --branch` 为空。`npm run doctor` 为 0 fail；缺少本地 `node_modules`、默认 SQLite 和未启动 8888 服务只给出预期 warning。

本地待审总装已完成。PR #15—#21 仍均未合并，外部审阅仍是后续决定，不能把这份本地回归替代为外部批准。
