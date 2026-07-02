# speechOutput.ts

> `frontend/src/features/speech/speechOutput.ts` · TypeScript · 约 529 行

## 用途

提供 JARVIS 语音输出能力：唤醒词解析、休眠意图、浏览器 voice 选择、服务端 `/api/tts/speech` 请求、本地 WebAudio/WAV fallback 和播放取消。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `SpeechCallbacks` | type | ~57 | 播放开始、结束、错误和 pulse 回调。 |
| `SpeechOutputOptions` | type | ~64 | 主应用播放选项。 |
| `extractWakeCommand` | function | ~82 | 从文本中识别 Jarvis 唤醒词和后续命令。 |
| `wantsSleep` | function | ~100 | 判断是否要求退下/待命/休眠。 |
| `primeSpeechOutput` | function | ~166 | 预热浏览器 speechSynthesis。 |
| `getTtsMode` | function | ~186 | 读取 `VITE_TTS_BROWSER_FALLBACK`。 |
| `isFallbackableTtsError` | function | ~202 | 判断错误是否可走 fallback。 |
| `cancelSpeechPlayback` | function | ~210 | 停止当前语音或 fallback 音。 |
| `requestTtsAudio` | async function | ~428 | 请求服务端 TTS 音频 Blob。 |
| `speak` | function | ~619 | 播放服务端音频、浏览器语音或 fallback 音。 |

## 依赖

内部依赖:
- `frontend/src/lib/agentStreamClient.ts` — 使用 `API_BASE_URL`。
- `frontend/src/lib/language.ts` — 选择中英文 voice。

## 修改指南

- **改 TTS URL**: 同步 Vite 代理和后端 `routes/tts.py`。
- **改 fallback 音**: 检查浏览器 Autoplay 限制和 `onPulse` 视觉反馈。
- **改唤醒词**: 同步用户可说的中文近音词，不要只保留英文。

## 依赖图

```text
speechOutput.ts
← 引入: agentStreamClient, language
→ 被引用: App.tsx
```

