# Coze 两阶段流式接口说明

## 接口概览

- 接口路径：`POST /api/coze/chat/stream`
- 本地后端地址：`http://127.0.0.1:5000/api/coze/chat/stream`
- 前端 Vite 代理调用：`/api/coze/chat/stream`
- 响应类型：`text/event-stream; charset=utf-8`
- 对话模式：支持多轮输入，两阶段内部编排；路径规划智能体是主控智能体。

接口内部会按顺序调用两个 Coze 智能体：

1. 知识图谱路径规划智能体：根据用户需求自由生成本次对话的路线，返回 `ACK`、`KG_PATH`、`EXPLANATION`。
2. 智能体推荐智能体：根据用户原始需求、上一步路线参考和候选智能体合集，返回 `ACK`、`RECOMMENDED_AGENTS`、`SUMMARY`。

两阶段没有固定图谱约束。第一阶段路线只用于视觉表达和理解参考；第二阶段推荐从 60 个智能体候选集中独立选择组合。

前端不会收到 `<ACK>`、`<KG_PATH>`、`<AGENT>` 这类原始标签。后端会把这些标签转换成结构化 SSE JSON。

## 请求

### Headers

```http
Content-Type: application/json
```

前端不需要传 Coze token，token 只配置在后端 `.env`。

### Body

```json
{
  "message": "我想优化白酒行业销售转化",
  "user_id": "123456789",
  "conversation_id": "7483480124491380000",
  "parameters": {}
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | string | 是 | 用户本次输入，也是第二阶段里的“业务需求、学习目标或任务描述”。 |
| `content` | string | 否 | `message` 的兼容别名；优先使用 `message`。 |
| `user_id` | string | 否 | Coze 用户 ID；不传则使用后端默认值。 |
| `conversation_id` | string | 否 | 主控会话 ID，等价于路径规划智能体会话 ID；第二轮开始传上一轮返回的 `master_conversation_id`。 |
| `route_conversation_id` | string | 否 | `conversation_id` 的显式别名，用于路径规划主控智能体。 |
| `conversation_ids` | object | 否 | 多智能体会话 ID。支持 `route_planner` / `master` / `knowledge_graph` 和 `agent_recommendation` / `recommender`。 |
| `parameters` | object | 否 | 透传给两个 Coze 智能体的参数；不传默认为 `{}`。 |
| `agent_names` | string[] | 否 | 第二阶段候选智能体合集覆盖值；不传则使用 `data/source_agents_full.json` 中的 60 个智能体。 |
| `auto_save_history` | boolean | 否 | 是否让 Coze 保存本轮上下文，默认 `true`。多轮对话建议保持默认值。 |

### 多轮对话

第一轮可以不传 `conversation_id`，Coze 会创建新的主控会话。后端会在 SSE 中返回：

```text
event: conversation.updated
data: {"event":"conversation.updated","stage":"knowledge_graph","conversation_key":"route_planner","conversation_id":"7483480124491380000","conversation_ids":{"route_planner":"7483480124491380000"},"master_conversation_id":"7483480124491380000"}
```

也会在 `workflow.completed` 里返回同一组 ID。下一轮把 `master_conversation_id` 或 `conversation_ids.route_planner` 作为 `conversation_id` 传回即可：

```json
{
  "message": "继续刚才那条路径，帮我更聚焦成交转化",
  "conversation_id": "7483480124491380000"
}
```

推荐智能体默认每轮可独立生成；如果前端也希望推荐智能体保留自己的上下文，可以保存并回传 `conversation_ids.agent_recommendation`。

第二阶段后端实际发送给推荐智能体的内容格式：

```text
已选择的路线：{第一阶段 KG_PATH}
可用智能体合集：[{60 个候选智能体名称}]
可能包含业务需求、学习目标或任务描述：{message}
```

## 成功响应

成功时返回 SSE 流。

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
```

每条 SSE：

```text
event: content.delta
data: {"event":"content.delta","stage":"knowledge_graph","type":"KG_PATH","content_type":"text","content":"白酒行业销售优化知识图谱路径"}

```

## 阶段说明

