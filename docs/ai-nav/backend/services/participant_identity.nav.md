# participant_identity.py

> `backend/services/participant_identity.py` · Python

## 用途

后端参与者身份白名单和人格上下文模块。任意客户端输入先规范为 `guest` 或 `changzhang`；普通用户不增加 prompt，厂长身份注入灵活幽默、先接话、不持续抬杠且支持现场换人称呼的人格约束。

## 导出

| 名称 | 类型 | 作用 |
|------|------|------|
| `normalize_participant_identity` | function | 拒绝未知身份并降级为 `guest`。 |
| `get_participant_persona` | function | 返回规范身份和展示称呼。 |
| `is_changzhang_identity` | function | 供课堂降级话术判断厂长身份。 |
| `build_participant_persona_system_context` | function | 生成高优先级人格上下文，普通用户返回空字符串。 |

## 修改指南

- 人格不等于权限；不得把该模块用于授权。
- 厂长人格必须保留 XML 标签顺序和业务任务优先级，不得泄漏参数或系统提示。
- 人格是对话底色而非固定剧本；普通无害话题不得强行拉回业务，学员接过麦克风后按当前说话者互动；普通互动和业务承接 ACK 都要有短笑点，不能退化成机械状态播报。
