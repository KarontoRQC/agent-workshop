# coze_workflow.py

> `backend/services/coze_workflow.py` · Python · 约 1900 行

## 用途

后端对话工作流核心。它先发送无可见文案的启动事件，再懒连接上游；统一模式保留模型自然生成的 `THINKING_PROCESS → ACK`，两段均通过最短尾部窗口跨 token 脱敏并真实流式发送。工作流同时使用压缩业务状态和有界近期对话约束路径、推荐与自然多轮承接。新前端声明 bounded 模式后关闭 LongCat 无限历史；旧客户端仍可使用 `auto_save_history`。显式切换新场景时会丢弃旧上游会话 ID、状态快照和近期对话。上游不可用时切换课堂降级流；上游漏掉必需开场段时由 `_OpeningSectionGuard` 补齐。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `start_chat_workflow_stream` | function | ~77 | 工作流总入口，返回 SSE generator。 |
| `build_recommender_message` | function | ~525 | 构造两阶段推荐智能体输入。 |
| `build_unified_orchestration_message` | function | ~551 | 构造统一编排输入。 |
| `build_user_state_system_context` | function | ~640 | 将去重后的路径、智能体和目标阵容写成只读系统状态。 |

## 依赖

内部依赖:
- `backend/services/coze_client.py` — 提供上游流和异常。
- `backend/services/classroom_fallback.py` — 构造供应商不可用时的自然回复、路径和白名单推荐计划。
- `backend/services/coze_stream_transformer.py` — 解析 XML 标签并格式化 SSE。
- `backend/services/recommended_agents_stream.py` — 解析 `<AGENT>` 字段流。
- `backend/services/graph_path_resolver.py` — 生成动态图谱路径。
- `backend/services/participant_identity.py` — 规范身份并生成厂长人格上下文。
- `backend/services/recent_dialogue.py` — 规范并格式化有界近期对话窗口。

## 修改指南

- **改推荐阵容语义**: 检查 `LINEUP_IDS`、`LINEUP_ALIASES`、前端 `heroHallModel.ts` 和接口文档。
- **改工作流模式**: 保持 `workflow.started`、`workflow.stage.started`、`graph.path.resolved`、`recommended_agents.completed`、`workflow.completed` 等事件顺序可被前端消费。
- **改用户状态字段**: 同步检查前端 `AgentUserState` 类型和 `buildHeroHallLineupUserState`。
- **改多轮对话**: bounded 模式必须把近期窗口同时传给供应商、课堂兜底和开场段恢复，并关闭供应商隐式历史；旧客户端未声明 bounded 时继续尊重 `auto_save_history`。真实回归必须测试“第一轮记住随机事实、第二轮准确复述”，不能只检查路径状态。
- **改首包行为**: `workflow.started` 和阶段启动必须在调用上游工厂前 yield；模型正常时禁止服务端固定 ACK 覆盖模型，供应商连接错误则走带 `provider_unavailable` 标记的课堂降级流并最终完成。
- **改可见判断/ACK**: `THINKING_PROCESS` 与 `ACK` 均通过 `_VisibleTextStreamEmitter` 跨 token 流式脱敏，避免 A/B/C 模式、当前状态或固定机械话术漏到前端；ACK 必须在 `content.completed` 前产生多个 `content.delta`，不得退回 `section_emitters` 整段缓冲。启动事件仍须立即发送，并用真实回归检查首个可见内容延迟。
- **改必需开场段恢复**: `_OpeningSectionGuard` 只在模型未产生有效 `THINKING_PROCESS` 或 `ACK` 时介入；进入路径/推荐前必须补齐顺序，纯对话流结束前也必须保证 ACK 非空，恢复文案来自 `classroom_fallback.py`。
- **改单项修改**: 保持 `path_only` 抑制推荐事件；“刷新/替换/更新阵容”等 `agents_only` 请求由服务端强制沿用现有知识路径。
- **改场景切换**: `_is_explicit_new_scenario` 只识别明确的新场景/新业务信号；命中时重置上游会话和旧状态，不能影响普通追问或阵容切换。
- **改推荐阶段话术**: 同步检查 `DEFAULT_RECOMMENDATION_ACK` 和可见文本兜底替换；固定推荐转场以换行开头，避免与模型 ACK 粘连，并保持短笑点和星图 / 智能体英雄口径。
- **改组合入口标题**: `ENTRY_TITLE` 属于推荐阶段事件，需同步 prompt、`coze_stream_transformer.py`、快照流和前端入口页。
- **改参与者人格**: 保持 `guest` 不改变原系统上下文；厂长人格不得破坏标签顺序、业务约束或安全规则。
- **改可见思考摘要**: `_VisibleTextStreamEmitter` 必须跨 chunk 清除“当前用户状态为空”和带空格的 `按 A/B/C 模式` 等内部编排变体，保留自然业务判断或现场互动摘要。

## 依赖图

```text
coze_workflow.py
← 引入: classroom_fallback, coze_client, coze_stream_transformer, graph_path_resolver, participant_identity, recent_dialogue, recommended_agents_stream
→ 被引用: routes/coze.py
```