| stage | 说明 |
| --- | --- |
| `knowledge_graph` | 第一阶段：知识图谱路径规划。 |
| `agent_recommendation` | 第二阶段：智能体组合推荐。 |

## 通用事件

| SSE event | data.event | 说明 |
| --- | --- | --- |
| `workflow.started` | `workflow.started` | 整个接口流程开始。 |
| `workflow.stage.started` | `workflow.stage.started` | 某个阶段开始。 |
| `workflow.stage.completed` | `workflow.stage.completed` | 某个阶段结束。 |
| `conversation.updated` | `conversation.updated` | 某个阶段获得或更新了 Coze 会话 ID；`route_planner` 是主控会话。 |
| `content.started` | `content.started` | 某个标签内容段开始。 |
| `content.delta` | `content.delta` | 文本内容增量。 |
| `content.completed` | `content.completed` | 某个标签内容段结束。 |
| `graph.node.delta` | `graph.node.delta` | 第一阶段路径节点增量，用于点亮/渲染图谱节点。 |
| `graph.path.resolved` | `graph.path.resolved` | 第一阶段路径解析完成，返回完整节点和边。 |
| `recommended_agent.started` | `recommended_agent.started` | 单个推荐智能体开始。 |
| `recommended_agents.delta` | `recommended_agents.delta` | 推荐智能体字段增量，JSON 对象；同一个 `agent_index` 需要 merge。 |
| `recommended_agent.field.completed` | `recommended_agent.field.completed` | 单个推荐智能体字段结束。 |
| `recommended_agent.completed` | `recommended_agent.completed` | 单个推荐智能体结束。 |
| `recommended_agents.completed` | `recommended_agents.completed` | 推荐智能体列表完成。 |
| `chat.completed` | `chat.completed` | 两个阶段都完成。 |
| `workflow.completed` | `workflow.completed` | 整个流程完成。 |
| `workflow.error` | `workflow.error` | 第二阶段内部调用失败时返回。 |

前端应以 `workflow.completed` 或 `chat.completed` 作为完整结束信号，不要在第一阶段结束时停止读取。

## 第一阶段内容

第一阶段 `stage` 固定为 `knowledge_graph`。

### ACK

```text
event: content.delta
data: {"event":"content.delta","stage":"knowledge_graph","type":"ACK","content_type":"text","content":"好的，我已接收到您的需求，"}
```

### KG_PATH

```text
event: content.delta
data: {"event":"content.delta","stage":"knowledge_graph","type":"KG_PATH","content_type":"text","content":"白酒行业销售优化知识图谱路径"}
```

### EXPLANATION

```text
event: content.delta
data: {"event":"content.delta","stage":"knowledge_graph","type":"EXPLANATION","content_type":"text","content":"该路径聚焦白酒行业销售场景..."}
```

### 图谱节点返回

当前端已经默认渲染动态根节点 `dynamic-route-root` 时，后端不会在 `nodes` 里重复返回根节点，只返回本次路线拆出来的临时节点。

例如 `KG_PATH` 为：

```text
白酒行业招商获客-销售跟进
```

后端会先逐个返回节点：

```text
event: graph.node.delta
data: {"event":"graph.node.delta","stage":"knowledge_graph","route":"白酒行业招商获客-销售跟进","node":{"id":"route-node-1","label":"白酒行业招商获客","type":"entry","summary":"当前动态路线节点：白酒行业招商获客","insight":"该节点来自路径规划智能体的实时输出，不依赖固定图谱包。","parent":"dynamic-route-root","children":["route-node-2"],"agents":[],"count":1}}

event: graph.node.delta
data: {"event":"graph.node.delta","stage":"knowledge_graph","route":"白酒行业招商获客-销售跟进","node":{"id":"route-node-2","label":"销售跟进","type":"focus","summary":"当前动态路线节点：销售跟进","insight":"该节点来自路径规划智能体的实时输出，不依赖固定图谱包。","parent":"route-node-1","children":[],"agents":[],"count":0}}
```

然后返回完整路径：

