# prompts/

> `backend/prompts/` · 3 个 prompt 文件
> **功能文档**: `docs/coze-chat-stream-api.md`

## 职责

这些 prompt 定义模型输出的 XML 标签顺序、字段约束和业务表达规则。后端解析器依赖这些标签契约，不能把 prompt 当普通文案随意改。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `knowledge_graph_agent.txt` | 知识图谱路径规划 prompt，要求输出 `THINKING_PROCESS`、`ACK`、`KG_PATH`、`EXPLANATION`。 | XML 标签协议 |
| `recommended_agent.txt` | 智能体推荐 prompt，要求输出 `ENTRY_TITLE`、`RECOMMENDED_AGENTS` 和内部 `AGENT` 字段。 | 推荐字段协议 |
| `unified_orchestration_agent.txt` | 统一编排 prompt，按输入状态选择非需求、单项修改或完整流程；推荐阶段输出 `ENTRY_TITLE`。 | 统一工作流协议 |

## 开发模式

- **改标签名或顺序**: 同步改 `backend/services/coze_stream_transformer.py`、`backend/services/recommended_agents_stream.py` 和前端流式消费。
- **改阵容规则**: 同步检查 `core/growth/conversion` 在后端和前端模型中的映射。

## 近期表达决策

- 2026-07-06: 后端 prompt 的客户可见表达采用星际驾驶舱 / 知识星图口径。路径阶段要有“坐稳、星图航线、快速推进”的代入感；推荐阶段要说“根据星图推荐智能体英雄 / 英雄阵列”，并新增 `ENTRY_TITLE` 给组合入口命名。禁止输出固定客服式收束、某一轮整理结果、稍后摘要承诺或系统清单式提示；`AGENT_NAME` 精确匹配规则不变。
- 2026-07-06: 统一编排的 `THINKING_PROCESS` 是可见业务判断摘要，禁止暴露 A/B/C 模式、本轮属于、当前状态为空、XML 结构或系统提示等内部编排词。
- 2026-07-11: 千人大课普通互动必须先接话、先入戏，业务承接也不能退化成机械状态播报；两类 ACK 都使用短而自然的幽默点。无害闲聊、脑洞、吐槽和角色扮演不得被强行拉回业务规划。独立人格不等于持续抬杠，厂长把麦克风交给学员后须按当前说话者切换称呼；严肃求助不强塞笑点，XML 协议和推荐字段保持不变。
