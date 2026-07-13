# test_tts_config.py

> `backend/tests/test_tts_config.py` · Python · 约 27 行

## 用途

验证后端 TTS 配置固定走 Edge TTS 中文女声路径：忽略 `TTS_PROVIDER`、`PIPER_EXE`、`PIPER_VOICE` 等本地模型环境变量，允许已知 Edge 中文女声，并把男声或未知 voice 回落到默认 `zh-CN-XiaoxiaoNeural`。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `test_tts_settings_ignore_local_provider_env` | test | ~4 | 断言本地模型环境变量不会进入 `TtsSettings`。 |
| `test_tts_settings_allows_known_edge_chinese_female_voice` | test | ~17 | 断言已知 Edge 中文女声可作为配置值。 |
| `test_tts_settings_rejects_edge_male_voice` | test | ~23 | 断言 Edge 中文男声会回落到默认女声。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 `get_tts_settings` 和默认 Edge TTS 女声。

外部依赖(仅列包名,不做解释):
- `pytest`

## 修改指南

- **改 Edge 女声白名单**: 同步更新 `backend/config.py` 和本测试断言。
- **保持 Edge-only**: 不要新增本地模型 provider 断言为合法配置。

## 依赖图

```text
test_tts_config.py
→ 引入: backend/config.py
→ 被引用: pytest
```