```text
event: graph.path.resolved
data: {"event":"graph.path.resolved","stage":"knowledge_graph","route":"白酒行业招商获客-销售跟进","root_id":"dynamic-route-root","nodes":[{"id":"route-node-1","label":"白酒行业招商获客","type":"entry"},{"id":"route-node-2","label":"销售跟进","type":"focus"}],"edges":[{"id":"route-node-1->route-node-2","source":"route-node-1","target":"route-node-2","relationType":"dynamic_route","relationLabel":"动态路径","sortOrder":0}]}
```

前端推荐使用 `graph.path.resolved.nodes` 的最后一个节点作为当前焦点。上面的例子里，最终焦点应为 `route-node-2`。

## 第二阶段内容

第二阶段 `stage` 固定为 `agent_recommendation`。

### ACK

```text
event: content.delta
data: {"event":"content.delta","stage":"agent_recommendation","type":"ACK","content_type":"text","content":"好的，路线已经选择完成，"}
```

### RECOMMENDED_AGENTS

推荐智能体不会作为 XML 字符串返回，而是结构化 JSON，并且字段是流式增量输出。

同一个智能体会通过稳定的 `agent_index` 持续更新，前端需要把相同 `agent_index` 的 `agent` 对象 merge 到同一张卡片上。尤其是 `reason` 字段会边生成边增长。

推荐对象字段以流式接口真实返回为准，目前用于前端展示的字段是 `agent_index`、`rank`、`agent_name`、`stage`、`reason`、`lineup`。接口不返回 `endpoint`、`url`、`agent_key` 或跳转链接；Hero Hall 上方推荐卡片必须使用这些返回字段展示名称、阶段、理由和序位。点击“打开推荐”时，前端只能用返回的 `agent_name` 精确匹配 `data/source_agents_full.json` 中的本地智能体目录来补充真实入口，匹配不到时不伪造入口。Hero Hall 下方英雄池仍继续使用本地目录数据。

单个推荐智能体开始：

```text
event: recommended_agent.started
data: {"event":"recommended_agent.started","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agent_index":0}
```

字段增量：

```text
event: recommended_agents.delta
data: {"event":"recommended_agents.delta","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agent":{"agent_index":0,"rank":1,"agent_name":"①战略专家"},"delta":{"agent_index":0,"field":"agent_name","content":"①战略专家"}}

event: recommended_agents.delta
data: {"event":"recommended_agents.delta","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agent":{"agent_index":0,"rank":1,"agent_name":"①战略专家","stage":"策略规划","reason":"制定白酒信任证明整体策略，"},"delta":{"agent_index":0,"field":"reason","content":"制定白酒信任证明整体策略，"}}

event: recommended_agents.delta
data: {"event":"recommended_agents.delta","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agent":{"agent_index":0,"rank":1,"agent_name":"①战略专家","stage":"策略规划","reason":"制定白酒信任证明整体策略，明确落地路径"},"delta":{"agent_index":0,"field":"reason","content":"明确落地路径"}}
```

单个智能体完成：

```text
event: recommended_agent.completed
data: {"event":"recommended_agent.completed","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agent":{"agent_index":0,"rank":1,"agent_name":"①战略专家","stage":"策略规划","reason":"制定白酒信任证明整体策略，明确落地路径"}}
```

推荐列表完成：

```text
event: recommended_agents.completed
data: {"event":"recommended_agents.completed","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agents":[{"agent_index":0,"rank":1,"agent_name":"①战略专家","stage":"策略规划","reason":"制定白酒信任证明整体策略，明确落地路径"}]}
```

### SUMMARY

```text
event: content.delta
data: {"event":"content.delta","stage":"agent_recommendation","type":"SUMMARY","content_type":"text","content":"从调研、用户分析到内容落地全链路..."}
```

## 前端消费建议

前端主要处理：

- `content.delta`：按 `stage + type` 追加文本。
- `recommended_agents.delta`：按 `agent_index` merge 智能体卡片，`reason` 会流式增长。
- `recommended_agents.completed`：得到完整推荐列表。
- Hero Hall 上方推荐组合展示 `recommended_agents.*` 返回的真实字段；下方英雄池展示本地 `data/source_agents_full.json` 数据。
- `workflow.completed`：结束 loading。
- `workflow.error`：展示错误。

## 前端调用示例

`EventSource` 原生只支持 GET，本接口是 POST，所以建议用 `fetch` + `ReadableStream`。

