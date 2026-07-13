# AgentCombinationPendingPage.css

> `frontend/src/features/heroHall/AgentCombinationPendingPage.css` · CSS · 约 71 行

## 用途

定义 Hero Hall 同域等待页的中央状态舞台、旋转加载标记、蓝金视觉和低动态模式。

## 修改指南

- 等待页必须是可识别的真实同域页面，禁止退回空白 `about:blank`。
- 加载图标正常使用 4.2 秒旋转，低动态模式使用 7 秒旋转；必须保持可见运动，但不能形成急促闪烁。
- 保持移动端文字和状态图标在视口内，并遵守 `prefers-reduced-motion`。
