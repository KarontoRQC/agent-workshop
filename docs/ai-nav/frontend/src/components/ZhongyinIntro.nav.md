# ZhongyinIntro.tsx

> `frontend/src/components/ZhongyinIntro.tsx` · TypeScript React · 约 375 行

## 用途

实现中隐会图谱星球开场动画，包含 2D/3D 向量工具、种子随机、星轨控制器和自动进入回调。
品牌字样随组件首次绘制直接进入 `is-ready` 状态，不再等待额外计时器。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ZhongyinIntro` | component | ~386 | 渲染开场动画并在完成后调用 `onEnter`。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `react`

## 修改指南

- **改开场时长**: 检查 `ANIMATION_DURATION_MS`、`INTRO_AUTO_EXIT_MS`、`INTRO_REMOVE_DELAY_MS` 的配合。
- **改品牌出现时机**: 保持首帧 `is-ready`，不得重新加入延迟显示计时器；用生产 UI 审计检查初始计算不透明度。
- **改进入行为**: 保持 `onEnter` 单向通知，避免在组件内部改 App 全局状态。

## 依赖图

```text
ZhongyinIntro.tsx
→ 被引用: App.tsx
```
