# 片段阅读真实 AI 契约 v1

本文是 `doc/goals/verbal-reading-real-ai-mvp.md` Phase 0 的实现合同。产品范围和完成状态仍以 Goal 为准。

## 1. 当前静态 AI 清单

`verbal-reading-pilot.html` 当前有以下模拟能力，Phase 2 接入前必须明确视为原型：

| 位置 | 当前来源 | 当前真实性 | 迁移规则 |
| --- | --- | --- | --- |
| `AI 教练短提示` | 每题 `ai_brief_example` | 静态样例 | 保留为开发参考，不作为实时诊断展示 |
| `getCoachDiagnosis()` | 前端按答案和标签拼接 | 规则模拟 | Phase 2由后端单题诊断替代 |
| `renderReport()`关键弱项 | 前端统计 `weak_steps` | 客观标签计数，不是模型判断 | 统计层可保留，必须标为“程序统计” |
| `getDrillBlueprint()` | 前端固定训练文案 | 规则模拟 | Phase 4由真实题库检索结果替代 |
| `同类题出题方案` | 前端模板 | 不是实际题目 | 不得在真实MVP中称为已推荐题 |

在 Phase 2 通过前，页面不得出现“真实AI已生成”或暗示DeepSeek已经参与的文案。

## 2. 事实分层

| 层 | 权威来源 | 可否被AI改变 |
| --- | --- | --- |
| 题库事实 | manifest中的正式JSON | 否 |
| 用户事实 | JWT当前用户的session/attempt记录 | 否 |
| 客观统计 | 服务端计算的正误、用时、改选、分布 | 否 |
| 方法规则 | `backend/data/verbal-reading-skill` | 只通过版本化文件更新 |
| AI判断 | 通过schema的DeepSeek输出 | 可以重试/重建，但必须保留run证据 |

## 3. 用户数据模型

### `verbal_practice_sessions`

- `id`: 服务端生成字符串ID。
- `user_id`: 从JWT当前用户写入，禁止接受请求体user_id。
- `set_id`: 必须存在于 `sets_manifest.json`。
- `status`: `in_progress | submitted`。
- `started_at`、`submitted_at`、`elapsed_ms`。
- `score`、`question_count`。
- 同一提交请求必须幂等，不能重复创建AI运行或覆盖首次提交事实。

### `verbal_attempt_items`

- `session_id`、`question_id`联合唯一。
- `first_answer`、`final_answer`、`change_count`。
- `elapsed_ms`由服务端接受受限增量或服务端时间戳计算，不能信任负数/极大值。
- `correct_answer`和`is_correct`由正式题库计算。

### `verbal_ai_runs`

- `kind`: `diagnosis | follow_up`。
- `provider`、`model`、`skill_version`。
- `status`: `queued | running | completed | failed | timed_out | invalid_output`。
- `latency_ms`、`usage_json`、`error_code`、`output_json`。
- 不保存API key、Authorization头或未脱敏异常请求。

### `verbal_ai_messages`

- 必须同时绑定`session_id`和JWT用户。
- 可选`question_id`必须属于该session题目集合。
- 角色只允许`user | assistant`。

### `verbal_training_recommendations`

- 推荐题必须存在于manifest。
- `reason_tags`至少覆盖题型、结构、方法、陷阱中的两个维度。
- 默认排除当前session已经作答题。

## 4. API 合同

所有API前缀为`/api/verbal-reading`，所有用户数据API必须JWT认证。

| 方法与路径 | 成功 | 关键失败 |
| --- | --- | --- |
| `POST /sessions` | 201，返回当前用户的新session | 401未登录；404/422无效set |
| `PUT /sessions/{id}/answers` | 200，upsert单题作答 | 403/404非本人session；409已提交 |
| `POST /sessions/{id}/submit` | 200，返回服务端成绩和AI状态 | 403/404非本人；422无有效作答 |
| `GET /sessions/{id}` | 200，恢复本人练习或结果 | 404隐藏他人资源存在性 |
| `GET /sessions` | 200，仅当前用户历史 | 401未登录 |
| `POST /sessions/{id}/diagnosis` | 202或200，真实provider运行 | 503缺配置；504超时；422输出非法 |
| `POST /sessions/{id}/messages` | 200/202，保存追问和AI回答 | 404非本人或题目不属于session |
| `GET /sessions/{id}/recommendations` | 200，真实原题列表 | 404非本人 |

错误响应不得包含内部堆栈、密钥、完整provider请求或其他用户ID。

## 5. AI 输出

权威JSON Schema：`spec/verbal-reading-ai-diagnosis-v1.schema.json`。

服务端在入库前必须额外验证：

1. `question_feedback`只引用本session题目。
2. `user_answer`等于数据库最终选择。
3. `correct_answer`等于正式题库答案。
4. `evidence_question_ids`非空且属于本session。
5. `recommended_question_ids`属于服务端提供的候选池。

模型输出和事实冲突时，run状态设为`invalid_output`，页面降级显示官方解析；禁止“尽量展示”。

## 6. Skill加载

- Skill入口：`backend/data/verbal-reading-skill/SKILL.md`。
- 当前版本：`1.1.0`。
- 必读引用：`references/methodology.md`、`references/response-contract.md`。
- 每个AI run记录skill_version和可复现的skill内容hash。
- 申论`feiyang-skill`不得进入片段阅读prompt。
- 采用渐进式加载：入口Skill只做任务路由；根据题型加载必要方法引用，再加载统一response contract。禁止把资料、数量、言语、判断、申论全科内容一次性发送给provider。
- 本项目方法事实源以正式题库的官方解析、花生批注和版本化言语Skill为准。外部`huasheng13-skill`只作为公开方法调研线索，不覆盖题库事实，也不在许可证不明确时复制其正文。

### 6.1 可复用导师底座

- JWT归属、会话、作答证据、AI运行审计、追问和推荐状态是模块共用能力。
- `verbal-reading-skill`只处理言语；后续数量题库必须使用独立`quantity` adapter和版本化数量Skill。
- 不同模块可复用provider adapter和运行记录，但不得共享未经路由的系统提示或错因规则。
- 当前Phase 0—5只验收片段阅读；数量接入是后续Goal，不作为本Goal完成条件。

## 7. DeepSeek配置和脱敏

| 环境变量 | 默认/规则 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 无默认；仅服务端；优先于兼容的`LLM_API_KEY` |
| `LLM_BASE_URL` | `https://api.deepseek.com` |
| `LLM_MODEL` | `deepseek-chat` |
| `VERBAL_AI_TIMEOUT_SECONDS` | 默认30，范围5—120 |
| `VERBAL_AI_MAX_RETRIES` | 默认1，范围0—1 |

- key缺失时返回明确`provider_not_configured`，不能使用静态文案冒充成功。
- 日志摘要只允许显示`configured=true/false`，不得输出key尾号。
- Phase 2完成前必须扫描Git、前端bundle、日志和错误响应中的secret形态。

## 8. Phase 0 门禁

- [ ] 言语Skill通过Skill Creator校验。
- [ ] AI输出schema可解析，合法/非法样例测试通过。
- [ ] 当前静态AI位置全部有清单和迁移规则。
- [ ] 配置读取、范围约束和脱敏测试通过。
- [ ] 新文件不包含真实密钥或申论prompt。
- [ ] Xixi Goal中`VR-AI-P0`有逐项证据后才可verify。
