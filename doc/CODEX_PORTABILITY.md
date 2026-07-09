# 全新 Codex 接手说明

本文件解决一种更彻底的场景：不是换同一个 Codex 里的 Agent，而是换到一个全新的 Codex 环境、另一台电脑、或一个没有用户本机 `.codex` 配置的地方。

## 结论

全新 Codex 不能天然继承：

- 旧聊天记录；
- 本机 `~/.codex` 里的自定义 skill；
- 本机 `~/.codex/templates` 里的模板；
- 旧 Agent 的偏好记忆；
- Codex 内置 Python/Node 的临时状态。

全新 Codex 能稳定继承：

- Git 仓库里的文件；
- `AGENTS.md`、`CURRENT_STATUS.md`、`TASKS.md`、`错误复盘.md`；
- README、环境说明、doctor 自检脚本；
- 已提交的代码、测试、文档、脚本。

所以项目记忆必须放在仓库里。本机 `.codex` 只能作为加速模板，不能作为唯一事实源。

## 全新 Codex 第一条消息

把下面这段发给全新 Codex：

```text
这是一个长期项目，不要凭聊天摘要继续。

请先按顺序读取：
1. AGENTS.md
2. CURRENT_STATUS.md
3. TASKS.md
4. 错误复盘.md
5. doc/USER_PREFERENCES.md
6. doc/ENVIRONMENT.md
7. doc/CODEX_PORTABILITY.md

然后运行 npm run doctor，只报告环境状态，不要先修改代码。

接着告诉我：
- 当前分支是什么；
- 当前任务是什么；
- 环境是否能跑；
- 如果不能跑，是 Node、Python、依赖、数据库、端口还是其他问题；
- 下一步应该从哪里继续。

用户数据功能默认必须保留登录、登出、持久化和账号隔离。
不要覆盖未提交改动，不要使用 reset --hard，不要把未验证内容说成完成。
```

## 全新 Codex 开新项目第一条消息

如果是一个新项目，把下面这段发给全新 Codex：

```text
这是一个新长期项目。先建立项目记忆，不要先写功能。

请在仓库内创建并填写真实内容：
1. AGENTS.md
2. CURRENT_STATUS.md
3. TASKS.md
4. 错误复盘.md
5. doc/USER_PREFERENCES.md
6. doc/ENVIRONMENT.md
7. 一个只读自检命令，例如 npm run doctor 或 python scripts/doctor.py

要求：
- 文件必须进入仓库，不能只放在 ~/.codex；
- 不保留模板占位符；
- 写真实启动命令、测试命令、版本要求和数据规则；
- 用户数据功能默认必须保留登录、登出、持久化和账号隔离；
- 第一轮完成后，告诉我如何在一台新机器上检查环境并启动。
```

## 判断是否真的可迁移

一个项目只有满足下面这些条件，才算“换全新 Codex 也能接手”：

- 根目录有 `AGENTS.md`；
- 当前状态写在 `CURRENT_STATUS.md`；
- 任务和验收写在 `TASKS.md`；
- 用户偏好写在 `doc/USER_PREFERENCES.md`；
- 环境和版本写在 `doc/ENVIRONMENT.md`；
- 有一个只读环境检查命令；
- `doctor` 能区分版本、依赖、端口、数据库问题；
- 最后一个 Agent 的回复包含当前分支、已改文件、已验证、未验证、下一步。

## 个人 skill 的正确位置

`standard-project-workflow` 这类 skill 是“工作方法”，不是项目记忆。全新 Codex 没有这个 skill 时，也必须能靠仓库文件继续。

推荐优先级：

1. 仓库内 `AGENTS.md` 和项目文档；
2. 当前用户明确指令；
3. 可用时再使用个人 skill；
4. 旧聊天摘要只作参考，不作事实源。
