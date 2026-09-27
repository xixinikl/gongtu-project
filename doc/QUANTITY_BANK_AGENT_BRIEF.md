# 数量关系 600 题交接要求

把这份文档发给新的 Agent。不要让它只看聊天记录继续，必须以仓库文件和当前输出为事实源。

## 任务目标

把用户提供的数量关系 600 题整理成可上线题库生产线。

核心要求：

- 600 道题不能丢，必须全部保留在 `raw_sets` 或 `clean_candidates`。
- 前台只能读取 `output/quantity-bank/approved_seed/questions.json`。
- 不合格题必须留在后台修复队列，不能混进用户训练。
- 质量优先，不为了凑数量放脏题。
- 答案不能错。宁可少上线，也不能把错答案、错题干、错解析放给用户。

## 当前真实状态

当前分支：

```text
cx/lesson-015-dynamic-explore
```

当前生产线状态：

```text
clean_candidates: 600
approved_seed: 372
repair_queue: 228
```

注意：之前一度有 188 道 approved，但后来发现 OCR 切题存在“题干和解析错配”风险，所以新增硬门禁后降到 104。随后修正题本页码映射、补充原解析页确认修复、加入保守题干替换规则、用题干强信号纠正明显脏题型，逐步提升到 347。本轮继续只处理“题干/选项 OCR 脏但答案可验算”的低风险题，并修正 `quantity_hs13_set31_q06` 的 OCR 错答案风险，该题最先发生的是“乙追上甲”，应选 B，不是 OCR 抓到的 A；同时追加斐波那契数列、日期星期、排名互补、营业额等差数列、概率排序、日期周期、选课学分组合、砝码可称重量、开关灯奇偶计数、营养餐利润配比、编号倍数转身等严格推导/原 OCR 支撑修复，approved 提升到 372。`quantity_hs13_set33_q08` 已记录严格推导答案 A，但因原 OCR 解析错配仍被门禁留在后台，不得前台可见。自动题干替换规则曾短暂提升到 197，但抽样发现中文 OCR 噪声风险后已收紧；当前已无可先自动规则队列，后续不要再靠逐页慢修，优先走视觉/原图批量核验，复杂题转视觉/原图。

## 必读文件

先按顺序读：

```text
AGENTS.md
CURRENT_STATUS.md
TASKS.md
错误复盘.md
doc/QUESTION_BANK_PIPELINE_METHOD.md
data/quantity_bank/README.md
data/quantity_bank/schema.json
output/quantity-bank/question_status_report.md
output/quantity-bank/question_status_matrix.csv
tools/quantity-bank-clean-candidates.mjs
tools/quantity-bank-export-approved.mjs
tools/quantity-bank-export-vision-queue.mjs
tools/quantity-bank-validate-approved.mjs
tools/quantity-bank-audit-approved-answers.mjs
```

## 重要红线

1. 不要把 `approved_seed` 当前数量少说成任务完成。
2. 不要把 OCR 原始候选题给前台读取。
3. 不要把低置信答案升级进前台，除非有明确原解析页/视觉核验依据。
4. 不要把图形题重新画一遍。
5. 图形题只裁“题干作答必需的局部图形/表格/路线图/统计图”，不要贴整页题目、整页解析、答案截图。
6. 自动相似度重配只能作为后台辅助，不能直接进入 `approved_seed`。
7. `analysis_stem_mismatch`、`analysis_auto_rematched_needs_review` 的题不能前台可见。
8. 推荐方法必须从题型白名单生成，不能从 OCR 解析全文随便抓关键词；利润题混入行程公式、单题挂 4 个以上方法，都算不合格。
9. 不要碰无关文件 `真正的成语.xlsx`。

## 当前最大问题

当前最大质量问题不是普通 OCR 噪声，而是题本/解析匹配问题：

- 有些候选题字段看似完整，但题干是 A 题，解析和答案是 B 题。
- 已新增 `analysis_stem_mismatch` 门禁挡住这类题。
- 已新增 `analysis_auto_rematched_needs_review`，表示系统尝试过同套解析重配，但还不能直接前台上线。

`data/quantity_bank/page_maps.json` 的题本页码映射已修正一轮，并新增 `tools/quantity-bank-audit-page-map.mjs`。

已观察到的疑点：

```text
output/quantity-bank/repair_assets/questions/数量关系600题_page-058.png 显示练习题 27 套
output/quantity-bank/repair_assets/questions/数量关系600题_page-060.png 显示练习题 29 套
output/quantity-bank/repair_assets/questions/数量关系600题_page-062.png 显示练习题 30 套
output/quantity-bank/repair_assets/analysis/analysis_18_34_page-061.png 显示练习题 28 套
output/quantity-bank/repair_assets/analysis/analysis_18_34_page-067.png 显示练习题 29 套
```

这说明 `page_maps.json` 中题本 pages 与套号存在偏移或缺页问题，不能继续盲目按每套 2 页硬配。当前相似度审计结果：59 套匹配通过，只有第 28 套题本页在当前题本 PDF/OCR 中未定位到；第 44 套和第 54 套已改成 3 页。

