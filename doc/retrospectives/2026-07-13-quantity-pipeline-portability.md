# 数量流水线的干净 worktree 误报候选

- 日期：2026-07-13
- 来源：`cx/phase6-clean-integration` 的 GT-P6-8 总装回归。
- 事实：新 worktree 没有被忽略的 `output/quantity-bank/raw_sets`。`npm run quantity:pipeline` 的 `--skip-build` 路径仍先读取该目录而失败；已提交的 `data/quantity_bank/approved_seed.json` 与 `quantity:ci` 实际足以完成 600/60/71 的正式数据门禁。
- 影响：跨电脑或干净总装无法按文档运行默认数据门禁，容易让 Agent 错误地拷贝/提交 OCR 中间产物。
- 补救：`tools/quantity-bank-pipeline.mjs` 在 `--skip-build` 且 raw sets 缺失时自动转为 portable approved-seed CI；保留显式 `--portable`。新增 `tests/quantity-pipeline-portable.test.mjs`。
- 验证：干净总装树中 `npm run quantity:pipeline` 输出 `mode: portable_approved_seed` 并通过；Node 回归 46/46。
- 状态：needs_weekly_review；仅项目内候选，尚未提升为个人 Profile 规则。
