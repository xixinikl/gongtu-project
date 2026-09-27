# 片段阅读题库 Goal 拆解与验收标准

更新时间：2026-07-12

本文把“片段阅读题库 + 极简答题页 + AI 导师诊断层”拆成可以持续执行的小任务。后续跑 goal 时，按任务编号推进；每个任务都必须有可检查产物和验收标准。

## 总目标

把《2025 年花生片段阅读 600 题》整理成可练习、可诊断、可扩展的题库原型：

1. 原书题干、选项、答案、核心解析、花生批注保留为底座。
2. AI 导师层只做补充：弱项判断、错因归因、同类题训练建议。
3. 每套题按 20 题为一个完整练习单位；半套不得进入前台。
4. 数据必须来自 PDF 页图视觉核对，OCR 只能辅助定位，不能作为事实源。
5. 前台只读取 manifest 中通过门禁的完整套题。

## 当前基线

- 已完成第 01-30 套，每套 20 题，共 600 题。
- 前台页面：`verbal-reading-pilot.html`
- 题库清单：`data/verbal_reading/sets_manifest.json`
- 当前已验证答案串：
  - 第 01 套：`CCBCBCBABDBBBABAADDD`
  - 第 02 套：`DDCCBBABABBBCBACDDBB`
  - 第 03 套：`CABBDACCDBDCAABCDCBC`
  - 第 04 套：`DDBCDBADABDCBCADDCBD`
  - 第 05 套：`CBBAABABBDCACDBDCAAB`
  - 第 06 套：`BCABCDACBAAABCDCAACA`
  - 第 07 套：`CACCBCCCDCADBDACCCDC`
  - 第 08 套：`BBDBBABACACABCDBAABD`
  - 第 09 套：`CBABAAADCDABACCDBACB`
  - 第 10 套：`CDCCCCACABCCBBCBAADB`
  - 第 11 套：`BAABCBACDCBCBDBCCCDC`
  - 第 12 套：`CDCBACCBDBDCCABACDBB`
  - 第 13 套：`AADCDBAADBBDBBAADACD`
  - 第 14 套：`CCDBACDCDCBDABADBDBA`
  - 第 15 套：`CCBBABDCCDDBCDCCACBA`
  - 第 16 套：`CBAADCDCCAAADBDBDDCD`
  - 第 17 套：`DDDDBCCDDDAACCBCCDAB`
  - 第 18 套：`DCCCCBDBBCDDDBDDADBB`
  - 第 19 套：`ABDBBCCDDBBABCBBDDCB`
  - 第 20 套：`AACBDDBACABDCADACBCA`
  - 第 21 套：`DAADDCBDBBCDCCBAADCA`
  - 第 22 套：`DCAADCBBBDDDDCBBBDDB`
  - 第 23 套：`CBBBCADBDABDBDBBBCBA`
  - 第 24 套：`ABBACCBDCABBBADBBDBB`
  - 第 25 套：`ADBBDCDABAADBBACBADA`
  - 第 26 套：`DCBBCCCABBDDCABDBABC`
  - 第 27 套：`CBADCACDACAACADBAABD`
  - 第 28 套：`BDDBDDABCDABCBDDCACA`
  - 第 29 套：`DBBABDBBDACDADDBBDAC`
  - 第 30 套：`DBCACBCCDCCDBDBCBBDD`

## 执行节奏

每次只推进一套题，必要时拆成前 10 题和后 10 题，但必须等 20 题都完成后才进入 manifest。

推荐单轮节奏：

1. 定位下一套题本页和解析页。
2. 视觉录入前 10 题。
3. 视觉录入后 10 题。
4. 合并成完整套题。
5. 更新 manifest。
6. 验证页面可选择并作答。
7. 更新 `CURRENT_STATUS.md`。

## 小任务列表

### VR-INGEST-001 定位下一套页码

目标：确认下一套 20 题在题本 PDF 和解析 PDF 中的页码范围。

输入：

