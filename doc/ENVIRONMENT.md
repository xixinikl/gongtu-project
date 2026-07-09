# 本地环境与换设备说明

本项目当前不依赖云服务器即可开发。开发时由本机临时运行前端静态服务、FastAPI 后端和 SQLite 数据库。

## 推荐版本

| 工具 | 推荐 |
|---|---|
| Node.js | 20+ |
| npm | 使用 `package-lock.json` |
| Python | 3.10+ |
| 数据库 | SQLite，本地文件，不提交 |

Python 3.9 可能无法运行部分现代语法。若本机默认 Python 是 3.9，应创建 Python 3.10+ 虚拟环境。

## 第一检查命令

```bash
npm run doctor
```

该命令只检查，不安装、不删除、不启动长期服务。它会报告：

- Node 和 npm 是否可用；
- `node_modules` 是否存在；
- Python 版本是否满足 3.10+；
- FastAPI 和 Uvicorn 是否可导入；
- 本地 SQLite 数据库是否存在；
- 8089 和 8888 端口是否已被占用；
- 当前 Git 分支和工作区是否有改动。

## 常用启动

静态训练页：

```bash
npm run dev
```

后端主站：

```bash
python3 start_gontu.py --open
```

如果需要先安装后端依赖：

```bash
python3 -m venv backend/venv
backend/venv/bin/python -m pip install -r backend/requirements.txt
backend/venv/bin/python start_gontu.py --open
```

## 数据库约定

- 默认数据库：`backend/data.db`
- 也可通过 `GONTU_DB_PATH` 指定开发数据库位置。
- `backend/data.db`、WAL/SHM 文件和 `.codex-runtime/` 均不提交。
- 换分支不应随意删除数据库；除非任务明确要求重置开发数据。

## 给新 Agent 的环境规则

- 不要假设用户本机 Python 版本正确，先跑 `npm run doctor`。
- 不要把 Codex 内置 Python 的成功等同于用户本机一定可运行。
- 不要为了绕过本机问题删除登录、数据库或用户数据逻辑。
- 环境失败时要区分：代码错误、依赖缺失、版本不匹配、端口占用、数据库缺失。
