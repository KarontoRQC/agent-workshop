# graph_path_resolver.py

> `backend/services/graph_path_resolver.py` · Python · 约 73 行

## 用途

把 `KG_PATH` 路线文本拆成动态图谱节点和边，供前端逐步点亮路径和聚焦最后节点。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `ROOT_ID` | const | ~1 | 前端动态路径根节点 ID。 |
| `GraphPathResolver` | class | ~4 | 将路线文本解析为 `route/root_id/nodes/edges`。 |
| `split_route_text` | function | ~21 | 支持 `-`、`>`、`→`、`/`、逗号等分隔符。 |

## 依赖

内部依赖:
- 无。

## 修改指南

- **改路径分隔符**: 修改 `split_route_text` 后检查前端 `splitRouteText` 是否需要保持一致。
- **改节点类型**: 修改 `_get_dynamic_node_type` 后检查前端图谱节点样式。

## 依赖图

```text
graph_path_resolver.py
→ 被引用: coze_workflow.py
```

