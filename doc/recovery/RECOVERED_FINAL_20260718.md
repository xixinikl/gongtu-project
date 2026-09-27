# 公途跨电脑最终版本救援记录（2026-07-18）

## 结论

本分支保存的是用户从另一台 Mac 带回并在浏览器中亲自确认的公途最终功能版本快照。它的首要目的不是立即合并到 `main`，而是先把未提交成果安全保存到 GitHub，避免继续开发管理员/VIP功能时再次丢失或混淆版本。

当前救援分支：`rescue/recovered-final-20260718`

基线分支：`cx/phase6-e2e-hardening`

基线提交：`dd2c032e6dd9f8e02a585847aa3ea4e544acb75b`

原工作树分支：`cx/unified-v3-experience-repair`

## 来源与原件保护

- 用户从另一台 Mac 复制的归档：`归档.zip`。
- 归档 SHA-256：`078c5de70a29ddb646150566feccbcf3d91f1c6e424e5442dc3909eaf7ea202f`。
- 归档完整性检查：`unzip -tq` 通过，无压缩错误。
- 发布时使用新的 Git 克隆承接文件，没有修写原归档，也没有在原损坏工作树上提交。
- 旧工作树的 `.git` 文件仍指向旧电脑的 `/Users/miduoduo/...`，因此不能直接作为可靠发布工作树；救援分支通过远端基线的新克隆重建。

## 用户已确认的页面

### 首页

- 文件：`doc/prototypes/homepage-middle-ink-morph.html`
- SHA-256：`7e0b9eb1513727e084f03dc138c44a8c6ac69050183ec7b0db2a771255ab30e6`
- 用户确认特征：水墨聚散中段、五章内容、学习证据、空间几何与结尾 CTA。
- 当前边界：它仍是原型路径，尚未正式接到后端 `/` 与功能页 `/app` 的完整往返链路。

### 主功能页

- 文件：`智学成语-高级版.html`
- SHA-256：`4df01b6b7a944b02f8d398aecd475d39756ad22dc6467d9f32ae2f8baa938b31`
- 正式入口：`/app`
- 用户确认特征：言语、数量关系、图形推理、申论批改、AI教练；数量“全部题型 / 易忘攻克 / 步骤填空 / 题型识别”；统一米白金色学习面板。

### 申论页

- 文件：`shenlun.html`
- SHA-256：`e76439397cf8bc741cb6a051c18bd1adf681169dc1fc4df0abc4f8a8e9005d98`
- 正式入口：`/shenlun`
- 用户确认特征：完整题目、批改与问答、问题追踪、Word/PDF 导出。

### AI 后端

- 关键文件：`backend/ai_coach.py`
- SHA-256：`43fa85327d1325aabe37e8407d43dfbeebd3c2d86b1af53b3098e4fbe6589170`
- `.env` 没有进入救援工作树；AI 预览通过归档中旧工作目录的本机配置临时加载。
- 任何后续提交都不得上传 DeepSeek 密钥。

## 2026-07-18 实际验证证据

验证使用 Python 3.11 隔离环境与独立 SQLite 数据库副本，不修改找回的原始 `backend/data.db`。

- `GET /`：200。
- `GET /app`：200。
- `GET /shenlun`：200。
- `GET /doc/prototypes/homepage-middle-ink-morph.html`：200。
- `POST /api/auth/register`：200，返回 JSON。
- `POST /api/auth/login`：200，返回 JSON。
- `GET /api/auth/me`：200，返回当前用户 JSON。
- AI Coach 创建线程：201。
- AI Coach 发送消息：201。
- DeepSeek run：`provider=deepseek`、`model=deepseek-chat`、`status=completed`、`error_code=None`。
- 实际 AI 验证回复：`AI连接正常`。
- Node 24 全量前端/几何测试：665/665 通过。
- Python 关键后端测试按文件独立运行：55/55 通过（AI Coach 15、Skill Registry 6、思维导图 3、数量 5、申论 15、空间学习 3、片段阅读 8）。
- 项目 `npm run doctor`：0 fail；仅提示数据库尚未初始化、预览端口未启动和工作树待提交。
- `git diff --check`：通过。

说明：本记录确认“找回的版本能够运行、关键入口与 AI 可用、Node 665 项全部通过”；Python 本次重跑的是与救援改动最相关的 55 项，不等于重新执行仓库历史上的每一个 Python 测试文件。

## 本次救援快照包含什么

- 原工作树全部已跟踪修改。
- 原工作树中未提交的首页、统一外壳、数量训练、AI接线、Skill、验收文档、目标文档和必要图片/字体资源。
- 原工作树中的项目状态文件和测试文件。

## 明确排除的内容

以下内容不得上传，且不属于代码救援快照：

- `.env`、API Key、Token 和其他秘密。
- `backend/data.db`、WAL/SHM 和预览数据库。
- `.xds/`、虚拟环境、日志和本机运行状态。
- `node_modules/`、`backend/venv/`。
- 用户上传的 `backend/data/mindmap-images/2/1/question.png`。
- 原始 `归档.zip`。
- 另一工作树中尚未完成并存在冲突的管理员/VIP整批改动。

## 管理员/VIP功能边界

- 本救援工作树中已有的 `admin.html` 视觉收口属于该工作树快照，随本分支保存。
- 另一工作树 `cx/homepage-cinematic-plan` 中还有未完成的认证、管理员、VIP/积分冲突改动；它们没有整批并入本救援分支。
- 管理员/VIP后续必须从本救援分支新建独立分支，按文件和功能逐项迁移、逐项测试，禁止整目录覆盖。

建议后续分支：`agent/admin-vip-finalization`

## 下一步顺序

1. 先确认本救援分支已在 GitHub 可见并保留 Draft PR 作为差异入口。
2. 在救援分支的后续独立分支中，把确认的水墨首页正式接到 `/`，CTA 接到 `/app`，并验证“首页 → 功能页 → 返回首页”。
3. 首页链路稳定后，从救援分支创建管理员/VIP独立分支。
4. 只读盘点 `cx/homepage-cinematic-plan` 和未完成 handoff 中的管理员/VIP改动，再选择性迁移。
5. 完成认证、普通用户、管理员、VIP/积分、刷新持久化和 A/B 用户隔离验证后，才允许申请合并。

## 新电脑或新 Agent 的接手命令

```bash
git clone https://github.com/xixinikl/gongtu-project.git
cd gongtu-project
git fetch origin
git switch --track origin/rescue/recovered-final-20260718
cat AGENTS.md
cat doc/recovery/RECOVERED_FINAL_20260718.md
```

接手时应先复核关键文件 SHA-256，再进行任何合并或覆盖操作。

## 交接摘要

```text
当前项目：公途 gongtu-project
当前分支：rescue/recovered-final-20260718
当前任务：保护另一台 Mac 找回并由用户确认的最终首页与功能页版本
已改文件：原 cx/unified-v3-experience-repair 工作树的完整未提交代码快照，加本恢复记录
已验证：首页、/app、/shenlun、注册、登录、当前用户、真实 DeepSeek AI
未验证：本救援提交尚未重新执行历史全部测试；首页尚未正式接到 /；管理员/VIP冲突改动尚未迁入
下一步：先完成首页正式接线，再从救援分支新开管理员/VIP独立分支
风险/注意：不得提交 .env、数据库、用户上传图片或整批覆盖其他工作树
```
