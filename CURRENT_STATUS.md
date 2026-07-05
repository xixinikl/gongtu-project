# 当前开发状态

更新时间：2026-07-05
当前分支：`cx/lesson-015-dynamic-explore`
当前里程碑：M5A 考公立体图推动态解题与讲解

## 当前任务

- 状态：● 本轮完成，等待用户验收
- 编号：LESSON-015 / THREEVIEW-001 / THREEVIEW-002
- 任务：`feat: 动态解题手感、视频题草稿、三视图训练 MVP`

## 本轮结论

- 已创建开发分支 `cx/lesson-015-dynamic-explore`。
- 已完成 `LESSON-015A/015B`：动态解题页的滑动式切面手感、实时状态反馈、候选图/真实截面/3D 切面同屏对比。
- 已完成 `CASE-IMPORT-001`：把用户提供的视频题先抽取原题截图并以 draft 方式录入题库入口。
- 已完成 `THREEVIEW-001`：用用户提供的黑白块三视图题做第一道三视图训练 MVP。
- 已按用户反馈删掉三视图训练页前台“题目截图”区；原题图片仍留在数据文件里，作为来源追溯，不占训练页面空间。
- 已修复本地页面打不开的直接原因：`8089` 静态服务已重新启动，并新增 `npm run dev` / `npm run dev:static` 作为固定启动方式。
- 已完成 `THREEVIEW-002`：沉淀三视图做题技巧模板，后续新题必须填短技巧、做题步骤和选项差异。
- 当前不继续做 `LESSON-016`，等待用户验收后再进入四类训练总入口。

## 交付文件

- `reasoning-lesson.html`
- `reasoning-lesson.css`
- `reasoning-lesson.js`
- `tests/reasoning-lesson-layout.test.mjs`
- `three-view-training.html`
- `three-view-training.css`
- `three-view-training.js`
- `tests/three-view-training.test.mjs`
- `data/three-view-cases/black-white-blocks-001.json`
- `data/three-view-cases/technique-template.json`
- `data/images/three-view/black-white-blocks-001-source.jpg`
- `doc/THREE_VIEW_TEACHING_TEMPLATE.md`
- `data/reasoning-cases/draft-video-questions.json`
- `data/images/reasoning/drafts/`
- 审计：`TASKS.md`、`CURRENT_STATUS.md`、`doc/AGENT_WORK_LOG.md`

## 下一项

LESSON-016：建立四类训练总入口。

## 验收证据

- 已通过：`node --check reasoning-lesson.js`。
- 已通过：`node --test tests/reasoning-lesson-layout.test.mjs`，14/14 通过。
- 已通过：浏览器未点选项直接拖动三维区，竖向拖动后偏移 `+20%`，横向拖动后旋转 `-41°`，实时截面 path 和顶点同步变化。
- 已通过：浏览器逐项点击默认题 A/B/C/D、第二题 A/B/C/D，候选图和真实截面均不空，控制台 error/warn 为空。
- 已通过：浏览器打开 draft 链接，下拉草稿数 7，页面显示原题图、来源、`draft-unverified`、`待人工核验`，切面控件禁用，控制台 error/warn 为空。
- 已通过：切回正式题后 4 个选项恢复，第二题原题图显示，草稿提示清空。
- 已通过：`npm run test:geometry`，569/569 通过。
- 已通过：`node --check three-view-training.js`。
- 已通过：`node --test tests/three-view-training.test.mjs`，5/5 通过。
- 已通过：三视图训练页面源码不再包含 `source-image` / “题目截图”，题源图片仅保留在数据文件中。
- 未计入验收：本轮内置浏览器刷新 `127.0.0.1` 页面被工具安全策略拦截。
- 已通过：已停掉手动服务并改用 `npm run dev` 启动；`lsof -nP -iTCP:8089 -sTCP:LISTEN` 显示 Python 正在监听；`curl -I 'http://127.0.0.1:8089/three-view-training.html?verify=threeview001'` 返回 `HTTP/1.0 200 OK`。
- 已通过：浏览器打开 `/three-view-training.html`，题目、4 个选项、18 块、3 黑 15 白、左/俯/主三种投影均加载，`validation=pass`。
- 已通过：浏览器点击 D 后显示“再想想”和错误理由；点击 C 后显示“答对了”和正确理由；控制台 error/warn 为空。
- 已通过：浏览器 3D canvas 截图非空，模型可见；main/left/top/free 四个视角按钮逐个切换成功；短技巧、4 条做题步骤、4 条选项差异实际显示。
- 本地提交：待本任务完成后提交。
- 推送状态：待本任务完成后推送到 `origin/cx/lesson-015-dynamic-explore`。
