# Coze 两阶段流式接口说明

## 接口概览

- 接口路径：`POST /api/coze/chat/stream`
- 本地后端地址：`http://127.0.0.1:5000/api/coze/chat/stream`
- 前端 Vite 代理调用：`/api/coze/chat/stream`
- 响应类型：`text/event-stream; charset=utf-8`
- 对话模式：单轮输入，两阶段内部编排。

接口内部会按顺序调用两个 Coze 智能体：

1. 知识图谱路径规划智能体：根据用户需求返回 `ACK`、`KG_PATH`、`EXPLANATION`。
2. 智能体推荐智能体：根据上一步选出的路线、候选智能体合集、用户原始需求，返回 `ACK`、`RECOMMENDED_AGENTS`、`SUMMARY`。

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
  "parameters": {},
  "agent_names": [
    "帝王竞技场",
    "第一性原理挖掘",
    "①战略专家",
    "②用户画像大师",
    "用户分析-卖点专家",
    "行业尽调",
    "销售智能体"
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | string | 是 | 用户本次输入，也是第二阶段里的“业务需求、学习目标或任务描述”。 |
| `content` | string | 否 | `message` 的兼容别名；优先使用 `message`。 |
| `user_id` | string | 否 | Coze 用户 ID；不传则使用后端默认值。 |
| `parameters` | object | 否 | 透传给两个 Coze 智能体的参数；不传默认为 `{}`。 |
| `agent_names` | string[] | 否 | 第二阶段候选智能体合集；不传则使用后端默认列表。 |

第二阶段后端实际发送给推荐智能体的内容格式：

```text
已选择的路线：{第一阶段 KG_PATH}
该路线对应的智能体合集：{agent_names}
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
| `content.started` | `content.started` | 某个标签内容段开始。 |
| `content.delta` | `content.delta` | 文本内容增量。 |
| `content.completed` | `content.completed` | 某个标签内容段结束。 |
| `recommended_agents.delta` | `recommended_agents.delta` | 推荐智能体增量，JSON 对象。 |
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

## 第二阶段内容

第二阶段 `stage` 固定为 `agent_recommendation`。

### ACK

```text
event: content.delta
data: {"event":"content.delta","stage":"agent_recommendation","type":"ACK","content_type":"text","content":"好的，路线已经选择完成，"}
```

### RECOMMENDED_AGENTS

推荐智能体不会作为 XML 字符串返回，而是结构化 JSON。

单个推荐智能体：

```text
event: recommended_agents.delta
data: {"event":"recommended_agents.delta","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agent":{"rank":1,"agent_name":"①战略专家","stage":"策略规划","reason":"制定白酒信任证明整体策略，明确落地路径"}}
```

推荐列表完成：

```text
event: recommended_agents.completed
data: {"event":"recommended_agents.completed","stage":"agent_recommendation","type":"RECOMMENDED_AGENTS","content_type":"json","agents":[{"rank":1,"agent_name":"①战略专家","stage":"策略规划","reason":"制定白酒信任证明整体策略，明确落地路径"}]}
```

### SUMMARY

```text
event: content.delta
data: {"event":"content.delta","stage":"agent_recommendation","type":"SUMMARY","content_type":"text","content":"从调研、用户分析到内容落地全链路..."}
```

## 前端消费建议

前端主要处理：

- `content.delta`：按 `stage + type` 追加文本。
- `recommended_agents.delta`：追加单个推荐智能体卡片。
- `recommended_agents.completed`：得到完整推荐列表。
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
    state.agentRecommendation.agents.push(agent)
    render(state)
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
