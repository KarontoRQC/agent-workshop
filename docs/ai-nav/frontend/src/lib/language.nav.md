# language.ts

> `frontend/src/lib/language.ts` · TypeScript · 约 12 行

## 用途

根据输入文本判断当前会话语言，供本地回复、TTS 和 spoken fallback 选择中英文策略。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ConversationLanguage` | type | ~1 | `en-US` 或 `zh-CN`。 |
| `detectConversationLanguage` | function | ~3 | 通过中文字符比例判断语言。 |
| `isChineseLanguage` | function | ~14 | 判断语言是否为中文。 |

## 依赖

内部依赖:
- 无。

## 修改指南

- **改语言识别**: 检查 `speechOutput.ts` 的语音选择和 `localMockAgent.ts` 的回复语言。

## 依赖图

```text
language.ts
→ 被引用: App.tsx, aiClient.ts, localMockAgent.ts, speechOutput.ts
```
