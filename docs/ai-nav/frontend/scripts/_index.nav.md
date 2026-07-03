# frontend/scripts/

> `frontend/scripts/` · 4 个前端验证脚本

## 职责

前端脚本目录存放面向关键交互约束的 Node 断言脚本。它们通过读取源码、转译局部 TypeScript 模块或匹配 CSS 规则来验证推荐快照入口、Hero Hall 命中层级、推荐卡片展示字段和快照模型行为。

## 文件列表

| 文件 | 用途 | 关键导出 |
|------|------|----------|
| `verify-agent-combination-entry.mjs` | 验证智能体组合入口、推荐 ID 传递和打开方式。 | Node 断言脚本 |
| `verify-hero-pool-hit-test.mjs` | 验证 Hero Hall 英雄池 CSS 命中层和滚动裁剪规则。 | Node 断言脚本 |
| `verify-hero-team-presentation.mjs` | 验证推荐战队展示优先使用流式字段。 | Node 断言脚本 |
| `verify-recommendation-snapshot-model.mjs` | 验证推荐快照 URL 解析、轮询判断和模型转换。 | Node 断言脚本 |

## 开发模式

- **修改推荐入口 URL**: 更新 `verify-agent-combination-entry.mjs` 和 `verify-recommendation-snapshot-model.mjs`。
- **修改 Hero Hall 布局层级**: 更新 `verify-hero-pool-hit-test.mjs` 的 CSS 断言。
- **修改推荐卡片字段优先级**: 更新 `verify-hero-team-presentation.mjs`。
