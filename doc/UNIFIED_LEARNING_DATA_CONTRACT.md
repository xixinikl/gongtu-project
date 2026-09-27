# 公途统一学习记录合同

> 版本：v1（2026-07-13）
> 适用阶段：`gongtu-unified-learning-platform` Phase 2 及后续接入阶段
> 原则：垂直业务表继续保存题目与专业事实，统一层只负责跨模块活动、问题、任务和时间线索引。

## 1. 身份与信任边界

- 唯一用户主键是现有 `users.id`。
- 后端只接受 `require_user` 从 JWT 解析出的 `user_id` 作为数据归属。
- 请求体或查询参数中即使出现 `user_id`，也不得用于确定数据所有者。
- 所有读取、更新和删除都必须同时包含记录 ID 与 JWT 用户 ID 条件。
- 登出只清理浏览器中的 `gontu_token`、`gontu_user` 和必要身份缓存，不删除服务端学习记录。

## 2. 模块标识

| module_id | 用户板块 | 首批数据来源 |
| --- | --- | --- |
| `verbal.vocab` | 词语积累 | 词库及学习状态表 |
| `verbal.logic_fill` | 逻辑填空 | 231 题题库及作答记录 |
| `verbal.reading` | 片段阅读 | `verbal_practice_sessions` 等 600 题记录 |
| `verbal.exam` | 言语套题 | 统一活动层，Phase 3 接真实组卷 |
| `quantity.practice` | 数量单题训练 | Phase 3 接数量题库记录 |
| `quantity.exam` | 数量套题 | Phase 3 接数量题库记录 |
| `reasoning.planar` | 平面图推 | `questions` 错题记录及思维导图状态 |
| `reasoning.spatial` | 立体图推 | Phase 4 接空间训练记录 |
| `shenlun.review` | 申论批改 | `shenlun_history` |
| `planning.global` | 综合规划 | AI 教练生成的跨模块任务 |

模块标识是稳定 API 合同。页面名称可以优化，已写入记录的 `module_id` 不随文案变化。

## 3. 数据分层

### 3.1 垂直事实层

继续由现有专业表保存：

- 题干、选项、标准答案、官方解析与媒体；
- 用户逐题答案、改选、用时、得分；
- 成语解释、用户例句、人民网链接和词库状态；
- 申论原答、批改结果；
- 图推错题与空间训练专业状态。

统一层不得复制后改写这些事实，也不得把 AI 输出冒充官方解析。

### 3.2 统一索引层

| 表 | 用途 | 关键归属 |
| --- | --- | --- |
| `learning_activities_v2` | 一次训练、套题、批改或复习活动摘要 | `user_id + module_id` |
| `learning_issues_v2` | 可继续训练的用户问题结论 | `user_id + module_id + issue_key` |
| `learning_issue_evidence_v2` | 支撑问题结论的题目或活动证据 | `user_id + issue_id` |
| `learning_tasks_v2` | 下一步训练任务及结果 | `user_id + module_id` |

`internal_confidence` 仅供程序和 AI 路由使用，不直接返回给普通用户界面。前台使用“多次出错”“还需几题确认”“已有改善”等用户语言。

## 4. API 合同

统一路由前缀为 `/api/learning`：

- `POST /activities`：建立活动；服务端生成 ID 并绑定 JWT 用户。
- `PATCH /activities/{id}`：更新本人活动状态、用时与摘要。
- `GET /activities`：按本人、模块和时间读取。
- `POST /issues`：以 `module_id + issue_key` 为本人新增或更新问题，并追加证据。
- `GET /issues`：读取本人的问题结论；不暴露内部置信度。
- `POST/PATCH/GET /tasks`：建立、完成及读取本人的下一步任务。
- `GET /timeline`：合并统一活动和已兼容垂直表的只读摘要。

统一层摘要只存复盘所需的最小信息。详情页应通过 `source_id` 回到垂直模块读取完整事实。

## 5. 现有数据盘点与兼容映射

| 现有领域 | 当前归属方式 | Phase 2 处理 | 后续动作 |
| --- | --- | --- | --- |
| 账号 | `users.id` | 继续作为唯一主键 | 无第二套 UC ID |
| 言语片段阅读 | `verbal_practice_sessions.user_id` 及关联表 | 时间线只读映射为 `verbal.reading` | Phase 3 写入统一活动索引 |
| 申论历史 | `shenlun_history.user_id` | 时间线只读映射为 `shenlun.review` | Phase 4 输出问题与任务 |
| 平面图推错题 | `questions.user_id` | 时间线只读映射为 `reasoning.planar` | Phase 4 统一身份类型并输出证据 |
| 成语词库状态 | 交接工作区中的用户状态表 | 本阶段不搬运数据 | Phase 3 迁移并保持原卡片能力 |
| 逻辑填空 | 交接工作区 231 题 | 本阶段不搬运题库 | Phase 3 接题与作答；无原书解析时单列 AI 讲解 |
| 数量题库 | 60 套 600 题批准库 | 本阶段只保留模块合同 | Phase 3 重跑 pipeline 和交接第 8 节门禁后接入 |
| 立体图推 | 各训练页本地/专业状态 | 本阶段只保留模块合同 | Phase 4 接四段主链 |
| AI 对话 | 当前演示及板块上下文 | 本阶段不把聊天原文当问题结论 | Phase 5 持久化可训练结论与任务 |

## 6. 迁移与回滚

- 数据库初始化采用 `CREATE TABLE/INDEX IF NOT EXISTS`，可重复执行。
- Phase 2 不删除、不重命名、不回填覆盖任何垂直业务表。
- 时间线兼容器只读旧表；关闭统一路由不会改变旧模块数据。
- 回滚应用版本时可停止写入四张 `*_v2` 表，旧板块继续按原表工作。
- 如需彻底撤销统一层，必须先导出 `*_v2` 数据；删除统一表不是自动部署或普通回滚步骤。
- 后续每个模块接入时先双写或写统一索引、读垂直事实，验证稳定后再考虑去重；本 Goal 不做破坏性合表。

## 7. 验收门禁

- 未登录访问统一 API 返回 401。
- 伪造请求体 `user_id` 不改变 JWT 所有者。
- 用户 A 不能读取、修改或引用用户 B 的活动、问题、证据或任务。
- 同一用户刷新或重新请求后能读取既有记录。
- 登出不触发服务端删除；再次登录仍可恢复记录。
- 模块筛选在数据库查询阶段生效，不能因全局 `limit` 漏掉目标模块。
- 统一时间线能读取已兼容的言语、申论和平面图推摘要，且不跨用户泄露。
