# speech/

> `frontend/src/features/speech/` · 1 个 TypeScript 文件

## 职责

Speech 模块统一处理唤醒词、睡眠指令、服务端 TTS 请求、浏览器语音 fallback、本地通信音和播放取消。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `speechOutput.ts` | 语音输出和 TTS fallback。 | `speak`, `requestTtsAudio`, `extractWakeCommand` |

## 开发模式

- **改语音播放**: 保持 server → browser/local fallback 的 auto 模式。
- **改唤醒词**: 同步检查 `App.tsx` 中 voice awake 状态。

