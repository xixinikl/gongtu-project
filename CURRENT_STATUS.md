# 当前开发状态

更新时间：2026-07-13
当前分支：`cx/realtime-preview-v1`
当前里程碑：PR #20 实时预览收口（进行中）

## 当前 Goal：`realtime-preview-closure`

- PR #20 为 Draft、CLEAN；远端仅含 `755cb96`，本地 `0aae184` 仅新增实时预览 CI，工作树干净且领先远端 1 个提交。
- 与工作流一致的 Node 24 合同测试 3/3、启动器语法和 Python 编译均通过。
- 完整 `npm run test:geometry` 的两项失败是既有 `backend/.env.example` 缺失和登录安全回跳合同缺失，均不在预览提交 diff 中；不混入 #20。
- `workflow` 授权已恢复，`0aae184` 与 Goal 记录已推送；实时预览的 GitHub push/PR workflow 均成功。PR #20 仍为 Draft/CLEAN、无审阅意见，接下来仅等待用户或仓库流程决定 Ready、审阅和合并。详情见 `doc/REALTIME_PREVIEW_CLOSURE.md`。

## 当前任务

- 状态：● 已完成
- 编号：HANDOFF-20260709
- 任务：`docs: 写入当前交接并上传 GitHub`

## 本轮结论

- 已创建开发分支 `cx/lesson-015-dynamic-explore`。
- 已完成 `LESSON-015A/015B`：动态解题页的滑动式切面手感、实时状态反馈、候选图/真实截面/3D 切面同屏对比。
- 已完成 `CASE-IMPORT-001`：把用户提供的视频题先抽取原题截图并以 draft 方式录入题库入口。
- 已完成 `THREEVIEW-001`：用用户提供的黑白块三视图题做第一道三视图训练 MVP。
- 已按用户反馈删掉三视图训练页前台“题目截图”区；原题图片仍留在数据文件里，作为来源追溯，不占训练页面空间。
- 已修复本地页面打不开的直接原因：`8089` 静态服务已重新启动，并新增 `npm run dev` / `npm run dev:static` 作为固定启动方式。
- 已完成 `DEVSERVER-002`：`npm run dev` 改为先检查 8089，未启动就后台启动，已启动就复用；新增 `npm run dev:status` 和 `npm run dev:stop`，避免前台服务断开后页面反复打不开。
- 已完成 `THREEVIEW-002`：沉淀三视图做题技巧模板，后续新题必须填短技巧、做题步骤和选项差异。
- 已完成 `THREEVIEW-003` 本地验收：三视图黑白方块训练升级为 50 道正式题、每 5 题一组、10 组训练；15 张用户截图保留为来源样本；题库由生成器产出并逐题程序校验。
- 训练页已从单题验证改为组训练：显示第几题、计时、历史记录；完成 5 题后显示正确率、总用时、平均用时和错题；记录保存在 localStorage，刷新后仍可见。
- 3D 讲解区已缩小为辅助验证区：答题前隐藏投影视图，答题后展示模型和主/左/右/俯四个投影；桌面和手机宽度下模型区不再被题目区撑大。
- 已完成 `THREEVIEW-004`：修正三视图题面二维视图和右侧 3D 固定视角不同向的问题；主/左/右/俯按钮现在由 `VIEW_CAMERA_POSES` 同源配置驱动，俯视图改为从上往下看。
- 已完成 `THREEVIEW-005`：按用户反馈把三视图训练页从临时 demo 感打磨为更正式的训练系统布局；三栏列宽、间距、按钮网格、响应式断点和背景视觉已重新收紧。
- 已完成 `THREEVIEW-006`：按用户反馈放弃三张不等高卡片硬对齐，改成左侧题目主工作区、右侧模型验证和做题技巧上下排列的两栏工作台；3D 高度受控，答题后投影视图宽屏一排展示。
- 已完成 `THREEVIEW-007`：修正“选完马上看立体摆法”的逻辑，未选择 A/B/C/D 前隐藏真实 3D、禁用视角按钮，并在选择后再解锁模型验证区。
- 已完成 `LESSON-015C`：动态解题页正式题加载后会先显示一个真实切面预览，3D 舞台右下角新增“正面看这一刀”浮层，同步展示 V2 真实截面的正面轮廓；第二道正式题题源图已裁成 996×430，只保留上方题干和选项区；草稿题仍保留在下拉中且明确为待核验。
- 本轮浏览器验收过程中发现并修复了一个初始化 bug：无切面 overview 帧返回了裸 camera，导致页面读取 `.camera.target` 失败；已修复为统一返回 `{ camera, plane }`，并在专项测试中补断言。
- 已完成 `LESSON-015D`：动态解题正式题初始 3D 相机现在沿真实切面法向正对橙色截面，不再只依赖右下角浮层；页面暴露 `#lesson-canvas[data-section-facing]` 作为验收指标，浏览器实测第二题为 `1.000`；用户本轮给出的草稿/视频题答案已入库，正式题冲突答案保留为待复核记录，不覆盖既有人工答案。
- 已完成 `LESSON-015E`：删除 3D 舞台内“正面看这一刀”小图卡片，改为只在三维模型本体里展示正面真实截面；正面预览相机退远、模型更轻、橙色截面更清楚；候选预览、实时截面、基础说明和候选/真实对比区均固定尺寸，点击 A/B/C/D 不再把 3D 舞台或下方截面区顶开。
- 已完成 `LESSON-015F`：动态解题页已改成先选后析；未选择 A/B/C/D 前解析卡、结论卡、切面控制和真实截面都锁住，点击选项后才展示候选/真实对照。真实截面 SVG 现在按当前 3D 相机方向投影，拖动/移动后下方“实时同步截面”和右侧“当前实际截面”使用同一份 camera projection。候选 C 的文案已改为“类型可验证”，不再把没完全对上的说成对上。
- 已完成 `HANDOFF-20260709`：新增 `doc/HANDOFF_2026-07-09.md` 作为本轮最新交接入口，记录当前仓库、分支、功能进度、验证状态、未完成项和新 Agent 接手步骤；`doc/AGENT_HANDOFF.md` 顶部已指向最新交接，避免旧机器路径误导。
- 本轮确认 GitHub 远端为 `https://github.com/xixinikl/gongtu-project.git`，不是 `canvas-storm`；用户说明只是 GitHub username 变化。
- 本轮 `npm run doctor` 未全绿：当前 shell Node.js 18.20.8 低于项目要求 20+，Python 3.9.6 低于项目要求 3.10+；8089 和 8888 均已监听。

