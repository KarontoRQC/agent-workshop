# useMicLevel.ts

> `frontend/src/hooks/useMicLevel.ts` · TypeScript · 约 112 行

## 用途

请求麦克风音频流，使用 Web Audio 采样当前音量，并返回可用于粒子能量反馈的 level。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `useMicLevel` | hook | ~3 | 返回麦克风音量、权限状态和控制函数。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `react`

## 修改指南

- **改采样频率**: 确保 animation frame、AudioContext 和 MediaStream tracks 都能清理。

## 依赖图

```text
useMicLevel.ts
→ 被引用: App.tsx
```
