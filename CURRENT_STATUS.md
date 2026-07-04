# 当前开发状态

更新时间：2026-07-04
当前分支：`feature/csg-v2-integration`
当前里程碑：M5A 考公立体图推动态解题与讲解

## 当前任务

- 状态：● 已完成
- 编号：LESSON-014K
- 任务：`fix: 基础截面实时截面同步真实切面`

## 本轮结论

- 你指出的问题成立：上一版右侧实时截面仍然用预设图形生成，不是由当前 3D 切面真实交点生成；因此用户拖动切面时，3D 真实截面已经变化，实时截面却还显示目标形状。
- 你指出的“梯形”问题也成立：正方体“梯形”的旧切面参数实际被分类为正方形/非梯形，不能作为梯形示例。
- 已删除旧 `shapePoints`/`makeShapeGeometry` 预设绘图死代码，避免实时截面再次走假形状路线。
- `renderLiveSection` 已改为读取 `viewer.currentSectionPoints`：实时截面由当前 3D 切面与立体真实交点的局部坐标生成，并同步显示真实顶点点位。
- 大 3D 截面新增真实顶点标记；卡片缩略图也新增顶点标记，并改为更接近正对当前切面的投影，避免五边形/梯形被视角压成别的形状。
- 正方体“梯形”参数已改为 `[0.8, 1, 1] / offset 0.5`，默认真实分类为梯形。
- 页面版本已升到 `/section-foundation.css?v=20260705a` 与 `/section-foundation.js?v=20260705a`，避免浏览器缓存旧实现。

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
- 已通过：应用浏览器打开 `/section-foundation.html`，确认加载 CSS `v=20260705a`、JS `v=20260705a`。
- 已通过：应用浏览器点击“五边形”后，右侧 3D `data-section-vertex-count=5`、实时截面 `data-vertex-count=5`、中栏缩略图 `data-section-vertices=5`。
- 已通过：应用浏览器拖动五边形切面后，右侧 3D 与实时截面均变为 4 点，真实形状显示为“梯形”，实时文案显示“目标：五边形”。
- 已通过：应用浏览器点击“梯形”后，默认 `data-actual-section=梯形`，实时文案显示“正方体当前真实截面：梯形”。
- 已通过：应用浏览器控制台 error/warning 为空。
- 已通过：已用浏览器截图检查五边形拖动后的同步状态，右侧实时截面和 3D 顶点数一致。
- 本地提交：本任务所在提交。
- 推送状态：本任务完成后推送到 `origin/feature/csg-v2-integration`。
