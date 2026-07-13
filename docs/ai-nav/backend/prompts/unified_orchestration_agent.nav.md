# unified_orchestration_agent.txt

> `backend/prompts/unified_orchestration_agent.txt` · Prompt 文本 · 约 6 KB

## 用途

统一编排知识路径和智能体组合，根据当前用户状态判断本轮是非需求、只改路径、只改智能体组合，还是完整新需求流程；普通课堂互动优先直接接话和自然幽默，不因旧状态或固定人格拒绝、抬杠或强行拉回业务规划；路径更新和完整业务承接 ACK 同样必须有短笑点，不能只播报“正在校准”。

## 关键协议

| 名称 | 类型 | 作用 |
|------|------|------|
| 模式 A | 分支 | 非需求类，先输出简短 `THINKING_PROCESS`，再输出自然 `ACK`。 |
| 模式 B1 | 分支 | 只修改知识路径，输出新的 `KG_PATH`。 |
| 模式 B2 | 分支 | 只修改智能体组合，沿用当前 `KG_PATH` 并输出 `RECOMMENDED_AGENTS`。 |
| 模式 C | 分支 | 新需求完整流程，输出路径、推荐和总结。 |

## 依赖

内部依赖:
- `backend/services/coze_workflow.py` — 构造统一编排输入并消费输出。
- `frontend/src/features/workflow/workflowModel.ts` — 维护前端用户状态和阵容状态。

## 修改指南

- **改模式选择规则**: 同步检查 `_detect_state_edit_mode` 和前端状态提交逻辑。
- **改完整流程标签**: 同步检查 `UNIFIED_WORKFLOW_TAGS`。
- **改输出顺序**: 所有模式必须保持 `THINKING_PROCESS` 在 `ACK` 前，不得为了首响速度改写协议或注入固定文案。
- **改现场人格**: 普通无害话题先回答、先入戏；厂长与学员切换按当前说话者处理。闲聊和业务 ACK 都须自然带一个短笑点，幽默不得破坏 XML、推荐数量和 `AGENT_NAME` 精确匹配。