## 交付文件

- `reasoning-lesson.html`
- `reasoning-lesson.css`
- `reasoning-lesson.js`
- `tests/reasoning-lesson-layout.test.mjs`
- `tests/reasoning-case-fixtures.test.mjs`
- `geometry/reasoning-case-validator.js`
- `spec/reasoning-case-v1.schema.json`
- `data/reasoning-cases/cone-box-001.json`
- `data/reasoning-cases/pyramid-cylinder-001.json`
- `data/reasoning-cases/draft-video-questions.json`
- `data/images/reasoning/pyramid-cylinder-001-question-crop.png`
- `three-view-training.html`
- `three-view-training.css`
- `three-view-training.js`
- `tests/three-view-training.test.mjs`
- `package.json`
- `README.md`
- `.gitignore`
- `tools/dev-server.mjs`
- `data/three-view-cases/black-white-blocks-001.json`
- `data/three-view-cases/black-white-blocks-50.json`
- `data/three-view-cases/technique-template.json`
- `data/images/three-view/black-white-blocks-001-source.jpg`
- `data/images/three-view/sources/`
- `three-view-case-engine.js`
- `tools/generate-three-view-bank.mjs`
- `doc/THREE_VIEW_TEACHING_TEMPLATE.md`
- `doc/HANDOFF_2026-07-09.md`
- `data/reasoning-cases/draft-video-questions.json`
- `data/images/reasoning/drafts/`
- 审计：`TASKS.md`、`CURRENT_STATUS.md`、`doc/AGENT_WORK_LOG.md`

## 下一项

提交并推送当前分支到 `origin/cx/lesson-015-dynamic-explore` 后，等待用户验收 `LESSON-015F`。验收入口：`http://127.0.0.1:8089/reasoning-lesson.html?case=pyramid-cylinder-001&verify=front-facing&fresh=015f4`。重点看未选项时是否先作答、选 C 后是否只说“类型可验证”、移动切面后下方截面图是否跟 3D 当前方向一致。

