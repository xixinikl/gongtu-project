# 当前开发状态

更新时间：2026-07-02
当前分支：`feature/csg-v2-integration`
当前里程碑：M5A 考公立体图推动态解题与讲解

## 当前任务

- 状态：● 已完成
- 编号：PRD-001
- 任务：`docs: 重构考公立体图推产品路线`

## 已完成规划

- 保留三个独立入口：考公图推解题、空间几何实验室、CSG 建模工作台。
- 第一批固定两道视频参考题，答案和排除理由全部人工建立。
- 新增 CASE、LESSON、AUTHOR、VISION 四段依赖链。
- 图片辅助录题必须晚于手工录题和两题动态讲解验收。
- AI 只能输出候选基本体、CSG 关系、参数和不确定项，不得输出正式答案。

## 免费开源技术边界

- 图像预处理：OpenCV/OpenCV.js（Apache-2.0）。
- 中文 OCR：PaddleOCR（Apache-2.0）。
- 浏览器 OCR 降级：Tesseract.js（Apache-2.0）。
- 可选本地推理：Transformers.js、Transformers、llama.cpp 或 Ollama。
- 不依赖付费云 API；模型权重许可证和最低资源在 OSS-001 单独冻结。

## 交付文件

- `doc/SPATIAL_REASONING_PRODUCT_PLAN.md`
- `doc/AGENT_HANDOFF.md`
- `doc/AGENT_WORK_LOG.md`
- 审计：`TASKS.md`、`CURRENT_STATUS.md`

## 验收证据

- 三个产品入口、两道参考题、概念协议、任务依赖和停止点已写入规划。
- GitHub 官方仓库已核对主要候选代码许可证。
- `git diff --check` 通过后提交。

## 唯一下一项

CASE-001：固化“倒圆锥 + 方体”参考题黄金答案。

本任务只建立人工答案和夹具，不开发 AI，不修改截面算法。
