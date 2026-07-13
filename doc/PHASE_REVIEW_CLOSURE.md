# Phase 1—6 外部审阅与合并收口 Goal

> **唯一权威**：本文件是 `phase-review-closure` Goal 的唯一权威入口。PR 状态、反馈、验证、外部决策和停止条件均以本文为准。
>
> **更新时间**：2026-07-13
>
> **当前分支**：`cx/phase6-e2e-hardening`

## 当前事实

2026-07-13 通过 GitHub 只读查询核对，六阶段 PR 链均为 open、`mergeStateStatus=CLEAN`，没有 GitHub 检查、审阅记录或可执行评论。

| 阶段 | PR | 状态 | 当前结论 |
| --- | --- | --- | --- |
| Phase 1 | [#15](https://github.com/xixinikl/gongtu-project/pull/15) | 非 Draft，CLEAN | 可供外部审阅；尚无审阅或检查。 |
| Phase 2 | [#16](https://github.com/xixinikl/gongtu-project/pull/16) | 非 Draft，CLEAN | 可供外部审阅；尚无审阅或检查。 |
| Phase 3 | [#17](https://github.com/xixinikl/gongtu-project/pull/17) | Draft，CLEAN | 本地验收已记录，等待审阅前的外部决定。 |
| Phase 4 | [#18](https://github.com/xixinikl/gongtu-project/pull/18) | Draft，CLEAN | 本地验收已记录，等待审阅前的外部决定。 |
| Phase 5 | [#19](https://github.com/xixinikl/gongtu-project/pull/19) | Draft，CLEAN | 本地验收已记录，等待审阅前的外部决定。 |
| Phase 6 | [#21](https://github.com/xixinikl/gongtu-project/pull/21) | Draft，CLEAN | 干净总装回归已记录，等待审阅前的外部决定。 |

PR #20 是独立的实时预览工具，不属于 Phase 1—6 线性链。它为 Draft、CLEAN，有一条说明 OAuth 写入权限不足的跟进评论；它将在本 Goal 停止或完成后作为下一条独立 Goal 处理，不混入阶段审阅或合并。

## 范围

- 持续读取并记录 PR #15—#21 的检查、评论、审阅和合并状态。
- 将实际收到的可执行反馈精确路由至所属阶段分支，修复后运行与反馈相称的验证并更新 PR。
- 提供可供用户或审阅者做出 Ready、批准、合并决定的清晰清单。

## 非范围

- 不自动标记 PR Ready、不自行批准、不合并任何 PR，也不直接修改 `main`。
- 不因没有 GitHub 检查而伪称 CI 已通过；本 Goal 只记录现有状态和已在阶段审计中存在的本地证据。
- 不处理 PR #20 的实时预览实现、OAuth 写入权限或其基线失败；这些留给独立后续 Goal。
- 不重新运行与新增审阅反馈无关的整套 Phase 1—6 回归。

## 开 Goal 提示

“继续 `phase-review-closure`：先读取本文件和 `CURRENT_STATUS.md`，再只读核对 PR #15—#21。处理实际新增的可执行反馈时，只在对应阶段分支修改并复验；未经用户明确授权，不将 PR 标记 Ready、不批准、不合并。”

## 阶段

1. **PRC-1 盘点**：记录 PR #15—#21 的分支链、Draft、检查、评论、审阅和合并状态。
2. **PRC-2 审阅清单**：明确反馈归属、验证边界和外部决策；将 #20 标为独立后续事项。
3. **PRC-3 反馈处理**：对每条新增可执行反馈在所属分支修复、复验并更新证据；当前基线为零待处理反馈。
4. **PRC-4 外部决策等待**：保持本 Goal 可见，等待用户/审阅者决定何时将 Draft PR 转为 Ready、何时批准或合并。

## 证据

- 2026-07-13：`gh pr view 15…21 --repo xixinikl/gongtu-project --json ...`。#15—#21 无 checks、无 reviews；#15—#19/#21 无 comments；#20 有一条非主线权限跟进评论。
- Phase 6 总装与六阶段本地验证：`doc/PHASE6_COMPLETION_AUDIT.md`。
- 各阶段当前事实：`CURRENT_STATUS.md`。

## 停止条件

当任一条件出现时暂停自动处理并保留当前任务：

1. 需要把 PR 标记 Ready、批准、合并、关闭或重写历史；
2. 审阅反馈要求跨多个阶段重构、迁移、删除数据或改变产品范围；
3. GitHub 权限、检查配置或外部服务状态阻止验证；
4. 用户明确切换到 PR #20 或其他独立工作。

## 完成审计

本 Goal 只有在 PR #15—#21 的所有实际审阅反馈均已处理并验证，且用户或仓库审阅流程已明确处理每个 PR 的 Ready/批准/合并结论后，才能标记完成。若外部审阅尚未发生，则保持 PRC-4 进行中，不能以“没有反馈”代替批准。
