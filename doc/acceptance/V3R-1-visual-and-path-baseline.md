# V3R-1 · 视觉与用户路径基线

日期：2026-07-13
修复分支：`cx/unified-v3-experience-repair`
权威目标：[公途统一学习平台总装 Goal](../goals/gongtu-unified-learning-platform.md)

## 已确认的设计基线

正式产品必须继承 `verbal-ai-v3` 的学习产品层级，而非把它留在 query Demo：统一主导航（言语、数量关系、图形推理、申论批改、AI 教练）、宣纸/黑金/古风 SVG 的同一视觉语法、清晰的模块次级导航、可回学习中心的路径，以及从训练到 AI 再返回原任务的闭环。该要求来自原 Goal 0、4.1、4.4 节。

`/app` 的实际 DOM 已显示该层级和“问西西”入口，说明 V3 外壳不是设计猜测；缺口是它没有落实到各专业正式页。

## 正式路径现状

| 模块 | 正式路径 | 当前事实 | 修复验收 |
| --- | --- | --- | --- |
| 统一学习中心 | `/app` | 有 V3 主导航、言语次级导航与“问西西”。 | 作为专业页统一外壳、导航和层级的对照。 |
| 言语片段阅读 | `/verbal-reading-pilot.html` | 真实题目、作答和记录可用；页面是独立答题工具视觉。未发现 AI 入口。 | 训练页保留真题能力，同时接入 V3 层级、AI 入口和安全返回。 |
| 数量关系 | `/quantity-practice.html` | 路由可用；未发现 AI 入口。 | 真实训练可带允许上下文进入 AI 并返回。 |
| 平面图推 | `/mindmap` | 有独立页面和返回链接；未发现 AI 入口。 | 保留专业布局，加入一致导航与 AI 上下文入口。 |
| 立体学习中心 | `/spatial-learning.html` | 有四段入口和返回公途链接；未发现 AI 入口。 | 将其纳入统一正式路径与 AI 闭环。 |
| 立体自由切面 | `/csg-section.html` | 在 248px 左栏中放置横向滚动且隐藏滚动条的四段导航。 | 所有路径必须可发现、可点击，不能依赖隐形横向滚动。 |
| 申论批改 | `/shenlun` | 有独立页面和返回链接；未发现 AI 入口。 | 保留专业批改，加入真实上下文入口与安全返回。 |
| AI 教练 | `/ai-coach` | 真实三栏 AI 页面与后端 Skill Registry 存在。 | 由每个模块通过真实、允许的上下文抵达，而非让用户自行猜入口。 |

## 已验证证据

1. 本机全栈预览 `http://127.0.0.1:58471` 对 `/app`、言语、数量、平面、空间、自由切面、申论和 AI 教练均返回 HTTP 200。
2. `/app` 的实际 DOM 有“言语 / 数量关系 / 图形推理 / 申论批改 / AI教练”主导航，以及“问西西”按钮。
3. `verbal-reading-pilot.html`、`quantity-practice.html`、`mindmap.html`、`csg-section.html`、`spatial-learning.html`、`three-view-training.html`、`shenlun.html` 中没有 `ai-coach` 用户交接链接。
4. `csg-section.html` 的 `#left-panel` 宽 248px；`spatial-learning-shell.css` 对 `.spatial-module-nav` 使用 `overflow-x:auto` 并隐藏滚动条。用户提供的 Chrome 截图显示该导航只露出部分标签，证实该实现不可作为可发现导航。

## 截图对照输入

- 用户确认的断层：`/var/folders/zx/lf008sxs02b2wghtxfl9k6_w0000gn/T/codex-clipboard-93e5329b-805f-41b2-a5f5-c6fdacc6e4d7.png`（片段阅读正式页与 V3 Demo 风格断层）。
- 用户确认的导航问题：`/var/folders/zx/lf008sxs02b2wghtxfl9k6_w0000gn/T/codex-clipboard-2c38dc88-d5ad-4e03-8d3d-4a695fea2336.png` 与 `codex-clipboard-1032dc7f-0945-4936-8147-33a44aa6e142.png`（空间路径被挤压/截断）。

这些截图是用户验收的失败证据；后续浏览器截图必须在同样的桌面与手机尺寸下证明问题被消除。

## V3R-2 的不可退让条件

1. 不以缩小字体、隐藏滚动条或把导航塞入侧栏来换取“无横向溢出”。
2. 专业页可以保留高密度训练/画布布局，但必须有可辨认的公途主入口、模块位置和返回路径。
3. 每页只显示真实、可用的 AI 入口；入口缺少上下文时，必须明确为自由提问，不能暗示已带题目。