- 题本 PDF：`/Users/miduoduo/Downloads/2025年花生片段阅读600题-题本【上】.pdf`
- 解析 PDF：`/Users/miduoduo/Downloads/2025年花生片段阅读600题-解析【上】.pdf`
- 上一套已完成的页码记录。

产物：

- 渲染页图放在 `tmp/pdfs/verbal-reading-setXX/`
- 在工作记录中写清：
  - set_id
  - 题本物理页范围
  - 解析物理页范围
  - 是否正好 20 题

验收标准：

- 题本页图能看到该套第 1 题和第 20 题。
- 解析页图能看到该套第 1 题和第 20 题答案解析。
- 确认不是把上一套续编号误认为同一套。例如第 01 套只有 1-20，不能做成 q21-q40。

失败处理：

- 如果题本页和解析页套号不一致，停止入库，重新定位。
- 如果页图不清晰，提升渲染 DPI 后重看。

### VR-INGEST-002 录入前 10 题

目标：完成 `setXX_q01_q10.json`。

产物：

- `data/verbal_reading/setXX_q01_q10.json`

每题字段要求：

- `id`
- `question_no`
- `source`
- `content.stem`
- `content.prompt`
- `content.options`，必须 4 个选项 A-D
- `answer`
- `analysis_source.source_type_label`
- `learning_tags.question_type`
- `learning_tags.passage_type`
- `learning_tags.method_tags`
- `learning_tags.option_trap_tags`
- `learning_tags.weak_steps`
- `official_analysis`
- `peanut_notes`
- `ai_brief_example`

验收标准：

- 10 题题号连续：1-10。
- 每题都有完整题干、设问、A/B/C/D、答案。
- 答案来自解析页【参考答案】，不是推测。
- `official_analysis` 保留原书解析核心，不被 AI 提示替代。
- `peanut_notes` 保留花生批注方法点。
- `ai_brief_example` 明确是补充提示，不能覆盖官方解析。

失败处理：

- 若某题选项或题干看不清，只记录为待复核，不得进入正式 JSON。
- 若解析页答案和解析正文矛盾，标记争议，回看原页，不得直接入前台。

### VR-INGEST-003 录入后 10 题

目标：完成 `setXX_q11_q20.json`。

产物：

- `data/verbal_reading/setXX_q11_q20.json`

验收标准：

- 与 `VR-INGEST-002` 相同。
- 题号连续：11-20。
- 后 10 题不得作为半套加入 manifest。

失败处理：

- 若只完成后 10 题，最多保留在 `tmp/verbal_reading/` 作为候选；不得进入前台。

### VR-QA-001 单套数据结构校验

目标：确认一整套 20 题可以作为练习单位。

输入：

- `setXX_q01_q10.json`
- `setXX_q11_q20.json`

验收命令示例：

```bash
node -e 'const fs=require("fs"); const files=["data/verbal_reading/setXX_q01_q10.json","data/verbal_reading/setXX_q11_q20.json"]; const qs=files.flatMap(f=>JSON.parse(fs.readFileSync(f,"utf8")).questions); console.log(qs.length, qs.map(q=>q.question_no).join(","), qs.map(q=>q.answer).join("")); const missing=qs.filter(q=>!q.content?.stem||!q.content?.prompt||q.content.options?.length!==4||!/^[ABCD]$/.test(q.answer)||!q.official_analysis||!q.peanut_notes?.length||!q.ai_brief_example); if(qs.length!==20||missing.length) process.exit(1);'
```

验收标准：

- 总题数 20。
- 题号 1-20 连续。
- 每题 4 个选项。
- 每题答案为 A/B/C/D。
- 每题有官方核心解析、花生批注、AI 提示。
- 输出答案串，写入 `CURRENT_STATUS.md`。

### VR-MANIFEST-001 将完整套题加入清单

目标：只有完整通过校验的套题才能加入前台 manifest。

产物：

- 更新 `data/verbal_reading/sets_manifest.json`

验收标准：

