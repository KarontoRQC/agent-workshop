# source_agents_full.json

> `data/source_agents_full.json` · JSON · 约 482 行

## 用途

保存智能体源目录。后端读取 `智能体名称` 作为默认推荐候选，并通过 `PostgresAgentCatalogStore` 将完整记录种子导入 `agents` 表；前端运行时通过 `GET /api/agents` 获取目录，不再直接读取该文件。

## 结构

| 字段 | 类型 | 作用 |
|------|------|------|
| `智能体名称` | string | 推荐和展示的原始名称。 |
| `功能` | string | 管理、销售、私域、文案等分类。 |
| `类型` | string | 智能体或项目。 |
| `智能体链接` | string/null | 可打开的 ChatGPT/GPT 启动目标。 |
| `知识库` | string/null | 关联知识库文件名。 |
| `智能体介绍` | string/null | 前端和推荐逻辑可用的描述文本。 |

## 依赖

内部依赖:
- `backend/config.py` — 从 `智能体名称` 加载默认候选。
- `backend/services/agent_catalog_store.py` — 归一化完整记录并导入数据库目录。

## 修改指南

- **改名称**: 检查推荐 prompt 是否仍能完全匹配候选名称。
- **改链接字段**: 检查 `agent_catalog_store.py`、`routes/agents.py` 和 `agentLaunchCatalog.ts` 是否仍能传递并解析 `launch_url`。

## 依赖图

```text
source_agents_full.json
→ 被引用: backend/config.py, backend/services/agent_catalog_store.py
```
