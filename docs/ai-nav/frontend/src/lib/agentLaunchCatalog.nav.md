# agentLaunchCatalog.ts

> `frontend/src/lib/agentLaunchCatalog.ts` · TypeScript · 约 447 行

## 用途

解析 `data/source_agents_full.json`，生成可展示、可启动、可匹配头像的智能体目录。它为抽卡浮层、Workflow Dock 和 Hero Hall 提供富化后的 agent。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `AgentLaunchTarget` | type | ~26 | 可打开目标的标题和 URL。 |
| `EnrichedDrawAgent` | type | ~31 | 推荐智能体加头像、知识库、meta 和启动信息后的结构。 |
| `enrichDrawAgent` | function | ~86 | 用目录数据富化一个推荐智能体。 |
| `getAgentLaunchTargets` | function | ~135 | 从富化 agent 列表提取可打开目标。 |
| `getCatalogHeroAgents` | function | ~151 | 返回完整 Hero Hall 候选池。 |
| `openAgentLaunchTargets` | function | ~166 | 打开单个或多个启动目标。 |

## 依赖

内部依赖:
- `data/source_agents_full.json` — 源目录。
- `frontend/src/assets/agent-avatars/*` — 头像素材。
- `types.ts` — 推荐智能体类型。

## 修改指南

- **改智能体字段名**: 同步 `data/source_agents_full.json` 和 `backend/config.py`。
- **改启动方式**: 检查 `openAgentLaunchTargets` 和 `writeLaunchHub`，避免浏览器弹窗被阻止后无 fallback。

## 依赖图

```text
agentLaunchCatalog.ts
← 引入: data/source_agents_full.json, src/assets/agent-avatars
→ 被引用: AgentDrawOverlay, WorkflowDock, AgentHeroHall, heroHallModel
```