## 本轮验收重点

- 未选择 A/B/C/D 前：只让学生先判断，解析卡、结论卡、候选/真实对比、真实截面图和切面控制都不能提前暴露。
- 点击选项后：再显示候选图、真实截面图、逐项验证和讲解控制。
- 截面同步：`#section-preview-svg` 与 `#comparison-actual` 必须使用同一份按当前 3D 相机方向投影的 SVG。
- 文案诚实：C 这类可行截面只能写“类型可验证/可以出现”，不能写成“图形能对上”。

## 验收证据

- 已执行（HANDOFF-20260709）：`npm run doctor`，结果未全绿；Node.js 18.20.8 低于 20+，Python 3.9.6 低于 3.10+，8089/8888 端口均监听。
- 已通过（HANDOFF-20260709）：新增交接文档并更新当前状态、任务看板和工作日志；`git diff --check` 通过。
- 已通过（HANDOFF-20260709）：`node --check reasoning-lesson.js && node --check three-view-training.js && node --check tools/doctor.mjs && node --check tools/dev-server.mjs`。
- 已通过（HANDOFF-20260709）：`node --test tests/reasoning-lesson-layout.test.mjs`，17/17 通过。
- 已通过（HANDOFF-20260709）：`node --test tests/reasoning-case-fixtures.test.mjs`，12/12 通过。
- 已通过（HANDOFF-20260709）：`node --test tests/three-view-training.test.mjs`，6/6 通过。
- 已通过（HANDOFF-20260709）：`npm run test:geometry`，572/572 通过。
- 已通过（LESSON-015F 最终）：`node --check reasoning-lesson.js`。
- 已通过（LESSON-015F 最终）：`node --test tests/reasoning-lesson-layout.test.mjs`，17/17 通过。
- 已通过（LESSON-015F 最终）：`node --test tests/reasoning-case-fixtures.test.mjs`，12/12 通过。
- 已通过（LESSON-015F 最终）：`npm run test:geometry`，572/572 通过。
- 已通过（LESSON-015F 最终）：浏览器打开 `/reasoning-lesson.html?case=pyramid-cylinder-001&verify=front-facing&fresh=015f4`，初始 `shapeComparisonClassHidden=true`、`verdictClassHidden=true`、`foundationClassHidden=true`、`previous/play/next/up/range` 全部禁用、`sectionProjection=locked`、`engineText=先选一个选项后显示真实切面`、控制台 error/warn 为空；点击 C 后 `selectedCard=C`、`sectionProjection=camera`、`comparisonProjection=camera`、`sectionMatchesComparison=true`、`resultText=类型可验证`；点上移后 path 变化且仍 `sectionMatchesComparison=true`。
- 已通过（LESSON-015F 最终）：桌面与 390px 移动端截图已保存到 `output/playwright/lesson015f-desktop-after-reset.png`、`output/playwright/lesson015f-mobile-after-c.png`。
- 已通过（LESSON-015E 最终）：`node --check reasoning-lesson.js`。
- 已通过（LESSON-015E 最终）：`node --test tests/reasoning-lesson-layout.test.mjs`，17/17 通过。
- 已通过（LESSON-015E 最终）：`node --test tests/reasoning-case-fixtures.test.mjs`，12/12 通过。
- 已通过（LESSON-015E 最终）：`npm run test:geometry`，572/572 通过。
- 已通过（LESSON-015E 最终）：`git diff --check -- reasoning-lesson.html reasoning-lesson.css reasoning-lesson.js tests/reasoning-lesson-layout.test.mjs`。
- 已通过（LESSON-015E 最终）：`npm run dev:status` 返回 `open=true`、`pidAlive=true`；`curl -I 'http://127.0.0.1:8089/reasoning-lesson.html?case=pyramid-cylinder-001&verify=front-facing'` 返回 `HTTP/1.0 200 OK`。
- 已通过（LESSON-015E 最终）：桌面浏览器加载 `reasoning-lesson.css/js?v=20260705h`，初始 `selected=null`、`frontCardExists=false`、`engineText=真实截面 · 1 个轮廓`、`sectionFacing=1.000`、实时截面 path 数 1、控制台 error/warn 为空。
- 已通过（LESSON-015E 最终）：桌面 1440×1000 下未选和 A/B/C/D 点击后，3D 舞台均保持 `y=174 height=520`，下方截面区均保持 `y=694 height=223`，右侧基础说明/对比图均保持 `y=276 / y=402`。
- 已通过（LESSON-015E 最终）：移动端 390×844 下 `documentWidth=390` 无横向溢出；未选和 A/B/C/D 点击后，3D 舞台均保持 `x=11 y=839 width=368 height=470`，控制台 error/warn 为空。
- 已通过（LESSON-015E 最终）：截图已保存到 `output/playwright/lesson015e-desktop-initial-final.png`、`output/playwright/lesson015e-desktop-front-facing-v4.png`、`output/playwright/lesson015e-mobile-front-facing.png`。
- 已通过：`node --check reasoning-lesson.js`。
- 已通过：`node --check geometry/reasoning-case-validator.js`。
- 已通过：`node --test tests/reasoning-lesson-layout.test.mjs`，17/17 通过。
- 已通过：`node --test tests/reasoning-case-fixtures.test.mjs`，12/12 通过。
- 已通过：`npm run test:geometry`，572/572 通过。
- 已通过：`git diff --check`。
- 已通过：`curl -I 'http://127.0.0.1:8089/reasoning-lesson.html?case=pyramid-cylinder-001'` 返回 `HTTP/1.0 200 OK`。
- 已通过：`curl -I 'http://127.0.0.1:8089/reasoning-lesson.html?case=cone-box-001'` 返回 `HTTP/1.0 200 OK`。
- 已通过：应用浏览器打开 `http://127.0.0.1:8089/reasoning-lesson.html?case=pyramid-cylinder-001&verify=front-facing`，加载 `reasoning-lesson.css?v=20260705f` / `reasoning-lesson.js?v=20260705f`，`engineText=真实截面 · 1 个轮廓`，`#lesson-canvas[data-section-facing]=1.000`，正对截面 SVG 有 1 个 path 和 3 个顶点，控制台 error/warn 为空。
- 已通过：`curl -I 'http://127.0.0.1:8089/data/images/reasoning/pyramid-cylinder-001-question-crop.png'` 返回 `HTTP/1.0 200 OK`；本地 PNG 尺寸为 996×430。
- 历史记录（LESSON-015C，当时仍有浮层；LESSON-015E 已删除该浮层）：应用浏览器刷新第二题后页面加载完成，`engine=真实截面 · 1 个轮廓`，当时正对截面 SVG 有 `.section-shape` 和 3 个顶点；第二题题图使用 `/data/images/reasoning/pyramid-cylinder-001-question-crop.png`，natural size `996x430`；选项选中数为 0；控制台 error/warn 为空。
- 已通过：浏览器未点选项直接拖动三维区，竖向拖动后偏移 `+20%`，横向拖动后旋转 `-41°`，实时截面 path 和顶点同步变化。
- 已通过：浏览器逐项点击默认题 A/B/C/D、第二题 A/B/C/D，候选图和真实截面均不空，控制台 error/warn 为空。
- 已通过：浏览器打开 draft 链接，下拉草稿数 7，页面显示原题图、来源、`draft-unverified`、`待人工核验`，切面控件禁用，控制台 error/warn 为空。
- 已通过：切回正式题后 4 个选项恢复，第二题原题图显示，草稿提示清空。
- 已通过：`npm run test:geometry`，570/570 通过。
- 已通过：`node --check three-view-training.js`。
- 已通过：`node --test tests/three-view-training.test.mjs`，6/6 通过。
- 已通过：三视图训练页面源码不再包含 `source-image` / “题目截图”，题源图片仅保留在数据文件中。
- 已通过：已停掉手动服务并改用 `npm run dev` 启动；`lsof -nP -iTCP:8089 -sTCP:LISTEN` 显示 Python 正在监听；`curl -I 'http://127.0.0.1:8089/three-view-training.html?verify=threeview001'` 返回 `HTTP/1.0 200 OK`。
- 已通过：浏览器打开 `/three-view-training.html`，题目、4 个选项、18 块、3 黑 15 白、左/俯/主三种投影均加载，`validation=pass`。
- 已通过：浏览器点击 D 后显示“再想想”和错误理由；点击 C 后显示“答对了”和正确理由；控制台 error/warn 为空。
- 已通过：浏览器 3D canvas 截图非空，模型可见；main/left/top/free 四个视角按钮逐个切换成功；短技巧、4 条做题步骤、4 条选项差异实际显示。
- 已通过：`node --check three-view-case-engine.js`。
- 已通过：`node --check tools/generate-three-view-bank.mjs`。
- 已通过：`node --test tests/three-view-training.test.mjs`，6/6 通过，覆盖 50 题、10 组、15 张来源截图、每题投影一致、唯一答案、讲解话术、生成器可复现，以及 3D 固定相机与 2D 视图同向。
- 已通过：`npm run test:geometry`，570/570 通过。
- 已通过：浏览器打开 `/three-view-training.html?group=threeview-group-01`，页面显示 10 个训练组、第 1/5 题、4 个选项、2 个给定视图；答题前投影视图隐藏，模型区约 240-302px。
- 已通过：浏览器完整跑第 1 组 5 题；第 1 题先选错显示“再想想”和错误原因，再选对显示“答对了”；主/左/右/俯/自由视角按钮均切换成功；完成后结果区显示 `5/5 正确`、`正确率 100%`、总用时和平均用时；控制台 error/warn 为空。
- 已通过：浏览器刷新 `/three-view-training.html?verify=orientation-fix` 后逐个点击主/左/右/俯/自由，`data-camera-position` 分别为 `0,0,-7.2`、`7.2,0,0`、`-7.2,0,0`、`0,7.2,0`、`5.4,4.5,6.2`；`validation=pass`、`bankValidation=pass`，控制台 error/warn 为空。
- 已通过：浏览器刷新后历史记录显示“上次 5/5”，证明 localStorage 记录可恢复。
- 已通过：响应式验收：桌面 1366×768 下题目/模型/讲解三栏，模型区高度约 302px；手机 390×844 下单栏流式布局，选项两列，模型区约 302px；两种尺寸控制台 error/warn 为空。
- 已通过：三视图训练页两栏工作台验收：`three-view-training.css?v=20260705g` 已加载；1440×900 下左侧题目卡约 742px，右侧模型/技巧卡约 632px，模型区 240px，视角按钮为 3×2；1280×800 仍为两栏；980×820 和 390×844 自动单栏且无横向溢出；答题后 1440px 下 4 个模型投影视图为一排四列；`canvas.validation=pass`、`canvas.bankValidation=pass`，浏览器控制台 error/warn 为空。
- 已通过：本轮布局修改后 `node --check three-view-training.js`、`node --check three-view-case-engine.js`、`node --test tests/three-view-training.test.mjs` 6/6、`npm run test:geometry` 570/570、`git diff --check` 均通过。
- 已通过：三视图训练页选前锁定验收：浏览器加载 `three-view-training.css?v=20260705h` / `three-view-training.js?v=20260705e`；未选择前 `answered=false`、canvas `opacity=0`、`pointer-events=none`、`aria-hidden=true`、视角按钮全部禁用、统计徽标和投影视图隐藏；点击 A 后 `answered=true`、canvas 可见可操作、视角按钮启用、统计徽标和投影视图显示；`validation=pass`、`bankValidation=pass`，浏览器控制台 error/warn 为空。
- 已通过：本轮选后解锁修改后 `node --check three-view-training.js`、`node --check three-view-case-engine.js`、`node --test tests/three-view-training.test.mjs` 6/6、`npm run test:geometry` 570/570、`git diff --check` 均通过。
- 已通过：本地静态服务保活验收：`node --check tools/dev-server.mjs` 通过；`npm run dev` 在端口未开时后台启动 `pid=72457`；重复运行 `npm run dev` 显示已监听并复用；`npm run dev:status` 返回 `open=true`、`pidAlive=true`；`lsof -nP -iTCP:8089 -sTCP:LISTEN` 显示 Python 监听；`curl -I 'http://127.0.0.1:8089/three-view-training.html?verify=orientation-fix'` 返回 `HTTP/1.0 200 OK`；页面 HTML 引用 `three-view-training.css?v=20260705h` 与 `three-view-training.js?v=20260705e`。
- 本地提交：待本任务完成后提交。
- 推送状态：待本任务完成后推送到 `origin/cx/lesson-015-dynamic-explore`。
