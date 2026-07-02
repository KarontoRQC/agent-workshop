# recommended_agent.txt

> `backend/prompts/recommended_agent.txt` · Prompt 文本 · 约 21 KB

## 用途

指导推荐智能体从可用智能体集合中选择 1-10 个，并按固定 XML 结构输出推荐列表和组合总结。

## 关键协议

| 名称 | 类型 | 作用 |
|------|------|------|
| `RECOMMENDED_AGENTS` | XML 标签 | 包裹所有推荐智能体。 |
| `AGENT` | XML 标签 | 单个推荐智能体。 |
| `RANK` | XML 标签 | 推荐排序。 |
| `AGENT_NAME` | XML 标签 | 必须等于候选集合中的原始名称。 |
| `LINEUP` | XML 标签 | 只能是 `core`、`growth`、`conversion`。 |
| `STAGE` | XML 标签 | 推荐适用阶段。 |
| `REASON` | XML 标签 | 推荐理由。 |

## 依赖

内部依赖:
- `backend/services/recommended_agents_stream.py` — 将内部 `AGENT` 字段解析为 JSON。
- `frontend/src/features/heroHall/heroHallModel.ts` — 消费阵容字段。

## 修改指南

- **新增字段**: 同步 `FIELD_TAGS`、前端 `RecommendedAgent` 和 Hero Hall 展示。
- **修改候选名称规则**: 同步 `data/source_agents_full.json` 字段读取逻辑。

