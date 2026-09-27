# Agent 2 → Agent 3 交接文档

> 创建时间：2026-06-29
> 回审更新：2026-06-30
> 交接人：Agent 2（Marvis）
> 回审人：Agent 1
> 分支：`feature/spatial-geometry-agent2`
> M1 状态：✅ 全部完成（7/7）

---

## 一、环境速查

| 项目 | 值 |
|------|-----|
| 工作树路径 | `/Users/xixi/Documents/Codex/2026-06-29/new-chat/work/gongtu-agent2` |
| 分支 | `feature/spatial-geometry-agent2` |
| 基线提交 | `23c76df`（GOV-005C） |
| 最新提交 | 本次 M1 文档校正提交 |
| 远程 | `origin`（已推送） |
| HTTP 服务 | FastAPI + Uvicorn |
| 页面地址 | `http://127.0.0.1:8765/geometry` |
| Node/npm | 使用当前 PATH 中满足 `package.json` engines 的版本 |
| 依赖 | 使用 `npm ci` 从 `package-lock.json` 安装 |

### 启动命令
```bash
cd "/Users/xixi/Documents/Codex/2026-06-29/new-chat/work/gongtu-agent2"
npm ci --ignore-scripts --no-audit --no-fund
/Users/xixi/Workbuddy/2026-06-28-19-13-40/venv/bin/python \
  -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8765
```

---

## 二、M1 交付清单（全部完成）

| LAB | 功能 | 文件 | 提交 |
|-----|------|------|------|
| LAB-006 | 长方体与正方体生成器 | `geometry/box-generator.js` | `54a7e9f` |
| LAB-007 | 三棱柱生成器 | `geometry/prism-generator.js` | `df84f29` |
| LAB-008 | 三棱锥生成器 | `geometry/pyramid-generator.js` | `b5d770d` |
| LAB-009 | 圆柱生成器 | `geometry/cylinder-generator.js` | `4f2f18b` |
| LAB-010 | 圆锥与球体生成器 | `geometry/cone-generator.js` + `geometry/sphere-generator.js` | `29c42e9` |
| LAB-011 | 参数控制面板 | `geometry.html`（右侧动态面板） | `7f5b694` |
| LAB-012 | 参数验证测试 | `tests/geometry-generators.test.mjs` + 测试加载器 | `84593ff` |

### 新增文件清单
```
geometry/
├── box-generator.js      # LAB-006  长方体/正方体
├── prism-generator.js     # LAB-007  三棱柱
├── pyramid-generator.js   # LAB-008  三棱锥
├── cylinder-generator.js  # LAB-009  圆柱
├── cone-generator.js      # LAB-010  圆锥
├── sphere-generator.js    # LAB-010  球体
tests/
├── geometry-generators.test.mjs  # LAB-012 可复现测试
└── three-absolute-loader.mjs     # 浏览器绝对导入的 Node 测试适配
```

### 修改文件
- `geometry.html` — 整合了全部 7 种模型、动态参数面板、颜色选择器

---

## 三、架构约定（务必遵守）

1. **生成器统一模式**：每个导出 `createXxx(...)` 函数，返回 `THREE.Group`（含 MeshStandardMaterial 实体 + EdgesGeometry 棱线），参数非法自动降级到 0.01
2. **参数面板**：`geometry.html` 中 `renderModelParams(type)` 为每种模型动态渲染控件，100ms debounce 触发 `placeModel()`
3. **三文件上限**：每次 LAB 新增文件 + 修改文件 ≤ 3 个（审计文件不计）
4. **测试命令**：`npm run test:geometry`
5. **独立提交**：每 LAB 完成后立即 `git commit && git push`
6. **禁止事项**：绝不修改基准分支 `feature/spatial-geometry-lab` 和备份分支

---

## 四、已验证项

- ✅ 全部 7 种模型浏览器渲染正常（有截图存档于 `output/` 目录）
- ✅ 按钮 aria-pressed 切换正常
- ✅ 参数面板动态切换正常
- ✅ 122 个仓库内可复现测试全部通过
- ✅ 无 NaN/Infinity 泄漏到 Three.js
- ✅ 首次加载立即创建默认正方体
- ✅ 七类模型底面均与 `y=-1.5` 网格对齐

---

## 五、未完成事项（M2 起）

M1 阶段结束。下一项严格以 `TASKS.md` 为准：

```text
CUT-001 feat: 在三维场景显示无限切割平面
```

---

## 六、注意事项

1. `.gitignore` 已更新，排除 `node_modules/` 和 `output/`
2. `node_modules` 不属于仓库内容；接手后执行 `npm ci`，不得依赖某台机器残留
3. 每次开始新任务前读 `AGENT2_PROGRESS.md`（或后续 Agent 的专属进度板）
4. 截图只作为视觉辅证，不能替代 Canvas 状态、自动测试和数学断言
5. 原 `beda165` 没有测试源码，不得再引用“183 用例”作为验收证据
