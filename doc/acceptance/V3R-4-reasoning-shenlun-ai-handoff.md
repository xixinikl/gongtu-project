# V3R-4 图推与申论 AI 上下文闭环验收

日期：2026-07-13

隔离预览：`v3-repair`，验收 URL `http://127.0.0.1:64987`，数据库 `backend/data.db`。验收账号只用于当前隔离数据命名空间。

## 平面图推

1. 在正式 `/mindmap` 新建错题“V3R-4 huasheng13 窄路由验收题”，节点为“有一样的图案 > 完全一样 > 【1】位置 > 平移 > 非宫格类”，正确答案 C。
2. 服务端创建本人活动 `mindmap:question:1`；AI 链接只携带 `module=reasoning.planar`、`context_kind=activity`、活动 ID 和同源 `/mindmap?question=1`。
3. AI 页面在新建线程前显示 `Skill planar-reasoning-coach · v1.1.0`。
4. 新建线程后数据库上下文只含本人错题，`provenance.owner_verified=true`；题目答案来源标为 `user_supplied`，未伪装为官方题库答案。
5. 返回链接恢复 `/mindmap?question=1`，详情弹窗与“带这道错题问西西”均恢复。

## 立体图推

1. 正式 `/section-foundation.html` 打开即由服务端创建本人 visit 记录，页面 AI 动作为“带当前空间训练问西西”。
2. AI 页面显示 `Skill spatial-reasoning-coach · v1.1.0`。
3. 新建线程后服务端解析出 `module_id=reasoning.spatial`、`activity.type=visit`、`stage_id=foundation`、`last_position=/section-foundation.html`，来源为 `spatial_learning_records` 且 `owner_verified=true`。
4. `return_url` 为同源 `/section-foundation.html`。本次同时修复空间 visit 的 `source_id` 与统一活动来源不一致问题，避免真实入口被误判为陈旧记录。

## 申论

1. 在正式 `/shenlun` 选择“二期第四套·第4题”公文题；URL 写入 `?question=q4-4`。
2. 进入 AI 教练时页面显示 `Skill feiyang-shenlun-perspective · v1.1.0`；Skill Registry 的批改任务加载飞扬心智模型、决策启发式与 huasheng13 申论窄补充，方法追问才额外加载飞扬公文模板。
3. 返回链接恢复 `/shenlun?question=q4-4` 和原选中题。
4. 当前隔离预览没有 provider key，因此没有伪造一次成功批改。成功批改后才发布 `shenlun.review` 活动；该路径由受控 provider API 测试验证 `activityId=shenlun-grade:{record_id}`，失败路径不生成活动。

## huasheng13 渐进加载

- 上游 20 个 reference、9,326 行没有被整包复制或加载。
- 六个业务模块各只绑定一份任务窄适配；申论的核心仍是飞扬 Skill。
- `test_huasheng13_is_task_scoped_instead_of_loading_the_full_corpus` 逐模块断言只出现本模块适配文件，不出现其他适配、上游真题示例或申论素材库。
- 完整映射与来源/许可边界见 [V3-skill-routing-matrix.md](V3-skill-routing-matrix.md)。

## 自动验证

- Python Skill/AI Coach/申论专项：33/33。
- Node AI 页面与训练交接专项：17/17（加入真实 Skill ID/版本可见性门禁）。
- 言语直接诊断版本回归已更新为 `verbal-reading-skill v1.2.0`。
- `git diff --check` 通过。

## V3R-4 边界

V3R-4 证明了三类正式入口、正确 Skill、本人服务端上下文和安全返回。真实 provider run 的 `package_hash`/`bundle_hash` 全量回归、跨用户负例与失败提示合同属于 V3R-5；桌面/手机全路径视觉与用户亲看确认属于 V3R-6。
