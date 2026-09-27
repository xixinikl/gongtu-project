# 公途 — 通用开发规范与学习路线

> 这份文档定义两类通用约定：
> 1. **我们要去哪**：从一个人写代码进化到工业化开发的学习路线
> 2. **日常怎么干活**：Git 纪律、CI 体系、环境配置、红线
>
> AI 协作者的任务状态、逐任务提交、质量门禁和空间几何专项规则，以项目根目录的
> [`.ai_rules.md`](../.ai_rules.md) 为最高仓库规则。
> 项目本身是什么、有哪些功能、怎么跑起来，看 [README.md](../README.md)。

---

## 零、规则体系与优先级

本文件保留已有项目经验，作为所有开发者都应遵循的通用规范；它不再承担 AI 执行章程的职责。

规则冲突时按以下顺序处理：

1. 用户当前明确指令。
2. 项目根目录 `.ai_rules.md`。
3. 本文件 `doc/PROJECT_RULES.md`。
4. `README.md` 和其他模块文档。

新需求改变工作方式时，必须先把变更写入 `.ai_rules.md` 和 `TASKS.md`，再开始修改业务代码。旧规则不得通过口头约定静默覆盖，新旧规则冲突必须留下版本记录。

空间几何实验室的全部任务统一登记在根目录 `TASKS.md`，当前执行证据记录在 `CURRENT_STATUS.md`。任务状态、文件数量、验收、提交和推送要求均以 `.ai_rules.md` 为准。

---

## 一、学习路线：走向工业化开发

目标不是"把功能做完"，而是掌握一套**专业团队级别的工程流程**。

```
一个人写代码 ──→ 版本控制 ──→ 自动检查 ──→ 自动测试 ──→ 自动发布
                                                          │
                                    多端交付（Web + 桌面 + 手机 + 小程序）
```

| 阶段 | 学什么 | 状态 | 产出 |
|------|--------|------|------|
| 1. 版本控制 | Git 分支、PR、Code Review | ✅ 完成 | PR #1，feature/desktop-app 分支 |
| 2. CI 自动检查 | Ruff + mypy + Bandit | ✅ 完成 | `.github/workflows/check.yml`，三个机器人 |
| 3. 项目架构分离 | 核心逻辑与 UI 解耦 | ✅ 完成 | `backend/` 独立，`desktop/` 套壳 |
| 4. 桌面端 App 化 | Electron 打包原生应用 | ✅ 完成 | `desktop/main.js`，Dock 独立窗口 |
| 5. **自动化测试** | pytest 写测试用例 | ⬜ 下一步 | CI 加测试步骤 |
| 6. **云端开发环境** | GitHub Codespaces | ⬜ 待做 | 浏览器里写代码，环境一致 |
| 7. **自动打包发布** | CI 构建 .dmg / .apk | ⬜ 远期 | 推代码 → 自动出安装包 |
| 8. 手机端 + 小程序端 | 移动端 / 小程序适配 | ⬜ 远期 | `mobile/`、`miniapp/` 目录 |

### 为什么测试是下一站

现在的 CI 只能查"代码写没写错"（风格、类型、安全），查不了"功能对不对"。pytest 接手后者。

---

## 二、Git 纪律

```
main ────── ●────── ● 稳定版本
  │
  └── feature/xxx ── ●── ●── PR ──→ main
```

- **永远不动 main**：开发和修复都在分支上
- **分支命名**：`feature/xxx`、`fix/xxx`
- **提交格式**：`类型: 中文描述`（`fix:` / `feat:` / `ci:`）
- **必须走 PR**：Push → 开 PR → 等 CI 全绿 → Merge
- **多端共存**：网页版（根目录）、桌面版（`desktop/`）、手机版（`mobile/`）、小程序版（`miniapp/`）同在 main，目录隔离
- **平台适配走独立分支**：macOS / Windows 兼容性改动必须开新分支（如 `feature/windows-compat`），PR 合并前确保两端启动入口互不破坏
- **Git ≠ GitHub**：Git 管版本，GitHub 管协作

---

## 三、CI 检查体系

每次 PR 和 push 到 main，三个机器人同时跑：

