# knowledge_graph_agent.txt

> `backend/prompts/knowledge_graph_agent.txt` · Prompt 文本 · 约 22 KB

## 用途

指导路径规划智能体判断用户输入是否包含业务/学习/经营需求，并在匹配时输出知识图谱路径；闲聊时只输出日常回复结构。

## 关键协议

| 名称 | 类型 | 作用 |
|------|------|------|
| `THINKING_PROCESS` | XML 标签 | 可展示判断摘要。 |
| `ACK` | XML 标签 | 面向用户的自然承接回复。 |
| `KG_PATH` | XML 标签 | 唯一路径文本，要求 6-10 个节点。 |
| `EXPLANATION` | XML 标签 | 路径匹配说明，必须拼写完整。 |

## 依赖

内部依赖:
- `backend/services/coze_stream_transformer.py` — 解析这些标签。
- `backend/services/graph_path_resolver.py` — 消费 `KG_PATH`。

## 修改指南

- **修改输出协议**: 必须同步后端 parser 和 `docs/coze-chat-stream-api.md`。
- **修改路径节点数量**: 同步前端展示密度和后端 `GraphPathResolver` 预期。
