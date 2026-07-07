# features/

> `frontend/src/features/` · 5 个功能域
> **功能文档**: `frontend/AGENTS.md`

## 职责

功能目录按业务边界组织前端逻辑：对话控制台、工作流状态与展示、语音输出、Agent Hero Hall 以及推荐智能体工具函数。

## 子模块

- `agentConsole/` — 左下/左侧 JARVIS 对话控制台，包含语音模块、打字切换和文本输入。
- `workflow/` — 知识路径、推荐智能体、用户状态和 Workflow Dock。
- `speech/` — TTS 请求、浏览器语音、唤醒词和 fallback 音。
- `heroHall/` — Agent Hero Hall 弹层、英雄池、推荐战队轮播、组合入口页阵容搭建/保存和阵容模型。
- `agents/` — 推荐智能体显示名、阶段和 key 工具函数。

## 开发模式

- **改跨模块状态**: 优先从 `workflow/workflowModel.ts` 和 `heroHall/heroHallModel.ts` 判断数据边界。
- **改 UI 组件**: 保持组件和样式 colocated，不要把模块样式塞回 `App.css`。
