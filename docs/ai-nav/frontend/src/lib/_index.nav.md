# lib/

> `frontend/src/lib/` · 14 个 TypeScript 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

`lib/` 封装前端非 UI 逻辑：后端 SSE 客户端、智能体目录 API、AI 回复 fallback、本地 mock、语言判断、语音命令解析和智能体目录/启动链接映射。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `agentCatalogClient.ts` | 读取 `GET /api/agents` 数据库智能体目录，并把目录智能体追加到推荐快照。 | `fetchAgentCatalog`, `appendAgentToRecommendation`, `AgentCatalogError` |
| `agentStreamClient.ts` | 调用 `/api/coze/chat/stream` 并解析 SSE。 | `streamAgentChat`, `AgentStreamEvent` |
| `aiClient.ts` | 在流式后端、外部 endpoint、本地 mock 间选择回复来源。 | `requestAIReply` |
| `apiBase.ts` | 规范化同源 API 地址，阻止 HTTPS 页面回退到明文 HTTP。 | `resolveApiUrl`, `getApiBaseUrl` |
| `apiSession.ts` | 获取、缓存和刷新签名 API 会话，并为受保护请求注入 CSRF header。 | `fetchWithApiSession`, `ensureApiSession` |
| `combinationAgentClient.ts` | 读取和保存组合智能体服务对象；组合入口页右上保存按钮通过它调用 `/api/combination-agents/by-recommendation/<id>`。 | `fetchCombinationAgentByRecommendation`, `saveCombinationAgentForRecommendation`, `CombinationAgentError` |
| `consoleBranding.ts` | 应用启动时向开发者控制台仅输出一次羊驼字符画。 | `printConsoleBranding` |
| `localMockAgent.ts` | 本地演示 fallback 回复、路径动作和推荐智能体。 | `requestLocalMockAgentReply` |
| `participantIdentity.ts` | 从 URL 白名单解析普通用户/厂长参与者身份，未知值统一降级为普通用户。 | `getParticipantIdentityFromSearch`, `normalizeParticipantIdentity`, `ParticipantIdentity` |
| `recommendationEditAccess.ts` | 按推荐编号在本机保存工作流返回的编辑 token，公开分享页保持只读。 | `storeRecommendationEditToken`, `getRecommendationEditToken`, `clearRecommendationEditToken` |
| `agentLaunchCatalog.ts` | 接收数据库目录并富化推荐智能体的头像、真实启动链接和展示字段，并提供组合入口导航 helper。 | `setAgentCatalogAgents`, `enrichDrawAgent`, `getCatalogHeroAgents`, `openAgentCombinationEntryPage` |
| `recommendationSnapshotClient.ts` | 读取 `GET /api/recommendations/<id>` 推荐快照；旧 `saveRecommendationLineup` 仅作兼容，组合智能体保存应走 `combinationAgentClient.ts`。 | `fetchRecommendationSnapshot`, `saveRecommendationLineup`, `RecommendationSnapshotError` |
| `commands.ts` | 粒子形态、色板和语音命令解析。 | `parseVoiceCommand`, `clamp` |
| `language.ts` | 中英文会话语言判断。 | `detectConversationLanguage`, `isChineseLanguage` |

## 开发模式

- **改后端事件字段**: 先改 `agentStreamClient.ts` 类型和分发，再改 `workflowModel.ts`。
- **改本地 fallback**: 保持 `localMockAgent.ts` 只用于 demo，不要掩盖真实后端错误。
- **改智能体目录**: 同步检查 `backend/services/agent_catalog_store.py`、`backend/routes/agents.py` 和 `agentCatalogClient.ts`。
- **改组合智能体保存**: 同步检查 `combinationAgentClient.ts`、`backend/routes/combination_agents.py` 和组合入口页。
- **改参与者身份**: 保持 URL 只解析白名单值，并同步检查 `agentStreamClient.ts`、后端 `participant_identity.py` 与接口文档；禁止把 URL 参数当权限。
- **改 API 会话/写接口**: 统一通过 `apiSession.ts` 发请求；推荐或组合写入还必须从 `recommendationEditAccess.ts` 取对应编号的编辑 token。