## 推荐下一步

0. 先看 10 秒状态，不要一上来就重跑全链路：

```bash
npm run quantity:status
```

当前应看到 `clean_candidates=600`、`approved_seed=372`、`repair_queue=228`、`image_dependent_in_queue=57`、`vision_tasks.task_count=228`、`vision_tasks.missing_image_tasks=0`。如果这一步显示数量异常，先修产物和脚本，不要继续导入。

当前 228 道后台队列已经拆成批处理泳道：

```text
options_recovery: 109
image_crop_and_structure_repair: 57
stem_analysis_rematch: 32
answer_recovery: 20
stem_recovery: 10
```

建议先跑小泳道验证模型输出质量，例如先跑 `answer_recovery`，再跑 `options_recovery`。不要一开始就把 228 道全部回灌到修复层。

1. 优先处理 228 道后台修复队列；下一步重点是 171 道建议原图/视觉核验题、57 道必须原图/视觉的图形依赖题。当前没有 `auto_rule_then_vision_if_unresolved`，不要继续用人工脚本硬磨。
2. 对第 28 套回看原 PDF 或用视觉模型确认题本页是否缺失；确认前这些候选不得进入 `approved_seed`。
3. 每次改 OCR 或页码映射后先运行 `node tools/quantity-bank-audit-page-map.mjs`。
4. 如果要回答“600 题各自什么状态”，直接看 `output/quantity-bank/question_status_matrix.csv`；如果要给人类交接，看 `output/quantity-bank/question_status_report.md`。
5. 视觉批处理前置已准备好：`node tools/quantity-bank-render-repair-assets.mjs --limit=all --target=all --dpi=180` 验证后台队列页图缺图 0；`node tools/quantity-bank-vision-repair-batch.mjs --limit=all` 已生成 `output/quantity-bank/vision_model_outputs/vision_tasks_latest.json`，其中 `task_count=228`、`missing_image_tasks=0`。视觉提示已要求图形题输出 `needs_original_crop=true` 和 `crop_requests` 归一化裁剪框；图题不能只用视觉答案入库，必须先从原 PDF 生成局部图资产。当前环境没有 `QUANTITY_VISION_BASE_URL`、`QUANTITY_VISION_API_KEY`、`QUANTITY_VISION_MODEL`，所以尚未执行模型请求。配置后可运行：

```bash
QUANTITY_VISION_BASE_URL=... \
QUANTITY_VISION_API_KEY=... \
QUANTITY_VISION_MODEL=... \
node tools/quantity-bank-vision-repair-batch.mjs --limit=all --execute --concurrency=3

# 可先按泳道试跑，避免一次性处理 228 道：
node tools/quantity-bank-vision-repair-batch.mjs --limit=all --lane=answer_recovery
node tools/quantity-bank-vision-repair-batch.mjs --limit=all --lane=options_recovery
node tools/quantity-bank-vision-repair-batch.mjs --limit=all --lane=image_crop_and_structure_repair
```

`--lane` 过滤会写入 `vision_tasks_latest_filtered.json`，不会覆盖全量 `vision_tasks_latest.json`；只有无过滤的 `--limit=all` 会刷新全量 latest，避免 CI 被分泳道任务误导。

```bash
node tools/quantity-bank-import-vision-repairs.mjs
node tools/quantity-bank-import-vision-repairs.mjs --apply  # 只在检查 candidate/rejected 后执行

node tools/quantity-bank-export-crop-assets.mjs
node tools/quantity-bank-audit-crop-assets.mjs
node tools/quantity-bank-import-crop-media.mjs
node tools/quantity-bank-import-crop-media.mjs --apply  # 只在检查候选 media 后执行
```

视觉回灌不是模型输出什么就写什么。`tools/quantity-bank-import-vision-repairs.mjs` 已按泳道限制可导入字段：

- `answer_recovery`：只接收答案/题型/解析摘要，且必须有 `evidence_note`。
- `options_recovery`：只接收完整 A/B/C/D。
- `stem_recovery`：只接收题干。
- `stem_analysis_rematch`：必须 `same_question=true`。
- `image_crop_and_structure_repair`：禁止直接导入普通修复，必须走 crop asset 流程。

导入前必须先看 `output/quantity-bank/vision_import/vision_repair_candidates.json` 的 candidate/rejected，不要直接 `--apply`。

`quantity-bank-export-crop-assets.mjs` 会把模型输出的 `crop_requests` 转成 `output/quantity-bank/crop_assets/crop_assets_manifest.json` 和局部 PNG。`quantity-bank-audit-crop-assets.mjs` 会独立审计资产存在性、坐标、面积、来源页。裁剪框必须完全在页面 0..1 范围内，且面积在页面 0.3% 到 55% 之间；整页截图、解析页答案截图、无意义小点都不能算合格资产。图形题必须先检查这些局部原图资产，再决定是否把 `media` 挂到题目；不能只因模型给了答案就进 `approved_seed`。

