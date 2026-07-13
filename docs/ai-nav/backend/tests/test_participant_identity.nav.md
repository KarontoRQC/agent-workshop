# test_participant_identity.py

> `backend/tests/test_participant_identity.py` · Python

## 用途

验证客户端不能通过任意字符串注入身份，普通用户 prompt 保持原样，厂长人格同时具备灵活接话、自然幽默、不过度抬杠、学员换人、标签协议保护和参数保密约束。

## 关键覆盖

| 名称 | 作用 |
|------|------|
| `test_participant_identity_only_accepts_allowlisted_changzhang_value` | 只允许白名单值，注入式或未知值降级为普通用户。 |
| `test_guest_identity_preserves_existing_prompt_behavior` | 普通身份不增加人格上下文。 |
| `test_changzhang_persona_is_flexible_humorous_and_bounded` | 锁定灵活接话、幽默、不过度抬杠、现场换人和安全边界。 |
| `test_production_prompts_prioritize_flexible_classroom_banter` | 锁定统一/路径 prompt 的闲聊接梗、业务 ACK 幽默、非机械播报和学员换人规则。 |
