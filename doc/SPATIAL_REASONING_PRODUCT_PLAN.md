# 考公立体图推动态解题产品路线

状态：已冻结

日期：2026-07-02

规划分支：`feature/csg-v2-integration`

代码基线：`csg-section-v6-interactive` / `5fae59f`

## 1. 产品重新定位

项目保留三个相互独立、共享底层能力的入口：

| 入口 | 用户 | 核心任务 | 是否保留 |
|---|---|---|---|
| 考公图推解题与讲解 | 学生 | 看题、验证选项、理解截面推理 | 新增，成为学生主入口 |
| 空间几何实验室 | 学生/教师 | 自由搭模型、移动切面、观察截面 | 完整保留 |
| CSG 建模工作台 | 教师/管理员 | 制作组合模型、调参数、验证截面 | 完整保留 |

现有代码不是废弃物。Section Engine V2、Manifold/CSG、Geometry JSON、积木搭建器和交互状态机
都是新解题入口的底层能力。禁止为了新入口删除或覆盖旧入口。

## 2. 第一批参考题

参考视频：

1. `/Users/xixi/Downloads/douyin/@公考志远（立体图推数资分享） 圆锥+方体经典模型 1080P.mp4`
2. `/Users/xixi/Downloads/douyin/@公考志远（立体图推数资分享） 棱锥+圆柱组合截面考察 1080P.mp4`

两题先由人工固定：

- 原题截图和题干；
- A/B/C/D/E 选项轮廓；
- 标准组合模型；
- 正确答案；
- 每个错误选项违反的几何约束；
- 关键相机角度；
- 关键切面位置与倾角；
- 讲解字幕和时间线。

AI 不参与这两题的答案生成。它们是后续所有自动化能力的黄金基线。

## 3. 学生端目标流程

```text
进入一道题
  → 同屏看到原题和选项
  → 看到题目对应的标准三维模型
  → 选择一个待验证选项
  → 播放或手动控制相机/切面
  → 蓝色真实截面连续变化
  → 显示该选项必须满足或违反的几何约束
  → 逐项排除
  → 最后显示正确答案和完整讲解
```

学生端不显示模板调试、三角面数量、WASM 状态和开发诊断。高级信息只保留在实验室或 CSG 工作台。

## 4. 动态讲解题目协议

在现有 Geometry JSON 之上新增版本化 `ReasoningCase`，概念结构如下：

```json
{
  "schemaVersion": "1.0",
  "id": "cone-box-001",
  "source": {
    "image": "question.png",
    "prompt": "哪一个是该模型正确的截面？"
  },
  "options": [
    {"id": "A", "asset": "a.svg", "verdict": "correct"},
    {"id": "B", "asset": "b.svg", "verdict": "impossible"}
  ],
  "model": {
    "kind": "geometry-json-or-csg-template",
    "ref": "cone-box-classic",
    "params": {}
  },
  "explanation": {
    "steps": [
      {
        "optionId": "B",
        "caption": "完整椭圆必须斜着经过圆锥母线",
        "camera": {"position": [5, 4, 7], "target": [0, 0, 0]},
        "plane": {"normal": [0.4, 0.8, 0.4], "constant": -0.2},
        "constraintIds": ["cone-full-ellipse"]
      }
    ]
  },
  "verification": {
    "status": "human-verified",
    "verifiedBy": "manual"
  },
  "uncertainties": []
}
```

硬约束：

- `verdict` 和正确答案只能来自人工标准答案或确定性验证，不能由图片模型直接写入正式题。
- 相机和切面关键帧只控制讲解，不改变数学模型。
- 所有模型必须通过现有 Geometry JSON/CSG 参数校验。
- AI 草稿必须使用 `draft` 状态，并保留 `uncertainties`。

## 5. 现有能力复用

| 已有能力 | 新入口中的用途 |
|---|---|
| Section Engine V2 | 计算并显示每个讲解关键帧的真实截面 |
| `geometry/section-visual-v2.js` | 蓝色截面稳定渲染 |
| Manifold/CSG 模板 | 圆锥+方体、棱锥+圆柱等组合模型 |
| Geometry JSON + Ajv | 标准模型和讲解题协议校验 |
| orbit/plane 状态机 | 手动探索模式 |
| 关键帧录屏经验 | 自动讲解时间线和视频验收 |
| SQLite/FastAPI | 题目、草稿、验证状态和资源索引 |

新页面只能调用这些模块，不复制截面算法或另写一套 CSG。

## 6. 免费开源能力选型

默认要求：不依赖付费云 API；离线或本机运行；许可证写入清单；模型权重许可证单独复核。

