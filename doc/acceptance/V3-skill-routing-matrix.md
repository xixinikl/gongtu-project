# V3 Skill 路由与 huasheng13 渐进加载矩阵

更新时间：2026-07-13

## 结论

公途不会把 `huasheng13-skill` 的全科内容塞入每次 AI 请求。上游固定在 commit `6a43d776741f69a231eb2d75f9d5d59efe870659`；审计到入口与 20 个 reference 共 9,326 行。运行时以公途模块 Skill 为主，只加载当前模块的一份窄适配文件。每个 AI run 继续记录 `skill_id`、`skill_version`、`package_hash` 与实际 `bundle_hash`。

上游 README 显示 MIT 徽章和声明，但固定 commit 没有实际 `LICENSE` 文件。因此仓库不复制上游全量正文/练习/真题，只保存来源 manifest 和针对本产品重写的任务路由。

## 模块矩阵

| 公途模块 | 运行 Skill | huasheng13 只补什么 | 明确不加载 |
| --- | --- | --- | --- |
| 片段阅读 | `verbal-reading-skill` v1.2.0 | 中心理解、细节判断、标题/衔接/下文推断检查顺序 | 词库全表、数量、判断、申论、练习题 |
| 逻辑填空 | `logic-fill-coach` v1.1.0 | 当前题的语境关系与实际选项词义辨析 | 200+ 词表整体、片段阅读全章、其他模块 |
| 数量关系 | `quantity-coach` v1.1.0 | 按工程/行程/利润/容斥等当前子题型选择方法；需要时才核对对应公式 | 资料分析、全局策略、真题示例与整本公式 |
| 平面图推 | `planar-reasoning-coach` v1.1.0 | 平面位置、样式、数量、属性的候选规律顺序 | 定义/类比/逻辑判断、立体展开、练习题 |
| 立体图推 | `spatial-reasoning-coach` v1.1.0 | 截面、三视图、相邻/相对/遮挡的观察顺序 | 平面规律全表；任何替代真实几何引擎的结论 |
| 申论 | `feiyang-shenlun-perspective` v1.1.0 | 在飞扬核心上补审题—找点—加工—表达；公文题才核对格式 | 素材库、时政热点、整套范文、申论练习集 |

## 申论组合规则

1. 核心判断由飞扬 Skill 的心智模型和决策启发式承担。
2. 批改任务加载飞扬心智模型、决策启发式和 `huasheng13-申论补充路由`。
3. 方法追问在上述基础上按需增加飞扬公文模板。
4. huasheng13 只提供题型操作检查，不覆盖当前材料、题干要求和服务端作答事实，也不冒充官方评分标准。
5. 不输出可直接抄写的完整大作文；只给立意、结构、分论点与材料使用方向。

## 可复查实现

- 来源清单：`backend/data/skill-sources/huasheng13-v1.json`
- 唯一路由：`backend/data/skill-registry.json`
- 渐进加载门禁：`tests/test_ai_skill_registry.py::SkillRegistryTests::test_huasheng13_is_task_scoped_instead_of_loading_the_full_corpus`
- 页面证据：AI 教练上下文区展示后端返回的真实 `skill_id` 与版本，不再只写笼统模块名。

## 当前验收状态

- V3R-4 已完成平面、立体、申论正式路径的真实浏览器往返；本人上下文、正确 Skill 与同源返回均有记录。
- V3R-5 已以受控数量 run 精确验证 `package_hash`、`bundle_hash`、Skill ID/版本与本矩阵一致，并验证跨用户 404、失败关闭和同源 `return_url`。
- V3R-6 已完成六模块当前代码/自动回归审计；仍等待用户亲看统一页面的视觉与操作确认。在用户确认前，不能把整个 Goal 标为完成。
