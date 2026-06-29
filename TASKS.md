# 公途空间几何实验室任务看板

> 状态：`○ 待开始` · `◐ 进行中` · `● 已完成` · `⛔ 阻塞`
> 这是用户验收主看板。同一时刻只能有一个 `◐`；只有验收通过、写明证据并提交后才可标记 `●`。

## 当前验收摘要

| 项目 | 当前结果 |
|---|---|
| 当前阶段 | M1 可操作的基础 3D 实验室 |
| 已完成 | 15 项 |
| 进行中 | 0 项 |
| 下一项 | LAB-006 建立长方体与正方体生成器 |
| 功能分支 | `feature/spatial-geometry-lab` |

## 里程碑

| 阶段 | 目标 | 状态 |
|---|---|---|
| M0 | 工程治理与现状保护 | ● 已完成 |
| M1 | 可操作的基础 3D 实验室 | ◐ 进行中 |
| M2 | 无限切平面与精确截面 | ○ 待开始 |
| M3 | 组合模型与空间视图题 | ○ 待开始 |
| M4 | 参数化题库与管理工具 | ○ 待开始 |
| M5 | 图片文字 AI 辅助建模 | ○ 待开始 |
| M6 | 集成、测试与发布 | ○ 待开始 |

## M0：工程治理与现状保护

- [x] ● GOV-001 docs: 建立 AI 协作章程与任务看板
  - 文件：`.ai_rules.md`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：三个文件存在；状态定义一致；单任务修改不超过 3 个文件
  - 结果：已通过文件存在性、状态唯一性和 `git diff --check`
  - 提交：`10324e7`
- [x] ● GOV-002 docs: 同步项目开发规范的规则优先级
  - 文件：`doc/PROJECT_RULES.md`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：旧规则引用 `.ai_rules.md`；冲突优先级清晰
  - 结果：已建立四级规则优先级，旧规范已链接三个治理文件
  - 提交：`bfd884b`
- [x] ● GOV-003 docs: 编写空间几何模块架构决策
  - 文件：`doc/GEOMETRY_ARCHITECTURE.md`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：包含模块边界、数据流、风险与阶段验收标准
  - 结果：已覆盖模块边界、三条数据流、主要风险和 M0 至 M6 验收标准
  - 提交：`f269cc6`
- [x] ● GOV-003A docs: 强化任务看板验收可见性
  - 文件：`.ai_rules.md`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：完成项显示结果和提交证据；用户回复直接展示看板片段
  - 结果：已补齐前三项任务证据，并将展示要求写入 AI 协作章程
  - 提交：本任务所在提交
- [x] ● GOV-004 chore: 建立空间几何依赖锁定方案
  - 文件：`package.json`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：Three.js 与几何依赖版本固定；安装命令成功
  - 结果：精确锁定 Three.js、three-mesh-bvh 和 three-bvh-csg，隔离目录安装与依赖树检查通过
  - 提交：本任务所在提交
- [x] ● GOV-004A chore: 生成可复现依赖锁文件
  - 文件：`package-lock.json`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：锁文件可完成 `npm ci`；仓库不提交 `node_modules`
  - 结果：已生成 npm lockfileVersion 3 锁文件，隔离目录 `npm ci` 和依赖树检查通过
  - 提交：本任务所在提交
- [x] ● GOV-005 ci: 建立前端 JavaScript 基础检查
  - 文件：`.github/workflows/check.yml`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：CI 能检查空间几何 JavaScript 语法
  - 结果：CI 已使用 Node.js 22 可复现安装依赖，并检查现有入口及未来 `geometry/` 下全部 JavaScript
  - 提交：本任务所在提交
- [x] ● GOV-005A docs: 校正任务文件计数口径
  - 交付文件：`.ai_rules.md`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：每项最多三个交付文件；两个强制审计文件每次更新但不占交付名额
  - 结果：避免为了满足机械文件数而把独立模块塞入单文件，同时保留完整看板审计
  - 提交：本任务所在提交
- [x] ● GOV-005B docs: 建立 Agent 安全交接手册
  - 交付文件：`.ai_rules.md`、`doc/AGENT_HANDOFF.md`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：新 Agent 能确定工作树、分支、继续点、产品边界、测试方式和禁止事项
  - 结果：已建立接手前必读、Git 核验、代码契约、测试环境、风险与防误改清单
  - 提交：本任务所在提交
