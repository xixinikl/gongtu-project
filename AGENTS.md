# 公途 Agent 接手入口

本文件是所有新 Agent 进入本仓库后的项目入口。聊天摘要只能作为辅助，仓库文件才是事实源。

如果用户的个人 Agent Profile 仓库可用，先读个人偏好，再读本项目事实：

```text
https://github.com/xixinikl/xixi-agent-profile
```

本项目事实仍以当前仓库的 `AGENTS.md`、`CURRENT_STATUS.md` 和 `TASKS.md` 为准。

## 先读顺序

每次开始修改前，按顺序读取：

1. 个人 Agent Profile 的 `AGENTS.md`，如果已 clone 或可访问；
2. 当前项目 `AGENTS.md`；
3. `CURRENT_STATUS.md`；
4. `TASKS.md`；
5. `.ai_rules.md`；
6. `错误复盘.md`；
7. `doc/USER_PREFERENCES.md`；
8. `doc/ENVIRONMENT.md`；
9. `doc/CODEX_PORTABILITY.md`；
10. 与本任务相关的 README、模块文档或代码。

如果文档互相冲突，以用户当前指令、Git 事实、`CURRENT_STATUS.md`、`TASKS.md` 的当前状态为准。旧交接文档中的绝对路径可能来自旧机器，不得盲信。

## 固定启动检查

开始开发或换设备后，先运行：

```bash
npm run doctor
```

`doctor` 只做检查，不安装依赖、不删除文件。它用于判断 Node、Python、依赖、数据库和端口是否处于可开发状态。

常用本地入口：

```bash
npm run dev
python3 start_gontu.py --open
```

若本机 Python 低于 3.10，优先创建或切换 Python 3.10+ 虚拟环境，不要把代码降级成旧语法来迁就单台机器。

## 用户长期偏好

详见 `doc/USER_PREFERENCES.md`。高频原则：

- 用户希望解释具体、可执行，不要只讲抽象概念。
- 用户希望 Agent 主动读项目、主动验证、主动说明未完成项。
- 用户不希望每次换 Agent 都重新讲登录态、数据保留、审美和工作方式。
- 用户喜欢柔和、干净、长期可维护的界面，不喜欢临时 demo 感。

## 产品硬规则

凡是涉及学习记录、错题、题库、练习进度、申论历史、词库、收藏、设置等用户数据的功能，必须遵守：

- 默认要求登录。
- 后端数据归属必须从 JWT 当前用户取得，禁止相信前端传入的 `user_id`。
- 用户 A 不得看到、修改或删除用户 B 的数据。
- 登出只能清本地登录态和必要缓存，不得删除后端用户数据。
- 验收必须覆盖未登录、已登录、刷新后保留、登出后再登录、A/B 用户隔离中的适用路径。

如果新功能跳过这些规则，不得称为完成。

## 工作流硬规则

- 不直接改 `main`。
- 不使用 `git reset --hard` 或破坏性清理用户改动。
- 修改前先看 `git status --short --branch`。
- 已有脏工作区默认视为用户或前序 Agent 成果，只处理本任务相关部分。
- 未实际运行的测试不能写成已通过。
- 长时间任务结束前必须更新 `CURRENT_STATUS.md`，说明当前分支、任务、改动、验证、未完成项和下一步。
- 用户纠正了非显而易见的错误时，必须把可复用教训追加到 `错误复盘.md`。

## 换 Agent 交接格式

如果额度用完、任务暂停或需要交给下一个 Agent，在最终回复中必须给出：

```text
当前分支：
当前任务：
已改文件：
已验证：
未验证：
下一步从哪里继续：
重要注意：
```

下一个 Agent 接手时，不要凭聊天记忆继续，先读本文件和 `CURRENT_STATUS.md`。

## 全新 Codex 场景

如果用户换到一个全新的 Codex 环境，不要假设它拥有本机 `~/.codex` 里的 skills、模板或历史记忆。
跨环境事实源只能依赖仓库文件。详见 `doc/CODEX_PORTABILITY.md`。
