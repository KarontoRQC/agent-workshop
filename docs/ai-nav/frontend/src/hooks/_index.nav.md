# hooks/

> `frontend/src/hooks/` · 2 个 React hook 文件

## 职责

封装浏览器语音识别和麦克风能量采样，供主应用驱动语音控制和粒子反馈。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `useVoiceControl.ts` | Web Speech API 语音识别、唤醒后命令提交。 | `useVoiceControl` |
| `useMicLevel.ts` | 麦克风音量采样和清理。 | `useMicLevel` |

## 开发模式

- **改语音识别**: 检查安全上下文提示和自动停止时机。
- **改麦克风采样**: 确保组件卸载时停止 tracks 和 animation frame。

