# 当前开发状态

更新时间：2026-07-05
当前分支：`feature/csg-v2-integration`
当前里程碑：M5A 考公立体图推动态解题与讲解

## 当前任务

- 状态：● 已完成
- 编号：LESSON-014L
- 任务：`fix: 纠正基础截面正多边形与直角三角形规则`

## 本轮结论

- 你指出的“正方体直角三角形看不懂”问题成立：上一版把按钮名称当真实分类，容易把削角三角形讲成直角三角形。
- 已把正方体/长方体“直角三角形”移入“不能直接截出”；点击后仍展示真实削角截面，但实时卡明确写“等边三角形，不是直角三角形”。
- 正方体五边形已讲清通常不是正五边形，不能用标准正五边形去理解。
- 正方体正六边形已讲清：刀片垂直体对角线，穿过六条棱的中点，六条边等长；离开中心后仍可能是六边形，但不一定正。
- 梯形默认参数已从容易一拖就变三角形的边缘位置，改成更稳定的 `[0.15, 0.5, 0.5] / offset 0.36 / limit 0.18`；默认和拖到 `偏移 +18` 都保持 4 点真实梯形。
- 页面版本已升到 `/section-foundation.css?v=20260705b` 与 `/section-foundation.js?v=20260705b`。

## 交付文件

- `section-foundation.html`
- `section-foundation.js`
- `tests/reasoning-lesson-layout.test.mjs`
- 审计：`TASKS.md`、`CURRENT_STATUS.md`、`doc/AGENT_WORK_LOG.md`

## 唯一下一项

LESSON-015：重做手动探索为更丝滑的滑动式截面验证。

## 验收证据

- 已通过：`git diff --check` 未发现空白错误。
- 已通过：`node --check section-foundation.js`。
- 已通过：`node --experimental-loader ./tests/three-absolute-loader.mjs --test tests/reasoning-lesson-layout.test.mjs`，13/13 通过。
- 已通过：应用浏览器打开 `/section-foundation.html`，确认加载 CSS `v=20260705b`、JS `v=20260705b`。
- 已通过：应用浏览器确认“直角三角形”不在正方体“常见能截出”，只在“不能直接截出”；点击后大 3D `actual=等边三角形`、`vertices=3`，实时截面提示“不是直角三角形”。
- 已通过：应用浏览器点击“五边形”后，大 3D `vertices=5`，文案包含“不是正五边形”。
- 已通过：应用浏览器点击“六边形”后，大 3D `vertices=6`，文案包含“六条棱的中点”和“6 条边等长”。
- 已通过：应用浏览器点击“梯形”后，大 3D `vertices=4`；上下拖动到 `偏移 +18` 后仍为 4 点梯形，实时截面同步显示“正方体当前真实截面：梯形”。
- 已通过：应用浏览器控制台 error/warning 为空。
- 本地提交：本任务所在提交。
- 推送状态：本任务完成后推送到 `origin/feature/csg-v2-integration`。
