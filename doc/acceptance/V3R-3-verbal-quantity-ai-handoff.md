# V3R-3 · 言语与数量 AI 上下文闭环验收

日期：2026-07-13
修复分支：`cx/unified-v3-experience-repair`
隔离预览：`http://127.0.0.1:61465`

## 完成的用户路径

### 片段阅读

1. 正式页创建或恢复当前账号拥有的 `verbal_practice_sessions.id`。
2. 顶部入口从“问西西 · 自由提问”切换为“带当前进度问西西”；交卷后文案切换为“带本套复盘问西西”。
3. 入口只携带 `module=verbal.reading`、`context_kind=session`、session ID 与同源 `return_url`，不把题干、作答、答案或解析写进网址。
4. AI 教练显式提示“已携带本次训练引用”；只有用户点击“新对话”或发送消息时才创建记录。
5. 后端按 JWT 用户读取 session 与 attempts；返回链接恢复同一个 `?session=`，重新加载后仍停在原套题和原进度。

### 数量关系

1. 正式页创建或恢复当前账号拥有的数量 session，并将对应统一活动 ID `quantity:{session_id}` 作为上下文引用。
2. 训练中和复盘中都显示清晰的“带当前进度/本套复盘问西西”入口；主导航里的 AI 教练链接同步指向同一上下文。
3. 数量页现在识别 `?session=` 并自动恢复该账号的原训练；“返回套题列表”会明确移除 session 参数，不会重新把用户送回刚才的题。
4. AI 教练选择 `quantity.exam` Skill 路由并保存原训练 `return_url`；点击“返回公途”后恢复相同套题、相同 session 和已保存作答。

## 安全事实

- 公共链接构造器只接受 `activity` / `session` 两种引用，ID 只允许 `[A-Za-z0-9:_-]`，并把返回地址归一化为当前站点的路径。
- 浏览器在两类训练中各保存一次真实答案，再创建 AI 线程。数据库只读检查均得到：`owner_verified = 1`、`evidence_count = 1`、`first_user_answer = A`、`answers_revealed = 0`、`first_correct_answer = null`。
- 这证明未交卷时 AI 可以看到当前用户已经做过什么和用时，但不能借入口提前获得正确答案。
- AI 页面不会因为访问链接就自动写线程；用户必须明确新建或发送。网址不传答案，Skill、题目、作答、用时与答案是否可见均由后端选择。

## 真实浏览器证据

- 数量桌面 1440px：训练入口为 contextual 状态，页面无横向溢出；进入 AI 后激活 `quantity.exam`，显示待服务端核验提示；新建线程后显示“数量套题” Skill；返回后 URL、session、套题与训练视图一致。
- 片段阅读手机 390×844：外壳真实高度与页面留白均为 172px，AI 入口宽 366px、完整可见，`scrollWidth == clientWidth == 390`；进入 AI、新建线程、返回后仍是同一 session 的第 1/20 题。
- 两条路径都使用隔离预览账号和隔离数据命名空间，不接触用户正式学习数据。

## 自动验证

- AI handoff、统一外壳、AI 页面与既有统一页聚焦测试：24/24 通过。
- AI Coach 后端所有权、上下文、Skill、失败与安全 ID 专项：13/13 通过。
- Node 24 全量 `npm run test:geometry`：18 个 suite、639/639 通过、0 失败。
- `gontu-v3-shell.js` 语法检查与 `git diff --check` 通过。

## 事实边界

当前隔离预览没有配置模型密钥，所以本任务验证的是“训练事实进入真实 AI Coach 后端、正确 Skill 被选中、线程可建立且能返回”的产品闭环，不伪造 AI 回答。真实 DeepSeek Provider 的成功与失败合同已有 Phase 5 证据，后续 V3R-5 会把本次入口与记录、Skill、用户隔离、安全返回一起做完整回归。