| 能力 | 首选 | 许可证 | 运行位置 | 使用阶段 |
|---|---|---|---|---|
| 几何布尔 | [Manifold](https://github.com/elalish/manifold) | Apache-2.0 | 浏览器 WASM | 已使用 |
| Schema 校验 | [Ajv](https://github.com/ajv-validator/ajv) | MIT | 浏览器/Node | 已使用 |
| 图像预处理/轮廓 | [OpenCV](https://github.com/opencv/opencv) / OpenCV.js | Apache-2.0 | 浏览器优先 | VISION-003 |
| 中文 OCR | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | Apache-2.0 | FastAPI 本地后端 | VISION-004 主路径 |
| 轻量 OCR 降级 | [Tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0 | 浏览器 Worker | VISION-004 降级 |
| 浏览器端模型推理 | [Transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | 浏览器/WebGPU | 后期可选 |
| 本地多模态服务 | [Transformers](https://github.com/huggingface/transformers) 或 [llama.cpp](https://github.com/ggml-org/llama.cpp) | Apache-2.0 / MIT | 本机后端 | VISION-005 可替换适配器 |
| 本地模型管理 | [Ollama](https://github.com/ollama/ollama) | MIT | 本机服务 | 可选，不是硬依赖 |
| 交互分割 | [Segment Anything](https://github.com/facebookresearch/segment-anything) | Apache-2.0 | 本地后端 | 后期可选 |

选择原则：

1. 第一阶段不引入任何视觉模型，只做两道人工作品。
2. 线稿题优先用 OpenCV 规则和人工裁剪，不先上 SAM。
3. 中文 OCR 优先 PaddleOCR；Tesseract.js 只作为无需后端的降级。
4. 多模态模型只生成候选基本体、关系和不确定项，不生成正式答案。
5. “开源代码”不等于“模型权重可任意使用”；接入具体权重前必须记录名称、版本、许可证、体积和最低内存。
6. 免费指无 API 调用费，不代表没有本机算力、下载和存储成本。

## 7. 内部 API 边界

只新增项目自己的 FastAPI 接口，不绑定商业服务：

```text
POST /api/spatial/drafts/images
POST /api/spatial/drafts/{id}/ocr
POST /api/spatial/drafts/{id}/vision-candidates
POST /api/spatial/drafts/{id}/validate
POST /api/spatial/drafts/{id}/confirm
GET  /api/spatial/reasoning-cases/{id}
```

要求：

- 上传限制 MIME、大小和安全文件名；
- OCR 与视觉任务允许关闭；
- 本地模型不可用时返回明确降级状态，手工录题仍能继续；
- AI 输出永远按不可信 JSON 处理；
- 未确认草稿不得进入学生题库。

## 8. 依赖顺序和停止点

```text
CASE-001 → CASE-002
  → LESSON-001 → 002 → 003 → 004 → 005 → 006 → 007
  → AUTHOR-001 → AUTHOR-002
  → VISION-001 → 002
      ├→ 003 OpenCV
      └→ 004 OCR
  → VISION-005 → 006 → 007
```

停止点：

- 两道题的人工黄金答案未确认：不得写解题页面算法。
- 两道题的动态讲解未通过：不得开始通用图片自动建模。
- 手工录题不能独立完成：不得接多模态模型。
- 候选草稿没有人工确认：不得进入正式题库。
- 20 题基准集未建立：不得宣称“图片自动生成模型可用”。

## 9. 难度与风险

| 阶段 | 难度 | 主要风险 |
|---|---:|---|
| 两道人工黄金题 | 中 | 对选项和几何理由理解错误 |
| 解题页面与选项状态 | 中 | 把调试工具信息带进学生页面 |
| 讲解关键帧时间线 | 中高 | 相机、切面、字幕不同步 |
| 手工录题编辑器 | 中高 | 数据协议过早复杂化 |
| OpenCV/OCR | 中 | 线稿、字幕、选项框互相干扰 |
| 多模态候选草稿 | 高 | 单视图遮挡导致结构歧义 |
| 任意图片自动建模 | 很高 | 问题本身可能无唯一三维解 |

## 10. 验收定义

首个可用版本不是“上传任意图片自动解题”，而是：

1. 用户打开两道参考题中的任意一道。
2. 原题、选项、标准模型和蓝色截面同屏。
3. 可以逐项播放关键切面和排除理由。
4. 可以暂停后手动旋转或拖动切面。
5. 恢复讲解时回到确定性关键帧。
6. 正确答案来自人工黄金数据。
7. 实验室与 CSG 工作台仍可独立访问。

达到以上七项后，才进入图片辅助录题阶段。
