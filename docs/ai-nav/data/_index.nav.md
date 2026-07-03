# data/

> `data/` · 1 个 JSON 数据文件

## 职责

提供推荐智能体源目录。后端启动时用它种子导入数据库智能体目录，前端运行时不再直接读取该 JSON，而是通过 `GET /api/agents` 获取头像 URL 和启动链接。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `source_agents_full.json` | 约 60 个智能体/项目的名称、功能、类型、链接、知识库和介绍，作为 `agents` 表的种子来源。 | `智能体名称`, `智能体链接`, `知识库` |

## 开发模式

- **新增智能体**: 保持 `智能体名称` 字段非空；如有可打开入口，填入 `智能体链接`，再检查 `backend/services/agent_catalog_store.py` 的种子归一化。
- **改字段名**: 同步检查 `backend/config.py`、`backend/services/agent_catalog_store.py` 和 `docs/coze-chat-stream-api.md`。
