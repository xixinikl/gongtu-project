# 数量关系 600 题加工说明

这批 PDF 是扫描版，不能直接抽取文本。整理流程必须先 OCR，再清洗、匹配题目和解析，最后再进入产品题库。

跨电脑、换 Agent 或整理下一批题库时，先读 `doc/QUESTION_BANK_PIPELINE_METHOD.md`。本文件记录本批数量关系资料的具体结构和脚本入口，方法论文档记录可复用的生产线原则、门禁和交接清单。

## 已确认结构

- `数量关系600题.pdf`：题本篇，125 页。
- 题本目录显示 60 套练习，每套约 2 页，每套 10 题。
- `数量关系1-17解析.pdf`、`数量关系18-34解析.pdf`、`数量关系35-60解析.pdf`：解析篇，按套拆分。
- 解析页本身包含有价值标签：整体难度、易中难比例、题型分类、难度评价、参考答案、实战解析、花生批注。

## 产品整理原则

不要把这批题直接做成“刷题列表”。数量关系的核心价值应当是：

1. 单题诊断：判断题型、难度、是否值得做、推荐方法。
2. 套题选题：一套 10 题里先排必做、可做、先跳。
3. 系统学习：按题型识别、方法选择、分步训练、混合训练组织。
4. 复盘记录：记录错在题型识别、取舍判断、设量建模、列式关系、计算速度或审题遗漏。

题目切割、OCR 和清洗只是后台导入流程，不应该作为用户端功能暴露。用户端只需要看到整理后的题库、套题策略、单题诊断和复盘结果。

数量题不应强制“一题一个题型”。推荐使用多标签：

```text
primary_topic: 主题型
secondary_topics: 次题型/交叉题型
methods: 解题方法
exam_decision: 必做 / 可做 / 先跳
weak_steps: 复盘环节
```

## 加工状态

- 普通 PDF 文本抽取结果为 0，说明是图片扫描。
- 已安装本地 OCR：`tesseract` + `tesseract-lang`。
- OCR 能读出主体文字，但选项、符号、图形题、公式会有错误，不能直接上线。
- 后续需要做“AI 清洗 + 人工抽查”。

## 推荐入库流程

```text
PDF
-> 按套渲染图片
-> OCR 得到 raw text
-> 按题号切分题目/解析
-> 从解析提取答案、题型、难度、方法
-> AI 补充考场建议：必做/可做/先跳
-> 人工抽查修正
-> 进入正式题库
```

## 本地脚本

```bash
# OCR 某个来源的逐页文本，可断点续跑
node tools/quantity-bank-page-ocr.mjs --source=questions --start=6 --end=125 --dpi=140

# 根据页码映射归并成 60 套 raw bundle
node tools/quantity-bank-build-raw-sets.mjs

# 审计题本页码映射是否与解析套题匹配
node tools/quantity-bank-audit-page-map.mjs

# 生成 600 道结构化候选题
node tools/quantity-bank-clean-candidates.mjs

# 导出需要复查的 CSV 和摘要
node tools/quantity-bank-export-review.mjs

# 导出通过硬门禁、可供 demo 读取的上线种子题
node tools/quantity-bank-export-approved.mjs

# 导出视觉模型/原图回看修复队列，记录待修题应看哪一页、修什么
node tools/quantity-bank-export-vision-queue.mjs

# 按修复队列渲染原始 PDF 页图，供视觉模型或原图核验使用
node tools/quantity-bank-render-repair-assets.mjs --priority=high --limit=20 --target=all

# 生成视觉模型批处理任务；默认只 dry-run，不调用外部模型
node tools/quantity-bank-vision-repair-batch.mjs --priority=high --limit=20

# 配置 OpenAI 兼容多模态接口后，才执行真实批处理
QUANTITY_VISION_BASE_URL=... QUANTITY_VISION_API_KEY=... QUANTITY_VISION_MODEL=... \
  node tools/quantity-bank-vision-repair-batch.mjs --priority=high --limit=20 --concurrency=3 --execute

# 全队列页图已准备好时，可续跑全量视觉修复；默认不覆盖已有单题结果
QUANTITY_VISION_BASE_URL=... QUANTITY_VISION_API_KEY=... QUANTITY_VISION_MODEL=... \
  node tools/quantity-bank-vision-repair-batch.mjs --limit=all --concurrency=3 --retries=2 --execute

# 把视觉模型输出整理成待合并修复；默认 dry-run，不改 verified repairs
node tools/quantity-bank-import-vision-repairs.mjs

# 校验用户端可见种子题，脏题干、脏选项、脏题型会失败
node tools/quantity-bank-validate-approved.mjs

# 额外校验 approved 答案来源，防止低置信或误抓乱码答案进入前台
node tools/quantity-bank-audit-approved-answers.mjs
```

生成物位于 `output/quantity-bank/`，该目录被 `.gitignore` 忽略，不会把题库全文和 OCR 原文提交到 Git。

上线应分三层处理：

1. `raw_sets`：保留 600 题原始 OCR 和页码来源，不丢题。
2. `clean_candidates`：保留结构化候选与问题标记，供后台审核、批量修复和抽查。
3. `approved_seed`：只放通过题干、选项、答案、题型、非图形题等硬门禁的题，用户端 demo 只读取这一层。

用户端不直接展示 OCR 原始解析；正式讲解应由 AI 复核后生成，或经人工润色后入库。

低置信题不会丢弃：`review_queue.csv` 用于后台筛查，`vision_repair_queue.json` 用于把缺答案、缺选项、图形依赖、题干/题型 OCR 噪声等题目送到原图回看或视觉模型修复。视觉模型修完后仍必须回到 `approved_seed` 的同一套门禁，不能绕过校验直接给用户训练。

视觉批处理必须按“可续跑”方式执行：每道题单独落盘到 `output/quantity-bank/vision_model_outputs/{id}.json`，失败题写 `{id}.error.json`，默认跳过已有成功结果。不要再靠 Agent 逐页手工查看 600 题作为主流程；人工视觉只用于抽查、争议题和图形裁剪核验。

图形依赖题必须保留原始 PDF 图像来源，但只保留题干作答所必需的局部图形、表格、路线图或统计图裁剪。不要把整页题目、解析页、参考答案截图贴到用户端。普通文字题上线时仍然使用结构化字段：题干文本、A/B/C/D、答案、解析、题型和方法标签。

几何图、表格图、路线图、统计图等不得由 AI 或前端重新手绘替代；上线前必须从原 PDF 裁出对应题目的原图，并在题目数据中记录裁剪资产、PDF 来源、页码和裁剪框。没有原图裁剪资产的图形题继续保持 `blocked_from_user_training=true`。

原图或视觉模型确认过的修复写入 `data/quantity_bank/verified_repairs.json`。清洗脚本会在生成候选题后应用这些修复，再重新计算质量门禁。不要直接手改 `output/quantity-bank/clean_candidates/`，否则下次重跑会丢失修复来源。

题本页码不能再假设每套固定 2 页。当前 `page_maps.json` 已按内容相似度修正为真实页段：第 44 套和第 54 套为 3 页；第 28 套题本页在当前题本 PDF/OCR 中未定位到，只能先从解析题头保留后台候选，并打 `question_block_missing_needs_original_check`，回看原 PDF 或视觉模型确认前不得进入 `approved_seed`。

## 版权提醒

这套资料带有“四海公考 / 花生十三”标识。公开产品中不应在未确认授权的情况下原样提供整套题和解析。更稳妥的方式是先作为内部加工参考，正式题库使用授权内容、公开真题整理或改写题。
