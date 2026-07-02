# prompts/

> `backend/prompts/` · 3 个 prompt 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

这些 prompt 定义模型输出的 XML 标签顺序、字段约束和业务表达规则。后端解析器依赖这些标签契约，不能把 prompt 当普通文案随意改。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `knowledge_graph_agent.txt` | 知识图谱路径规划 prompt，要求输出 `THINKING_PROCESS`、`ACK`、`KG_PATH`、`EXPLANATION`。 | XML 标签协议 |
| `recommended_agent.txt` | 智能体推荐 prompt，要求输出 `RECOMMENDED_AGENTS` 和内部 `AGENT` 字段。 | 推荐字段协议 |
| `unified_orchestration_agent.txt` | 统一编排 prompt，按输入状态选择非需求、单项修改或完整流程。 | 统一工作流协议 |

## 开发模式

- **改标签名或顺序**: 同步改 `backend/services/coze_stream_transformer.py`、`backend/services/recommended_agents_stream.py` 和前端流式消费。
- **改阵容规则**: 同步检查 `core/growth/conversion` 在后端和前端模型中的映射。

