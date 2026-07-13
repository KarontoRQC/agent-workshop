# test_config.py

> `backend/tests/test_config.py` · Python · 约 55 行

## 用途

验证 LongCat 课堂可靠性默认值/边界，以及默认推荐候选名称读取规则，确保源表里没有 `智能体链接` 的智能体不会进入推荐器候选集合。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `test_longcat_reliability_defaults_are_classroom_bounded` | test | ~6 | 验证 6 秒流静默超时、响应头前重试和退避默认值。 |
| `test_longcat_reliability_settings_are_safely_bounded` | test | ~18 | 验证超时/重试环境变量不能突破安全上下界。 |
| `test_read_agent_names_skips_records_without_launch_link` | test | ~6 | 构造临时智能体源表，断言空链接/null 链接记录被跳过，同时保留有链接记录并去重。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 `_read_agent_names` 默认候选读取逻辑。

外部依赖(仅列包名,不做解释):
- `pytest`

## 修改指南

- **改默认候选规则**: 同步更新 `backend/config.py`、`docs/coze-chat-stream-api.md` 和本测试断言。
- **改 LongCat 可靠性环境变量**: 同步更新默认值、上下界、`.env.example`、接口文档和本测试断言。

## 依赖图

```text
test_config.py
← 引入: backend/config.py
→ 被引用: pytest
```
