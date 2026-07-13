# ParticleField.tsx

> `frontend/src/components/ParticleField.tsx` · TypeScript React · 约 1980 行

## 用途

使用 Three.js 渲染 JARVIS 粒子核心、外太空巡航、光环、流星、动态路径和语音响应效果，是主页视觉中心。运行时同时读取硬件提示、WebGL 渲染器类型与真实 FPS，使用角色等比例渐进索引同步收缩 GPU draw range 和 CPU 模拟范围，并按 `full/balanced/constrained` 档调节像素比与 CSS 合成负载；SwiftShader/llvmpipe 等软件渲染器首帧直接进入受限档，并使用独立的 30%/40% 渐进绘制下限，高性能设备仍保持完整粒子和画质。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ParticleField` | default component | 文件末尾 | 渲染并驱动 Three.js 场景。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `DialogueMode`、`ParticleSettings`。
- `frontend/src/components/particleFrameBudget.ts` — 提供分帧区间、渐进角色索引、帧率无关插值和真实 FPS 自适应预算。

外部依赖(仅列包名,不做解释):
- `react`
- `three`

## 修改指南

- **改粒子数量或材质**: 浏览器检查桌面/移动帧率和 canvas 非空。
- **改性能预算**: 同步更新 `particleFrameBudget.ts`、`verify-performance-guardrails.mjs`，并用 `measure-particle-performance.mjs` 按桌面/移动、待机/图谱四种状态复测；同时检查 `data-particle-draw-ratio`、`data-performance-tier`、`data-renderer-class` 与根节点 `data-visual-performance`。不得以删除粒子核心、光环、流星或图谱效果换取数字。
- **改路径显示**: 同步检查 `App.tsx` 的 graph route 状态和 `workflowModel.ts` 的路径解析。
- **改路径首屏**: 生产懒加载下必须等待粒子热身，并在候选节点尚未展开时节流重试；只有 `chooseGraphFocus()` 成功后才能清空 `pendingGraphFocusKey`，避免右侧已有路径而中央标签为空。
- **改路径立体比例**: 路径规划状态要保留纵深和菱形母体可见性，避免只把节点压成横向扁带。
- **改图谱旋转**: 图谱态通过 `GRAPH_LOCKED_ROTATION` 锁定场景层、路径层、节点和标签；中央菱形使用至少 12 个环向切面（当前 `SHELL_RADIAL_FACET_COUNT=18`）稳定旋转轮廓，并仅由 `graphDiamondYaw` 对未锁定的 `ROLE_SHELL` 粒子做 X/Z 平面旋转，即绕竖直 Y 轴从左到右水平自转，必须保持 `target.y` 不变。`GRAPH_DIAMOND_YAW_SPEED` 当前为 `0.18rad/s`，运行时通过 `data-graph-diamond-rotation` 与 `data-graph-diamond-rotation-axis="y"` 采样；禁止让路径、标签或相机继承该偏航，也不得恢复 X 轴俯仰或 Z 轴屏幕滚转。
- **改语音响应**: 检查 `ParticleSettings` 的 `mode`、`energy` 和 `pulseSeed`。
- **改鼠标交互**: 菱形知识路径星图不应在鼠标悬停时触发碰撞、磁吸、涡旋、hover glow 或相机推挤；如需改动，保留桌面/移动浏览器预览验证。

## 依赖图

```text
ParticleField.tsx
← 引入: types.ts, particleFrameBudget.ts, three
→ 被引用: App.tsx
```
