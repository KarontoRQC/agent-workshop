# WorkflowDock.css

> `frontend/src/features/workflow/WorkflowDock.css` · CSS · 约 35 行

## 用途

提供 Workflow Dock 的模块化样式，避免把该模块的小范围布局继续扩进 `App.css`。

## 关键区域

| 区域 | 作用 |
|------|------|
| `.workflow-*` | 路径、推荐卡片和 dock 状态样式。 |

## 依赖

内部依赖:
- `WorkflowDock.tsx` — 导入该样式。

## 修改指南

- **改 dock 样式**: 保持不影响 Hero Hall 和主页 HUD 的绝对定位。
