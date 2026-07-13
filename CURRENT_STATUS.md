# 当前开发状态

更新时间：2026-07-13

当前分支：`cx/phase5-real-ai-coach`

当前 Goal：`gongtu-unified-learning-platform`

当前阶段：Phase 5 真实多模块 AI 教练（门禁完成，Draft PR #19 待验收）

## 阶段状态

- Phase 1：PR #15 已验收。
- Phase 2：PR #16 已验收。
- Phase 3：Draft PR #17 待验收；801成语、231逻辑填空、600片段阅读、600数量已接入。
- Phase 4：Draft PR #18 待验收；平面/空间图推和申论整改已通过本地门禁。
- Phase 5：Draft PR #19；真实上下文、版本 Skill、消息/run、问题卡、真实 DeepSeek 与浏览器门禁均已通过。
- Phase 6：下一阶段，开始全链路、安全、响应式与完成审计。

## Phase 5 已完成

- 正式 `/ai-coach` 入口与公途三栏页面；不再展示假对话、假统计或静态老师回复。
- 独立提问与训练上下文两条路径：无上下文只做方法咨询；有上下文由服务端按 JWT 重建事实。
- AI 线程、消息、run、失败、重试、候选问题卡全部归属现有 `users.id`。
- Skill Registry 覆盖片段阅读、逻辑填空、数量、平面图推、空间图推、申论和综合规划。
- Run 记录 Skill ID/版本、package/bundle/context hash、provider/model/usage/结构化输出和状态。
- Provider 输出必须通过 Skill 响应 Schema；非法输出 fail closed。
- 问候、闲聊、自我评价和无证据咨询不生成弱项；真实服务端证据达到门槛后才产生候选，用户确认后才写问题本。
- 普通保存只形成 `coach_note`，客户端不能任意创建弱项。
- 综合规划直接读取本人垂直训练表，不采信客户端可写的通用活动摘要。

## 验证证据

- Python AI Coach/Skill/配置专项：20/20；全模块分进程回归：61/61。
- Node/几何全量：620/620。
- 浏览器：注册、登录、模块加载、无上下文数量新对话、缺配置失败、消息保留、重试、刷新恢复；A→退出→B 隔离→退出→A 恢复通过。
- 响应式：1440px 与 390px 均 `scrollWidth == clientWidth`。
- Goal lint：pass。

## 未完成与事实边界

- 真实 DeepSeek 已通过；本机 `.env` 权限0600且被Git忽略。用户暂未轮换聊天中曾暴露的旧 Key，后续平台允许时仍建议更换。
- 申论仍只有10道摘要题且缺套/缺题；AI 教练不会掩盖题库不完整。
- 数量仍有42题解析视觉引用待独立审计。
- `python -m unittest discover` 会因历史测试文件共享已缓存 `database.DB_PATH` 而互相污染；本次使用每文件独立进程验证，全部57项通过。
- 历史 `tests/test_cross_platform.py` 仍有8项桌面打包治理失败，不属于 Phase 5 功能改动，必须在 Phase 6 完成审计中保留。

## 下一步

1. 提交并推送 Phase 5 最终证据，更新 Draft PR #19。
2. 进入 Phase 6 全链路、安全、响应式与干净总装。
