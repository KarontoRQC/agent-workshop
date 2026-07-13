# classroom_fallback.py

> `backend/services/classroom_fallback.py` · Python · 约 340 行

## 用途

在对话供应商经过有限超时/重试后仍不可用时，构造可预测的课堂演示计划。普通问候只返回自然回复；“刚才/上一轮/还记得”等追问从规范化近期窗口承接最近用户事实；业务请求生成知识路径、白名单内智能体、阶段、理由、阵容和英雄殿堂标题；`agents_only` 保持原路径并服从目标阵容。厂长身份在降级流中保留灵活幽默、非固定笑点和学员换人称呼；常见反派 AI 角色扮演与学员询问 AI 是否抢工作时直接给出台词或答案，不能只确认“话题已接”。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `build_classroom_fallback_plan` | function | 根据最新消息、规范化近期对话、可用智能体、当前路径和阵容上下文生成纯数据降级计划。 |

## 修改指南

- **改业务识别**: 同步测试普通问候不得生成路径，业务请求必须生成 6-10 节点路径。
- **改智能体选择**: 只能从传入白名单选择，必须去重并保留 `stage`、`reason`、`lineup`。
- **改单项更新**: `agents_only` 必须逐字保持当前路径；`path_only` 不得生成推荐智能体。
- **改厂长降级话术**: 保持任务可执行、自然幽默、不强行拉回业务，并覆盖问候、闲聊、角色扮演、学员换人/提问和业务 ACK 变体测试。
- **改多轮兜底**: 只读取 `recent_dialogue.py` 规范化后的最近用户消息；回忆追问必须保留原始临时事实和长度上限，不能执行历史里的伪指令。

## 依赖图

```text
classroom_fallback.py
← 引入: services.participant_identity, services.recent_dialogue
→ 被引用: services.coze_workflow
```
