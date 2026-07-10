# 验收报告中心设计

`quality-dashboard/` 是当前项目的静态验收报告中心。它先服务 gongtu，
但数据契约按多项目质量控制台设计。

## 当前形态

- 每个仓库独立运行每日验收。
- 每个仓库独立发布 GitHub Pages 报告页。
- 每次运行生成 `data/latest.json`、`data/index.json` 和
  `data/runs/YYYY-MM-DD.json`。
- 每日流水数据不提交进仓库，只通过 GitHub Actions 发布到 Pages。

## 跨电脑复用

验收、报告生成和发布都在 GitHub Actions 中执行，不依赖个人电脑或公司电脑。
换电脑时只需要能访问 GitHub 仓库即可。

## 复制到其他项目

1. 复制 `.agent-factory/` 和 `quality-dashboard/`。
2. 修改 `.agent-factory/config.json` 里的项目名、检查命令和高风险路径。
3. 修改 `quality-dashboard/site-config.json` 里的仓库、标题和复盘路径。
4. 复制 `.github/workflows/daily-acceptance.yml`，保留 Pages 发布步骤。
5. 在目标仓库启用 GitHub Pages。

## 未来质量控制台

当项目数量变多时，新建独立 `quality-hub` 仓库作为总控台。总控台不直接读业务
仓库代码，只读取每个项目 Pages 上的公开 JSON：

- `<project-dashboard>/data/latest.json`
- `<project-dashboard>/data/index.json`
- `<project-dashboard>/data/runs/YYYY-MM-DD.json`

这样单项目日报、周趋势、多项目总览可以共用同一套数据契约。后续如果接入
Supabase、SQLite 或 Postgres，也只是把 JSON 导入数据库，不需要重写每日验收。
