# tts_service.py

> `backend/services/tts_service.py` · Python · 约 113 行

## 用途

统一 TTS 合成入口，只调用 Edge TTS 生成 MP3 音频，并根据 mood 调整语速和音高。服务不再提供 Piper、本地 ONNX 模型或其他本地语音合成分支。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `TtsConfigurationError` | exception | ~10 | Edge TTS 可执行入口不可用时抛出。 |
| `TtsSynthesisError` | exception | ~14 | Edge TTS 命令失败、超时或没有输出音频时抛出。 |
| `synthesize_speech` | function | ~18 | 路由调用的合成入口，固定返回 Edge TTS MP3 字节和 `audio/mpeg`。 |
| `synthesize_with_edge_tts` | function | ~23 | 使用 Edge TTS 生成音频文件并读取为字节。 |
| `get_edge_command` | function | ~73 | 解析 `EDGE_TTS_EXE`，默认通过当前 Python 的 `edge_tts` 模块运行。 |
| `get_edge_mood_rate` | function | ~90 | 根据 mood 选择 Edge TTS 语速。 |
| `get_edge_mood_pitch` | function | ~103 | 根据 mood 选择 Edge TTS 音高。 |

## 依赖

内部依赖:
- `backend/config.py` — 提供 Edge TTS 命令、中文女声、速率、音量、音高和超时配置。

外部依赖(仅列包名,不做解释):
- `edge-tts`

## 修改指南

- **改语音默认值**: 先改 `backend/config.py` 的 Edge TTS 女声白名单和默认值，再更新 `backend/.env.example` 与 `backend/tests/test_tts_config.py`。
- **改 mood 映射**: 检查 `get_edge_mood_rate` 和 `get_edge_mood_pitch`，并补充服务测试。
- **保持 Edge-only**: 不要重新加入 Piper、本地模型或 `TTS_PROVIDER` 分支；残留的本地模型环境变量应被忽略。

## 依赖图

```text
tts_service.py
→ 引入: config
→ 被引用: routes/tts.py
```
