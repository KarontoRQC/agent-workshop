# agents/

> `frontend/src/features/agents/` · 1 个工具文件

## 职责

提供推荐智能体的规范化、显示名、阶段、key 和可展示判断工具函数。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `agentUtils.ts` | 推荐智能体字段清洗和展示辅助函数。 | `normalizeRecommendedAgent`, `getRecommendedAgentKey` |

## 开发模式

- **改展示名规则**: 同步检查 Workflow Dock、Hero Hall 和 Agent Console。

