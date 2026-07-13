# test_recent_dialogue.py

> `backend/tests/test_recent_dialogue.py` · pytest

## 用途

验证有界近期对话只保留最新有效 user/assistant 消息，严格执行 10 条、单条 600 字、总计 3,200 字限制，并防止历史文本伪造上下文边界。

## 修改指南

- 修改近期对话限额、角色兼容或转义策略时同步更新本文件、前端 `recentDialogue.ts` 和接口文档。
