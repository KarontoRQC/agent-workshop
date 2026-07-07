# ParticleField.tsx

> `frontend/src/components/ParticleField.tsx` · TypeScript React · 约 1740 行

## 用途

使用 Three.js 渲染 JARVIS 粒子核心、外太空巡航、光环、流星、动态路径和语音响应效果，是主页视觉中心。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ParticleField` | default component | 文件末尾 | 渲染并驱动 Three.js 场景。 |

## 依赖

内部依赖:
- `frontend/src/types.ts` — 使用 `DialogueMode`、`ParticleSettings`。

外部依赖(仅列包名,不做解释):
- `react`
- `three`

## 修改指南

- **改粒子数量或材质**: 浏览器检查桌面/移动帧率和 canvas 非空。
- **改路径显示**: 同步检查 `App.tsx` 的 graph route 状态和 `workflowModel.ts` 的路径解析。
- **改路径立体比例**: 路径规划状态要保留纵深和菱形母体可见性，避免只把节点压成横向扁带。
- **改图谱旋转**: 图谱态的粒子层和路径层必须使用 gentle bounded yaw/`visibleSceneSpin`，外层只保留 `GRAPH_LAYER_PARALLAX_YAW` 小幅视差，不要让 `points.rotation.y` 直接继承完整背景自转。
- **改语音响应**: 检查 `ParticleSettings` 的 `mode`、`energy` 和 `pulseSeed`。
- **改鼠标交互**: 菱形知识路径星图不应在鼠标悬停时触发碰撞、磁吸、涡旋、hover glow 或相机推挤；如需改动，保留桌面/移动浏览器预览验证。

## 依赖图

```text
ParticleField.tsx
← 引入: types.ts, three
→ 被引用: App.tsx
```
