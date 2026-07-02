# recommended_agents_stream.py

> `backend/services/recommended_agents_stream.py` · Python · 约 280 行

## 用途

专门解析 `<RECOMMENDED_AGENTS>` 内部的 `<AGENT>` 列表，将 rank、agent_name、lineup、stage、reason 转成流式 JSON 增量。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `RecommendedAgentsStreamEmitter` | class | ~41 | 增量读取 `<AGENT>` 字段并输出推荐智能体事件。 |
| `FIELD_TAGS` | const | ~5 | 标签名到字段名的映射。 |
| `LINEUP_ALIASES` | const | ~13 | 阵容别名到 `core/growth/conversion` 的映射。 |

## 依赖

内部依赖:
- `backend/services/coze_stream_transformer.py` — 使用 `content_event` 创建标准事件。

## 修改指南

- **新增推荐字段**: 同步修改 `FIELD_TAGS`、prompt、前端 `RecommendedAgent` 类型和 Hero Hall 展示。
- **改阵容别名**: 同步检查后端 `coze_workflow.py` 和前端 `heroHallModel.ts`。

## 依赖图

```text
recommended_agents_stream.py
← 引入: coze_stream_transformer.content_event
→ 被引用: coze_workflow.py
```
