# test_tts_service.py

> `backend/tests/test_tts_service.py` · Python · 约 31 行

## 用途

验证 TTS 服务入口固定调用 Edge TTS，即使运行环境残留 Piper 或本地模型变量，也不会暴露或调用本地模型分支。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `test_synthesize_speech_uses_edge_tts_only` | test | ~4 | monkeypatch Edge 合成函数，断言入口返回 MP3 mimetype、使用默认 Edge 女声，并且没有 Piper 属性。 |

## 依赖

内部依赖:
- `backend/services/tts_service.py` — 提供 Edge-only TTS 合成入口。

外部依赖(仅列包名,不做解释):
- `pytest`

## 修改指南

- **改合成入口**: 保持 `synthesize_speech` 只调 Edge TTS，并同步更新本测试。
- **禁止本地模型回归**: 不要重新添加 `synthesize_with_piper` 或 `TTS_PROVIDER` provider 分支。

## 依赖图

```text
test_tts_service.py
→ 引入: backend/services/tts_service.py
→ 被引用: pytest
```
