# 当前开发状态

更新时间：2026-07-04
当前分支：`feature/csg-v2-integration`
当前里程碑：M5A 考公立体图推动态解题与讲解

## 当前任务

- 状态：● 已完成
- 编号：LESSON-014G
- 任务：`fix: 前置当前截面位置说明`

## 本轮结论

- 你指出的问题成立：原来真正的“切面放在哪里”说明被放在 3D 图下面，首屏看到的是旧的泛泛规则。
- 已把“当前切面位置”解释卡移到右栏标题下方、3D 视口上方。
- 顶部三张旧规则卡已改成“切法选择”，摘要直接来自当前位置规则，不再用旧的泛泛讲法顶在标题下。
- 默认正方体六边形首屏会直接说明：从一个角附近斜穿到对角附近，同时经过正方体的六个面。
- 点击不可行项“圆”时，会显示“为什么放哪里都不行”，说明正方体所有表面都是平面，无论放在哪里都不能直接得到圆。

## 交付文件

- `section-foundation.html`
- `section-foundation.css`
- `section-foundation.js`
- `tests/reasoning-lesson-layout.test.mjs`
- 审计：`TASKS.md`、`CURRENT_STATUS.md`

## 唯一下一项

LESSON-015：重做手动探索为更丝滑的滑动式截面验证。

## 验收证据

- 已通过：`git diff --check` 未发现空白错误。
- 已通过：`node --check section-foundation.js`。
- 已通过：`node --experimental-loader ./tests/three-absolute-loader.mjs --test tests/reasoning-lesson-layout.test.mjs`，13/13 通过。
- 已通过：浏览器打开 `/section-foundation.html`，右栏首屏显示“当前切面位置 / 正方体怎样截出六边形 / 切面从一个角的附近斜穿到对角附近，同时经过正方体的六个面”。
- 已通过：浏览器确认解释卡在 3D 视口之前，`explanationBefore3d = true`。
- 已通过：浏览器点击“圆”，顶部显示“为什么放哪里都不行 / 正方体不能直接截出圆”，实时截面显示“不能直接截出”。
- 本地提交：本任务所在提交。
- 推送状态：本任务完成后推送到 `origin/feature/csg-v2-integration`。
