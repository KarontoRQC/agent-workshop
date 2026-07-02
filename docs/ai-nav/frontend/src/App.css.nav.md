# App.css

> `frontend/src/App.css` · CSS · 约 12897 行

## 用途

定义主页 JARVIS cockpit、HUD 面板、粒子场包裹层、Agent Console、Workflow Dock、Hero Hall 外壳和响应式视觉系统的大量样式。

## 关键区域

| 区域 | 作用 |
|------|------|
| `.app-shell` / HUD 类 | 首页机甲头盔和控制台外观。 |
| `.workflow-*` | 工作流路径和推荐展示的全局配合样式。 |
| `.hero-hall-*` | Hero Hall 弹层外壳和部分共享样式。 |
| 响应式 media query | 移动端和窄屏布局约束。 |

## 依赖

内部依赖:
- `App.tsx` — 使用大部分全局 class。
- `features/heroHall/*.css` — Hero Hall 内部轮播/模块样式应优先放在 colocated CSS。
- `features/workflow/WorkflowDock.css` — Workflow Dock 的模块样式。

## 修改指南

- **新增 feature 样式**: 优先写入对应 feature 的 `.css`，不要继续扩大 `App.css`。
- **改 Hero Hall 外壳**: 保持 `frontend/AGENTS.md` 中「作为主页 cockpit HUD 模块弹出」的约束。
- **改移动端**: 检查文本是否溢出按钮、面板和卡片。

