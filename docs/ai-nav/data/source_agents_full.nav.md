# source_agents_full.json

> `data/source_agents_full.json` · JSON · 约 482 行

## 用途

保存智能体源目录。后端读取 `智能体名称` 作为默认推荐候选，前端读取完整记录用于头像匹配、展示名称、知识库提示和启动链接。

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
- `frontend/src/lib/agentLaunchCatalog.ts` — 解析链接、头像、知识库和稳定 key。

## 修改指南

- **改名称**: 检查推荐 prompt 是否仍能完全匹配候选名称。
- **改链接字段**: 检查 `getAgentLaunchTarget` 是否仍能解析。

## 依赖图

```text
source_agents_full.json
→ 被引用: backend/config.py, frontend/src/lib/agentLaunchCatalog.ts
```
