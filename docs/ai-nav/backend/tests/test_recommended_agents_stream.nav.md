# test_recommended_agents_stream.py

> `backend/tests/test_recommended_agents_stream.py` · Python · 约 85 行

## 用途

验证推荐智能体流的候选白名单、名称规范化、去重、数量限制、目标阵容强制、缺失字段补齐和无白名单兼容行为。

## 关键覆盖

| 名称 | 类型 | 作用 |
|------|------|------|
| `test_emitter_filters_unknown_duplicate_and_excess_agents` | test | 校验最终推荐列表只保留合法且不重复的服务端候选。 |
| `test_emitter_without_allowlist_keeps_backward_compatible_agent` | test | 保持独立解析器无白名单调用的兼容性。 |
| `test_emitter_fills_only_missing_stage_and_reason_fields` | test | 只补齐缺失阶段/理由，不覆盖模型已有内容。 |

## 修改指南

- 修改 `<AGENT>` 字段、候选校验、最大数量或阵容归一化时同步更新断言。
