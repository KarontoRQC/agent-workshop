# AgentCombinationShare.css

> `frontend/src/features/heroHall/AgentCombinationShare.css` · CSS

## 用途

定义英雄殿堂标题区分享按钮、全屏遮罩、分享弹层、二维码承载区、链接行、复制/保存操作和移动端单列布局。弹层通过 portal 位于殿堂滚动裁切层之外，不受 `.agent-combination-entry-frame` 的 `overflow` 和 `clip-path` 影响。

## 关键区域

| 区域 | 作用 |
|------|------|
| `.agent-combination-share-trigger` | 顶部标题区的分享入口。 |
| `.agent-combination-share-backdrop` | 覆盖视口的分享遮罩。 |
| `.agent-combination-share-dialog` | 分享内容与操作容器。 |
| `.agent-combination-share-qr` | 保证二维码白底、稳定比例和扫描对比度。 |
| `.agent-combination-share-actions` | 复制链接与保存二维码命令。 |

## 修改指南

- **改弹层尺寸**: 保持 `max-height` 和内部滚动，移动端不能超出视口。
- **改二维码视觉**: 白色二维码底色和深色前景由组件参数决定，CSS 不得加滤镜或遮挡 Canvas。
- **改移动端**: 同步检查 `@media (max-width: 520px)` 的单列按钮和链接换行。

## 依赖图

```text
AgentCombinationShare.css
→ 被引用: AgentCombinationShare.tsx
```