| 机器人 | 工具 | 保护什么 | 命令 |
|--------|------|----------|------|
| 静态检查 | Ruff | 未使用变量、import 位置 | `ruff check backend/ --select=E,F --ignore=E501` |
| 类型检查 | mypy | 参数类型、返回值类型 | `mypy backend/ --ignore-missing-imports --follow-imports=skip --disable-error-code var-annotated` |
| 安全检查 | Bandit | SQL 注入、硬编码密钥 | `bandit -r backend/ -ll --exclude '**/venv/**'` |

工作流文件：`.github/workflows/check.yml`

### 豁免项（有意放过的规则）

- **E501**：中文注释超长，忽略
- **var-annotated**：`get_db()` 返回的 `conn` 暂未加类型声明
- **venv/**：不扫第三方依赖
- **`# nosec B608`**：SQL 拼接中字段名来自 Pydantic 模型定义，非用户输入

### 加新机器人的标准

不是为了凑数。必须回答：这个机器人保护了什么现有机器人保护不了的东西？

---

## 四、跨平台开发约定

> 公途同时服务 macOS 和 Windows 用户。后端代码跨平台通用，启动入口按平台分离。

| 平台 | 启动入口 | 说明 |
|------|----------|------|
| macOS | `公途启动.command` | 双击启动，依赖 venv 环境 |
| Windows | `公途启动.bat` | 双击启动，自动检查/安装依赖 |
| 通用 | `start_gontu.py` | 命令行启动，跨平台 |

### 开发纪律

1. **不改对方入口**：改 `.command` 别碰 `.bat`，反之亦然
2. **路径用 `os.path.join`**：严禁硬编码 `/Users/` 或 `C:\Users\`
3. **依赖写进 `requirements.txt`**：缺依赖会导致另一端首次运行崩溃
4. **`.gitignore` 含两端垃圾文件**：`.DS_Store`（mac） + `Thumbs.db` / `Desktop.ini`（Win）

---

## 五、环境陷阱

| 陷阱 | 症状 | 正确做法 |
|------|------|----------|
| `pip` 不在 PATH | `command not found` | 用 venv 路径 |
| `node` 不在 PATH | `command not found` | `/usr/local/bin` 加到 PATH |
| npm `allow-scripts` | 安装卡住 | `--ignore-scripts` 绕过 |
| Electron 找不到 uvicorn | `No module` | `main.js` 写 venv 绝对路径 |
| Token 没勾 workflow | CI 不触发 | Token 勾 `repo` + `workflow` |
| `ruff --fix` 改了多个文件 | 提交不全，CI 还红 | 跑完 `ruff --fix` 立刻 `git status` |

| Windows 缺 `.bat` | 用户找不到启动方式 | `公途启动.bat` 已创建，随版本维护 |

**venv 绝对路径**：
```
/Users/xixi/Workbuddy/2026-06-28-19-13-40/venv/bin/python
/Users/xixi/Workbuddy/2026-06-28-19-13-40/venv/bin/pip
/Users/xixi/Workbuddy/2026-06-28-19-13-40/venv/bin/ruff
```

---

## 六、红线

- **不擅自改文件**：先征求确认
- **不在 main 开发**：功能分支 → PR → CI → Merge
- **不提交敏感文件**：`.env`、`data.db`、`venv/` 不入库
- **不用系统 pip/python**：始终走 venv
- **不跳过 CI 红叉**：红了先修
- **不假设权限**：Token 问题引导用户操作

---

## 七、用户画像（给 AI 协作者看）

- 编程初学者，目标是掌握专业开发流程
- 喜欢比喻和童话解释概念，操作要具体命令
- UX 必须闭环，浅色柔和配色
- 常说"你看看"= 帮分析截图，"都有问题"= 全红了挨个修，"怎么推"= 帮 push

---

## 八、关键文件

| 文件 | 干什么 |
|------|--------|
| `README.md` | 项目门面 |
| `backend/main.py` | API 入口 |
| `backend/database.py` | 数据库（`get_db()`） |
| `backend/src/grader.py` | LLM 调用 |
| `backend/.env` | API 密钥（不入库） |
| `desktop/main.js` | Electron 启动 |
| `.github/workflows/check.yml` | CI 流水线 |
| `doc/PROJECT_RULES.md` | 本文件 |
| `公途启动.bat` | Windows 一键启动 |
| `公途启动.command` | macOS 一键启动 |

---

> 最后更新：2026-06-29 · 随项目成长持续修订
