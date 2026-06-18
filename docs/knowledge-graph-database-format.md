# Knowledge Graph Database Format

这份格式给后端和 Agent 使用，只存业务语义，不存前端显示样式。

不要把这些字段写进数据库：

- `x`
- `y`
- `radius`
- `color`
- `fan`
- `ring`
- `opacity`
- `labelMode`
- `kind`

这些都属于前端布局渲染层，由 `graphLayout.js` 动态计算。

## Tables

### nodes

存所有业务节点。行业、痛点、能力、变量、小任务都在这张表里。

```json
{
  "id": "problem-leads",
  "title": "线索获取",
  "node_type": "problem",
  "parent_id": "industry-baijiu",
  "level": 2,
  "summary": "从线索来源、客户画像、首轮触达和招商理由四个方向拆解。",
  "insight": "线索问题不能只问流量，要问谁值得跟、为什么现在跟、下一句说什么。",
  "status": "active",
  "is_leaf": false,
  "sort_order": 1
}
```

字段说明：

- `id`: 稳定节点 ID，前端、后端、Agent 都用这个做引用。
- `title`: 节点显示名，也是 Agent 可读名称。
- `node_type`: 节点类型。当前有 `brief`、`industry`、`problem`、`capability`、`问题`、`动作`、`素材`、`数据`、`变量` 等。
- `parent_id`: 默认父节点。根节点为 `null`。
- `level`: 从根节点开始的层级。根节点是 `0`。
- `summary`: 给用户看的短摘要。
- `insight`: 给 Agent 的判断提示，通常比 `summary` 更适合写进提示词。
- `status`: 是否启用。
- `is_leaf`: 是否末端节点。
- `sort_order`: 在同级节点中的排序。

### edges

存节点之间的关系。

```json
{
  "id": "industry-baijiu->problem-leads",
  "source_node_id": "industry-baijiu",
  "target_node_id": "problem-leads",
  "relation_type": "decomposes_to_business_node",
  "relation_label": "行业拆解",
  "sort_order": 1
}
```

字段说明：

- `source_node_id`: 起点。
- `target_node_id`: 终点。
- `relation_type`: 机器可读关系类型。
- `relation_label`: 人能看懂的关系名称。
- `sort_order`: 同一父节点下关系排序。

### agents

存可调用智能体定义。这里不要放 Coze 的 `bot_id` 明文，前端只传 `agent_key`，后端做映射。

```json
{
  "id": "agent-lead-mining",
  "agent_key": "lead_mining",
  "name": "线索挖掘智能体",
  "role": "判断线索来源和客户优先级",
  "provider": "coze",
  "endpoint": "/api/agent-gateway/chat",
  "score": 92,
  "status": "active"
}
```

### node_agents

存节点和智能体的推荐关系。

```json
{
  "id": "problem-leads:agent-lead-mining",
  "node_id": "problem-leads",
  "agent_id": "agent-lead-mining",
  "priority": 1,
  "relation_type": "recommended_agent"
}
```

## Agent Context Shape

给 Coze 或后端 Agent 时，建议不要把整张图一次塞进去，而是按当前焦点节点组一个小上下文：

```json
{
  "focus_node": {
    "id": "problem-leads",
    "title": "线索获取",
    "node_type": "problem",
    "summary": "从线索来源、客户画像、首轮触达和招商理由四个方向拆解。",
    "insight": "线索问题不能只问流量，要问谁值得跟、为什么现在跟、下一句说什么。"
  },
  "parent_node": {
    "id": "industry-baijiu",
    "title": "白酒行业"
  },
  "children": [
    { "id": "lead-source", "title": "线索来源", "node_type": "问题" },
    { "id": "dealer-avatar", "title": "代理画像", "node_type": "人群" },
    { "id": "invite-script", "title": "邀约话术", "node_type": "动作" }
  ],
  "recommended_agents": [
    {
      "agent_key": "lead_mining",
      "name": "线索挖掘智能体",
      "role": "判断线索来源和客户优先级"
    }
  ]
}
```

## Prompt Guidance

Agent 调教时重点读：

- 当前节点的 `title`
- 当前节点的 `node_type`
- 当前节点的 `summary`
- 当前节点的 `insight`
- 父节点 `parent_node`
- 子节点列表 `children`
- 推荐智能体列表 `recommended_agents`

不要让 Agent 关心前端星图怎么画。Agent 只需要理解：

1. 当前业务语义是什么。
2. 当前节点在整张图里的位置是什么。
3. 下一层可以继续问什么、拆什么、调用什么智能体。

## Files

- Seed JSON: `data/knowledge_graph_seed.json`
- SQL schema: `data/knowledge_graph_schema.sql`
- Export script: `scripts/export-knowledge-graph-db.mjs`
