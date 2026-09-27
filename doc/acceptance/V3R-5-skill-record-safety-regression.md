# V3R-5 记录、Skill 与安全合同回归

日期：2026-07-13

## 结果

- Python 15 个测试文件按独立进程运行，共 77/77 通过。
- Node/几何/页面全量：643/643 通过。
- `git diff --check` 通过。

旧 Python 测试文件使用固定用户 ID，合并到单进程会互相污染临时数据库；本项目既有门禁是逐文件独立进程。本次按该隔离方式执行并保留每个文件的真实计数。

## Skill 合同

- 七个模块均从 allowlist Registry 解析真实版本、响应 Schema、package hash 与 task bundle hash。
- huasheng13 六份窄适配只进入各自模块；不会跨入其他模块，不加载上游真题示例、申论素材库或全科包。
- 一次受控数量 AI run 不再只检查“hash 有 64 位”，而是精确断言 `skill_id`、版本、`package_hash` 和 `bundle_hash` 等于当前 `quantity-coach v1.1.0` 的 Registry 解析结果。
- provider 收到的 system prompt 明确包含“huasheng13 数量关系按题型路由”，且不含“huasheng13 申论补充路由”。
- 版本、固定 hash、文件缺失、越界路径或用户文本试图选择 Skill 时均 fail closed。

## 记录与账号隔离

- 训练上下文由 JWT 所属垂直表解析，客户端伪造的答案、用户 ID、题号和摘要不会进入上下文。
- A 用户的 activity、线程、消息、run 与问题卡对 B 用户返回 404；来源记录带 `owner_verified=true`。
- 重复 `client_message_id` 不会重复调用 provider 或重复写消息。
- AI run 保存 provider/model、Skill ID/版本、package/bundle/context hash、usage 与状态。

## 安全与失败合同

- 外部或非同源 `return_url` 归一化为 `/app`；正式训练只生成同源返回路径。
- 未交卷言语/数量答案不经 URL 传输，正确答案保持隐藏。
- provider 超时、异常、非法 Schema 与缺配置均保留用户问题、记录失败状态、不伪造老师答案；内部异常和密钥不进入响应。
- 申论失败不生成批改学习活动；成功活动具备稳定 `shenlun-grade:{record_id}` 引用。

## 下一阶段

V3R-6 将按用户新增要求逐页验收“功能标签”：标签名必须对应真实功能；切换后主内容或正式页面必须变化；不同页面使用自己的标签集合。同时完成桌面/手机视觉检查并等待用户亲看确认。
