# participantIdentity.ts

> `frontend/src/lib/participantIdentity.ts` · TypeScript

## 用途

集中解析页面 URL 的 `identity` 参数。只允许 `changzhang` 命中厂长人格，其余值统一返回 `guest`，让页面保持同一套 UI，同时把规范身份交给流式客户端。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `ParticipantIdentity` | type | 约束为 `guest | changzhang`。 |
| `normalizeParticipantIdentity` | function | 将任意输入规范为白名单身份。 |
| `getParticipantIdentityFromSearch` | function | 从 `location.search` 读取并规范 `identity`。 |

## 修改指南

- URL 身份只能改变称呼和人格，不得用于认证或权限判断。
- 新增白名单身份时同步修改后端 `services/participant_identity.py`、接口文档和契约测试。
