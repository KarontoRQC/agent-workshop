# Knowledge Graph Data Format

这份格式给后端和 Agent 使用，只存业务语义，不存前端显示样式。

不要把这些视觉字段写进数据库：`x`、`y`、`radius`、`color`、`fan`、`ring`、`opacity`、`labelMode`、`kind`。它们属于前端布局渲染层，由 `src/graphLayout.js` 动态计算。

## 当前数据流

- 原始智能体全集：`data/source_agents_full.json`
- 编译脚本：`scripts/build-agent-graph-pack.mjs`
- 前端运行图谱包：`data/agent_graph_pack.json`
- 前端适配层：`src/agentAdapter.js`

这版没有把数据塞进 vault。原因是智能体 JSON 已经有稳定字段，直接编译成图谱包更轻。vault 以后可以作为导出镜像，而不是运行时数据库。

## Graph Pack

`agent_graph_pack.json` 的顶层结构：

```json
{
  "rootId": "root-brief",
  "stats": {},
  "nodes": [],
  "edges": [],
  "agents": []
}
```

### nodes

节点只描述语义和层级：

```json
{
  "id": "function-copywriting-agent",
  "label": "文案 / 智能体",
  "type": "bucket",
  "summary": "20 个智能体归入「文案」能力区。",
  "parent": "function-copywriting",
  "children": ["agent-010", "agent-011"],
  "agents": ["agent-010", "agent-011"],
  "count": 20
}
```

当前节点类型：

- `brief`：总入口。
- `function`：功能母节点，例如文案、IP、管理。
- `bucket`：功能 + 类型的中间层，例如文案 / 智能体。
- `agent`：叶子智能体，只选中，不再作为母节点放大。

### edges

边只描述关系，不描述曲线样式：

```json
{
  "id": "function-copywriting->function-copywriting-agent",
  "source": "function-copywriting",
  "target": "function-copywriting-agent",
  "relation": "groups_type",
  "weight": 20
}
```

### agents

智能体调用信息单独存，后面接 Coze 时建议前端只传 `agentKey`，后端再映射真实 `bot_id` 或密钥。

```json
{
  "id": "agent-010",
  "agentKey": "agent-010",
  "name": "公众号生成器",
  "functionLabel": "文案",
  "typeLabel": "智能体",
  "provider": "chatgpt-gpt",
  "endpoint": "https://chatgpt.com/g/...",
  "knowledgeBase": "",
  "description": "",
  "score": 91
}
```

## Agent Context

给 Coze 或后端 Agent 时，不要一次塞整张图。建议按当前选中节点生成小上下文：

```json
{
  "focusId": "function-copywriting-agent",
  "focusLabel": "文案 / 智能体",
  "focusType": "bucket",
  "path": [
    { "id": "root-brief", "label": "智能体合集", "type": "brief" },
    { "id": "function-copywriting", "label": "文案", "type": "function" },
    { "id": "function-copywriting-agent", "label": "文案 / 智能体", "type": "bucket" }
  ],
  "recommendedAgents": [
    {
      "name": "公众号生成器",
      "agentKey": "agent-010",
      "provider": "chatgpt-gpt",
      "endpoint": "https://chatgpt.com/g/..."
    }
  ]
}
```

## 后端建议

Flask 可以先只暴露两个接口：

- `GET /api/graph-pack`：返回 `agent_graph_pack.json`。
- `POST /api/agent-gateway/chat`：接收 `agentKey + graphContext + message`，后端决定走 Coze、GPTs 链接还是本地代理。

这样前端改视觉和动画时，不会影响智能体跳转逻辑。
