# useVoiceControl.ts

> `frontend/src/hooks/useVoiceControl.ts` · TypeScript · 约 253 行

## 用途

封装浏览器 Web Speech API，处理安全上下文检查、识别生命周期、单轮收音和快速语音命令提交。最终结果使用短静默窗口，临时结果使用稍长窗口作为浏览器未及时 final 的兼容兜底。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `useVoiceControl` | hook | ~67 | 返回语音识别状态、错误、启动/停止控制。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `react`

## 修改指南

- **改唤醒或停止逻辑**: 同步检查 `speechOutput.ts` 的 `extractWakeCommand` 和 `wantsSleep`。
- **改错误提示**: 保持非安全连接提示可见且明确。
- **改静默窗口**: 保持 final 结果快速、interim 结果稳健，并确保命令发出后 `keepAliveRef` 关闭，不自动启动下一轮收音。

## 依赖图

```text
useVoiceControl.ts
→ 被引用: App.tsx
```
