# Coze 两阶段流式接口说明

## 接口概览

- 接口路径：`POST /api/coze/chat/stream`
- 本地后端地址：`http://127.0.0.1:5000/api/coze/chat/stream`
- 前端 Vite 代理调用：`/api/coze/chat/stream`
- 响应类型：`text/event-stream; charset=utf-8`
- 对话模式：默认 `WORKFLOW_MODE=unified`，一次上游流同时产出路径与推荐；仍按两个前端 stage 分段发送。
- 访问控制：聊天、TTS 和写接口必须先建立签名 API 会话；推荐内容的修改还需要该推荐编号专属的编辑令牌。

接口对外保持两个业务阶段：

1. 知识图谱路径规划智能体：根据用户需求自由生成本次对话的路线，返回 `ACK`、`KG_PATH`、`EXPLANATION`。
2. 智能体推荐智能体：根据用户原始需求、上一步路线参考和候选智能体合集，返回 `ACK`、`ENTRY_TITLE`、`RECOMMENDED_AGENTS`、`SUMMARY`。

默认统一模式只调用一次 LongCat/Coze，减少第二次模型握手；兼容模式才按顺序调用两个智能体。第一阶段路线只用于视觉表达和理解参考；第二阶段推荐从有可打开链接的智能体候选集中独立选择组合，源表中缺少 `智能体链接` 的项目不会提供给推荐智能体。

前端不会收到 `<ACK>`、`<KG_PATH>`、`<AGENT>` 这类原始标签。后端会把这些标签转换成结构化 SSE JSON。

## 请求

### Headers

```http
Content-Type: application/json
X-Agent-CSRF-Token: <POST /api/session 返回的 csrf_token>
Cookie: agent_session=<HttpOnly 签名会话 Cookie，由浏览器自动携带>
```

前端不需要传 Coze token，token 只配置在后端 `.env`。

### API 会话

前端在第一次聊天、TTS 或写操作前调用：

```http
POST /api/session
```

成功响应返回短期 CSRF token，并通过 `Set-Cookie` 写入 `HttpOnly`、`SameSite=Lax`、生产 HTTPS 下带 `Secure`、路径限制为 `/api` 的 `agent_session`：

```json
{
  "csrf_token": "signed-csrf-token",
  "expires_at": 1783771200
}
```

