# coze_stream_transformer.py

> `backend/services/coze_stream_transformer.py` · Python · 约 380 行

## 用途

解析模型输出中的 XML 风格标签，把文本段、推荐智能体段和通用 Coze/LongCat SSE 帧转换为前端可消费的结构化事件。遇到孤立闭合标签、错误闭合类型或缺失闭合后直接进入下一个合法一级标签时，会结束当前段并从合法标签恢复，禁止把原始 XML 泄漏到可见文本。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ROUTE_PLANNER_TAGS` | const | ~4 | 知识路径阶段允许的标签。 |
| `RECOMMENDER_TAGS` | const | ~21 | 推荐阶段允许的标签。 |
| `UNIFIED_WORKFLOW_TAGS` | const | ~28 | 统一编排模式允许的标签。 |
| `TaggedContentParser` | class | ~39 | 增量解析标签内容并发出事件。 |
| `iter_tagged_events` | function | ~221 | 从上游 SSE 中迭代结构化标签事件。 |
| `iter_tagged_json_stream` | function | ~268 | 迭代 JSON SSE 流。 |
| `format_sse_event` | function | ~306 | 将事件对象格式化为 SSE 文本。 |

## 依赖

内部依赖:
- `backend/services/recommended_agents_stream.py` — 作为 `RECOMMENDED_AGENTS` 段的 stream emitter。

## 修改指南

- **新增标签**: 在对应 TAGS 常量中加入开闭标签，并同步前端 `workflowModel.ts` 的 section 判断；推荐入口标题使用 `ENTRY_TITLE`，由快照流写入 `entry_title`。
- **兼容拼写错误**: 使用 `TAG_TYPE_ALIASES` 和 `TAG_CLOSE_ALIASES`，不要在前端分散兼容。
- **改结构容错**: 同步覆盖标签跨 chunk、错误闭合、孤立闭合和后续 `RECOMMENDED_AGENTS` 恢复；不能把 `<AGENT>` 子标签误当一级边界。
- **改 JSON 序列化**: 保持 `ensure_ascii=False`，避免中文 SSE 变成不可读转义。

## 依赖图

```text
coze_stream_transformer.py
→ 被引用: routes/coze.py, services/coze_workflow.py, services/recommended_agents_stream.py
```
