# Phase 5 真实 AI 教练审计

> 日期：2026-07-13  
> 分支：`cx/phase5-real-ai-coach`  
> 状态：实现与本地门禁完成；真实 DeepSeek 成功调用仍需本机配置一枚已轮换的密钥后补证

## 已落地

- 正式入口 `/ai-coach`，旧 `ai-coach-demo.html` 仅保留文件兼容。
- JWT 用户拥有的线程、消息、运行、候选问题卡；刷新后可恢复，A/B 不可互读。
- 两种入口同时成立：
  - 独立问老师：无 activity，只允许方法问答，不产生客观弱项证据；
  - 从训练页进入：前端只传 activity/session 引用，服务端按 JWT 重新读取垂直记录。
- 版本化 Skill Registry 覆盖片段阅读、逻辑填空、数量、平面图推、空间图推、申论和综合规划。
- 每次运行记录 Skill ID、版本、package hash、实际 bundle hash、context hash、provider、model、状态、usage 和结构化输出。
- Provider 输出必须通过当前 Skill 的响应 Schema；非法输出记为 `invalid_output`，不会当成功答案展示。
- Provider 缺配置、超时、网络或输出异常时，保留用户消息和失败 run，页面提供重试，不显示静态老师回复。
- 普通聊天、问候、自我评价和无证据方法咨询不会进入问题本。
- 只有服务端上下文中的真实错题、服务端评分三视图或正式申论批改维度达到门槛时，才生成候选问题卡；用户再次确认后才写统一问题与证据。
- 手动保存普通老师回复只生成 `coach_note` 任务，不能由客户端任意命名并创建弱项。

## 可信上下文边界

- 不读取前端填写的 `learning_activities_v2.summary_json` 作为题目、答案或弱项事实。
- 数量与片段阅读未交卷时不装配正确答案和判定。
- 逻辑填空解析缺失时明确标为缺失，不把 AI 内容标为官方解析。
- 平面图推用户补录答案标记为 `user_supplied`。
- 空间实验访问不产生正确率；三视图只读服务端重判记录。
- 申论普通 chat 不能作为批改证据；只有 `recordType=grading` 的本人记录可进入上下文。
- 综合规划直接聚合 JWT 用户的垂直训练表，不采信通用活动摘要中的客户端统计。

## 验证证据

- Python API/Skill 专项：16/16。
- Python 各模块隔离进程回归：57/57。
- Node 全量：620/620。
- 浏览器：注册/登录、正式入口、后端模块列表、无上下文新建数量对话、Provider 未配置失败、问题保留、重试、刷新恢复；并完成 A→退出→B 看不到 A 对话→退出→A 对话恢复。
- 响应式：1440px 与 390px；`scrollWidth == clientWidth`。
- Goal 文档 lint：pass。

## 尚未完成/不能宣称

- 当前工作树没有 `backend/.env`，因此未进行真实 DeepSeek 成功响应验收；不能把 mock provider 的成功测试写成真实线上调用。
- 用户曾在聊天中粘贴过一枚 API Key。该密钥已经暴露在聊天记录中，不应自动写入仓库或工具日志；应先在 DeepSeek 控制台轮换，再由用户在本机 `backend/.env` 设置 `DEEPSEEK_API_KEY`。
- 安全配置入口：在 Phase 5 工作树运行 `npm run ai:configure`；终端隐藏输入，脚本原子写入 Git 忽略的 `backend/.env` 并设置 `0600` 权限。
- 完成一次不泄密的真实调用、刷新恢复和 usage/run 审计前，Phase 5 保持“实施中”，Phase 6 不启动。
