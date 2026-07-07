# workflow/

> `frontend/src/features/workflow/` · 4 个文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

Workflow 模块维护后端 SSE 事件到前端展示状态的转换，包括知识图谱文本、动态图谱路径、推荐智能体、阵容用户状态、语音分段揭示和右侧 Workflow Dock 展示。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `workflowModel.ts` | 工作流状态、事件合并、语音 reveal 和用户状态构造。 | `createEmptyAgentWorkflow`, `appendWorkflowContent`, `upsertRecommendedAgent` |
| `recommendationSnapshotModel.ts` | 组合入口 URL ID 解析、轮询判断和快照 agents 映射。 | `getAgentCombinationEntryIdFromUrl`, `shouldPollRecommendationSnapshot`, `snapshotToRecommendedAgents` |
| `WorkflowDock.tsx` | 右侧知识路径和推荐智能体 dock 展示。 | `WorkflowDock` |
| `WorkflowDock.css` | Workflow Dock 样式。 | CSS class |

## 开发模式

- **改 SSE 事件处理**: 先改 `workflowModel.ts`，再检查 `App.tsx` 的回调调用。
- **改展示布局**: 修改 `WorkflowDock.tsx` 和 colocated CSS，保持主页 HUD 位置稳定。
