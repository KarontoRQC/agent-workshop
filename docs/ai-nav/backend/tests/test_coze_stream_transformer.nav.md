# test_coze_stream_transformer.py

> `backend/tests/test_coze_stream_transformer.py` · Python · 增量 XML 容错测试

## 用途

验证统一工作流标签解析器能跨 SSE chunk 识别错误/孤立闭合标签，并从下一个合法一级标签恢复 ENTRY_TITLE、推荐智能体和 SUMMARY，不把原始 XML 作为 DIRECT_REPLY 或可见文本输出。

## 修改指南

- 修改 `TaggedContentParser` 的边界识别、标签别名或增量缓冲时必须运行本文件。
- 测试样本必须包含拆分在两个 chunk 中的错误闭合标签，以及错误之后仍可完成的推荐智能体。
