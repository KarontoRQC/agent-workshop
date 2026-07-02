# src/

> `frontend/src/` · React 应用源码
> **功能文档**: `frontend/AGENTS.md`

## 职责

`src/` 是前端 JARVIS 原型主体。`App.tsx` 汇聚全局状态和流程，`lib/` 封装后端和本地 mock，`features/` 保存业务模块，`components/` 保存视觉组件，`hooks/` 保存浏览器能力 hooks。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `main.tsx` | React 挂载入口。 | `createRoot` 调用 |
| `App.tsx` | JARVIS 主应用、工作流状态、语音、HUD 和 Hero Hall 编排。 | 默认 `App` |
| `App.css` | 主页、HUD、Hero Hall 弹层外壳和全局视觉样式。 | CSS class |
| `index.css` | 页面根级 reset 和背景。 | CSS root |
| `types.ts` | 跨模块共享类型。 | `AgentWorkflow`, `RecommendedAgent`, `AgentTurn` |
| `vite-env.d.ts` | Vite 类型声明。 | `ImportMetaEnv` |

## 子模块

- `lib/` — API 客户端、本地 mock、命令解析、语言判断和智能体目录。
- `components/` — 粒子场、开场动画、绘制浮层和对话面板等视觉组件。
- `hooks/` — 语音识别和麦克风电平 hooks。
- `features/` — Agent Console、Workflow、Speech、Hero Hall 和智能体工具函数。

## 开发模式

- **改应用主状态**: 从 `App.tsx` 进入，再下钻到 `features/workflow/` 或 `features/heroHall/`。
- **改共享数据结构**: 优先更新 `types.ts`，再检查所有导入方。
- **改大块样式**: 优先使用 feature colocated CSS；只有全局 HUD/主页外壳才改 `App.css`。
