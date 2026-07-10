# 公途 gongtu-project Agent 接手入口

本文件是当前项目的第一入口。全局用户偏好看 `xixi-agent-profile`，本文件只记录项目事实。

## 先读顺序

1. `AGENTS.md`
2. `CURRENT_STATUS.md`
3. `TASKS.md`
4. `错误复盘.md`
5. `doc/ENVIRONMENT.md`
6. `.agent-profile.json`
7. `doc/retrospectives/` 中与任务相关的复盘
8. 与任务相关的代码和文档

## 环境检查

```bash
python -m pytest backend/tests
```

## 质量闭环

- 每日 L0 验收由 `.github/workflows/daily-acceptance.yml` 在 Asia/Shanghai 06:40 运行，报告发布到质量台。
- 验收出现失败、高风险变更或低风险自动修复候选时，workflow 会把事实写入该次质量报告的“复盘候选”。
- 每周质量回顾由 `.github/workflows/weekly-quality-review.yml` 在周一 07:10 运行；它只总结趋势和候选，不自动改产品代码或全局规则。
- 只有经周检确认、重复或高影响且可验证的项目经验，才写入 `doc/retrospectives/`；跨项目经验再提升到个人 Profile 的 `LEARNINGS.md`。

接手长期任务前，运行个人 Profile 的项目体检：

```bash
bash /path/to/xixi-agent-profile/scripts/profile-doctor.sh --project .
```

## 项目硬规则

- 修改前必须核对项目状态、Git 分支和既有未提交改动。
- 先运行 doctor；无法验证时必须明确记录阻塞和风险。
- 每日验收出现 `conditional`、`fail`、自动修复或未覆盖项时，必须写入 `doc/retrospectives/` 候选；不要把单次问题直接升级为全局规则。

## 交接格式

```text
当前分支：
当前任务：
已改文件：
已验证：
未验证：
下一步：
风险/注意：
```
