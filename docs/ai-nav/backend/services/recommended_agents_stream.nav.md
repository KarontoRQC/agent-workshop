# recommended_agents_stream.py

> `backend/services/recommended_agents_stream.py` · Python · 约 351 行

## 用途

专门解析 `<RECOMMENDED_AGENTS>` 内部的 `<AGENT>` 列表，将字段转成流式 JSON，并在完成时校验服务端候选名称、去重、限制数量和强制目标阵容。模型漏掉阶段或理由时按阵容补齐非空值，已有模型字段保持不变。课堂完整推荐固定需要五个智能体；模型少给时保留已有结果并按真实白名单顺序补齐。

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
- **改结果校验**: 最终 `recommended_agents.completed` 必须只含允许名称、连续 `agent_index/rank`；完整推荐由工作流设置 `minimum_agents=5`，最多仍为 6 个。
- **改缺失字段兜底**: 只能补空值，不得覆盖模型已返回的 `stage` 或 `reason`。
- **改最小数量**: 只能从传入白名单补齐，不得构造未知名称；同步运行 underflow 补齐测试和真实多场景 API 回归。

## 依赖图

```text
recommended_agents_stream.py
← 引入: coze_stream_transformer.content_event
→ 被引用: coze_workflow.py
```
