# 交接文档：阶梯修复 → 5×5 搭建器

## 冻结基线

```
分支: feature/spatial-geometry-cutfix-plan
HEAD: e6c7c33
标签: section-engine-v2-com007-verified
时间: 2026-07-01
```

## 本阶段完成（3 个 commit）

| commit | 内容 |
|---|---|
| `5c7c2e6` | fix: 恢复阶梯组合体模型 + 退化三角形过滤修复 |
| `bd1289b` | task: 关闭旧 CUT-FIX-006/006A 阻塞项，解封 COM-007 |
| `e6c7c33` | task: COM-007 组合体截面验收通过 |

### 具体改动

1. **阶梯体模型恢复**
   - 从旧项目拷贝 `geometry/staircase-fixture.js`
   - `geometry.html` 补 `case "staircase"` dispatch 分支
   - 颜色方案从 `layered` 改为 `uniform`（单色，避免 18 个独立 Mesh 导致接缝闪烁）

2. **V2 截面闪烁修复**
   - 根因：`section-triangulation.js` 对 Earcut 产生的退化三角形（area ≤ 1e-12）采用"全部拒绝"策略 → V2 error → 降级 V1 → 截面形状在 V2/V1 之间跳变
   - 修复：改为"过滤退化三角形，保留其余有效部分"
   - 效果：阶梯体 -30°/-30° 斜切下 10 个 error → 0，483/488 全绿

3. **阻塞项清理**
   - CUT-FIX-006/006A 关闭：V2 截面引擎已完整替代旧算法
   - COM-007 解封并验收通过：阶梯体 + L 形截面无闪烁，形状正确

### 用户确认

- ✅ 阶梯体显示正确（非正方形）
- ✅ 统一颜色（不再分层着色）
- ✅ 无闪烁
- ✅ L 形截面正确

## 新分支

```
分支: feature/spatial-geometry-builder-5x5
基于: section-engine-v2-com007-verified (e6c7c33)
任务: 5×5×5 分层搭建器
```

## 项目状态

| 指标 | 值 |
|---|---|
| 当前阶段 | M2 实时截面教学体验纠偏 |
| 已完成 | 79 项 |
| 测试 | 483/488 全绿 |
| 下一任务 | 5×5×5 分层搭建器 |

## 已有基础设施（可直接复用）

| 模块 | 路径 | 说明 |
|---|---|---|
| BlockArray/BlockAssembly | `geometry/block-assembly.js` | 方块阵列构建+合并，阶梯体已用 |
| Section Engine V2 | `geometry/section-engine-v2.js` | 完整截面管线 |
| 交互模式状态机 | `geometry/viewport-interaction-mode.js` | orbit/plane 双模式 |
| 截面视觉 | `geometry/section-visual-v2.js` | 蓝色截面渲染 |
| 阶梯体夹具 | `geometry/staircase-fixture.js` | 可参考的 BlockArray 组装模式 |
| 截面诊断脚本 | `scripts/diagnose-section.mjs` | 离线逐 offset 扫描定位异常 |

## 经验教训（已入库 Skill）

- `~/.codex/skills/standard-project-workflow/references/lessons-learned.md` — 4 条通用教训（已推送 GitHub）
- `~/.workbuddy/skills/threejs-computational-geometry/` — Three.js 计算几何专项 Skill
