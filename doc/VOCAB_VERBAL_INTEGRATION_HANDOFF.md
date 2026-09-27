# 成语词库与言语题库整合交接

更新时间：2026-07-13
当前工作区：`/Users/miduoduo/Documents/xixi_gongtu-main-app`
当前分支：`cx/vocab-verbal-original-ui`
当前状态：已实现，待用户人工验收后决定提交/合并

## 交接目的

这份文档交接当前已完成的“成语内置词库 + 言语题库”实现，供后续统一整合页面、片段阅读、数量关系、空间图推、申论复盘和 AI 教练时使用。

后续总装原则已经在“优化片段阅读题库拆分方案”线程中确认：主站整合、统一导航、统一 `users.id`、统一学习记录、综合复盘和 AI 教练上下文由主站总装对话统一负责；各题库对话只负责本板块题库事实、专业规则、数据合同和验收证据，不要各自修改主站登录、用户表、导航和 AI 教练。

## 分支与保护线

- 当前功能分支：`cx/vocab-verbal-original-ui`
- 未直接修改 `main`
- 原几何/工图 worktree：`/Users/miduoduo/Documents/xixi_gongtu`
- 主应用 worktree：`/Users/miduoduo/Documents/xixi_gongtu-main-app`
- 当前改动未 commit、未 push，便于用户验收后整体回滚或提交
- 数据库文件 `backend/data.db`、`backend/data.db-wal`、`backend/data.db-shm` 被 `.gitignore` 忽略，不应提交

## 用户明确要求

- 不要重做成语页前端风格。
- 只能基于 `智学成语-高级版.html` 原布局、原色板、原按钮和原图标原位修改。
- 成语例句来源是用户 Excel 表格里的 `例句` 列，不是运行时联网抓取。
- 人民网只作为搜索链接展示，链接应在例句下方。
- 言语题库入口不要放在顶部主模块栏里，应作为成语界面里的自然延伸入口。
- 学习逻辑要接近常见背单词软件：词库内容稳定，今日任务是队列，全部词库只是浏览，易忘词/收藏夹/到期复习是用户状态视图。
- 任何学习记录、题库作答、收藏、错题、设置都必须归属当前 JWT 用户，禁止相信前端传入 `user_id`。

## 数据来源与现状

### 高频成语词库

来源文件：`/Users/miduoduo/Downloads/高频成语800词完整版（修复版）.xlsx`

导入事实：

- 原表 805 行
- 唯一成语 801 个
- 有 4 个重复词条
- 表格列：`成语`、`解释`、`例句`、`人民网搜索`
- `例句` 列很多单元格内含换行，导入和展示时必须保留换行
- 当前数据库 `highfreq_vocab` 已导入 801 条
- 当前数据库 `highfreq_vocab.examples <> ''` 为 801 条
- 当前数据库 `highfreq_vocab.source` 已统一为 `内置词库`

重要口径：用户要求“例句来自这个 Excel 表格”，后续任何文案都不要写成“人民网例句”或“去人民网找例句”。

### 花生海海刷言语题库

来源文件：

- `/Users/miduoduo/Downloads/花生海海刷言语理解题库.xlsx`
- `/Users/miduoduo/Downloads/花生海海刷言语理解题库.json`
- `/Users/miduoduo/Downloads/【四海】言语理解题本.pdf`
- `/Users/miduoduo/Downloads/【四海】26海海刷言语理解题本-答案汇总.pdf`

导入事实：

- 总题数 450
- 逻辑填空 231
- 片段阅读 219
- 已用答案汇总 PDF 按模块顺序比对，450 题答案 0 个不一致
- Excel 的 `题号` 列不可靠，10/20/30 会变成 `0`，11-19 显示为 1-9
- 导入时必须使用“来源模块内顺序号”重建题号，不能信 Excel 原题号列

当前真实页面先接入了 `花生海海刷 · 逻辑填空`。片段阅读数据已在表中，但真实 UI 还没有完整做片段阅读专项页和解析体验。

## 后端实现

主要文件：

- `backend/database.py`
- `backend/models.py`
- `backend/main.py`

### 数据表

`highfreq_vocab`

- 新增/使用字段：`examples`、`source`、`search_url`
- 用于内置成语词库内容
- 不存用户学习状态

`vocab_learning_state`

- 用户成语学习状态表
- 用 `user_id + vocab_source + word` 唯一定位
- 存学习次数、遗忘次数、间隔、是否掌握、是否收藏、上次学习日、下次复习日
- 后端用户归属来自 JWT 当前用户

`question_banks`

