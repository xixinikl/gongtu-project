# 验收报告中心

这个目录是 GitHub Pages 静态报告站。每日验收 workflow 会把
`.agent-factory/out/<date>/` 的机器输出转换成稳定 JSON，再发布到 Pages。

## 数据契约

- `data/index.json`: 最近验收索引和聚合计数
- `data/latest.json`: 最新一次验收详情
- `data/runs/YYYY-MM-DD.json`: 单日验收详情

日报流水不提交进仓库。workflow 发布时会尽量读取上一版 Pages 的历史 JSON，
合并当天结果后重新部署，因此仓库保持干净，页面仍能保留趋势。

未来升级为真正质量控制台时，优先保持这些字段兼容，再把 JSON 导入数据库。

## 复用到其他项目

每个项目只需要保留同一套数据契约，并修改 `site-config.json`：

- `projectId`
- `projectName`
- `dashboardTitle`
- `repository`
- `actionsWorkflow`
- `retrospectivePath`

这套设计不依赖本地电脑。公司电脑、个人电脑只负责提交代码；每日验收、
报告生成和 Pages 发布都在 GitHub Actions 云端完成。

后续如果要做总控台，可以新建一个独立 `quality-hub` 仓库，维护项目清单：

```json
[
  {
    "projectId": "gongtu-project",
    "dashboardUrl": "https://xixinikl.github.io/gongtu-project/"
  }
]
```

总控台读取每个项目的 `data/latest.json` 和 `data/index.json`，就能聚合所有项目。
