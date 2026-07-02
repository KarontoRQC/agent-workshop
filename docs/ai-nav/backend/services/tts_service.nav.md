# tts_service.py

> `backend/services/tts_service.py` · Python · 约 190 行

## 用途

统一 TTS 合成入口，按配置选择 Edge TTS 或 Piper，并根据 mood 调整语速、音高或长度参数。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `TtsConfigurationError` | exception | ~10 | TTS provider 配置不可用。 |
| `TtsSynthesisError` | exception | ~14 | 合成命令失败或没有输出音频。 |
| `synthesize_speech` | function | ~18 | 路由调用的合成入口。 |
| `synthesize_with_edge_tts` | function | ~34 | 使用 Edge TTS 生成音频。 |
| `synthesize_with_piper` | function | ~101 | 使用 Piper 生成音频。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 TTS provider 和可执行文件设置。

外部依赖(仅列包名,不做解释):
- `edge-tts`
- `piper`

## 修改指南

- **新增 provider**: 在 `synthesize_speech` 中加分支，并保持返回 `(audio_bytes, mimetype)`。
- **改 mood 映射**: 检查 `get_mood_length_scale`、`get_edge_mood_rate`、`get_edge_mood_pitch`。

## 依赖图

```text
tts_service.py
← 引入: config
→ 被引用: routes/tts.py
```