- 题库来源表
- 当前来源包含 `huasheng_haihai`
- 后续 `夸夸刷` 等新题库应作为新的 bank 接入，不另起系统

`verbal_questions`

- 言语题目表
- 字段包括题库来源、题型、来源模块、模块内顺序号、题干、选项 JSON、正确答案、解析、关联词语 JSON、指纹
- 指纹索引不是唯一约束，因为真实数据可能存在同题多来源或重复题，后续需要用业务层归并

`verbal_attempts`

- 用户作答记录表
- 存当前用户、题目、选择、是否正确、用时、创建时间
- 用户归属来自 JWT 当前用户

### API

词库：

- `GET /api/vocab/highfreq`
- `GET /api/deck/vocab/highfreq?limit=1000`
- `GET /api/vocab/sources`
- `GET /api/vocab/custom`
- `POST /api/vocab/custom/upload`
- `DELETE /api/vocab/custom`
- `GET /api/vocab/state`
- `PUT /api/vocab/state`

言语题库：

- `GET /api/verbal/banks`
- `GET /api/verbal/questions`
- `POST /api/verbal/attempts`
- `GET /api/verbal/attempts`

权限规则：

- 高频词库、词库状态、言语题库和作答记录目前都要求登录
- 题目默认不返回答案，作答后通过 attempts 接口返回答案和解析
- 后端从 JWT 取当前用户，不能相信前端传入的用户 ID

## 前端实现

主要文件：`智学成语-高级版.html`

实现方式：在原页面原位修改，保留浅色学习面板、宣纸感、金色点缀、顶部模块、中央学习卡、右侧统计/计划/热力图/卡片库结构。

### 成语学习界面

当前效果：

- 内置词库显示 801 个成语
- 成语卡正面显示词语和学习状态
- 点击卡片翻面后显示：
  - 成语解释
  - `例句` 标题
  - Excel 表格 `例句` 列内容，保留换行
  - `人民网搜索` 链接
- 例句显示在人民网链接上方
- 页面不会写“人民网例句”

相关前端函数：

- `buildIdiomCard`
- `replaceIdiomsFromSource`
- `fetchHighFreq`
- `formatIdiomMeaning`
- `renderLearningCard`

### 学习逻辑

当前模式按钮：

- `今日任务`
- `全部词库`
- `易忘攻克`

右侧卡片库筛选：

- `全部`
- `到期`
- `易忘`
- `收藏`

当前逻辑：

- 今日任务由到期复习 + 今日新词组成
- 全部词库只是浏览，不清空今日队列
- 易忘攻克基于 `forgetCount`
- 收藏状态进入收藏筛选，刷新后保留
- 每日目标统一使用 `daily_goal`
- 已修复“目标 35 但学完 10 个误判完成”的问题
- 如果 `已完成 + 队列剩余 < 今日目标`，页面会自动补未学/到期词条到今日队列

相关前端函数：

- `getDailyGoal`
- `setDailyGoal`
- `generateDailyQueue`
- `fillTodayQueueToGoal`
- `ensureTodayQueueReady`
- `handleResult`
- `syncVocabStateToBackend`

### 言语题库入口

当前效果：

- 顶部主模块栏不再显示 `言语题库`
- 在成语界面右侧卡片库下方有一个低调入口卡
- 点击后进入 `花生海海刷 · 逻辑填空`
- 顶部仍保持成语模块归属，不制造割裂的新主模块

相关前端函数：

- `switchDeck('verbal')`
- `renderVerbalAll`
- `renderVerbalQuestionCard`
- `loadVerbalQuestionsIfNeeded`
- `submitVerbalAnswer`

### 逻辑填空刷题界面

当前效果：

- 展示题干、A/B/C/D 四个选项
- 提交选择后显示正确答案和解析占位
- 当前解析为空时显示“暂无解析，先看正确答案。”
- 进入时默认拉取 `question_type=logic_fill&limit=20`
- 当前还没有完整题库筛选器、套题组卷、片段阅读专项 UI

### 题中词语悬停

当前效果：

- 题中词语按钮可 hover/focus
- 命中内置词库时显示浮层：
  - 词语
  - 来源：`内置词库`
  - 解释
  - `例句`
  - Excel 表格例句，保留换行
  - `加入今日任务`
  - `收藏`
  - `人民网`
- 未收录词显示：
  - 来源：`待补充`
  - 说明：词库暂未收录，可先收藏为待补充词条
  - 可加入今日任务或收藏
- hover 使用的是已加载到本地 `idiom_data` 的内置词库内容
- 进入言语题库时会刷新成语内置词库，避免旧缓存导致没有例句

