# 公途（GongTu）— 考公学习平台

一站式备考工具，覆盖行测与申论核心板块。从网页版起步，正在向桌面端、手机端、小程序端延伸。

---

## 功能

| 模块 | 说明 |
|------|------|
| 成语板块 | 成语学习与练习 |
| 数量板块 | 数量关系专项训练 |
| 图推思维导图 | 图形推理知识点可视化梳理，支持拖拽编辑 |
| 申论板块 | AI（DeepSeek）模拟阅卷老师评分 + "飞扬老师"角色对话辅导 |
| 管理员端 | 后台管理：题库维护、用户管理、数据统计 |

---

## 架构

```
┌──────────┐     ┌──────────────────┐     ┌─────────┐
│  网页前端  │────▶│                  │────▶│ SQLite  │
│  HTML/JS  │     │  FastAPI :8888   │     │ data.db │
└──────────┘     │  backend/main.py │     └─────────┘
                 │                  │
┌──────────┐     │                  │     ┌──────────────┐
│ Electron │────▶│                  │────▶│ DeepSeek API │
│ 桌面窗口  │     └──────────────────┘     │  (AI 批改)   │
└──────────┘                               └──────────────┘

┌──────────┐     ┌──────────────────┐
│  手机端   │     │   微信小程序      │
│  (未来)   │     │   (未来)          │
└──────────┘     └──────────────────┘
```

- **网页端**：原生 HTML/JS 单页应用，项目根目录
- **桌面端**：Electron，`desktop/main.js` 启动 Python 后端 + 原生窗口
- **手机端**：待开发（计划 `mobile/` 目录）
- **小程序端**：待开发（计划 `miniapp/` 目录）
- **后端统一**：四端共享同一套 FastAPI，只换壳不换核

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端框架 | FastAPI（Python） |
| 前端 | 原生 HTML + CSS + JavaScript |
| AI | DeepSeek（OpenAI 兼容接口） |
| 数据库 | SQLite |
| 桌面端 | Electron |
| CI/CD | GitHub Actions（Ruff + mypy + Bandit） |

---

## 快速开始

### 立体图推 / 静态训练页

```bash
npm run dev
```

浏览器打开 `http://127.0.0.1:8089/three-view-training.html`。`npm run dev` 会先检查 `8089`，没启动就自动后台启动静态服务；运行状态可用 `npm run dev:status` 查看，必要时用 `npm run dev:stop` 停止。

### 后端版主站

```bash
# 1. 进入项目
cd backend/

# 2. 配置 API 密钥（从 DeepSeek 获取）
echo 'LLM_API_KEY=你的密钥' > .env

# 3. 安装依赖
pip install -r requirements.txt

# 4. 启动
python main.py
```

浏览器打开 `http://localhost:8888`。

### 桌面端

```bash
cd desktop/
npm install
npm start
```

---

## 项目结构

```
gongtu-project/
├── index.html              # 网页版入口
├── backend/
│   ├── main.py             # FastAPI 主入口
│   ├── database.py         # 数据库连接
│   ├── auth.py             # 用户认证
│   ├── shenlun.py          # 申论批改 API
│   ├── mindmap.py          # 思维导图 API
│   ├── src/
│   │   ├── grader.py       # LLM 调用封装
│   │   ├── models.py       # 数据模型
│   │   └── prompt_builder.py # 提示词构建
│   └── .env                # API 密钥（不入库）
├── desktop/
│   ├── main.js             # Electron 启动脚本
│   └── package.json
├── .github/workflows/
│   └── check.yml           # CI 流水线
└── doc/
    └── PROJECT_RULES.md    # 开发规范与学习路线
```

---

> 更多关于开发规范、Git 工作流、CI 配置和学习路线，见 [doc/PROJECT_RULES.md](doc/PROJECT_RULES.md)
