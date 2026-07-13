# combination_agents.py

> `backend/routes/combination_agents.py` · Python · 约 123 行

## 用途

定义组合智能体服务对象的 HTTP 接口。组合入口页右上角保存按钮通过这里把用户调整后的五槽阵容保存为独立 `combination_agents` 记录；推荐快照只用于校验来源和生成 `source_snapshot`。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `combination_agents_bp` | Blueprint | ~12 | 注册组合智能体服务接口。 |
| `get_combination_agent` | function | ~16 | 通过 `combo_*` ID 读取已保存组合智能体。 |
| `get_combination_agent_by_recommendation` | function | ~29 | 通过 `recommendation_id` 读取已保存组合；`optional=1` 且未保存时返回 200/null，默认仍返回 404。 |
| `save_combination_agent_for_recommendation` | function | ~42 | 校验推荐快照存在后，把当前五槽阵容写入组合智能体 store。 |

## 依赖

内部依赖:
- `backend/services/combination_agent_store.py` — 提供组合阵容归一化和持久化 store。
- `backend/routes/agents.py` — 复用静态头像 URL 生成。
- `backend/services/recommendation_snapshot_store.py` — 通过 Flask config 读取推荐快照，作为组合智能体来源校验。

外部依赖(仅列包名,不做解释):
- `flask`

## 修改指南

- **改组合智能体保存 payload**: 先改 `services/combination_agent_store.py` 的归一化函数，再改本路由和前端 `combinationAgentClient.ts`。
- **改可选读取语义**: 保留无 `optional=1` 时的 404 兼容行为；组合入口页用 200/null 表达“尚未保存”，避免浏览器把正常状态打印成资源错误或取消请求。
- **改恢复逻辑**: 修改 `get_combination_agent_by_recommendation`，并同步组合入口页的加载顺序。
- **改头像重写**: 检查 `_combination_agent_with_static_avatar_urls` 和 `routes/agents.py` 的 `get_agent_avatar_url`。

## 依赖图

```text
combination_agents.py
← 引入: routes.agents, services.combination_agent_store
→ 被引用: app.py
```