- [x] ● GOV-005C docs: 建立接力 Agent 隔离与回审机制
  - 交付文件：`.ai_rules.md`、`doc/AGENT_HANDOFF.md`、`doc/AGENT_WORK_LOG.md`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：基准、备份、接力三分支职责清楚；Agent 2 逐任务记录；Agent 1 回来后先审后合
  - 结果：已建立隔离工作树、只追加日志、禁止接力 Agent 合并和完整回审流程
  - 提交：本任务所在提交

## M1：可操作的基础 3D 实验室

- [x] ● LAB-001 feat: 建立空间几何实验室页面骨架
  - 文件：`geometry.html`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：具备模型库、三维视口、标准视角、模型参数，以及场景内实时切割控制
  - 结果：已完成响应式页面骨架；明确自由切割与三点锁定两种模式，切面和截面反馈均位于同一三维场景
  - 提交：本任务所在提交
- [x] ● LAB-002 feat: 建立空间几何页面后端路由
  - 文件：`backend/main.py`、`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：`GET /geometry` 返回实验室 HTML；页面缺失时返回明确的 404
  - 结果：已建立独立 FastAPI 页面路由，并验证正常响应内容和缺失文件异常
  - 提交：本任务所在提交
- [x] ● LAB-003 feat: 建立 Three.js 场景相机与灯光
  - 交付文件：`geometry.html`、`geometry/scene.js`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：本地 Three.js 成功加载；渲染器、透视相机、三点布光和响应式画布可用
  - 结果：已建立可复用场景上下文、WebGL 降级提示、尺寸监听、阴影和本地裁剪能力
  - 提交：本任务所在提交
- [x] ● LAB-004 feat: 建立轨道旋转缩放与视角复位
  - 交付文件：`geometry.html`、`geometry/scene.js`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：支持鼠标与触控旋转、缩放、平移、阻尼和一键复位
  - 结果：已接入官方 OrbitControls，限制缩放与极角范围，并暴露可测试的相机状态
  - 提交：本任务所在提交
- [x] ● LAB-005 feat: 建立坐标轴网格与辅助标记
  - 交付文件：`geometry.html`、`geometry/scene.js`、`doc/AGENT_HANDOFF.md`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：场景显示地面网格、XYZ 坐标轴、原点、方向标签及可读颜色图例
  - 结果：已建立可释放的坐标辅助组，并通过 Canvas 状态暴露六类辅助元素
  - 提交：本任务所在提交
- [x] ● LAB-006 feat: 建立长方体与正方体生成器
  - 交付文件：`geometry/box-generator.js`、`geometry.html`
  - 审计文件：`TASKS.md`、`CURRENT_STATUS.md`
  - 验收：`createBox(width, height, depth)` 和 `createCube(size)` 返回 Three.js Group；含实体网格 + 棱线；支持颜色/透明度外观配置；参数非法时安全降级为最小值；正方体/长方体按钮与尺寸/透明度滑块联动；语法检查通过；git diff 无冲突
  - 结果：已建立参数化生成器，页面首次加载自动创建默认正方体，切换按钮/拖动滑块实时重建模型
  - 提交：`54a7e9f`
- [ ] ◐ LAB-007 feat: 建立三棱柱生成器
- [x] ● LAB-008 feat: 建立三棱锥生成器
  - 文件：`geometry/pyramid-generator.js`、`geometry.html`
  - 验收：createTriangularPyramid(baseSize, height, appearance) 基于 ConeGeometry(radialSegments=3) 生成三棱锥；语法检查通过；按钮与滑块联动
  - 结果：已建立参数化三棱锥生成器，Group 含实体+棱线，支持颜色/透明度配置，参数安全降级
  - 提交：待提交
- [ ] ○ LAB-009 feat: 建立圆柱生成器
- [ ] ○ LAB-010 feat: 建立圆锥与球体生成器
- [ ] ○ LAB-011 feat: 建立基础模型参数控制面板
- [ ] ○ LAB-012 test: 验证基础模型参数和退化输入

## M2：无限切平面与精确截面

- [ ] ○ CUT-001 feat: 在三维场景显示无限切割平面
- [ ] ○ CUT-002 feat: 拖动切面时实时剖开模型
- [ ] ○ CUT-003 feat: 倾斜切面时实时更新剖面
- [ ] ○ CUT-004 feat: 由题目三点锁定无限切面
- [ ] ○ CUT-005 feat: 建立多面体边与平面求交
- [ ] ○ CUT-006 feat: 建立截面交点排序和闭合
- [ ] ○ CUT-007 feat: 在模型切口实时填充与高亮截面
- [ ] ○ CUT-008 feat: 实时隐藏或透明显示被切一侧
- [ ] ○ CUT-009 feat: 建立可选的二维截面辅助视图
- [ ] ○ CUT-010 feat: 建立截面边数面积与顶点信息
- [ ] ○ CUT-011 test: 验证立方体典型切面
- [ ] ○ CUT-012 test: 验证柱锥体典型切面
- [ ] ○ CUT-013 test: 验证共面相切和浮点误差边界

## M3：组合模型与空间视图题

- [ ] ○ COM-001 feat: 建立积木坐标阵列数据结构
- [ ] ○ COM-002 feat: 建立积木组合模型生成器
- [ ] ○ COM-003 feat: 建立积木颜色和编号标记
- [ ] ○ COM-004 feat: 建立组合柱体模型
- [ ] ○ COM-005 feat: 建立布尔组合几何能力
- [ ] ○ COM-006 feat: 建立前后左右俯仰视图切换
- [ ] ○ COM-007 feat: 建立正投影轮廓显示
- [ ] ○ COM-008 test: 验证积木视图题固定样例
- [ ] ○ COM-009 test: 验证组合体切面固定样例

## M4：参数化题库与管理工具

- [ ] ○ QDB-001 docs: 定义 Geometry JSON 版本一协议
- [ ] ○ QDB-002 feat: 建立 Geometry JSON Schema 校验
- [ ] ○ QDB-003 test: 验证合法和非法模型协议
- [ ] ○ QDB-004 feat: 建立空间几何题库数据表
- [ ] ○ QDB-005 test: 验证题库迁移和回滚
- [ ] ○ QDB-006 feat: 建立空间几何题目查询接口
- [ ] ○ QDB-007 feat: 建立空间几何题目作答接口
- [ ] ○ QDB-008 feat: 建立管理员参数化建模页面
- [ ] ○ QDB-009 feat: 建立模型预览和参数编辑
- [ ] ○ QDB-010 feat: 建立题目答案与解析编辑
- [ ] ○ QDB-011 feat: 录入第一批基础切面示例题
- [ ] ○ QDB-012 feat: 录入第一批积木视图示例题

## M5：图片文字 AI 辅助建模

- [ ] ○ AIM-001 feat: 建立安全题目图片上传接口
- [ ] ○ AIM-002 test: 验证图片类型大小和异常文件
- [ ] ○ AIM-003 feat: 建立多模态模型适配器
- [ ] ○ AIM-004 feat: 建立图片文字建模提示词模板
- [ ] ○ AIM-005 feat: 建立 AI 输出结构化解析
- [ ] ○ AIM-006 feat: 建立模型语义和几何校验
- [ ] ○ AIM-007 feat: 建立不确定结构标记机制
- [ ] ○ AIM-008 feat: 建立 AI 建模任务状态接口
- [ ] ○ AIM-009 feat: 建立 WebSocket 建模进度通道
- [ ] ○ AIM-010 feat: 建立 AI 模型预览确认页面
- [ ] ○ AIM-011 feat: 建立模型人工修正和入库流程
- [ ] ○ AIM-012 test: 验证 AI 错误输出不会进入题库

## M6：集成、测试与发布

- [ ] ○ REL-001 feat: 将空间几何入口接入学习应用
- [ ] ○ REL-002 feat: 将空间几何介绍接入项目首页
- [ ] ○ REL-003 test: 建立空间几何端到端冒烟测试
- [ ] ○ REL-004 test: 验证 Electron 桌面端加载
- [ ] ○ REL-005 test: 验证窄屏和触控基础交互
- [ ] ○ REL-006 perf: 验证复杂模型渲染性能
- [ ] ○ REL-007 ci: 将空间几何测试接入完整 CI
- [ ] ○ REL-008 docs: 更新 README 使用和部署说明
- [ ] ○ REL-009 release: 完成发布前验收清单
