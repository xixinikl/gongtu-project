# 公途 — Windows 桌面版任务看板

> 创建时间：2026-06-29
> 当前分支：`feature/windows-compat` → PR #2 已合并 main
> 目标：让公途学习平台在 macOS 和 Windows 上都能跑，代码跨平台但不搞混

---

## 一、整体目标

```
网页版（已完成） + macOS 桌面壳（已完成）
          ↓
   Windows 也能跑（本次任务）
          ↓
   两端自动打包 .dmg / .exe（远期）
```

| 阶段 | 目标 | 状态 |
|------|------|------|
| 1 | macOS 桌面 Electron 壳 | ✅ 已合并 main (PR #1) |
| 2 | Windows 启动入口 + 依赖适配 | ✅ 已完成 |
| 3 | Electron 跨平台化（去硬编码） | ✅ 已完成 |
| 4 | CI/CD 在三道机器人下全绿 | ✅ 已合并 main (PR #2) |
| 5 | Windows 上实际跑通验证 | ✅ CI 自动验证通过 (PR #3) |
| 6 | 两端自动打包 .dmg + .exe | ⬜ 远期 |

---

## 二、任务清单

### ✅ 已完成

- [x] **P0-1：创建 `公途启动.bat`**
  - Windows 双击启动，自动检查 Python + 安装依赖
  - 文件：`公途启动.bat`（912 字节）
  - 提交：`08d23cf`

- [x] **P0-2：补全 `requirements.txt`**
  - 新增 `python-dotenv==1.1.0`、`openai==1.82.0`
  - 修复 Windows 上 `pip install -r requirements.txt` 后申论功能崩溃
  - 提交：`08d23cf`

- [x] **P1-1：`.gitignore` 加 Windows 条目**
  - `Thumbs.db`、`Desktop.ini`
  - 提交：`08d23cf`

- [x] **P1-2：`start_gontu.py` 加 Windows `--bg` 警告**
  - 传 `--bg` 时提示"Windows 暂不支持后台模式，将以前台运行"
  - 提交：`08d23cf`

- [x] **P2-1：`desktop/main.js` 去硬编码路径**
  - 原：`/Users/xixi/Workbuddy/.../python`（只能你的 Mac 跑）
  - 改：`process.platform` 自动检测 → Win 用 `python`，Mac 优先项目 venv
  - 提交：`f441374`

- [x] **P2-2：`desktop/package.json` 加 Windows 打包**
  - 新增 `build:win`（NSIS 安装包 + portable 便携版）
  - 新增 `build:all`（两端一起打）
  - 提交：`f441374`

- [x] **P3-1：`PROJECT_RULES.md` 写入跨平台规则**
  - 第4章：平台启动入口分离、路径禁用硬编码、分支隔离纪律
  - 提交：`da00995`

- [x] **P3-2：`tests/test_cross_platform.py` 自动化验证**
  - 16 项检查：package.json 结构、main.js 无硬编码、.bat 完整性、main 分支保护
  - 全部 16/16 通过
  - 提交：`7748d34`

- [x] **CI：`.github/workflows/check.yml` 加 `workflow_dispatch`**
  - 支持手动触发
  - 提交：`f0a8286`

- [x] **PR #2 已开 → 已合并 main**
  - https://github.com/2082743849-beep/gongtu-project/pull/2
  - CI 自动触发 Ruff + mypy + Bandit
  - 三道全绿 ✅ 合并

- [x] **CI 三道机器人通过**
  - Ruff 静态检查 ✅
  - mypy 类型检查 ✅
  - Bandit 安全检查 ✅

- [x] **P4-1：Windows CI 集成测试 (PR #3)**
  - GitHub Actions `windows-latest` 上自动验证
  - 依赖安装 → 8 模块导入 → 语法检查 → 服务启动 & /api/health 响应
  - 全部 4/4 通过，补充 `python-multipart` 到 requirements.txt
  - Workflow：`.github/workflows/windows-test.yml`
  - 测试脚本：`tests/test_windows_ci.py`
  - 提交：`911d4a5`

---

### ⬜ 待做

- [ ] **P0-3：你在 Windows 上实际测试**
  - 装 Python 3.10+ 和 Node.js
  - 双击 `公途启动.bat`，确认浏览器打开 `localhost:8888`
  - 测试桌面壳：`cd desktop && npm install && npm start`

- [ ] **P2-3：清理 `start_server.py`**
  - 该文件硬编码了 Windows 的 `venv/Scripts/python.exe`，在 Mac 上不可用
  - 建议废弃，统一用 `start_gontu.py`

- [ ] **P2-4：清理 `_verify.js`**
  - 硬编码了别人的 Windows 桌面路径，完全不可用
  - 删除或改为相对路径

- [ ] **P3-3：清理 `desktop/node_modules/` 残留**
  - 当前 307 个文件，含 macOS 专属的 `@electron/osx-sign`、`@electron/notarize`
  - 建议 `.gitignore` 忽略，或在 Windows 上重新 `npm install`

- [ ] **远期：自动化测试（pytest）**
  - 当前 CI 只查代码风格/类型/安全，不查功能对不对
  - 学习路线第5阶段

- [ ] **远期：自动打包 .dmg + .exe**
  - macOS：`npm run build:mac` → `dist/公途-1.0.0.dmg`
  - Windows：`npm run build:win` → `dist/公途 Setup 1.0.0.exe`

---

## 三、当前分支全貌

```
main
  │
  ├── PR #1 (已合并) — feature/desktop-app
  │     Electron 桌面壳 + CI 三道机器人 + 项目文档
  │
  └── PR #2 (审查中) — feature/windows-compat ← 当前
        公途启动.bat   requirements.txt    .gitignore
        start_gontu.py   desktop/main.js   desktop/package.json
        doc/PROJECT_RULES.md   tests/test_cross_platform.py
        .github/workflows/check.yml
```

---

## 四、规则铁律（写在 PROJECT_RULES.md 里了）

1. **macOS / Windows 兼容性改动必须走独立分支**，不在 main 上直接改
2. **不改对方入口**：改 `.command` 别碰 `.bat`，反之亦然
3. **路径用 `os.path.join`**，严禁硬编码 `/Users/` 或 `C:\Users\`
4. **依赖写进 `requirements.txt`**，缺依赖会导致另一端崩溃
5. **`.gitignore` 含两端垃圾文件**：`.DS_Store` + `Thumbs.db` + `Desktop.ini`

---

> 更新于 2026-06-29 · 每完成一项打勾并提交
