# verify-hero-pool-hit-test.mjs

> `frontend/scripts/verify-hero-pool-hit-test.mjs` · JavaScript · ~20 行

## 用途

读取 `frontend/src/App.css`，验证 Hero Hall 英雄池顶部栏、布局容器和卡片网格具备命中层级、隔离、裁剪与 paint containment 规则。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `appCss` | const | ~4 | 读取全局 CSS 文本。 |
| `topbarRule` | const | ~6 | 提取英雄池顶部栏 CSS 规则体。 |
| `layoutRule` | const | ~7 | 提取英雄池布局 CSS 规则体。 |
| `gridRule` | const | ~8 | 提取英雄池网格 CSS 规则体。 |

## 依赖

内部依赖:
- `frontend/src/App.css` — 被验证的 Hero Hall 命中和裁剪样式。

外部依赖(仅列包名):
- `node:assert/strict`
- `node:fs`

## 修改指南

- **修改英雄池层级或选择器**: 同步更新本脚本的 CSS 正则选择器。
- **修改滚动裁剪策略**: 保留防止滚动卡片遮挡顶部栏的断言。

## 依赖图

```text
verify-hero-pool-hit-test.mjs
← 引入: App.css
→ 被引用: 手动 Node 验证
```
