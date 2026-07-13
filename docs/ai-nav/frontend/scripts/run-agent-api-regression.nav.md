# run-agent-api-regression.mjs

> `frontend/scripts/run-agent-api-regression.mjs` · Node.js · 约 367 行

## 用途

真实请求 Agent SSE，验证问候、同一会话连续切换白酒招商/餐饮私域/客户唤醒/千人大课等业务推荐、长上下文路径保护、标签顺序、首字延迟、会话/编辑权限、消息上限、目录分类和 TTS。

## 运行

```powershell
$env:AGENT_REPORT_OUTPUT='outputs/agent-api-regression.json'
node scripts/run-agent-api-regression.mjs https://agent.xtznai.com/api
```

## 修改指南

- 使用隔离生成的推荐编号完成写入回归；报告不得输出 `recommendation_edit_token`。
- 多场景回归必须逐轮回传 `conversation_ids` 与上一轮 `user_state`，并断言显式切换后会话 ID、路径、推荐编号和五智能体阵容全部更新。
- 所有可见段不得包含原始一级 XML 标签，也不得出现“当前状态为空”“按 A/B/C 模式”“内部模式提示”等编排语言。
- 修改 SSE、访问控制、目录或 TTS 契约时同步更新断言和 `docs/coze-chat-stream-api.md`。