相关前端函数：

- `hydrateBuiltinVocabForTooltips`
- `findIdiomDeckEntry`
- `showVerbalTermTooltip`
- `ensureTermCard`
- `setTermFavorite`
- `addTermToIdiomToday`

## 导入与校验脚本

主要脚本：

- `tools/verify_verbal_vocab_sources.py`
- `tools/import_verbal_vocab_sources.py`

报告：

- `doc/import-reports/verbal_vocab_source_validation.md`
- `doc/import-reports/verbal_vocab_source_validation.json`

截图证据：

- `doc/import-reports/app-vocab-verbal-smoke.png`
- `doc/import-reports/app-verbal-entry-under-idiom.png`
- `doc/import-reports/app-examples-verified.png`
- `doc/import-reports/app-q302-example-verified.png`
- `doc/import-reports/app-vocab-verbal-hover-favorite.png`
- `doc/import-reports/app-daily-goal-fill-verified.png`

数据库备份：

- 导入前会备份到 `/Users/miduoduo/Documents/gongtu-db-backups/before-vocab-verbal-import-*`
- 真正历史库备份位置见 `CURRENT_STATUS.md`

## 已验证内容

已实际验证：

- 高频成语 801 个唯一词条
- 801 个词条都有 `examples`
- 花生海海刷 450 题
- 逻辑填空 231 题
- 片段阅读 219 题
- PDF 答案汇总比对 0 个不一致
- 未登录接口受限
- A/B 用户词库状态隔离
- A/B 用户作答记录隔离
- 题目默认答案隐藏
- 成语翻面显示解释、Excel 例句、人民网搜索链接
- 例句在人民网链接上方
- 页面不再出现“人民网例句/去人民网搜索例句”等误导文案
- 题中词语 hover 命中 `齐头并进` 时显示内置词库解释和 Excel 例句
- 未收录词可作为待补充词条收藏并加入今日任务
- 收藏刷新后保留，登出再登录后保留，其他用户不可见
- 切换全部词库不清空今日任务队列
- 每日目标 35、已完成 10、队列空时会自动补 25 个，不再误判今日完成
- HTML 内联脚本解析通过
- `git diff --check` 在允许 CRLF 的配置下通过

固定检查：

- `npm run doctor` 在当前主应用 worktree 失败，原因是 `/Users/miduoduo/Documents/xixi_gongtu-main-app/package.json` 不存在。该失败已在 `CURRENT_STATUS.md` 中记录，不是本功能代码语法失败。

## 从“优化片段阅读题库拆分方案”线程提炼的整合要求

用户希望片段阅读这次不要重蹈 OCR 大量错误、答案对不上、后期人工补救很痛苦的覆辙。

片段阅读题库处理原则：

- 不要一次性粗暴 OCR 全部材料
- 按小份拆分，例如一套题或 10/20 题为一个处理单位
- 原题 PDF 和解析 PDF 要分开核验
- 最好亲自视觉检查题干、选项、答案、解析和旁注
- 每个小批次都要能独立校验，不要等全部做完才发现题号和答案错位
- 题号不能盲信 Excel 导出列，要用模块内顺序和答案汇总交叉校验
- 片段阅读正式接入前，应先建立小批次验收表，记录哪些题已视觉核验，哪些题只是初步导入

主站整合分工：

- 主站总装对话负责统一页面、统一用户、统一记录、AI 教练和综合复盘
- 言语题库对话只负责题目、答案、解析、Skill、题型标签准确
- 数量题库对话只负责数量题库核验、题型、方法、难度、用时标签
- 几何对话只负责三视图、截面模型和交互正确
- 申论对话只保留原申论能力，提供批改摘要和复盘数据
- 其他对话不要修改统一导航、登录、用户表或 AI 教练

统一页面方向：

- 后续不应只是一个成语页外挂题库，而要整理成一个总学习页面
- 复盘页不能把“强证据/待补证据”这类后台判断词暴露给用户
- 复盘页应表达成用户能理解的：
  - 最近容易错在哪里
  - 为什么会错
  - 下一步练什么
  - 练完是否有改善
- 套题实战页不能只是说明卡，应该成为真实组卷入口：
  - 训练模式：言语专项、数量专项、行测混合
  - 题型构成
  - 预计用时与计时方式
  - 做题顺序建议
  - 开始后题号进度
  - 完成后正确率、用时和放弃策略复盘
- 数量板块后续要发挥核心能力：
  - 识别题型
  - 判断必做、可做、先跳
  - 选择方法
  - 控制单题时间
  - 记录步骤卡点
  - 通过同类题验证是否真正掌握