浏览器把 `csrf_token` 保存在当前标签页的 `sessionStorage`，后续受保护请求通过 `X-Agent-CSRF-Token` 发送。会话默认有效 43,200 秒；Cookie 不可由前端 JavaScript 读取。`agentStreamClient.ts`、`speechOutput.ts` 和各写客户端已经通过 `apiSession.ts` 自动完成该流程。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_SIGNING_SECRET` | 无 | 非测试环境必填，至少 32 个 UTF-8 字节；用于签名 API 会话和推荐编辑令牌，不得进入前端或日志。 |
| `API_SESSION_TTL_SECONDS` | `43200` | API 会话有效期，限制为 300-86,400 秒。 |
| `CHAT_MESSAGE_MAX_CHARS` | `8000` | 单条聊天消息字符上限。 |
| `ENABLE_ECHO_ENDPOINT` | `0` | 生产保持关闭；关闭时 `POST /api/echo` 返回 `404`。 |

### Body

```json
{
  "message": "我想优化白酒行业销售转化",
  "user_id": "123456789",
  "conversation_id": "7483480124491380000",
  "participant_identity": "changzhang",
  "history_mode": "bounded_recent",
  "recent_dialogue": [
    {"role": "user", "content": "我的课堂代号是石榴-4827"},
    {"role": "assistant", "content": "记住了"}
  ],
  "parameters": {}
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | string | 是 | 用户本次输入，也是第二阶段里的“业务需求、学习目标或任务描述”；默认最多 8,000 个字符，超出返回 `413`。 |
| `content` | string | 否 | `message` 的兼容别名；优先使用 `message`。 |
| `user_id` | string | 否 | Coze 用户 ID；不传则使用后端默认值。 |
| `conversation_id` | string | 否 | 主控会话 ID，等价于路径规划智能体会话 ID；第二轮开始传上一轮返回的 `master_conversation_id`。 |
| `route_conversation_id` | string | 否 | `conversation_id` 的显式别名，用于路径规划主控智能体。 |
| `conversation_ids` | object | 否 | 多智能体会话 ID。支持 `route_planner` / `master` / `knowledge_graph` 和 `agent_recommendation` / `recommender`。 |
| `parameters` | object | 否 | 供应商附加参数，不传默认为 `{}`。LongCat 的 `model`、`messages`、`stream`、`thinking`、`temperature`、`max_tokens` 由服务端控制，客户端不能覆盖。 |
| `agent_names` | string[] | 否 | 第二阶段候选智能体合集覆盖值；不传则使用 `data/source_agents_full.json` 中带有非空 `智能体链接` 的智能体。 |
| `auto_save_history` | boolean | 否 | 旧客户端是否使用供应商会话历史；当 `history_mode=bounded_recent` 时服务端会关闭供应商隐式历史，避免上下文无限增长。 |
| `history_mode` | string | 否 | 新前端固定发送 `bounded_recent`，表示使用受限近期对话窗口；未知值按旧客户端处理。 |
| `recent_dialogue` | object[] | 否 | 最近对话，元素为 `{role: "user"|"assistant", content: string}`。服务端只保留最新 10 条，每条最多 600 字，总计最多 3,200 字，并作为只读、不可信上下文使用。 |
| `user_state` | object | 否 | 前端提交的当前知识路径、推荐智能体和阵容快照。统一模式多轮对话以它为唯一状态来源。 |
| `lineup_context` | object | 否 | 当前阵容与 `requested_lineup`；仅作为本轮受保护的状态数据。 |
| `requested_lineup` | string | 否 | `core`、`growth` 或 `conversion`，是 `lineup_context.requested_lineup` 的快捷字段。 |
| `participant_identity` | string | 否 | 参与者人格标识。仅白名单值 `changzhang` 启用“厂长”互动人格；缺省、`guest` 或未知值都按普通用户处理。该字段只控制称呼与互动风格，不授予任何权限。 |

### 多轮对话

统一模式采用“显式业务状态 + 有界近期对话”：每轮由前端回传最新 `user_state` 和 `recent_dialogue`。业务状态只保留压缩后的路径/阵容快照；近期对话只保留最新 10 条（约 5 轮）、单条最多 600 字、合计最多 3,200 字。最新 `message` 仍是本轮唯一任务来源，近期窗口只用于理解“刚才、那个、继续”等指代以及用户明确要求记住的临时事实。

新前端同时发送 `history_mode: "bounded_recent"`。该模式关闭 LongCat 隐式历史，避免同一会话越聊越长后偏离 XML 和任务约束；历史窗口由页面显式提交并在后端再次限长、规范角色、转义标记。旧客户端没有发送 `history_mode` 时，`auto_save_history: true` 仍会启用供应商会话历史，避免升级后直接失去多轮能力。

模型标签解析采用增量容错：一级标签错误闭合、孤立闭合或缺失闭合后直接出现下一个合法一级标签时，服务端会结束当前段并从合法标签继续；原始 XML 不会作为 `DIRECT_REPLY` 或普通文本发送。`THINKING_PROCESS` 与 `ACK` 均使用短窗口流式脱敏，只保留可能跨 token 组成敏感编排词的最短尾部，其余文本立即发送 `content.delta`；既防止“当前状态为空”“按 A/B/C 模式”“内部模式提示”等内容泄漏，也避免正式回答等待一级标签闭合后整段出现。

完整推荐阶段固定返回 5 个智能体。模型输出少于 5 个时，服务端保留已通过白名单和去重校验的结果，再从真实可用智能体白名单补齐到 5 个；不会虚构名称。超过数量上限、未知名称或重复名称仍会被过滤。

### 参与者身份与厂长人格

- 普通用户继续使用原地址：`https://agent.xtznai.com/`。
- 厂长现场入口使用同一页面：`https://agent.xtznai.com/?identity=changzhang`。
- 前端只把 URL 参数规范化为 `guest` 或 `changzhang`，再通过 `participant_identity` 发送；后端会再次按白名单规范化，不能由客户端注入任意称呼或 prompt。
- 厂长人格会自然称呼“厂长”，保持独立 AI 搭档立场；对证据不足、目标冲突或过度乐观的判断会直接指出问题并给出替代方案。幽默使用机智反差、前文回扣和轻度调侃，不谄媚、不低俗、不羞辱，也不影响 `THINKING_PROCESS → ACK` 等 XML/SSE 契约。
- URL 参数不是认证方式。不得用它控制后台权限、数据范围、管理操作或任何安全边界；真实授权仍必须使用服务端认证。

兼容双阶段模式第一轮可以不传 `conversation_id`，Coze 会创建新的主控会话。后端会在 SSE 中返回：

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

推荐智能体默认每轮可独立生成；兼容模式如果前端也希望推荐智能体保留自己的上下文，可以保存并回传 `conversation_ids.agent_recommendation`。

当最新消息明确包含“切换场景”“再次切换”“换一个业务”“不要沿用”等新场景信号时，服务端会忽略本轮回传的旧 `conversation_ids`、`user_state` 和 `recent_dialogue`，重新创建上游会话；完成事件会返回新的会话 ID。普通追问以及只改路径/阵容仍沿用原会话、近期窗口和压缩状态。这样可避免多次课堂演示时旧行业、旧路径或旧推荐污染新场景。

兼容模式第二阶段后端实际发送给推荐智能体的内容格式：

```text
已选择的路线（JSON 字符串）："{第一阶段 KG_PATH}"
可用智能体合集（JSON 数组）：[{带有非空启动链接的候选智能体名称}]
用户最新需求（JSON 字符串）："{message}"
```

### LongCat 延迟与稳定性配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LOG_LEVEL` | `INFO` | 保留不含用户正文的请求 ID、首事件、首内容和总耗时日志。 |
| `LONGCAT_THINKING` | `disabled` | 默认关闭模型侧推理流，避免后端等待被丢弃的 `reasoning_content` 后才出现首字。 |
| `LONGCAT_TEMPERATURE` | `0.2` | 降低 XML 标签、路径和智能体字段漂移。 |
| `LONGCAT_MAX_TOKENS` | `3000` | 服务端输出上限。 |
| `LONGCAT_SSE_CHUNK_SIZE` | `64` | 上游 SSE 读取块大小，降低小增量被客户端缓冲的概率。 |
| `LONGCAT_STREAM_READ_TIMEOUT` | `4` | 等待响应头或相邻流数据的最大静默秒数；超时后立即进入课堂降级，不串行等待第二轮。 |
| `LONGCAT_REQUEST_RETRIES` | `0` | 默认不重放模型请求；已经开始输出的流始终不重试。 |
| `LONGCAT_RETRY_BACKOFF` | `0.25` | 响应头前临时错误的线性退避秒数。 |
| `LONGCAT_CIRCUIT_BREAKER_SECONDS` | `20` | 超时、连接失败、429 或 5xx 后的进程内短路时间，避免连续课堂请求重复等待故障供应商。 |

除非专门调试模型推理，不要把 `LONGCAT_THINKING` 改为 `enabled`。

当 LongCat 在有限超时/重试后仍不可用时，统一工作流不发送 `workflow.error`，而是输出带 `fallback: "provider_unavailable"` 元数据的完整课堂降级流。降级流仍保持 `THINKING_PROCESS → ACK`，并读取同一份规范化 `recent_dialogue`：用户追问“刚才/上一轮/还记得”时会承接最近用户事实，不会重复通用接话。业务请求继续输出 `KG_PATH`、`graph.path.resolved`、白名单内推荐智能体和 `workflow.completed`；普通问候只自然回复，不生成路径或推荐。推荐快照会照常持久化，便于 Hero Hall 继续打开。

## 成功响应

成功时返回 SSE 流。

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
X-Request-ID: chat-0123456789abcdef
Server-Timing: setup;dur=8.4
```

统一模式会在建立上游模型连接前发送 `workflow.started` 和 `workflow.stage.started`，可见文本全部来自模型，并严格保持 `THINKING_PROCESS` 在 `ACK` 前。`workflow.started` 还包含 `recommendation_id` 与仅供当前创建者保存的 `recommendation_edit_token`。`X-Request-ID` 可关联 `chat_stream_first_content` 日志；LongCat 的真实首帧和首字分别记录为 `chat_provider_first_frame`、`chat_provider_first_content`。

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

### ENTRY_TITLE

`ENTRY_TITLE` 是智能体为本次组合入口生成的可见标题，用于替换前端默认的“智能体组合入口”。标题应结合行业、场景、路径或目标，并以“英雄殿堂”结尾。

```text
event: content.delta
data: {"event":"content.delta","stage":"agent_recommendation","type":"ENTRY_TITLE","content_type":"text","content":"白酒招商英雄殿堂"}
```

### RECOMMENDED_AGENTS

推荐智能体不会作为 XML 字符串返回，而是结构化 JSON，并且字段是流式增量输出。

后端会在单个智能体完成时重新校验结果：名称必须来自本轮服务端候选集合，重复项会删除，最多保留 6 个；指定 `requested_lineup` 时会强制写入该阵容。`recommended_agents.completed.agents` 是经过校验的最终真值，前端应使用它覆盖流式中间态。

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
let apiSession

async function getApiSession() {
  if (!apiSession) {
    const response = await fetch('/api/session', {
      method: 'POST',
      credentials: 'same-origin',
    })
    apiSession = await response.json()
  }

  return apiSession
}

async function streamCozeChat(message, handlers = {}) {
  const session = await getApiSession()
  const response = await fetch('/api/coze/chat/stream', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-CSRF-Token': session.csrf_token,
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

第一阶段启动前失败时，接口返回不含供应商原始异常的普通 JSON。

### 401：缺少或过期 API 会话

```json
{
  "error": "API session is required"
}
```

### 403：CSRF token 无效

```json
{
  "error": "invalid API request token"
}
```

### 400：缺少用户输入

```json
{
  "error": "message is required"
}
```

### 413：用户输入超过上限

```json
{
  "error": "message is too long",
  "max_chars": 8000
}
```

### 502/503：供应商连接或配置不可用

```json
{
  "error": "Failed to connect to chat provider"
}
```

默认开启课堂降级，因此供应商超时通常仍以完整 SSE 和 `fallback: "provider_unavailable"` 结束。未被工作流收敛的流异常只返回通用错误，不回显数据库、密钥名、代理或供应商响应体：

```text
event: workflow.error
data: {"event":"workflow.error","error":"Backend stream failed"}
```

## 调试命令

```bash
curl -sS -c /tmp/agent-cookie -X POST \
  "http://127.0.0.1:5000/api/session" > /tmp/agent-session.json
csrf="$(python -c 'import json; print(json.load(open("/tmp/agent-session.json"))["csrf_token"])')"
curl -N -b /tmp/agent-cookie -X POST \
  "http://127.0.0.1:5000/api/coze/chat/stream" \
  -H "Content-Type: application/json" \
  -H "X-Agent-CSRF-Token: $csrf" \
  -d '{"message":"hello"}'
```

## 推荐快照与分享链接

`POST /api/coze/chat/stream` 会在创建流式对话时同步创建推荐快照，并在 `workflow.started` SSE 事件中返回 `recommendation_id`。前端会把该 ID 写入当前页面 URL，例如：

```text
event: workflow.started
data: {"event":"workflow.started","recommendation_id":"rec_abc123","recommendation_edit_token":"signed-edit-token","conversation_ids":{}}
```

后端创建快照后会保证先向前端发送带 `recommendation_id` 的 `workflow.started` 事件；即使上游流没有先返回 `workflow.started`，前端也能立即把当前页面地址同步为唯一推荐快照链接。

复制带有 `?recommendation_id=rec_abc123` 的页面地址给其他人时，前端会调用下面的接口读取当前推荐快照：

```http
GET /api/recommendations/rec_abc123
```

推荐智能体组合入口使用独立可分享 URL：`?agent_combination=1&id=rec_abc123`。URL 只包含推荐编号，不包含编辑令牌。创建者前端把 `recommendation_edit_token` 按推荐编号保存在本机 `localStorage`；其他设备或浏览器打开分享链接时只能读取、复制和保存二维码，阵容按钮为只读。进入该页面时前端会按 `id` 调用 `GET /api/recommendations/<id>`，并调用 `GET /api/agents` 读取数据库智能体目录，再把快照中的推荐智能体映射成带头像、标签和打开入口的卡片；`status=streaming` 时继续轮询更新。快照中的 `entry_title` 来自推荐智能体输出的 `ENTRY_TITLE`，前端用它替换入口页默认标题。

组合入口页的五槽阵容搭建器支持保存用户调整后的组合：点击组合阵容操作区里、“重置阵容”左侧的“保存阵容”会调用 `PUT /api/combination-agents/by-recommendation/<id>`，后端把当前五槽保存为独立的组合智能体服务对象。再次打开或刷新 `?agent_combination=1&id=...` 时，前端先读取 `GET /api/combination-agents/by-recommendation/<id>?optional=1` 恢复已保存阵容；没有组合智能体保存记录时返回 `200` 和 JSON `null`，页面使用推荐快照里的推荐智能体默认阵容。省略 `optional=1` 时仍保留原有 `404` 语义。推荐快照只是生成来源，不是组合智能体保存对象。

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

`status=streaming` 时前端每 2 秒轮询一次，直到 `completed` 或 `failed` 后停止。该接口只返回推荐组合快照，用于 Hero Hall 上方推荐组合、右侧推荐入口和推荐组合页；Hero Hall 下方英雄池由 `GET /api/agents` 数据库目录提供，不再由前端运行时直接读取本地 JSON。返回快照时，后端会把历史快照中的旧 `/api/agents/<id>/avatar` 头像地址按目录映射重写为静态 `/agent-avatars/...` 地址。

## 智能体目录与头像

智能体目录由后端从 `data/source_agents_full.json` 和头像资源种子导入 Postgres。若某个智能体没有源头像文件，后端会生成确定性的 SVG 头像并写入 `agent_assets`。启动或首次读取目录时，后端会把 `agent_assets.content` 中的图片导出到 `AGENT_STATIC_AVATAR_DIR`，再让 `avatar_url` 指向 nginx/静态服务器可访问的图片地址。

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
      "avatar_url": "/agent-avatars/agent-030-5f9a1c2b3d4e.png",
      "description": "分析用户特征与购买动机。",
      "tags": ["画像识别", "销售沟通"],
      "knowledge": ["user-profile.pdf"],
      "has_avatar": true
    }
  ]
}
```

`avatar_url` 是静态图片地址，默认前缀由 `AGENT_STATIC_AVATAR_BASE_URL` 控制；本地/Docker 默认是 `/agent-avatars`。后端仍保留下面的旧头像接口作为兜底读取方式，但目录列表优先返回静态地址。`launch_url` 是唯一打开入口；当源数据没有外部 GPT 链接时，前端展示该智能体但不显示“打开”。

```http
GET /api/agents/agent-030/avatar
```

## 追加智能体到推荐组合

Hero Hall 英雄池点击 `+` 时会把目录智能体追加到当前推荐快照末尾，不替换 AI 原本推荐的卡牌：

```http
POST /api/recommendations/rec_abc123/agents
Content-Type: application/json
X-Agent-CSRF-Token: <csrf_token>
X-Recommendation-Edit-Token: <recommendation_edit_token>

{"agent_id":"agent-030"}
```

成功响应返回更新后的推荐快照。后端会从数据库目录补齐 `name`、`launch_url`、`avatar_url`、`tags`、`description` 等字段，并写入 `agents_json`：

```json
{
  "agent_index": 4,
  "agent_id": "agent-030",
  "agent_name": "用户画像大师",
  "avatar_url": "/agent-avatars/agent-030-5f9a1c2b3d4e.png",
  "launch_url": "https://chatgpt.com/g/...",
  "source": "manual",
  "streamStatus": "completed"
}
```

同一个 `recommendation_id` 下同一个 `agent_id` 重复追加时保持幂等，不生成重复卡片。推荐组合页重新打开或刷新后会通过 `GET /api/recommendations/<id>` 同步显示手动追加的智能体。

错误响应：

- `401`: `{ "error": "API session is required" }`
- `403`: `{ "error": "recommendation is read-only" }`
- `404`: `{ "error": "recommendation snapshot not found" }`
- `503`: `{ "error": "recommendation snapshot store unavailable" }`

## 保存组合智能体服务

组合入口页的“保存阵容”位于组合阵容操作区、“重置阵容”左侧，会把用户当前调整后的五槽阵容保存为一个独立组合智能体服务对象，不会覆盖 `agents` 推荐列表本身，也不会把推荐快照当作保存对象：

```http
PUT /api/combination-agents/by-recommendation/rec_abc123
Content-Type: application/json
X-Agent-CSRF-Token: <csrf_token>
X-Recommendation-Edit-Token: <recommendation_edit_token>

{
  "title": "白酒成交英雄殿堂",
  "lineup": [
    {
      "agent_id": "agent-030",
      "agent_name": "用户画像大师",
      "stage": "管理",
      "reason": "分析用户特征与购买动机。",
      "launch_url": "https://chatgpt.com/g/...",
      "avatar_url": "/agent-avatars/agent-030-5f9a1c2b3d4e.png",
      "tags": ["画像识别", "销售沟通"]
    },
    null,
    {
      "agent_name": "成交教练",
      "stage": "成交转化"
    }
  ],
  "score": {
    "total": 86,
    "grade": "S"
  }
}
```

`lineup` 最多 5 项，允许 `null` 表示空槽。后端会补齐 `rank`、`slot_index`、`streamStatus`；如果同一个智能体按 `agent_id`、启动链接或名称重复入槽，后续重复槽会归一化为 `null`。保存按 `recommendation_id` 幂等更新同一个组合智能体服务对象。成功响应返回组合智能体对象：

```json
{
  "id": "combo_abc123",
  "recommendation_id": "rec_abc123",
  "title": "白酒成交英雄殿堂",
  "status": "saved",
  "lineup": [
    {
      "agent_id": "agent-030",
      "agent_name": "用户画像大师",
      "rank": 1,
      "slot_index": 0,
      "streamStatus": "completed"
    },
    null
  ],
  "score": {
    "total": 86,
    "grade": "S"
  },
  "source_snapshot": {
    "id": "rec_abc123",
    "entry_title": "白酒成交英雄殿堂"
  },
  "created_at": "2026-07-07T00:00:00+00:00",
  "updated_at": "2026-07-07T00:00:01+00:00"
}
```

打开或刷新组合入口页时，前端会调用下面的接口读取已保存组合；返回 `404` 表示用户还没有保存过，页面继续使用推荐快照默认阵容：

```http
GET /api/combination-agents/by-recommendation/rec_abc123
```

错误响应：

- `401`: `{ "error": "API session is required" }`
- `403`: `{ "error": "recommendation is read-only" }`
- `400`: `{ "error": "lineup is required" }`
- `404`: `{ "error": "recommendation snapshot not found" }`
- `503`: `{ "error": "combination agent store unavailable" }`
- `503`: `{ "error": "recommendation snapshot store unavailable" }`

后端不会把数据库异常或生成过程内部异常原文返回给前端；生成流异常时快照 `error` 使用通用文案 `Backend stream failed`。
