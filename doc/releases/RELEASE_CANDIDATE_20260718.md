# 公途发布候选说明 · 2026-07-18

## 唯一候选

- 候选标签：`gongtu-rc-20260718.1`
- 候选分支：`agent/admin-vip-console`
- 增量 PR：[#24](https://github.com/xixinikl/gongtu-project/pull/24)，基线为已验收的 `agent/homepage-app-link`
- 正式入口：首页 `/`、功能页 `/app`、申论 `/shenlun`、管理端 `/admin`
- 本文件和标签共同标记候选版本；不得再从旧电脑压缩包、其他本地目录或历史分支拼装发布文件。

该候选是“可继续内测的完整版本”，不是已经部署的生产收费版本。当前不会接入真实支付，也不会启用 VIP 扣点。

## 已包含

- 用户确认的水墨首页、正式功能页、申论页及双向导航。
- 登录、注册、账号数据隔离与持久化。
- 言语、数量、图推、申论和 AI 教练现有学习路径。
- 内嵌问西西的小面板与可拖动、锁定、缩放、还原悬浮窗。
- 统一管理员入口、用户概览、管理员授权、VIP 到期日与 AI 积分资料、访问策略预设。

## 明确未包含

- 没有正式支付、订单、退款或发票流程。
- 没有真正执行 AI 积分扣减、失败返还和消费流水。
- 当前首个账号自动成为管理员，只适合隔离内测；公开注册前必须改为显式初始化管理员。
- 当前仍是本地 SQLite 方案，尚未完成公网部署、生产监控和自动备份。
- 相对 `main` 的历史分支链尚未直接合并；本次先让增量 PR 具备独立 CI 证据，避免一次性处理 196 个提交。

## 可复现验收

项目运行环境以 `.xixi-dev-system.json`、`.python-version`、`package-lock.json` 和 `backend/requirements.txt` 为准。

```bash
"${CODEX_HOME:-$HOME/.codex}/bin/xixi-dev-system" doctor --project .
npm run doctor
npm ci --ignore-scripts --no-audit --no-fund
npm run test:geometry
uvx ruff check backend/ --select=E,F --ignore=E501
uvx mypy backend/ --exclude 'backend/venv' --ignore-missing-imports --follow-imports=skip --disable-error-code var-annotated
uvx bandit -r backend/ -ll --exclude '**/venv/**'

for test_file in tests/test_*.py; do
  backend/venv/bin/python "$test_file"
done
```

本轮本地基线：doctor 0 fail；Node 672/672；Python unittest 87 项及脚本型检查通过；mypy 26 个后端文件、Ruff 和 Bandit 中高危门禁通过。GitHub Actions 必须出现并完成 `frontend-check`、`backend-tests`、`lint`、`type-check` 和 `security`。

## SQLite 升级与恢复

VIP 相关字段属于启动时幂等迁移。第一次以候选版启动真实数据库前，必须停掉后端并做整库备份；不要只导出部分表。

备份步骤：

```bash
mkdir -p backend/backups
sqlite3 backend/data.db "PRAGMA wal_checkpoint(FULL);"
release_stamp=$(date +%Y%m%d-%H%M%S)
cp -p backend/data.db "backend/backups/data-before-${release_stamp}.db"
sqlite3 "backend/backups/data-before-${release_stamp}.db" "PRAGMA integrity_check;"
```

最后一条必须返回 `ok`。备份目录已被 Git 忽略，不得提交真实用户数据库。

如果升级后需要恢复：先停止后端，保留故障库用于排查，再把选定备份复制为新文件并原子替换；同时移走旧库的 `-wal` / `-shm` 文件，最后再次检查完整性。恢复会回到整个备份时点，不能只回滚 VIP 三个字段。

`tests/test_database_migration.py` 使用临时旧库证明三件事：旧用户资料在升级后保留、重复运行迁移不会重复破坏数据、停服整库备份能够恢复升级前的 schema 与用户资料。测试不接触 `backend/data.db`。

## 合并与发布停止条件

以下任一项未满足，候选版本都不能称为正式发布：

- PR #24 的五项 GitHub 检查没有全部通过。
- 工作区或远端分支不再与候选标签一致。
- 数据库备份没有通过 `PRAGMA integrity_check`。
- 用户尚未决定如何处理 Phase 1—6 历史 PR 链与 `main` 的 35 个后续提交。
- 公开注册前尚未完成管理员安全初始化、限流、审计和自动备份。
