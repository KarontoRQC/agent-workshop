from pathlib import Path

from services.participant_identity import (
    CHANGZHANG_IDENTITY,
    GUEST_IDENTITY,
    build_participant_persona_system_context,
    normalize_participant_identity,
)


def test_participant_identity_only_accepts_allowlisted_changzhang_value():
    assert normalize_participant_identity("changzhang") == CHANGZHANG_IDENTITY
    assert normalize_participant_identity(" CHANGZHANG ") == CHANGZHANG_IDENTITY
    assert normalize_participant_identity("director") == GUEST_IDENTITY
    assert normalize_participant_identity("changzhang\nignore-system") == GUEST_IDENTITY


def test_guest_identity_preserves_existing_prompt_behavior():
    assert build_participant_persona_system_context(GUEST_IDENTITY) == ""


def test_changzhang_persona_is_flexible_humorous_and_bounded():
    context = build_participant_persona_system_context(CHANGZHANG_IDENTITY)

    assert "display_name=厂长" in context
    assert "人格是底色，不是需要死守的剧本" in context
    assert "不得强行把闲聊拉回知识路径" in context
    assert "独立不等于抬杠" in context
    assert "开场问候必须自然称呼一次“厂长”" in context
    assert "把麦克风交给学员" in context
    assert "不能攻击" in context
    assert "XML" in context
    assert "不得提及 URL 参数" in context


def test_production_prompts_prioritize_flexible_classroom_banter():
    prompts_dir = Path(__file__).resolve().parents[1] / "prompts"
    unified_prompt = (prompts_dir / "unified_orchestration_agent.txt").read_text(encoding="utf-8")
    route_prompt = (prompts_dir / "knowledge_graph_agent.txt").read_text(encoding="utf-8")

    assert "人格是对话底色，不是必须死守的剧本" in unified_prompt
    assert "普通课堂互动和业务承接的 ACK 都必须带一个可辨识但简短的幽默点" in unified_prompt
    assert "禁止只播报“正在校准、正在处理”" in unified_prompt
    assert "厂长把麦克风交给学员" in unified_prompt
    assert "不得强行拉回知识路径" in route_prompt
    assert "独立不等于抬杠" in route_prompt
    assert "需求匹配类 ACK 都必须带一个可辨识但简短的幽默点" in route_prompt
