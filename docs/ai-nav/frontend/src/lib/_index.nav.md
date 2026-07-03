# lib/

> `frontend/src/lib/` · 8 个 TypeScript 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

`lib/` 封装前端非 UI 逻辑：后端 SSE 客户端、智能体目录 API、AI 回复 fallback、本地 mock、语言判断、语音命令解析和智能体目录/启动链接映射。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `agentCatalogClient.ts` | 读取 `GET /api/agents` 数据库智能体目录，并把目录智能体追加到推荐快照。 | `fetchAgentCatalog`, `appendAgentToRecommendation`, `AgentCatalogError` |
| `agentStreamClient.ts` | 调用 `/api/coze/chat/stream` 并解析 SSE。 | `streamAgentChat`, `AgentStreamEvent` |
| `aiClient.ts` | 在流式后端、外部 endpoint、本地 mock 间选择回复来源。 | `requestAIReply` |
| `localMockAgent.ts` | 本地演示 fallback 回复、路径动作和推荐智能体。 | `requestLocalMockAgentReply` |
| `agentLaunchCatalog.ts` | 接收数据库目录并富化推荐智能体的头像、真实启动链接和展示字段。 | `setAgentCatalogAgents`, `enrichDrawAgent`, `getCatalogHeroAgents` |
| `recommendationSnapshotClient.ts` | 读取 `GET /api/recommendations/<id>` 推荐快照。 | `fetchRecommendationSnapshot`, `RecommendationSnapshotError` |
| `commands.ts` | 粒子形态、色板和语音命令解析。 | `parseVoiceCommand`, `clamp` |
| `language.ts` | 中英文会话语言判断。 | `detectConversationLanguage`, `isChineseLanguage` |

## 开发模式

- **改后端事件字段**: 先改 `agentStreamClient.ts` 类型和分发，再改 `workflowModel.ts`。
- **改本地 fallback**: 保持 `localMockAgent.ts` 只用于 demo，不要掩盖真实后端错误。
- **改智能体目录**: 同步检查 `backend/services/agent_catalog_store.py`、`backend/routes/agents.py` 和 `agentCatalogClient.ts`。