图题后续入库路径已经预留：把通过审核的局部图资产写入对应 verified repair 的 `fields.media`，元素格式遵循 `data/quantity_bank/schema.json` 的 `question_figure_crop`。`clean-candidates`、`export-approved` 和 `validate-approved` 已支持“图形依赖 + 合格 media”路径；没有 media 的图题仍会留在后台。

`quantity-bank-import-crop-media.mjs` 可以把已通过裁剪审计的 manifest 转成 `fields.media` repair 候选；默认只生成 `output/quantity-bank/crop_import/crop_media_repair_candidates.json`，检查后再 `--apply`。

6. 推荐一键重跑生产线：

```bash
npm run quantity:pipeline
```

如果 OCR/raw sets 也需要重建，则运行：

```bash
npm run quantity:pipeline:full
```

排错时可拆分运行：

```bash
node tools/quantity-bank-build-raw-sets.mjs
node tools/quantity-bank-clean-candidates.mjs
node tools/quantity-bank-export-review.mjs
node tools/quantity-bank-export-approved.mjs
node tools/quantity-bank-export-vision-queue.mjs
node tools/quantity-bank-validate-approved.mjs
node tools/quantity-bank-audit-approved-answers.mjs
npm run quantity:ci
```

补充检查：`node tools/quantity-bank-validate-approved.mjs` 已覆盖前台题的推荐方法数量和脏词。当前 372 道 approved 前台题已通过 `validate-approved` 和 `audit-approved-answers`；如果后续改方法推断，必须重新跑这两条校验。

总体验收：`npm run quantity:ci` 会集中检查 600 道 clean、approved/queue 数量互补且无重叠、图题 media 门禁、视觉任务缺图、crop manifest/import 一致性。每次视觉回灌、裁图回灌或改门禁后都要跑。

当前状态报告产物：

```text
output/quantity-bank/question_status_manifest.json  # 600 道 JSON 状态清单
output/quantity-bank/question_status_matrix.csv     # 600 行表格，可筛选 public_status / repair_route / issues
output/quantity-bank/question_status_report.md      # 人类可读状态报告和下一步路线
```

5. 检查：

```bash
node - <<'NODE'
const approved=require('./output/quantity-bank/approved_seed/questions.json');
const clean=require('./output/quantity-bank/clean_candidates/all_questions.json');
const queuePayload=require('./output/quantity-bank/vision_repair_queue.json');
const queue=queuePayload.items || queuePayload.queue || [];
const approvedIds=new Set(approved.map(q=>q.id));
const queueIds=new Set(queue.map(q=>q.id));
const overlap=[...approvedIds].filter(id=>queueIds.has(id));
const approvedFull=clean.filter(q=>approvedIds.has(q.id));
const rematchedApproved=approvedFull.filter(q=>q.quality?.issues?.includes('analysis_auto_rematched_needs_review'));
const mismatchApproved=approvedFull.filter(q=>q.quality?.issues?.includes('analysis_stem_mismatch'));
const imageApproved=approvedFull.filter(q=>q.quality?.issues?.includes('image_dependent_question'));
const analysisOnlyApproved=approvedFull.filter(q=>q.source?.question_from_analysis_only);
const noRoute=queue.filter(q=>!q.repair_route);
console.log({ clean: clean.length, approved: approved.length, queue: queue.length, overlap: overlap.length, rematchedApproved: rematchedApproved.length, mismatchApproved: mismatchApproved.length, imageApproved: imageApproved.length, analysisOnlyApproved: analysisOnlyApproved.length, noRoute: noRoute.length });
if (clean.length!==600 || approved.length!==372 || queue.length!==228 || overlap.length || rematchedApproved.length || mismatchApproved.length || imageApproved.length || analysisOnlyApproved.length || noRoute.length) process.exit(1);
NODE
```

6. 浏览器验证：

```text
http://127.0.0.1:8089/quantity-redesign-demo.html
http://127.0.0.1:8089/quantity-bank-review.html
```

必须显示最新 approved / repair queue 数量，控制台不能有 error/warn。

## 必跑命令

```bash
npm run doctor
npm run quantity:status
for f in tools/quantity-bank-*.mjs; do node --check "$f" || exit 1; done
npm run quantity:test:vision-import
node tools/quantity-bank-validate-approved.mjs
node tools/quantity-bank-audit-approved-answers.mjs
npm run quantity:ci
git diff --check
```

`npm run doctor` 当前预期不会全绿：本机 Node 18 低于项目要求 20，Python 3.9 低于项目要求 3.10。记录结果即可，不要把未全绿说成通过。

`npm run quantity:ci` 必须看到 `public_demo_source=approved_seed_only`。这证明用户端 `quantity-redesign-demo.html` 只读 `approved_seed`，后台审核页才允许读 `clean_candidates`。

## 最终回复必须说清

```text
当前分支：
当前任务：
已改文件：
已验证：
未验证：
下一步从哪里继续：
重要注意：
```

不要说“600 题全部上线完成”，除非 600 道都通过门禁并完成浏览器和命令验证。
