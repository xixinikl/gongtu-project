# 数量关系模块接入统一学习平台交接

更新时间：2026-07-13

## 1. 交接用途

本文件是 `gongtu-unified-learning-platform` Goal Phase 3 接入数量关系题库的权威输入。
旧的 `doc/QUANTITY_BANK_FINAL_AUDIT.md` 记录的是补齐第28套前的历史状态，其中
“589题批准、11题隔离”已经失效，不得用于当前迁移判断。

## 2. 当前权威结论

- 范围：60套，每套10题，共600题。
- 当前批准：600题。
- 当前隔离：0题。
- 当前修复队列：0题。
- 600题答案来源均为 `full_visual_set_audit`。
- 第28套答案串：`DABDCCBCCB`。
- 第8套第7题已正式支持A-H八个连续选项，答案E，不得截成四选题。
- `npm run quantity:pipeline` 14步通过；批准校验、答案审计、图片审计和题库CI通过。

当前仍有一个已知的非阻断页码事实：原始《数量关系600题.pdf》缺少第28套题本页，
因此页码映射审计仍会把第28套标为 `needs_attention`。用户后来提供了第28套10道题的
原书页面截图，已经逐题保存为稳定证据并与解析PDF交叉核验，所以这不再是题目隔离项。

## 3. 权威文件与生成入口

持久事实源：

- `data/quantity_bank/verified_repairs.json`：600题视觉确认后的题干、选项、答案、解析、题型、方法与媒体修复。
- `data/quantity_bank/source_evidence/set28/`：第28套用户补充的10张原书页面证据。
- `data/quantity_bank/page_maps.json`：题本与解析册页码映射；保留第28套原PDF缺页事实。
- `tools/quantity-bank-*.mjs`：清洗、批准导出、答案审计、图片审计和CI。

可重建生成物（位于被Git忽略的 `output/quantity-bank/`）：

- `approved_seed/questions.json`：唯一允许用户端或正式迁移读取的批准层。
- `clean_candidates/all_questions.json`：后台审核层，不得直接作为用户题库。
- `vision_repair_queue.json`：当前应为0项。

换机器或接入前先运行：

```bash
npm run quantity:pipeline
```

不得直接修改 `output/quantity-bank/`；需要修题时修改持久事实源并重跑流水线。

## 4. 图片合同

- 当前共71张正式媒体，全部为 `question_figure_crop`，用于题目作答。
- 图形、表格、路线图、统计图必须使用原书/原题页面裁图，不允许AI或前端重画。
- 题目图不得包含答案、解析或会泄露答案的辅助线。
- 第28套第4题保留A-D四幅函数图；第8题保留A/B/C/D四矩形花园布局。
- 正式接入必须继续验证媒体文件存在、加载成功且交卷前不会泄露答案。

解析辅助图需要单独处理：当前媒体层尚未定义 `analysis_figure_crop`。全库有42题的解析
文本出现“如图、辅助线、表格”等视觉引用。部分可由题目原图加完整文字讲清，部分包含
解析新增辅助线、补形或表格。Phase 3迁移题库正文可以进行，但不得声称解析视觉100%还原；
上线完整解析体验前应逐题审计这42题：文字足够则记录确认，文字不足则从解析原页裁取
`analysis_figure_crop`，只在交卷后显示，绝不能替代题目原图。

## 5. 正式产品接入边界

数量关系不是普通刷题列表。正式 adapter 和页面至少要保留：

- 题型识别：`primary_topic`、`secondary_topics`。
- 方法选择：`methods`。
- 考场取舍：`must_do / can_do / skip_first`，产品文案为“必做 / 可做 / 先跳”。
- 过程证据：单题用时、是否跳过、是否改答、步骤卡点。
- 复盘维度：题型识别、取舍判断、设量建模、列式关系、计算速度、审题遗漏。

现有 `exam_decision` 是题库侧策略种子，不应伪装成适合所有用户的绝对结论。正式AI教练
应结合用户正确率、耗时和历史步骤证据调整建议，并明确区分“题目基准建议”与“个体建议”。

## 6. Phase 3 数据与安全门禁

- 只导入 `approved_seed`，禁止从OCR原文、clean candidates或审核队列直接供题。
- 交卷前API不得返回答案、解析、解析图或可推断答案的字段。
- 判题必须在服务端完成。
- 学习记录归属从JWT当前用户取得，禁止相信前端传入的 `user_id`。
- 覆盖未登录门禁、刷新恢复、登出后重登恢复和A/B用户隔离。
- 支持四选题与第8套第7题的八选题，选项数不得写死为4。
- 错题、推荐和AI上下文只能引用同一题目版本及其正式答案，防止题目与解析错位。

建议数量 adapter 输出字段：

```text
id, set_no, question_no, stem, options, media
primary_topic, secondary_topics, methods, exam_decision
```

答案、解析、解析辅助媒体仅在服务端交卷结果或授权复盘接口中返回。

## 7. 当前未完成项

1. 42道解析视觉引用的逐题审计与必要的 `analysis_figure_crop` 补录。
2. 正式数据库迁移、数量 adapter、服务端判题和用户作答记录尚未实施。
3. 统一外壳当前 Phase 1 的数量页面仍是功能表达，不得宣称已接真实600题。
4. 原资料含“四海公考 / 花生十三”标识；公开发布整套题与解析前必须确认授权或采用合规内容方案。

## 8. Phase 3 输入验收

接入 Agent 开始真实迁移前应确认：

- `npm run quantity:pipeline` exit code 0。
- approved=600、queue=0、missing answer/topic/options=0。
- 答案来源分布为 `full_visual_set_audit: 600`。
- 第28套10题存在且答案串为 `DABDCCBCCB`。
- 第8套第7题为A-H八选、答案E。
- 题目图片全部存在且浏览器无破图。
- 接入方案明确解析辅助图审计是独立未完成项，没有被静默遗漏。

满足以上门禁后，数量题库可作为 Phase 3 正式输入；在用户数据、安全与服务端判题验收前，
仍不能称为正式上线。
