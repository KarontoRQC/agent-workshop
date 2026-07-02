# unified_orchestration_agent.txt

> `backend/prompts/unified_orchestration_agent.txt` · Prompt 文本 · 约 6 KB

## 用途

统一编排知识路径和智能体组合，根据当前用户状态判断本轮是非需求、只改路径、只改智能体组合，还是完整新需求流程。

## 关键协议

| 名称 | 类型 | 作用 |
|------|------|------|
| 模式 A | 分支 | 非需求类，只输出 `THINKING_PROCESS` 和 `ACK`。 |
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

