# verify-recommendation-snapshot-model.mjs

> `frontend/scripts/verify-recommendation-snapshot-model.mjs` · JavaScript · ~75 行

## 用途

转译并动态导入 `recommendationSnapshotModel.ts`，验证智能体组合入口 ID 解析、推荐快照轮询判断，以及快照智能体转换为前端推荐智能体模型的行为。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `sourcePath` | const | ~5 | 指向被验证的推荐快照模型。 |
| `output` | const | ~7 | TypeScript 转译结果。 |
| `getAgentCombinationEntryIdFromUrl` | import | ~16 | 解析组合入口 URL 中的推荐 ID。 |
| `shouldPollRecommendationSnapshot` | import | ~17 | 判断推荐快照是否继续轮询。 |
| `snapshotToRecommendedAgents` | import | ~18 | 将后端快照智能体转换为前端推荐智能体。 |
| `agents` | const | ~30 | 完成态快照转换样例。 |
| `streamingAgents` | const | ~51 | 流式快照转换样例。 |

## 依赖

内部依赖:
- `frontend/src/features/workflow/recommendationSnapshotModel.ts` — 被验证的推荐快照模型。

外部依赖(仅列包名):
- `node:assert/strict`
- `node:fs`
- `node:path`
- `typescript`

## 修改指南

- **修改入口 URL 规则**: 更新 `getAgentCombinationEntryIdFromUrl` 断言。
- **修改快照状态机**: 更新轮询判断和 `streamStatus` 转换断言。

## 依赖图

```text
verify-recommendation-snapshot-model.mjs
← 引入: recommendationSnapshotModel.ts
→ 被引用: 手动 Node 验证
```