## 后续整合建议

### 第一阶段：统一正式外壳

目标：

- 把当前 V3/demo 方向落成真实主站外壳
- 保留当前成语页风格优势
- 重做复盘页和套题页，不暴露后台术语

不要做：

- 不要让各题库对话各自接主站
- 不要新建第二套用户 ID
- 不要重做成语页视觉

### 第二阶段：统一学习记录合同

建议建立统一事件/记录合同，至少包括：

- `user_id`
- `module`：idiom/verbal/quantity/geometry/shenlun
- `source_bank`
- `question_id` 或 `word`
- `action`：study/answer/favorite/review/skip/timeout
- `is_correct`
- `duration_ms`
- `tags`
- `created_at`

当前已有：

- 成语状态：`vocab_learning_state`
- 言语作答：`verbal_attempts`
- 旧学习事件：`learning_events`

后续要决定是复用旧 `learning_events`，还是新增统一跨模块表。不要在各模块里各写一套互不兼容的记录结构。

### 第三阶段：接片段阅读

当前 `verbal_questions` 已有片段阅读 219 题，但 UI 只先接了逻辑填空。

片段阅读接入最小方案：

- 在言语题库入口里增加题型选择：逻辑填空 / 片段阅读
- `GET /api/verbal/questions?question_type=reading_comprehension`
- 页面展示长题干和选项时要适配更长文本
- 答案和解析默认仍在作答后显示
- 如果解析缺失，明确显示“暂无解析”，不能假装已有完整解析
- 每批片段阅读题需要视觉核验记录

### 第四阶段：组卷与套题

当前题库结构支持按 bank/type/source_module 拉题，但还没有正式套题表。

建议新增或约定：

- `exam_sets`
- `exam_set_items`
- `exam_attempts`
- `exam_attempt_items`

套题应支持：

- 言语专项
- 数量专项
- 行测混合
- 自定义题型构成
- 计时
- 跳题/标记
- 完成后复盘

### 第五阶段：AI 教练上下文

AI 教练不要直接读散乱 localStorage，应读后端统一上下文。

建议上下文包括：

- 用户近期学习目标和完成情况
- 成语易忘词、收藏词、最近错词
- 言语题型正确率
- 逻辑填空常错词/常错关系
- 片段阅读常错类型
- 数量题型、方法、用时、跳题记录
- 申论批改摘要
- 空间图推交互记录

给用户展示时不要说“强证据/弱证据/待补证据”，改为自然学习建议。

## 已知未完成

- 当前真实页面只接入 `花生海海刷 · 逻辑填空` 的基本刷题流
- 片段阅读 UI 未完成
- 题库筛选和题库来源选择未完成
- 套题/组卷未完成
- AI 教练未接入真实统一上下文
- 综合复盘页未完成
- 数量关系、空间图推、申论还没有统一接入当前总页面
- 当前分支未 commit、未 push
- 主应用 worktree 没有 `package.json`，`npm run doctor` 会失败

## 接手时先做什么

1. 读 `AGENTS.md`、`CURRENT_STATUS.md`、`TASKS.md`、`.ai_rules.md`、`错误复盘.md`。
2. 确认当前分支仍是 `cx/vocab-verbal-original-ui`。
3. 不要直接改 `main`。
4. 先跑：

```bash
git status --short --branch
npm run doctor
```

5. 如果继续开发当前页面，再跑：

```bash
backend/venv/bin/python -m py_compile backend/database.py backend/models.py backend/main.py backend/auth.py backend/mindmap.py backend/shenlun.py start_gontu.py
node - <<'NODE'
const fs = require('fs');
const html = fs.readFileSync('智学成语-高级版.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
scripts.forEach(code => new Function(code));
console.log('parsed scripts:', scripts.length);
NODE
git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check
```

6. 启动本地服务：

```bash
cd /Users/miduoduo/Documents/xixi_gongtu-main-app/backend
venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8888
```

7. 打开：

```text
http://127.0.0.1:8888/app
```

## 绝对不要误报完成

- 没有视觉核验的片段阅读题，不要说“已完整上线”
- 没有用户隔离验证，不要说“用户数据安全”
- 没有刷新/登出重登验证，不要说“已持久化”
- 例句不是人民网抓取，不要写成人民网例句
- 题库答案只要没有和答案汇总/PDF/视觉核验对上，不要说“答案正确”
- 当前只有逻辑填空基本刷题，不要说“言语理解全功能完成”
- 当前只是主站专项分支，未 commit 未 push，不要说已合并