- `sets_manifest.json` 中新增 set：
  - `set_id`
  - `label`
  - `question_count: 20`
  - `files`
  - `status: visual_verified_minimal_practice`
- 前台页面能读取该 set。
- 半套、候选文件、tmp 文件不得出现在 manifest 中。

### VR-FRONTEND-001 套题选择与答题闭环

目标：页面能选择任意已完成套题并完成练习闭环。

产物：

- `verbal-reading-pilot.html`

验收标准：

- 页面显示套题选择器。
- 切换套题后：
  - 清空上一套作答状态。
  - 显示新套题 20 题。
  - 提交前不展示答案、解析、花生批注。
  - 提交后显示正确答案、核心解析、花生批注、AI 导师诊断。
- 本地访问返回 200：

```bash
curl -I http://127.0.0.1:8089/verbal-reading-pilot.html
```

### VR-AI-001 AI 导师诊断层

目标：AI 导师体现为学习诊断，不替代原书解析。

验收标准：

- 单题提交后显示：
  - 核心解析
  - 花生批注/方法点
  - AI 导师弱项判断
- 整套提交后显示：
  - 题型表现
  - 高频失分方法点
  - 关键弱项
  - 容易掉进的选项坑
  - 下一轮训练建议
  - 同类题出题方案
- AI 诊断必须基于 `learning_tags` 和用户选项。
- 未作答前不得泄露答案或解析。

### VR-AI-002 同类题出题接口预留

目标：先定义同类题生成的输入输出，不急着接模型。

产物建议：

- `doc/VERBAL_READING_AI_PROMPTS.md`

接口输入：

- 错题题型
- 错因标签
- 用户误选项
- 官方正确项
- 原题方法标签

接口输出：

- 3 道同类题
- 每题答案
- 每题解析
- 每题干扰项设计说明
- 对应训练目标

验收标准：

- 明确 AI 生成内容是“训练题”，不能伪装成原书题。
- 生成题不进入原书题库 manifest。
- 生成题必须标记 `source_type: ai_generated_drill`。

### VR-QA-002 页面与数据总校验

目标：每次新增一套后做统一验收。

验收命令：

```bash
node -e 'const fs=require("fs"); const manifest=JSON.parse(fs.readFileSync("data/verbal_reading/sets_manifest.json","utf8")); for (const s of manifest.sets) { const qs=s.files.flatMap(f=>JSON.parse(fs.readFileSync(f,"utf8")).questions); const nums=qs.map(q=>q.question_no).join(","); const expected=Array.from({length:s.question_count},(_,i)=>i+1).join(","); if(qs.length!==s.question_count||nums!==expected) throw new Error(s.set_id); const missing=qs.filter(q=>!q.content?.stem||!q.content?.prompt||q.content.options?.length!==4||!/^[ABCD]$/.test(q.answer)||!q.official_analysis||!q.peanut_notes?.length||!q.ai_brief_example); if(missing.length) throw new Error(s.set_id+" missing "+missing.map(q=>q.question_no)); console.log(s.set_id, qs.length, qs.map(q=>q.answer).join("")); }'
node -e 'const fs=require("fs"); const html=fs.readFileSync("verbal-reading-pilot.html","utf8"); new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]); console.log("html js parse ok");'
curl -I --max-time 5 http://127.0.0.1:8089/verbal-reading-pilot.html
git diff --check
```

验收标准：

- manifest 中每套均通过结构校验。
- 页面脚本可解析。
- 本地页面访问 200。
- `git diff --check` 通过。
- `CURRENT_STATUS.md` 记录新增套题、答案串、验证结果和未完成项。

## 每轮完成回复格式

每轮最终回复用户时，必须包含：

```text
本轮完成：
新增/修改文件：
已验证：
答案串：
未完成：
下一步：
```

如果因页码、答案冲突或视觉看不清暂停，不能只说“受阻”，必须先说明已经尝试的补救动作，以及下一步具体从哪一页继续。
