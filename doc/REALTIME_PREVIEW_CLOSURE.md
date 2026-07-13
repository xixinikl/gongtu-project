# PR #20 实时预览收口 Goal

> **唯一权威**：本文件是 `realtime-preview-closure` Goal 的唯一权威入口。PR 状态、提交边界、验证、基线失败归属和外部权限/审阅决策均以本文为准。
>
> **更新时间**：2026-07-13
>
> **工作树**：`/Users/miduoduo/Documents/xixi_gongtu/.xds/worktrees/cx-realtime-preview-v1`

## 当前事实

- [PR #20](https://github.com/xixinikl/gongtu-project/pull/20) 为 open Draft，基线 `cx/real-verbal-quantity-integration`，远端头 `cx/realtime-preview-v1`，`mergeStateStatus=CLEAN`；没有 GitHub checks 或 reviews。
- PR 远端只包含 `755cb96 feat: add isolated full-stack live preview`。
- 本地 `cx/realtime-preview-v1` 干净、领先远端一个提交：`0aae184 ci: verify realtime previews`。该提交只新增 `.github/workflows/realtime-preview-ci.yml`，没有修改产品代码或现有测试。
- 2026-07-13 实际 `git push` 已给出精确拒绝：OAuth App 不允许创建或更新 `.github/workflows/realtime-preview-ci.yml`，因为 token 缺少 GitHub `workflow` scope。远端未改变；这不是代码运行卡死。

## 范围

- 验证 `0aae184` 的实时预览合同、启动器语法与工作流声明。
- 记录本地与远端提交差异以及 PR #20 的检查、评论、审阅和权限状态。
- 将完整基线的失败精确分离为预览提交引入或预先存在的问题。

## 非范围

- 不自行修改 OAuth token、替换凭证或绕开 GitHub 权限来推送。
- 不把 Phase 1—6 主线、`backend/.env.example` 缺失或登录安全回跳修复混进 #20。
- 不自行标记 PR Ready、不批准、不合并。

## 开 Goal 提示

“继续 `realtime-preview-closure`：先读取本文件与 `git status --short --branch`。使用 Node 24 运行预览合同和启动器检查；保留 #20 仅含预览变更的边界。若 GitHub 写入权限仍不足，只记录停止条件，不改凭证、不伪称 CI 已运行。”

## 阶段

1. **RTP-1 盘点**：核对 #20、`755cb96`、`0aae184` 与 GitHub 评论。
2. **RTP-2 验证**：重跑 `node --test tests/realtime-preview-contract.test.mjs`、`node --check tools/realtime-preview.mjs` 和 `python3.11 -m py_compile backend/start_server.py`。
3. **RTP-3 路由**：确认 `0aae184` 只新增工作流；完整 `npm run test:geometry` 的两项失败不由它引入。
4. **RTP-4 外部决策**：等待具有 GitHub `workflow` scope 的用户/凭证推送 `0aae184`，随后由 GitHub 触发该工作流；Ready、审阅和合并仍由用户/仓库流程决定。

## 证据

- 2026-07-13 GitHub 只读查询：#20 open、Draft、CLEAN，0 checks、0 reviews、1 条权限跟进评论；远端 head 为 `755cb96`。
- `git status --short --branch`：本地 `cx/realtime-preview-v1` 干净且 `[ahead 1]`；`git diff --name-status origin/cx/realtime-preview-v1..HEAD` 仅有新增工作流文件。
- Node 24：`node --test tests/realtime-preview-contract.test.mjs` 3/3 通过；`node --check tools/realtime-preview.mjs` 通过；`python3.11 -m py_compile backend/start_server.py` 通过。
- Node 24：`npm run test:geometry` 有两项失败，分别是 `backend/.env.example` 缺失（`tests/verbal-reading-ai-phase0.test.mjs`）和 `login.html` 缺少 `safeNextPath`（`tests/verbal-reading-phase1-ui.test.mjs`）。它们位于 `0aae184` 的 diff 之外，故不得宣称为预览提交回归或已修复。
- 2026-07-13：`git push origin cx/realtime-preview-v1` 被 GitHub 拒绝：`refusing to allow an OAuth App to create or update workflow .github/workflows/realtime-preview-ci.yml without workflow scope`。随后的 `gh pr view 20` 仍显示远端 head `755cb96`、0 checks。

## 停止条件

当出现任一条件时保持 RTP-4 进行中：

1. GitHub OAuth token 或连接 App 仍没有更新工作流所需的 `workflow` scope；
2. 需要将 PR 标记 Ready、批准、合并或关闭；
3. 审阅要求改变预览功能以外的产品代码；
4. 用户明确要求将两个基线失败另建所属分支的修复 Goal。

## 完成审计

本 Goal 只有在 `0aae184` 已被有权限的流程推送、GitHub 工作流对该提交产生可复查结果、所有实际审阅反馈已在正确分支处理，且用户/仓库流程明确处置 Ready、批准或合并后，才能完成。在此之前，RTP-4 保持可见，不能以本地 3/3 通过代替远端 CI。
