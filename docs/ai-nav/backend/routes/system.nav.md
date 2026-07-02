# system.py

> `backend/routes/system.py` · Python · 约 22 行

## 用途

提供健康检查和请求回显接口，便于前端或运维确认后端可访问。

## 导出

| 名称 | 类型 | 行号 | 作用 |
|------|------|------|------|
| `system_bp` | Blueprint | ~6 | 注册系统接口。 |
| `health` | function | ~10 | 返回状态、服务名和 UTC 时间。 |
| `echo` | function | ~21 | 回显 JSON 请求体。 |

## 依赖

外部依赖(仅列包名,不做解释):
- `flask`

## 修改指南

- **添加诊断字段**: 只返回非敏感运行状态，不输出环境变量或 token。

## 依赖图

```text
system.py
→ 被引用: app.py 注册为 /api
```

