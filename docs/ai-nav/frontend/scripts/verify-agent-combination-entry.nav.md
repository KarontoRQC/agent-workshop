# verify-agent-combination-entry.mjs

> `frontend/scripts/verify-agent-combination-entry.mjs` · JavaScript · ~80 行

## 用途

通过源码断言验证智能体组合入口页及其拆分模块存在、读取快照 `entry_title` 作为动态标题、保留下方“更多智能体”目录区块、顶部不显示可选英雄数量/快照编号徽章/旧批量打开按钮且不使用“后备”类旧文案、推荐智能体区底部提供一键打开推荐智能体按钮、入口页样式留在 colocated CSS 中、首页不写入推荐 ID、首页不挂载旧 Hero Hall 弹层、自动殿堂入口不会覆盖首页、启动 helper 使用可分享入口 URL，前端会识别旧头像接口并优先使用静态头像，并确保 Workflow Dock 的“打开你的殿堂”用新标签打开组合入口。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `entryPath` | const | ~4 | 指向组合入口页组件。 |
| `entrySectionsPath` | const | ~5 | 指向组合入口页展示组件模块。 |
| `entryModelPath` | const | ~6 | 指向组合入口页派生逻辑模块。 |
| `entryStylePath` | const | ~7 | 指向组合入口页样式文件。 |
| `appPath` | const | ~8 | 指向首页应用入口。 |
| `catalogPath` | const | ~9 | 指向智能体启动目录 helper。 |
| `workflowDockPath` | const | ~11 | 指向工作流 Dock 组件。 |

## 依赖

内部依赖:
- `frontend/src/features/heroHall/AgentCombinationEntryPage.tsx` — 被验证的组合入口页编排组件。
- `frontend/src/features/heroHall/AgentCombinationEntrySections.tsx` — 被验证的组合入口页展示组件。
- `frontend/src/features/heroHall/agentCombinationEntryModel.ts` — 被验证的组合入口页派生逻辑。
- `frontend/src/features/heroHall/AgentCombinationEntryPage.css` — 被验证的组合入口页 colocated 样式。
- `frontend/src/App.tsx` — 被验证的 URL 解析和页面分支。
- `frontend/src/lib/agentLaunchCatalog.ts` — 被验证的启动入口生成。
- `frontend/src/features/workflow/WorkflowDock.tsx` — 被验证的打开入口。

外部依赖(仅列包名):
- `node:assert/strict`
- `node:fs`

## 修改指南

- **修改组合入口参数名**: 同步更新本脚本里的 URL 和正则断言。
- **继续拆分组合入口页**: 保持本脚本读取 page、sections、model、CSS 的组合断言，不要让验证脚本重新要求所有文案回到主 TSX。
- **修改打开方式**: 保持组合入口新标签/新页面打开，不要覆盖原首页，也不要重新走旧 Hero Hall 弹层；组合入口页推荐区的一键按钮可以复用多智能体 launcher，但只允许打开当前推荐智能体。

## 依赖图

```text
verify-agent-combination-entry.mjs
← 引入: App.tsx, agentLaunchCatalog.ts, WorkflowDock.tsx, AgentCombinationEntryPage.tsx, AgentCombinationEntrySections.tsx, agentCombinationEntryModel.ts, AgentCombinationEntryPage.css
→ 被引用: 手动 Node 验证
```
