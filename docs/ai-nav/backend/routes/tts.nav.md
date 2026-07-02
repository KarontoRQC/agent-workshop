# tts.py

> `backend/routes/tts.py` · Python · 约 26 行

## 用途

提供 TTS 音频接口，接收文本和 mood，调用后端合成服务并返回 WAV/MP3 字节流。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `tts_bp` | Blueprint | ~6 | 注册 `/api/tts` 接口。 |
| `speech` | function | ~10 | 处理 `POST /speech`，返回音频或 JSON 错误。 |

## 依赖

内部依赖:
- `backend/services/tts_service.py` — 合成音频并处理 provider 细节。

外部依赖(仅列包名,不做解释):
- `flask`

## 修改指南

- **扩展请求字段**: 先在 `speech` 中校验，再把参数传入 `synthesize_speech`。
- **改错误码**: 配置缺失保持 503，合成失败保持 502。

## 依赖图

```text
tts.py
← 引入: services.tts_service
→ 被引用: app.py 注册为 /api/tts
```
