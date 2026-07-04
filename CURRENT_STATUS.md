# 当前开发状态

更新时间：2026-07-04
当前分支：`feature/csg-v2-integration`
当前里程碑：M5A 考公立体图推动态解题与讲解

## 当前任务

- 状态：● 已完成
- 编号：LESSON-014H
- 任务：`fix: 删除右栏切法选择并口语化讲解`

## 本轮结论

- 你指出的问题成立：右栏“切法选择”三张卡会抢注意力，而且“切面放在哪里”的说法仍然偏专业。
- 已删除右栏“切法选择”卡片，右栏只保留讲解、3D 视口和实时截面。
- 右栏标题从“切面放在哪里”改为“这刀怎么摆”。
- 讲解文案改成学生听得懂的顺序：先看蓝色刀片怎么摆，再看它碰到几个面，最后看为什么变成这个截面。
- 默认正方体六边形说明改为：刀片斜着放，从上面三个面穿进去、从下面三个面穿出来；碰到 6 个面，所以边界有 6 条边。
- 不可行项“圆”改为：正方体没有圆滚滚的曲面，刀片不管怎么摆，碰到的边都是直的，所以不能直接切出圆。

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
- 已通过：`python3 -m http.server 8089` 已启动，`curl -I http://localhost:8089/section-foundation.html` 返回 `HTTP/1.0 200 OK`。
- 已通过：本地服务返回的 HTML 包含“这刀怎么摆”、`foundation-3d`、`live-section-svg`，并加载 `/section-foundation.js?v=20260704g`。
- 已通过：本地服务返回的 JS 包含“把刀片斜着放”“从上面三个面穿进去”“把蓝色刀片放在一个顶角上”“没有圆滚滚的曲面”。
- 已通过：反向检查确认旧的“切法选择 / demo-buttons / 当前切面位置 / 切面放在哪里”均不存在。
- 说明：内置浏览器自动控制仍被安全策略拦截；本轮未绕过策略，改用本地 HTTP 响应和专项测试完成验收闭环。
- 本地提交：本任务所在提交。
- 推送状态：本任务完成后推送到 `origin/feature/csg-v2-integration`。