```js
async function streamCozeChat(message, handlers = {}) {
  const response = await fetch('/api/coze/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      parameters: {},
    }),
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    throw new Error(errorPayload?.error || `HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      const event = parseSseFrame(frame)

      if (!event) {
        continue
      }

      handlers.onEvent?.(event)

      if (event.event === 'content.delta') {
        handlers.onContentDelta?.(event)
      }

      if (event.event === 'recommended_agents.delta') {
        handlers.onRecommendedAgent?.(event.agent)
      }

      if (event.event === 'recommended_agents.completed') {
        handlers.onRecommendedAgentsCompleted?.(event.agents)
      }

      if (event.event === 'graph.node.delta') {
        handlers.onGraphNode?.(event.node, event)
      }

      if (event.event === 'graph.path.resolved') {
        handlers.onGraphPathResolved?.(event)
      }

      if (event.event === 'workflow.completed') {
        handlers.onCompleted?.(event)
      }

      if (event.event === 'workflow.error') {
        handlers.onError?.(event)
      }
    }
  }
}

function parseSseFrame(frame) {
  const dataLine = frame
    .split('\n')
    .find((line) => line.startsWith('data:'))

  if (!dataLine) {
    return null
  }

  try {
    return JSON.parse(dataLine.replace(/^data:\s*/, ''))
  } catch {
    return null
  }
}
```

## 前端状态结构示例

```js
const state = {
  knowledgeGraph: {
    ack: '',
    kgPath: '',
    explanation: '',
  },
  agentRecommendation: {
    ack: '',
    agents: [],
    summary: '',
  },
}

await streamCozeChat('我想优化白酒行业销售转化', {
  onContentDelta(event) {
    if (event.stage === 'knowledge_graph') {
      if (event.type === 'ACK') state.knowledgeGraph.ack += event.content
      if (event.type === 'KG_PATH') state.knowledgeGraph.kgPath += event.content
      if (event.type === 'EXPLANATION') state.knowledgeGraph.explanation += event.content
    }

    if (event.stage === 'agent_recommendation') {
      if (event.type === 'ACK') state.agentRecommendation.ack += event.content
      if (event.type === 'SUMMARY') state.agentRecommendation.summary += event.content
    }

    render(state)
  },
  onRecommendedAgent(agent) {
    const index = state.agentRecommendation.agents.findIndex(
      (item) => item.agent_index === agent.agent_index,
    )

    if (index >= 0) {
      state.agentRecommendation.agents[index] = {
        ...state.agentRecommendation.agents[index],
        ...agent,
      }
    } else {
      state.agentRecommendation.agents.push(agent)
    }

    render(state)
  },
  onGraphPathResolved(event) {
    const target = event.nodes?.[event.nodes.length - 1]
    if (target) focusGraphNode(target.id)
  },
  onCompleted() {
    setLoading(false)
  },
})
```

## 错误响应

第一阶段启动前失败时，接口返回普通 JSON。

### 400：缺少用户输入

```json
{
  "error": "message is required"
}
```

### 500：后端配置缺失

```json
{
  "error": "COZE_API_TOKEN is not configured"
}
```

### 502：第一阶段 Coze 请求失败

```json
{
  "error": "Coze request failed",
  "status_code": 502,
  "detail": {
    "code": 4101,
    "msg": "..."
  }
}
```

第二阶段失败时，由于 SSE 已经开始，后端会返回 SSE 错误事件：

```text
event: workflow.error
data: {"event":"workflow.error","stage":"agent_recommendation","error":"Coze request failed","status_code":502,"detail":{"code":4101,"msg":"..."}}
```

## 调试命令

```bash
curl -N -X POST "http://127.0.0.1:5000/api/coze/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

## 推荐快照与分享链接

`POST /api/coze/chat/stream` 会在创建流式对话时同步创建推荐快照，并在 `workflow.started` SSE 事件中返回 `recommendation_id`。前端会把该 ID 写入当前页面 URL，例如：

```text
event: workflow.started
data: {"event":"workflow.started","recommendation_id":"rec_abc123","conversation_ids":{}}
```

后端创建快照后会保证先向前端发送带 `recommendation_id` 的 `workflow.started` 事件；即使上游流没有先返回 `workflow.started`，前端也能立即把当前页面地址同步为唯一推荐快照链接。

