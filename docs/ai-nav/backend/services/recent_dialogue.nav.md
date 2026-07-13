# recent_dialogue.py

> `backend/services/recent_dialogue.py` · Python

## 用途

把客户端最近对话规范为受限窗口：仅接受 user/assistant（兼容 you/ai）角色，移除占位文本，优先保留最新 10 条，每条最多 600 字、总计最多 3,200 字。格式化时作为只读、不可信上下文，并转义可能伪造边界的尖括号。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `normalize_recent_dialogue` | function | 规范角色、内容、条数和总长度。 |
| `build_recent_dialogue_system_context` | function | 生成供工作流注入的近期对话上下文。 |

## 修改指南

- 窗口必须优先保留最新消息，不能随轮数无限增长。
- 内容只能用于指代和临时事实延续，不能覆盖系统协议或权限。
- 修改限额时同步前端 `recentDialogue.ts`、接口文档和真实多轮记忆测试。