复制带有 `?recommendation_id=rec_abc123` 的页面地址给其他人时，前端会调用下面的接口读取当前推荐快照：

```http
GET /api/recommendations/rec_abc123
```

推荐智能体组合入口使用独立可分享 URL：`?agent_combination=1&id=rec_abc123`。进入该页面时前端会按 `id` 调用 `GET /api/recommendations/<id>`，并调用 `GET /api/agents` 读取数据库智能体目录，再把快照中的推荐智能体映射成带头像、标签和打开入口的卡片；`status=streaming` 时继续轮询更新。

推荐快照从创建时间起只保留 3 天。超过 3 天后，`GET /api/recommendations/<id>` 会按不存在处理并返回 `404`，分享出的 `?agent_combination=1&id=...` 页面不再展示这次推荐内容。

成功响应示例：

```json
{
  "id": "rec_abc123",
  "status": "streaming",
  "message": "need agents",
  "agents": [
    {
      "agent_index": 0,
      "agent_name": "Planner",
      "stage": "Planning",
      "reason": "Matches the requested workflow"
    }
  ],
  "summary": "",
  "graph_path": null,
  "conversation_ids": {},
  "error": "",
  "created_at": "2026-07-02T00:00:00+00:00",
  "updated_at": "2026-07-02T00:00:01+00:00"
}
```

`status=streaming` 时前端每 2 秒轮询一次，直到 `completed` 或 `failed` 后停止。该接口只返回推荐组合快照，用于 Hero Hall 上方推荐组合、右侧推荐入口和推荐组合页；Hero Hall 下方英雄池由 `GET /api/agents` 数据库目录提供，不再由前端运行时直接读取本地 JSON。

## 智能体目录与头像

智能体目录由后端从 `data/source_agents_full.json` 和头像资源种子导入 Postgres。若某个智能体没有源头像文件，后端会生成确定性的 SVG 头像并写入 `agent_assets`，保证目录项仍有可加载图片。前端运行时读取目录接口：

```http
GET /api/agents
```

成功响应示例：

```json
{
  "agents": [
    {
      "id": "agent-030",
      "name": "用户画像大师",
      "function": "管理",
      "type": "智能体",
      "launch_url": "https://chatgpt.com/g/...",
      "avatar_url": "/api/agents/agent-030/avatar",
      "description": "分析用户特征与购买动机。",
      "tags": ["画像识别", "销售沟通"],
      "knowledge": ["user-profile.pdf"],
      "has_avatar": true
    }
  ]
}
```

`avatar_url` 是图片地址，图片二进制仍存储在数据库中。`launch_url` 是唯一打开入口；当源数据没有外部 GPT 链接时，前端展示该智能体但不显示“打开”。

```http
GET /api/agents/agent-030/avatar
```

## 追加智能体到推荐组合

Hero Hall 英雄池点击 `+` 时会把目录智能体追加到当前推荐快照末尾，不替换 AI 原本推荐的卡牌：

```http
POST /api/recommendations/rec_abc123/agents
Content-Type: application/json

{"agent_id":"agent-030"}
```

成功响应返回更新后的推荐快照。后端会从数据库目录补齐 `name`、`launch_url`、`avatar_url`、`tags`、`description` 等字段，并写入 `agents_json`：

```json
{
  "agent_index": 4,
  "agent_id": "agent-030",
  "agent_name": "用户画像大师",
  "avatar_url": "/api/agents/agent-030/avatar",
  "launch_url": "https://chatgpt.com/g/...",
  "source": "manual",
  "streamStatus": "completed"
}
```

同一个 `recommendation_id` 下同一个 `agent_id` 重复追加时保持幂等，不生成重复卡片。推荐组合页重新打开或刷新后会通过 `GET /api/recommendations/<id>` 同步显示手动追加的智能体。

错误响应：

- `404`: `{ "error": "recommendation snapshot not found" }`
- `503`: `{ "error": "recommendation snapshot store unavailable" }`

后端不会把数据库异常或生成过程内部异常原文返回给前端；生成流异常时快照 `error` 使用通用文案 `Backend stream failed`。
